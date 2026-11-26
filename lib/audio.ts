import { SONG_INSTRUMENTS, type SongInstrument } from "./types";
import type { CustomSampleLayers } from "./song-builder-samples";

export type DrumEffectsSettings = { room: number; low: number; high: number; compression: number };
export const DEFAULT_DRUM_EFFECTS: DrumEffectsSettings = { room: 0, low: 0, high: 0, compression: 0 };

export type DrumAudio = {
  click: (accent?: boolean) => void;
  scheduleHit: (instrument: SongInstrument, atMs: number, accent?: boolean, velocity?: number, choke?: boolean, pan?: number) => void;
  scheduleTargetHit: (instrument: SongInstrument, atMs: number, accent?: boolean, velocity?: number) => void;
  scheduleClick: (atMs: number, accent?: boolean) => void;
  hit: (instrument: SongInstrument, accent?: boolean, velocity?: number, choke?: boolean) => void;
  setMix: (settings: DrumMixSettings) => void;
  setEffects: (settings: DrumEffectsSettings) => void;
  setMasterLevel: (level: number) => void;
  setTargetLevel: (level: number) => void;
  setClickLevel: (level: number) => void;
  setClickSound: (sound: TrainerClickSound) => void;
  setCustomSample: (instrument: SongInstrument, blob: Blob | null, layer?: "soft" | "primary" | "accent") => Promise<boolean>;
  setCustomSampleAlternates: (instrument: SongInstrument, layer: "soft" | "primary" | "accent", blobs: Blob[]) => Promise<boolean>;
  ready: Promise<boolean>;
  silence: () => void;
  close: () => void;
};

export type TrainerClickSound = "hat" | "woodblock" | "beep";

export type DrumMixSettings = {
  levels: Record<SongInstrument, number>;
  pan: Record<SongInstrument, number>;
  sampleIndex: Record<SongInstrument, number>;
  pitch: Record<SongInstrument, number>;
  decay: Record<SongInstrument, number>;
  muted: Record<SongInstrument, boolean>;
  solo: SongInstrument | "";
};

