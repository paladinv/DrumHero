import type { Instrument } from "./types";

export type AudioDetection = { instrument: Instrument | null; confidence: number; peak: number; rms: number };
export type DrumFeatures = [number, number, number, number, number];
export type AudioTemplates<T extends string = Instrument> = Partial<Record<T, number[]>>;
export type AudioDynamicsLevels = { noiseRms?: number; ghostRms?: number; accentRms?: number };
export type DrumOnsetState = { active: boolean; quietSince: number; troughRms: number; previousRms: number; lastAttackAt: number };
export function createDrumOnsetState(): DrumOnsetState { return { active: false, quietSince: 0, troughRms: 0, previousRms: 0, lastAttackAt: -Infinity }; }

/** Detects a fresh transient while ignoring the decaying tail of the previous strike. */
export function isFreshDrumOnset(state: DrumOnsetState, peak: number, rms: number, threshold: number, now: number) {
  const quiet = peak < threshold * 0.55 && rms < threshold * 0.45;
  if (quiet) {
    state.quietSince ||= now;
    if (now - state.quietSince >= 32) {
      state.active = false;
      state.troughRms = 0;
    }
  } else state.quietSince = 0;

  let onset = false;
  if (!state.active && peak >= threshold) {
    state.active = true;
    state.lastAttackAt = now;
    state.troughRms = rms;
    onset = true;
  } else if (state.active) {
    state.troughRms = Math.min(state.troughRms || rms, rms);
    const recovered = rms >= Math.max(threshold * 0.35, state.troughRms * 1.8);
    const rising = rms >= state.previousRms * 1.2;
    if (now - state.lastAttackAt >= 32 && peak >= threshold && recovered && rising) {
      state.lastAttackAt = now;
      state.troughRms = rms;
      onset = true;
    }
  }
  state.previousRms = rms;
  return onset;
}

/** Maps a calibrated acoustic strike between ghost-note and accent references to a MIDI-like strength scale. */
export function estimateAudioVelocity(rms: number, levels?: AudioDynamicsLevels): number | null {
  const { noiseRms = 0, ghostRms = 0, accentRms = 0 } = levels ?? {};
  if (![rms, noiseRms, ghostRms, accentRms].every(Number.isFinite) || noiseRms <= 0 || ghostRms <= noiseRms * 1.2 || accentRms <= ghostRms * 1.15 || rms <= noiseRms * 1.35) return null;
  const log = (value: number) => Math.log(value / noiseRms);
  const position = (log(rms) - log(ghostRms)) / (log(accentRms) - log(ghostRms));
  return Math.round(Math.max(1, Math.min(127, 45 + position * 60)));
}

const bands: Array<[number, number]> = [[30, 90], [90, 250], [250, 1500], [1500, 5000], [5000, 20000]];

/** Compresses a short FFT into low, low-mid, mid, high-mid and high energy shares. */
export function drumSpectrumFeatures(spectrumDb: Float32Array, sampleRate: number, fftSize: number): DrumFeatures {
  const energy = bands.map(([low, high]) => {
    const first = Math.max(0, Math.floor(low * fftSize / sampleRate));
    const last = Math.min(spectrumDb.length, Math.ceil(Math.min(high, sampleRate / 2) * fftSize / sampleRate));
    let total = 0;
    for (let i = first; i < last; i += 1) {
      const db = spectrumDb[i];
      if (Number.isFinite(db)) total += 10 ** (db / 10);
    }
    return total;
  });
  const total = energy.reduce((sum, value) => sum + value, 0) || 1;
  return energy.map((value) => value / total) as DrumFeatures;
}

export function rankDrumFeatureMatches<T extends string = Instrument>(features: number[], templates: AudioTemplates<T>) {
  if (features.length !== 5) return [] as Array<{ instrument: T; similarity: number }>;
  return (Object.entries(templates) as Array<[T, number[] | undefined]>)
    .filter((entry): entry is [T, number[]] => Array.isArray(entry[1]) && entry[1].length === 5)
    .map(([instrument, template]) => {
      const dot = features.reduce((sum, value, index) => sum + value * template[index], 0);
      const a = Math.sqrt(features.reduce((sum, value) => sum + value * value, 0)) || 1;
      const b = Math.sqrt(template.reduce((sum, value) => sum + value * value, 0)) || 1;
      return { instrument, similarity: dot / (a * b) };
    })
    .sort((left, right) => right.similarity - left.similarity);
}

export function classifyDrumFeatures<T extends string = Instrument>(features: number[], templates: AudioTemplates<T>): { instrument: T | null; confidence: number } {
  const candidates = rankDrumFeatureMatches(features, templates);
  if (candidates.length < 2) return { instrument: null, confidence: 0 };
  const first = candidates[0], second = candidates[1]?.similarity ?? 0;
  const confidence = Math.max(0, Math.min(1, first.similarity));
  return confidence >= 0.88 && first.similarity - second >= 0.08
    ? { instrument: first.instrument, confidence }
    : { instrument: null, confidence };
}

/** Detects a transient only; calibrated spectral templates handle voice recognition. */
export function classifyDrumAudio(samples: Float32Array, sampleRate: number): AudioDetection {
  if (!samples.length || sampleRate <= 0) return { instrument: null, confidence: 0, peak: 0, rms: 0 };
  let peak = 0, energy = 0;
  const stride = Math.max(1, Math.floor(samples.length / 1024));
  let count = 0;
  for (let i = 0; i < samples.length; i += stride) {
    const value = samples[i];
    peak = Math.max(peak, Math.abs(value));
    energy += value * value;
    count += 1;
  }
  const rms = Math.sqrt(energy / Math.max(1, count));
  return { instrument: null, confidence: 0, peak: rms >= 0.012 && peak >= 0.035 ? peak : 0, rms };
}
