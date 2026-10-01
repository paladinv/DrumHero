import type { SongInstrument } from "./types";

export type DrumAudio = {
  click: (accent?: boolean) => void;
  hit: (instrument: SongInstrument, accent?: boolean, velocity?: number) => void;
  setMix: (settings: DrumMixSettings) => void;
  ready: Promise<boolean>;
  close: () => void;
};

export type DrumMixSettings = {
  levels: Record<SongInstrument, number>;
  pan: Record<SongInstrument, number>;
  sampleIndex: Record<SongInstrument, number>;
};

export const DEFAULT_DRUM_MIX: DrumMixSettings = {
  levels: { kick: 0.82, snare: 0.82, hihat: 0.82, tom: 0.82, crash: 0.82, openhat: 0.82, ride: 0.82, rimshot: 0.82 },
  pan: { kick: 0, snare: 0, hihat: 0, tom: 0, crash: 0, openhat: 0, ride: 0, rimshot: 0 },
  sampleIndex: { kick: 0, snare: 0, hihat: 0, tom: 0, crash: 0, openhat: 0, ride: 0, rimshot: 0 }
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

export function createDrumAudio(initialMix: DrumMixSettings = DEFAULT_DRUM_MIX): DrumAudio | null {
  if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  const abort = new AbortController();
  const instruments = Object.keys(samplePaths) as SongInstrument[];
  const samples: Record<SongInstrument, AudioBuffer[]> = { kick: [], snare: [], hihat: [], tom: [], crash: [], openhat: [], ride: [], rimshot: [] };
  const nextTake: Record<SongInstrument, number> = { kick: 0, snare: 0, hihat: 0, tom: 0, crash: 0, openhat: 0, ride: 0, rimshot: 0 };
  let mix = initialMix;
  let closed = false;

  const playSample = (instrument: SongInstrument, gainValue: number, duration?: number) => {
    const takes = samples[instrument];
    if (!takes.length || closed) return;
    const chosenTake = Math.max(0, Math.min(takes.length - 1, Math.round(mix.sampleIndex[instrument] ?? 0)));
    const take = takes[chosenTake] ?? takes[nextTake[instrument] % takes.length];
    nextTake[instrument] += 1;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const now = context.currentTime;
    source.buffer = take;
    gain.gain.setValueAtTime(gainValue * Math.max(0, Math.min(1, mix.levels[instrument] ?? 0.82)), now);
    if (duration !== undefined) gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    const panner = context.createStereoPanner?.();
    if (panner) {
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, mix.pan[instrument] ?? 0)), now);
      source.connect(gain).connect(panner).connect(context.destination);
    } else source.connect(gain).connect(context.destination);
    if (duration === undefined) source.start(now);
    else source.start(now, 0, duration);
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
  })).then((results) => results.every(Boolean));

  void context.resume().catch(() => {});
  return {
    click: (accent = false) => playSample("hihat", accent ? 0.5 : 0.32, 0.07),
    hit: (instrument, accent = false, velocity) => playSample(instrument, velocity ? Math.max(0.025, Math.min(0.95, velocity / 127)) : accent ? 0.82 : 0.55),
    setMix: (settings) => { mix = settings; },
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
