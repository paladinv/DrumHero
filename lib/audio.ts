import { SONG_INSTRUMENTS, type SongInstrument } from "./types";
import type { CustomSampleLayers } from "./song-builder-samples";

export type DrumAudio = {
  click: (accent?: boolean) => void;
  scheduleHit: (instrument: SongInstrument, atMs: number, accent?: boolean, velocity?: number, choke?: boolean, pan?: number) => void;
  scheduleClick: (atMs: number, accent?: boolean) => void;
  hit: (instrument: SongInstrument, accent?: boolean, velocity?: number, choke?: boolean) => void;
  setMix: (settings: DrumMixSettings) => void;
  setMasterLevel: (level: number) => void;
  setClickLevel: (level: number) => void;
  setClickSound: (sound: TrainerClickSound) => void;
  setCustomSample: (instrument: SongInstrument, blob: Blob | null, layer?: "primary" | "accent") => Promise<boolean>;
  ready: Promise<boolean>;
  silence: () => void;
  close: () => void;
};

export type TrainerClickSound = "hat" | "woodblock" | "beep";

export type DrumMixSettings = {
  levels: Record<SongInstrument, number>;
  pan: Record<SongInstrument, number>;
  sampleIndex: Record<SongInstrument, number>;
  muted: Record<SongInstrument, boolean>;
  solo: SongInstrument | "";
};

const voiceValues = <T,>(initial: T): Record<SongInstrument, T> => Object.fromEntries(SONG_INSTRUMENTS.map(voice => [voice, initial])) as Record<SongInstrument, T>;
export const DEFAULT_DRUM_MIX: DrumMixSettings = {
  levels: voiceValues(0.82),
  pan: voiceValues(0),
  sampleIndex: voiceValues(0),
  muted: voiceValues(false),
  solo: ""
};

const samplePaths = {
  kick: [1, 2, 3, 4].map((take) => `/audio/drums/kick-${take}.wav`),
  snare: [1, 2, 3].map((take) => `/audio/drums/snare-${take}.wav`),
  hihat: [1, 2, 3, 4].map((take) => `/audio/drums/hihat-${take}.wav`),
  tom: [1, 2, 3].map((take) => `/audio/drums/tom-${take}.wav`),
  crash: [1, 2, 3, 4].map((take) => `/audio/drums/crash-${take}.wav`),
  openhat: [4, 3, 2, 1].map((take) => `/audio/drums/hihat-${take}.wav`),
  ride: [1, 2, 3, 4].map((take) => `/audio/drums/crash-${take}.wav`),
  rimshot: [1, 2, 3].map((take) => `/audio/drums/snare-${take}.wav`),
  cowbell: [1, 2, 3, 4].map((take) => `/audio/drums/crash-${take}.wav`),
  shaker: [1, 2, 3, 4].map((take) => `/audio/drums/hihat-${take}.wav`),
  tambourine: [1, 2, 3, 4].map((take) => `/audio/drums/hihat-${take}.wav`),
  ...Object.fromEntries(Array.from({length:8},(_,index)=>[`custom${index+1}`, [`/audio/drums/${["kick","snare","tom","crash"][index%4]}-1.wav`]]))
} as Record<SongInstrument, string[]>;

