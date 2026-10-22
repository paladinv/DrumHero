import type { SongInstrument } from "./types";

export type DrumAudio = {
  click: (accent?: boolean) => void;
  scheduleHit: (instrument: SongInstrument, atMs: number, accent?: boolean, velocity?: number, choke?: boolean, pan?: number) => void;
  scheduleClick: (atMs: number, accent?: boolean) => void;
  hit: (instrument: SongInstrument, accent?: boolean, velocity?: number, choke?: boolean) => void;
  setMix: (settings: DrumMixSettings) => void;
  setMasterLevel: (level: number) => void;
  setClickLevel: (level: number) => void;
  setClickSound: (sound: TrainerClickSound) => void;
  setCustomSample: (instrument: SongInstrument, blob: Blob | null) => Promise<boolean>;
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

export const DEFAULT_DRUM_MIX: DrumMixSettings = {
  levels: { kick: 0.82, snare: 0.82, hihat: 0.82, tom: 0.82, crash: 0.82, openhat: 0.82, ride: 0.82, rimshot: 0.82, cowbell: 0.82, shaker: 0.82, tambourine: 0.82, custom1: 0.82, custom2: 0.82, custom3: 0.82, custom4: 0.82 },
  pan: { kick: 0, snare: 0, hihat: 0, tom: 0, crash: 0, openhat: 0, ride: 0, rimshot: 0, cowbell: 0, shaker: 0, tambourine: 0, custom1: 0, custom2: 0, custom3: 0, custom4: 0 },
  sampleIndex: { kick: 0, snare: 0, hihat: 0, tom: 0, crash: 0, openhat: 0, ride: 0, rimshot: 0, cowbell: 0, shaker: 0, tambourine: 0, custom1: 0, custom2: 0, custom3: 0, custom4: 0 },
  muted: { kick: false, snare: false, hihat: false, tom: false, crash: false, openhat: false, ride: false, rimshot: false, cowbell: false, shaker: false, tambourine: false, custom1: false, custom2: false, custom3: false, custom4: false },
  solo: ""
};

const samplePaths: Record<SongInstrument, string[]> = {
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
  custom1: ["/audio/drums/kick-1.wav"], custom2: ["/audio/drums/snare-1.wav"], custom3: ["/audio/drums/tom-1.wav"], custom4: ["/audio/drums/crash-1.wav"]
};

export function createDrumAudio(initialMix: DrumMixSettings = DEFAULT_DRUM_MIX, initialCustomSamples: Partial<Record<SongInstrument, Blob>> = {}): DrumAudio | null {
  if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  const abort = new AbortController();
  const instruments = Object.keys(samplePaths) as SongInstrument[];
  const samples: Record<SongInstrument, AudioBuffer[]> = { kick: [], snare: [], hihat: [], tom: [], crash: [], openhat: [], ride: [], rimshot: [], cowbell: [], shaker: [], tambourine: [], custom1: [], custom2: [], custom3: [], custom4: [] };
  const customSamples: Partial<Record<SongInstrument, AudioBuffer>> = {};
  const nextTake: Record<SongInstrument, number> = { kick: 0, snare: 0, hihat: 0, tom: 0, crash: 0, openhat: 0, ride: 0, rimshot: 0, cowbell: 0, shaker: 0, tambourine: 0, custom1: 0, custom2: 0, custom3: 0, custom4: 0 };
  let mix = initialMix;
  let masterLevel = 1;
  let clickLevel = 1;
  let clickSound: TrainerClickSound = "hat";
  let closed = false;
  const activeSources=new Set<AudioScheduledSourceNode>();
  const silence=()=>{for(const source of activeSources){try{source.stop();}catch{/* Already ended. */}}activeSources.clear();activeOpenHat=null;};
  let activeOpenHat: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  const playSample = (instrument: SongInstrument, gainValue: number, duration?: number, metronomeClick = false, atMs?: number, panOverride?: number) => {
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
    const take = custom ?? takes[chosenTake] ?? takes[nextTake[instrument] % Math.max(1, takes.length)];
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
    await Promise.all(Object.entries(initialCustomSamples).map(async ([voice, blob]) => {
      if (!blob) return;
      try { customSamples[voice as SongInstrument] = await context.decodeAudioData(await blob.arrayBuffer()); }
      catch { /* A bad custom sample should not disable the built-in kit. */ }
    }));
    return results.every(Boolean);
  });

  void context.resume().catch(() => {});
  return {
    click: (accent = false) => playClick(accent),
    hit: (instrument, accent = false, velocity, choke = false) => playSample(instrument, velocity ? Math.max(0.025, Math.min(0.95, velocity / 127)) : accent ? 0.82 : 0.55, choke ? 0.12 : undefined),
    scheduleHit: (instrument,atMs,accent=false,velocity,choke=false,pan) => playSample(instrument,velocity?Math.max(.025,Math.min(.95,velocity/127)):accent?.82:.55,choke?.12:undefined,false,atMs,pan),
    scheduleClick: (atMs,accent=false) => playClick(accent, atMs),
    setMix: (settings) => { mix = settings; },
    setMasterLevel: (level) => { masterLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1)); },
    setClickLevel: (level) => { clickLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1)); },
    setClickSound: (sound) => { clickSound = sound; },
    setCustomSample: async (instrument, blob) => {
      try {
        if (!blob) { delete customSamples[instrument]; return true; }
        customSamples[instrument] = await context.decodeAudioData(await blob.arrayBuffer());
        return true;
      } catch { return false; }
    },
    ready,
    silence,
    close: () => {
      if (closed) return;
      closed = true;
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
