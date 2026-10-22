import type { DrumPart } from './song-library';
import type { SongInstrument } from './types';

export type BackingHitSuggestion = { timeSeconds: number; voice: 'kick' | 'snare' | 'hihat'; confidence: number };
export type BackingAudioAnalysis = { bpm: number; firstBeatSeconds: number; analyzedSeconds: number; hits: BackingHitSuggestion[] };

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function classifyHit(samples: Float32Array, sampleRate: number, timeSeconds: number): BackingHitSuggestion['voice'] {
  const start = Math.max(0, Math.floor((timeSeconds - 0.004) * sampleRate));
  const end = Math.min(samples.length, start + Math.floor(sampleRate * 0.045));
  const lowAlpha = Math.exp(-2 * Math.PI * 150 / sampleRate);
  const highAlpha = Math.exp(-2 * Math.PI * 4200 / sampleRate);
  let lowState = 0, highState = 0, lowEnergy = 0, midEnergy = 0, highEnergy = 0;
  for (let index = start; index < end; index += 1) {
    const value = samples[index] ?? 0;
    lowState = (1 - lowAlpha) * value + lowAlpha * lowState;
    highState = (1 - highAlpha) * value + highAlpha * highState;
    const low = lowState, high = value - highState, mid = value - low - high;
    lowEnergy += low * low; midEnergy += mid * mid; highEnergy += high * high;
  }
  const total = lowEnergy + midEnergy + highEnergy + 1e-12;
  if (lowEnergy / total > 0.43) return 'kick';
  if (highEnergy / total > 0.46) return 'hihat';
  return 'snare';
}

/** Estimate pulse and transient candidates locally in the browser. These suggestions are intentionally reviewable heuristics, not a drum transcription. */
export async function analyzeBackingAudio(blob: Blob): Promise<BackingAudioAnalysis> {
  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) throw new Error('Audio analysis is unavailable in this browser.');
  const context = new AudioContextClass();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const analyzedSeconds = Math.min(buffer.duration, 180);
    if (analyzedSeconds < 2) throw new Error('Choose a backing track that is at least two seconds long.');
    const source = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const sampleLimit = Math.min(source.length, Math.floor(analyzedSeconds * sampleRate));
    const frameSize = Math.max(1, Math.round(sampleRate * 0.01));
    const frames = Math.floor(sampleLimit / frameSize);
    const energy = new Float32Array(frames);
    const mono = source.subarray(0, sampleLimit);
    for (let frame = 0; frame < frames; frame += 1) {
      const first = frame * frameSize, last = Math.min(sampleLimit, first + frameSize);
      let sum = 0;
      for (let index = first; index < last; index += 1) sum += (mono[index] ?? 0) ** 2;
      energy[frame] = Math.sqrt(sum / Math.max(1, last - first));
    }
    const onset = new Float32Array(frames);
    for (let index = 1; index < frames; index += 1) onset[index] = Math.max(0, energy[index]! - energy[index - 1]!);
    const candidates: Array<{ frame: number; strength: number }> = [];
    const sortedOnset = Array.from(onset).sort((a, b) => a - b);
    const quantile = (p: number) => sortedOnset[Math.min(sortedOnset.length - 1, Math.floor((sortedOnset.length - 1) * p))] ?? 0;
    const threshold = Math.max(quantile(0.45) * 1.8, quantile(0.9) * 0.22, 0.0003);
    let lastFrame = -10;
    for (let index = 2; index < frames - 1; index += 1) {
      const value = onset[index] ?? 0;
      if (value < threshold || value < (onset[index - 1] ?? 0) || value < (onset[index + 1] ?? 0) || index - lastFrame < 9) continue;
      candidates.push({ frame: index, strength: value });
      lastFrame = index;
    }
    if (!candidates.length) throw new Error('No clear transients were found. Try a louder or less compressed reference track.');

    const onsetFrames = candidates.map(candidate => candidate.frame);
    let bestBpm = 100, bestScore = -Infinity;
    for (let bpm = 60; bpm <= 180; bpm += 0.25) {
      const lag = Math.max(1, Math.round(6000 / bpm));
      let score = 0, weight = 0;
      for (const frame of onsetFrames) {
        if (frame >= lag) {
          score += Math.min(1, (onset[frame] ?? 0) / (threshold * 3)) * Math.min(1, (onset[frame - lag] ?? 0) / (threshold * 3));
          weight += 1;
        }
      }
      const normalized = weight ? score / weight : 0;
      if (normalized > bestScore) { bestScore = normalized; bestBpm = bpm; }
    }
    const bpm = Math.round(clamp(bestBpm, 40, 200));
    const strongest = candidates.slice(0, 500);
    const maxStrength = Math.max(1e-9, ...strongest.map(candidate => candidate.strength));
    const hits = strongest.map(candidate => {
      const timeSeconds = candidate.frame / 100;
      return { timeSeconds, voice: classifyHit(mono, sampleRate, timeSeconds), confidence: clamp(candidate.strength / maxStrength, 0.25, 0.98) };
    });
    return { bpm, firstBeatSeconds: hits[0]?.timeSeconds ?? 0, analyzedSeconds, hits };
  } finally {
    await context.close();
  }
}

/** Keep only suggestions that fit the target pattern and snap them to its existing editable grid. */
export function backingSuggestionsForPart(analysis: BackingAudioAnalysis, part: DrumPart) {
  const stepCount = Math.max(1, Math.round(part.beats * part.subdivision / 4));
  const duration = part.beats * 60 / analysis.bpm;
  const best = new Map<string, DrumPart['hits'][number]>();
  for (const candidate of analysis.hits) {
    const relative = candidate.timeSeconds - analysis.firstBeatSeconds;
    if (relative < 0 || relative >= duration) continue;
    const step = Math.round(relative * analysis.bpm / 60 * part.subdivision / 4);
    if (step < 0 || step >= stepCount) continue;
    const key = `${candidate.voice}:${step}`;
    const prior = best.get(key);
    if (prior && (prior.velocity ?? 0) >= Math.round(55 + candidate.confidence * 55)) continue;
    best.set(key, { instrument: candidate.voice as SongInstrument, step, velocity: Math.round(55 + candidate.confidence * 55), accent: candidate.confidence > 0.72 });
  }
  return [...best.values()].sort((a, b) => a.step - b.step);
}