const voiceValues = <T,>(initial: T): Record<SongInstrument, T> => Object.fromEntries(SONG_INSTRUMENTS.map(voice => [voice, initial])) as Record<SongInstrument, T>;
export const DEFAULT_DRUM_MIX: DrumMixSettings = {
  levels: voiceValues(0.82),
  pan: voiceValues(0),
  sampleIndex: voiceValues(0),
  pitch: voiceValues(0),
  decay: voiceValues(1),
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

export function drumSampleUrl(instrument: SongInstrument, sampleIndex: number) {
  const paths = samplePaths[instrument] ?? [];
  return paths[Math.max(0, Math.min(paths.length - 1, Math.round(sampleIndex)))] ?? paths[0] ?? "";
}

export function createDrumEffectsBus(context: BaseAudioContext, destination: AudioNode, initial: DrumEffectsSettings = DEFAULT_DRUM_EFFECTS) {
  const input = context.createGain();
  const low = context.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 120;
  const high = context.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 8000;
  const compressor = context.createDynamicsCompressor(); compressor.knee.value = 18; compressor.attack.value = 0.008; compressor.release.value = 0.22;
  const dry = context.createGain();
  const convolver = context.createConvolver();
  const impulse = context.createBuffer(2, Math.round(context.sampleRate * 1.8), context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const samples = impulse.getChannelData(channel);
    let seed = 0x19a4 + channel * 7919;
    for (let index = 0; index < samples.length; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = seed / 0xffffffff * 2 - 1;
      samples[index] = noise * Math.pow(1 - index / samples.length, 4.2) * 0.6;
    }
  }
  convolver.buffer = impulse;
  const wet = context.createGain();
  input.connect(low).connect(high).connect(compressor);
  compressor.connect(dry).connect(destination);
  compressor.connect(convolver).connect(wet).connect(destination);
  const set = (settings: DrumEffectsSettings) => {
    const room = Math.max(0, Math.min(100, settings.room));
    const compression = Math.max(0, Math.min(100, settings.compression));
    low.gain.setTargetAtTime(Math.max(-12, Math.min(12, settings.low)), context.currentTime, 0.025);
    high.gain.setTargetAtTime(Math.max(-12, Math.min(12, settings.high)), context.currentTime, 0.025);
    compressor.threshold.setTargetAtTime(-18 - compression * 0.18, context.currentTime, 0.025);
    compressor.ratio.setTargetAtTime(1 + compression * 0.11, context.currentTime, 0.025);
    compressor.knee.setTargetAtTime(18 - compression * 0.12, context.currentTime, 0.025);
    wet.gain.setTargetAtTime(room * 0.0035, context.currentTime, 0.025);
  };
  set(initial);
  return { input, set };
}

export function createDrumAudio(initialMix: DrumMixSettings = DEFAULT_DRUM_MIX, initialCustomSamples: Partial<Record<SongInstrument, Blob | CustomSampleLayers>> = {}, onInterrupted?: () => void, initialEffects: DrumEffectsSettings = DEFAULT_DRUM_EFFECTS): DrumAudio | null {
  if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  const abort = new AbortController();
  const instruments = Object.keys(samplePaths) as SongInstrument[];
  const samples: Record<SongInstrument, AudioBuffer[]> = voiceValues([]);
  const customSamples: Partial<Record<SongInstrument, { primary: AudioBuffer; soft?: AudioBuffer; accent?: AudioBuffer; alternates?: Partial<Record<"primary" | "soft" | "accent", AudioBuffer[]>> }>> = {};
  const nextTake: Record<SongInstrument, number> = voiceValues(0);
  const nextCustomTake: Record<SongInstrument, Record<"primary" | "soft" | "accent", number>> = Object.fromEntries(SONG_INSTRUMENTS.map(voice => [voice, { primary: 0, soft: 0, accent: 0 }])) as Record<SongInstrument, Record<"primary" | "soft" | "accent", number>>;
  let mix = initialMix;
  let masterLevel = 1;
  let targetLevel = 0.55;
  let clickLevel = 1;
  let clickSound: TrainerClickSound = "hat";
  const effects = createDrumEffectsBus(context, context.destination, initialEffects);
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

  const playSample = (instrument: SongInstrument, gainValue: number, duration?: number, metronomeClick = false, atMs?: number, panOverride?: number, velocityValue = 86, targetPlayback = false) => {
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
    const layer = velocityValue < 48 ? "soft" : velocityValue >= 96 ? "accent" : "primary";
    const baseCustom = custom ? layer === "soft" ? custom.soft ?? custom.primary : layer === "accent" ? custom.accent ?? custom.primary : custom.primary : undefined;
    const alternates = custom?.alternates?.[layer] ?? [];
    const customTakes = baseCustom ? [baseCustom, ...alternates] : [];
    const take = customTakes.length ? customTakes[nextCustomTake[instrument][layer] % customTakes.length] : takes[chosenTake] ?? takes[nextTake[instrument] % Math.max(1, takes.length)];
    if (customTakes.length) nextCustomTake[instrument][layer] += 1;
    nextTake[instrument] += 1;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const now = eventAt;
    source.buffer = take;
    const pitch = mix.pitch?.[instrument] ?? 0;
    const playbackRate = Math.pow(2, pitch / 12);
    source.playbackRate.setValueAtTime(playbackRate, now);
    gain.gain.setValueAtTime(Math.max(0.0001, gainValue * (metronomeClick ? clickLevel : (targetPlayback ? targetLevel : masterLevel) * Math.max(0, Math.min(1, mix.levels[instrument] ?? 0.82)))), now);
    if (duration !== undefined) gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    const panner = context.createStereoPanner?.();
    if (panner) {
      panner.pan.setValueAtTime(metronomeClick ? 0 : Math.max(-1, Math.min(1, panOverride ?? mix.pan[instrument] ?? 0)), now);
      source.connect(gain).connect(panner).connect(metronomeClick ? context.destination : effects.input);
    } else source.connect(gain).connect(metronomeClick ? context.destination : effects.input);
    activeSources.add(source);
    if (duration === undefined) {
      const decay = Math.max(0.05, Math.min(1, mix.decay?.[instrument] ?? 1));
      if (decay < 0.999) {
        const audibleDuration = Math.max(0.04, take.duration / playbackRate * decay);
        gain.gain.setValueAtTime(Math.max(0.0001, gainValue * (targetPlayback ? targetLevel : masterLevel) * Math.max(0, Math.min(1, mix.levels[instrument] ?? 0.82))), now + audibleDuration * 0.82);
        gain.gain.linearRampToValueAtTime(0.0001, now + audibleDuration);
        source.start(now); source.stop(now + audibleDuration + 0.005);
      } else source.start(now);
    }
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
        const soft = layers.soft ? await context.decodeAudioData(await layers.soft.arrayBuffer()).catch(() => undefined) : undefined;
        const accent = layers.accent ? await context.decodeAudioData(await layers.accent.arrayBuffer()).catch(() => undefined) : undefined;
        const alternates = Object.fromEntries(await Promise.all(Object.entries(layers.alternates ?? {}).map(async ([layer, blobs]) => [layer, await Promise.all((blobs ?? []).map(async blob => context.decodeAudioData(await blob.arrayBuffer()).catch(() => null))).then(items => items.filter((item): item is AudioBuffer => item !== null))]))) as Partial<Record<"primary" | "soft" | "accent", AudioBuffer[]>>;
        customSamples[voice as SongInstrument] = { primary, ...(soft ? { soft } : {}), ...(accent ? { accent } : {}), ...(Object.keys(alternates).length ? { alternates } : {}) };
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
    scheduleTargetHit: (instrument,atMs,accent=false,velocity) => playSample(instrument,velocity?Math.max(.025,Math.min(.95,velocity/127)):accent?.82:.55,undefined,false,atMs,undefined,velocity??(accent?118:86),true),
    scheduleClick: (atMs,accent=false) => playClick(accent, atMs),
    setMix: (settings) => { mix = settings; },
    setEffects: (settings) => effects.set(settings),
    setMasterLevel: (level) => { masterLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1)); },
    setTargetLevel: (level) => { targetLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0.55)); },
    setClickLevel: (level) => { clickLevel = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1)); },
    setClickSound: (sound) => { clickSound = sound; },
    setCustomSample: async (instrument, blob, layer = "primary") => {
      try {
        if (!blob) {
          if (layer === "primary") delete customSamples[instrument];
          else if (customSamples[instrument]) {
            delete customSamples[instrument]![layer];
            if (customSamples[instrument]!.alternates) delete customSamples[instrument]!.alternates![layer];
          }
          return true;
        }
        const decoded = await context.decodeAudioData(await blob.arrayBuffer());
        if (layer !== "primary") {
          if (!customSamples[instrument]?.primary) return false;
          customSamples[instrument] = { ...customSamples[instrument]!, [layer]: decoded };
        } else customSamples[instrument] = { primary: decoded, ...(customSamples[instrument]?.soft ? { soft: customSamples[instrument]!.soft } : {}), ...(customSamples[instrument]?.accent ? { accent: customSamples[instrument]!.accent } : {}), ...(customSamples[instrument]?.alternates ? { alternates: customSamples[instrument]!.alternates } : {}) };
        return true;
      } catch { return false; }
    },
    setCustomSampleAlternates: async (instrument, layer, blobs) => {
      if (!customSamples[instrument]) return blobs.length === 0;
      if (blobs.length && !customSamples[instrument]![layer]) return false;
      try {
        const decoded = await Promise.all(blobs.slice(0, 4).map(async blob => context.decodeAudioData(await blob.arrayBuffer())));
        customSamples[instrument] = { ...customSamples[instrument]!, alternates: { ...customSamples[instrument]!.alternates, [layer]: decoded } };
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
