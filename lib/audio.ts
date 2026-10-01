import type { SongInstrument } from "./types";

export type DrumAudio = {
  click: (accent?: boolean) => void;
  hit: (instrument: SongInstrument, accent?: boolean, velocity?: number) => void;
  setMix: (settings: DrumMixSettings) => void;
  setCustomSample: (instrument: SongInstrument, blob: Blob | null) => Promise<boolean>;
  ready: Promise<boolean>;
  close: () => void;
};

export type DrumMixSettings = {
  levels: Record<SongInstrument, number>;
  pan: Record<SongInstrument, number>;
  sampleIndex: Record<SongInstrument, number>;
  muted: Record<SongInstrument, boolean>;
  solo: SongInstrument | "";
};

export const DEFAULT_DRUM_MIX: DrumMixSettings = {
  levels: { kick: 0.82, snare: 0.82, hihat: 0.82, tom: 0.82, crash: 0.82, openhat: 0.82, ride: 0.82, rimshot: 0.82 },
  pan: { kick: 0, snare: 0, hihat: 0, tom: 0, crash: 0, openhat: 0, ride: 0, rimshot: 0 },
  sampleIndex: { kick: 0, snare: 0, hihat: 0, tom: 0, crash: 0, openhat: 0, ride: 0, rimshot: 0 },
  muted: { kick: false, snare: false, hihat: false, tom: false, crash: false, openhat: false, ride: false, rimshot: false },
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
  rimshot: [1, 2, 3].map((take) => `/audio/drums/snare-${take}.wav`)
};

export function createDrumAudio(initialMix: DrumMixSettings = DEFAULT_DRUM_MIX, initialCustomSamples: Partial<Record<SongInstrument, Blob>> = {}): DrumAudio | null {
  if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  const abort = new AbortController();
  const instruments = Object.keys(samplePaths) as SongInstrument[];
  const samples: Record<SongInstrument, AudioBuffer[]> = { kick: [], snare: [], hihat: [], tom: [], crash: [], openhat: [], ride: [], rimshot: [] };
  const customSamples: Partial<Record<SongInstrument, AudioBuffer>> = {};
  const nextTake: Record<SongInstrument, number> = { kick: 0, snare: 0, hihat: 0, tom: 0, crash: 0, openhat: 0, ride: 0, rimshot: 0 };
  let mix = initialMix;
  let closed = false;
  let activeOpenHat: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  const playSample = (instrument: SongInstrument, gainValue: number, duration?: number, metronomeClick = false) => {
    if (!metronomeClick && (mix.muted[instrument] || (mix.solo && mix.solo !== instrument))) return;
    const takes = samples[instrument];
    const custom = !metronomeClick && mix.sampleIndex[instrument] < 0 ? customSamples[instrument] : undefined;
    if ((!takes.length && !custom) || closed) return;
    if (!metronomeClick && (instrument === "hihat" || instrument === "openhat")) {
      if (activeOpenHat) {
        const previous = activeOpenHat;
        previous.gain.gain.cancelScheduledValues(context.currentTime);
        previous.gain.gain.setValueAtTime(Math.max(0.0001, previous.gain.gain.value), context.currentTime);
        previous.gain.gain.linearRampToValueAtTime(0.0001, context.currentTime + 0.045);
        try { previous.source.stop(context.currentTime + 0.05); } catch { /* The sample may already have ended. */ }
        activeOpenHat = null;
      }
    }
    const chosenTake = metronomeClick ? 0 : Math.max(0, Math.min(takes.length - 1, Math.round(mix.sampleIndex[instrument] ?? 0)));
    const take = custom ?? takes[chosenTake] ?? takes[nextTake[instrument] % Math.max(1, takes.length)];
    nextTake[instrument] += 1;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const now = context.currentTime;
    source.buffer = take;
    gain.gain.setValueAtTime(Math.max(0.0001, gainValue * (metronomeClick ? 1 : Math.max(0, Math.min(1, mix.levels[instrument] ?? 0.82)))), now);
    if (duration !== undefined) gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    const panner = context.createStereoPanner?.();
    if (panner) {
      panner.pan.setValueAtTime(metronomeClick ? 0 : Math.max(-1, Math.min(1, mix.pan[instrument] ?? 0)), now);
      source.connect(gain).connect(panner).connect(context.destination);
    } else source.connect(gain).connect(context.destination);
    if (duration === undefined) source.start(now);
    else source.start(now, 0, duration);
    if (!metronomeClick && instrument === "openhat") activeOpenHat = { source, gain };
    source.onended = () => { if (activeOpenHat?.source === source) activeOpenHat = null; };
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
    click: (accent = false) => playSample("hihat", accent ? 0.5 : 0.32, 0.07, true),
    hit: (instrument, accent = false, velocity) => playSample(instrument, velocity ? Math.max(0.025, Math.min(0.95, velocity / 127)) : accent ? 0.82 : 0.55),
    setMix: (settings) => { mix = settings; },
    setCustomSample: async (instrument, blob) => {
      try {
        if (!blob) { delete customSamples[instrument]; return true; }
        customSamples[instrument] = await context.decodeAudioData(await blob.arrayBuffer());
        return true;
      } catch { return false; }
    },
    ready,
    close: () => {
      if (closed) return;
      closed = true;
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