export function createDrumAudio(initialMix: DrumMixSettings = DEFAULT_DRUM_MIX, initialCustomSamples: Partial<Record<SongInstrument, Blob | CustomSampleLayers>> = {}, onInterrupted?: () => void): DrumAudio | null {
  if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  const abort = new AbortController();
  const instruments = Object.keys(samplePaths) as SongInstrument[];
  const samples: Record<SongInstrument, AudioBuffer[]> = voiceValues([]);
  const customSamples: Partial<Record<SongInstrument, { primary: AudioBuffer; accent?: AudioBuffer }>> = {};
  const nextTake: Record<SongInstrument, number> = voiceValues(0);
  let mix = initialMix;
  let masterLevel = 1;
  let clickLevel = 1;
  let clickSound: TrainerClickSound = "hat";
  let closed = false;
  let hasRun = context.state === "running";
  const stateChanged = () => {
    if (context.state === "running") hasRun = true;
    else if (!closed && hasRun && (context.state === "suspended" || String(context.state) === "interrupted")) onInterrupted?.();
  };
  if (onInterrupted) context.addEventListener("statechange", stateChanged);
  const activeSources=new Set<AudioScheduledSourceNode>();
  const silence=()=>{for(const source of activeSources){try{source.stop();}catch{/* Already ended. */}}activeSources.clear();activeOpenHat=null;};
  let activeOpenHat: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  const playSample = (instrument: SongInstrument, gainValue: number, duration?: number, metronomeClick = false, atMs?: number, panOverride?: number, velocityValue = 86) => {
    const eventAt = context.currentTime + Math.max(0, ((atMs ?? performance.now()) - performance.now()) / 1000);
    if (!metronomeClick && (mix.muted[instrument] || (mix.solo && mix.solo !== instrument))) return;
    const takes = samples[instrument];
    const custom = !metronomeClick && mix.sampleIndex[instrument] < 0 ? customSamples[instrument] : undefined;
    if ((!takes.length && !custom) || closed) return;
    if (!metronomeClick && (instrument === "hihat" || instrument === "openhat")) {
      if (activeOpenHat) {
        const previous = activeOpenHat;
        previous.gain.gain.cancelScheduledValues(eventAt);
        previous.gain.gain.setValueAtTime(Math.max(0.0001, previous.gain.gain.value), eventAt);
        previous.gain.gain.linearRampToValueAtTime(0.0001, eventAt + 0.045);
        try { previous.source.stop(eventAt + 0.05); } catch { /* The sample may already have ended. */ }
        activeOpenHat = null;
      }
    }
    const chosenTake = metronomeClick ? 0 : Math.max(0, Math.min(takes.length - 1, Math.round(mix.sampleIndex[instrument] ?? 0)));
    const take = (custom ? velocityValue >= 96 && custom.accent ? custom.accent : custom.primary : undefined) ?? takes[chosenTake] ?? takes[nextTake[instrument] % Math.max(1, takes.length)];
    nextTake[instrument] += 1;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const now = eventAt;
    source.buffer = take;
    gain.gain.setValueAtTime(Math.max(0.0001, gainValue * (metronomeClick ? clickLevel : masterLevel * Math.max(0, Math.min(1, mix.levels[instrument] ?? 0.82)))), now);
    if (duration !== undefined) gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    const panner = context.createStereoPanner?.();
    if (panner) {
      panner.pan.setValueAtTime(metronomeClick ? 0 : Math.max(-1, Math.min(1, panOverride ?? mix.pan[instrument] ?? 0)), now);
      source.connect(gain).connect(panner).connect(context.destination);
    } else source.connect(gain).connect(context.destination);
    activeSources.add(source);
    if (duration === undefined) source.start(now);
    else source.start(now, 0, duration);
    if (!metronomeClick && instrument === "openhat") activeOpenHat = { source, gain };
    source.onended = () => { activeSources.delete(source); if (activeOpenHat?.source === source) activeOpenHat = null; };
  };

  const playClick = (accent = false, atMs = performance.now()) => {
    if (clickSound === "hat") {
      playSample("hihat", accent ? 0.5 : 0.32, 0.07, true, atMs);
      return;
    }
    if (closed || clickLevel <= 0) return;
    const eventAt = context.currentTime + Math.max(0, (atMs - performance.now()) / 1000);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = clickSound === "woodblock" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(clickSound === "woodblock" ? (accent ? 1500 : 1050) : (accent ? 1180 : 820), eventAt);
    gain.gain.setValueAtTime(0.0001, eventAt);
    gain.gain.linearRampToValueAtTime((accent ? 0.24 : 0.16) * clickLevel, eventAt + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, eventAt + 0.06);
    oscillator.connect(gain).connect(context.destination);
    activeSources.add(oscillator);
    oscillator.start(eventAt);
    oscillator.stop(eventAt + 0.065);
    oscillator.onended = () => activeSources.delete(oscillator);
  };

  const ready = Promise.all(instruments.map(async (instrument) => {
    const decoded = await Promise.all(samplePaths[instrument].map(async (path) => {
      try {
        const response = await fetch(path, { signal: abort.signal });
        if (!response.ok) return null;
        return await context.decodeAudioData(await response.arrayBuffer());
      } catch {
        return null;
      }
    }));
    samples[instrument] = decoded.filter((sample): sample is AudioBuffer => sample !== null);
    return samples[instrument].length > 0;
  })).then(async (results) => {
    await Promise.all(Object.entries(initialCustomSamples).map(async ([voice, source]) => {
      if (!source) return;
      try {
        const layers = source instanceof Blob ? { primary: source } : source;
        const primary = await context.decodeAudioData(await layers.primary.arrayBuffer());
        const accent = layers.accent ? await context.decodeAudioData(await layers.accent.arrayBuffer()).catch(() => undefined) : undefined;
        customSamples[voice as SongInstrument] = { primary, ...(accent ? { accent } : {}) };
      }
      catch { /* A bad custom sample should not disable the built-in kit. */ }
    }));
    return results.every(Boolean);
  });

  void context.resume().catch(() => {});
  return {
    click: (accent = false) => playClick(accent),
    hit: (instrument, accent = false, velocity, choke = false) => playSample(instrument, velocity ? Math.max(0.025, Math.min(0.95, velocity / 127)) : accent ? 0.82 : 0.55, choke ? 0.12 : undefined, false, undefined, undefined, velocity ?? (accent ? 118 : 86)),
    scheduleHit: (instrument,atMs,accent=false,velocity,choke=false,pan) => playSample(instrument,velocity?Math.max(.025,Math.min(.95,velocity/127)):accent?.82:.55,choke?.12:undefined,false,atMs,pan,velocity??(accent?118:86)),
    scheduleClick: (atMs,accent=false) => playClick(accent, atMs),
    setMix: (settings) => { mix = settings; },
    setMasterLevel: (level) => { masterLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1)); },
    setClickLevel: (level) => { clickLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1)); },
    setClickSound: (sound) => { clickSound = sound; },
    setCustomSample: async (instrument, blob, layer = "primary") => {
      try {
        if (!blob) {
          if (layer === "primary") delete customSamples[instrument];
          else if (customSamples[instrument]) delete customSamples[instrument]!.accent;
          return true;
        }
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        if (layer === "accent") {
          if (!customSamples[instrument]?.primary) return false;
          customSamples[instrument] = { ...customSamples[instrument]!, accent: decoded };
        } else customSamples[instrument] = { primary: decoded, ...(customSamples[instrument]?.accent ? { accent: customSamples[instrument]!.accent } : {}) };
        return true;
      } catch { return false; }
    },
    ready,
    silence,
    close: () => {
      if (closed) return;
      closed = true;
      if (onInterrupted) context.removeEventListener("statechange", stateChanged);
      silence();
      abort.abort();
      void context.close();
    }
  };
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}
