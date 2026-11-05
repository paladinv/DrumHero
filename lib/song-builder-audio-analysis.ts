import type { DrumPart } from './song-library';
import type { SongInstrument } from './types';
import type { ArrangementBar } from './song-builder';

export type BackingHitSuggestion = { timeSeconds: number; voice: 'kick' | 'snare' | 'hihat'; confidence: number };
export type BackingAudioAnalysis = { bpm: number; firstBeatSeconds: number; analyzedSeconds: number; hits: BackingHitSuggestion[] };
export type MicrophoneOnset = { timeSeconds: number; confidence: number };
export type ArrangementHitSuggestion = { barIndex: number; measure: number; sectionId: string; sectionName: string; partId: string; partName: string; hits: DrumPart['hits']; confidence: number };

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
    if (buffer.duration > 10 * 60) throw new Error('This browser can analyze backing tracks up to ten minutes long. Trim the audio and try again.');
    const analyzedSeconds = buffer.duration;
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
    const strongest = candidates.slice(0, 10_000);
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

/** Detects likely acoustic drum strikes in a short microphone take. Results are deliberately unclassified. */
export async function analyzeMicrophoneOnsets(blob: Blob): Promise<MicrophoneOnset[]> {
  const Context = window.AudioContext;
  if (!Context) throw new Error('Microphone audio analysis is unavailable in this browser.');
  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    const frameSize = Math.max(128, Math.round(buffer.sampleRate * 0.01));
    const frames = Math.ceil(buffer.length / frameSize);
    const energy = new Float32Array(frames);
    for (let frame = 0; frame < frames; frame += 1) {
      const start = frame * frameSize, end = Math.min(buffer.length, start + frameSize);
      let sum = 0;
      for (const channel of channels) for (let index = start; index < end; index += 1) sum += (channel[index] ?? 0) ** 2;
      energy[frame] = Math.sqrt(sum / Math.max(1, (end - start) * channels.length));
    }
    const flux = new Float32Array(frames);
    for (let frame = 1; frame < frames; frame += 1) flux[frame] = Math.max(0, energy[frame]! - energy[frame - 1]!);
    const sorted = Array.from(flux).sort((a, b) => a - b);
    const threshold = Math.max(sorted[Math.floor(sorted.length * 0.68)]! * 1.8, sorted[Math.floor(sorted.length * 0.92)]! * 0.22, 0.0005);
    const onsets: MicrophoneOnset[] = [];
    let lastFrame = -20;
    for (let frame = 2; frame < frames - 1; frame += 1) {
      const value = flux[frame]!;
      if (value < threshold || value < flux[frame - 1]! || value < flux[frame + 1]! || frame - lastFrame < 8) continue;
      onsets.push({ timeSeconds: Math.round(frame * frameSize / buffer.sampleRate * 1000) / 1000, confidence: Math.min(0.99, Math.max(0.25, value / Math.max(threshold, sorted.at(-1) ?? threshold))) });
      lastFrame = frame;
    }
    return onsets.slice(0, 512);
  } finally { await context.close(); }
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

/** Map audio transients across the arrangement timeline, keeping each measure reviewable. */
export function backingSuggestionsForArrangement(analysis: BackingAudioAnalysis, bars: ArrangementBar[], downbeatSeconds: number): ArrangementHitSuggestion[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const bar of bars) { starts.push(cursor); cursor += bar.beats * 60 / bar.bpm; }
  const groups = new Map<number, { bar: ArrangementBar; hits: Map<string, DrumPart['hits'][number]>; confidence: number; count: number }>();
  for (const candidate of analysis.hits) {
    const elapsed = candidate.timeSeconds - downbeatSeconds;
    if (elapsed < 0 || elapsed >= cursor) continue;
    let barIndex = starts.findIndex((start, index) => elapsed >= start && elapsed < start + bars[index]!.beats * 60 / bars[index]!.bpm);
    if (barIndex < 0) continue;
    const bar = bars[barIndex];
    if (!bar) continue;
    const beat = bar.partBeatOffset + (elapsed - starts[barIndex]!) * bar.bpm / 60;
    const step = Math.round(beat * bar.subdivision / 4);
    if (step < 0 || step >= Math.ceil(bar.partBeats * bar.subdivision / 4)) continue;
    const key = `${candidate.voice}:${step}`;
    const group = groups.get(barIndex) ?? { bar, hits: new Map(), confidence: 0, count: 0 };
    const velocity = Math.round(55 + candidate.confidence * 55);
    const previous = group.hits.get(key);
    if (!previous || (previous.velocity ?? 0) < velocity) group.hits.set(key, { instrument: candidate.voice, step, velocity, accent: candidate.confidence > 0.72 });
    group.confidence += candidate.confidence;
    group.count += 1;
    groups.set(barIndex, group);
  }
  return [...groups.entries()].map(([barIndex, group]) => ({
    barIndex, measure: group.bar.number, sectionId: group.bar.sectionId, sectionName: group.bar.sectionName,
    partId: group.bar.partId, partName: group.bar.partName,
    hits: [...group.hits.values()].sort((a, b) => a.step - b.step), confidence: group.confidence / Math.max(1, group.count)
  })).sort((a, b) => a.barIndex - b.barIndex);
}
