import type { Instrument } from "./types";

export type DrumAudio = {
  click: (accent?: boolean) => void;
  hit: (instrument: Instrument) => void;
  ready: Promise<boolean>;
  close: () => void;
};

const samplePaths: Record<Instrument, string[]> = {
  kick: [1, 2, 3, 4].map((take) => `/audio/drums/kick-${take}.wav`),
  snare: [1, 2, 3].map((take) => `/audio/drums/snare-${take}.wav`),
  hihat: [1, 2, 3, 4].map((take) => `/audio/drums/hihat-${take}.wav`),
  tom: [1, 2, 3].map((take) => `/audio/drums/tom-${take}.wav`),
  crash: [1, 2, 3, 4].map((take) => `/audio/drums/crash-${take}.wav`)
};

export function createDrumAudio(): DrumAudio | null {
  if (typeof window === "undefined" || !(window.AudioContext || window.webkitAudioContext)) return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  const context = new Context();
  const abort = new AbortController();
  const samples: Record<Instrument, AudioBuffer[]> = { kick: [], snare: [], hihat: [], tom: [], crash: [] };
  const nextTake: Record<Instrument, number> = { kick: 0, snare: 0, hihat: 0, tom: 0, crash: 0 };
  let closed = false;

  const playSample = (instrument: Instrument, gainValue: number, duration?: number) => {
    const takes = samples[instrument];
    if (!takes.length || closed) return;
    const take = takes[nextTake[instrument] % takes.length];
    nextTake[instrument] += 1;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const now = context.currentTime;
    source.buffer = take;
    gain.gain.setValueAtTime(gainValue, now);
    if (duration !== undefined) gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(gain).connect(context.destination);
    if (duration === undefined) source.start(now);
    else source.start(now, 0, duration);
  };

  const ready = Promise.all((Object.keys(samplePaths) as Instrument[]).map(async (instrument) => {
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
    hit: (instrument) => playSample(instrument, 0.55),
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
