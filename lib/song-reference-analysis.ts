import { meterBeats } from "./song-builder";

export type ReferenceAnalysis = {
  bpm: number;
  tempoConfidence: number;
  downbeatMs: number;
  downbeatConfidence: number;
};

/** Estimates a beat pulse and first bar phase from already-local reference audio. */
export function analyzeReferenceAudio(
  audio: Pick<AudioBuffer, "length" | "sampleRate" | "numberOfChannels" | "getChannelData">,
  preferredBpm = 100,
  meter = "4/4",
): ReferenceAnalysis | null {
  const frameMs = 10;
  const samplesPerFrame = Math.max(1, Math.round(audio.sampleRate * frameMs / 1000));
  const frameCount = Math.floor(audio.length / samplesPerFrame);
  if (frameCount < 800) return null;

  const energy = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame++) {
    const start = frame * samplesPerFrame;
    const end = Math.min(audio.length, start + samplesPerFrame);
    let sum = 0;
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const samples = audio.getChannelData(channel);
      for (let index = start; index < end; index++) {
        const sample = samples[index] ?? 0;
        sum += sample * sample;
      }
    }
    energy[frame] = Math.sqrt(sum / Math.max(1, (end - start) * audio.numberOfChannels));
  }

  const onset = new Float32Array(frameCount);
  let onsetTotal = 0;
  for (let frame = 1; frame < frameCount; frame++) {
    const rise = Math.max(0, energy[frame] - energy[frame - 1]);
    onset[frame] = rise;
    onsetTotal += rise;
  }
  if (onsetTotal < 0.0001) return null;

  const firstLag = Math.max(1, Math.round(60000 / 240 / frameMs));
  const lastLag = Math.min(Math.floor(frameCount / 4), Math.round(60000 / 40 / frameMs));
  let peak = 0;
  let lagScores: Array<{ lag: number; score: number }> = [];
  for (let lag = firstLag; lag <= lastLag; lag++) {
    let product = 0, left = 0, right = 0;
    for (let frame = lag; frame < frameCount; frame++) {
      const earlier = onset[frame - lag] ?? 0;
      const later = onset[frame] ?? 0;
      product += earlier * later;
      left += earlier * earlier;
      right += later * later;
    }
    const score = product / Math.sqrt(Math.max(1e-12, left * right));
    lagScores.push({ lag, score });
    peak = Math.max(peak, score);
  }
  if (peak < 0.015) return null;

  const preferred = Math.max(40, Math.min(240, preferredBpm));
  const nearPreferred = lagScores.filter(({ lag, score }) => {
    const bpm = 60000 / (lag * frameMs);
    return Math.abs(bpm - preferred) <= preferred * 0.12 && score >= peak * 0.78;
  }).sort((a, b) => Math.abs(60000 / (a.lag * frameMs) - preferred) - Math.abs(60000 / (b.lag * frameMs) - preferred));
  const best = nearPreferred[0] ?? lagScores.reduce((winner, item) => item.score > winner.score ? item : winner, lagScores[0]);
  const bpm = Math.round(60000 / (best.lag * frameMs));
  const scores = lagScores.map(item => item.score).sort((a, b) => a - b);
  const medianScore = scores[Math.floor(scores.length / 2)] ?? 0;
  const tempoConfidence = Math.max(0, Math.min(100, Math.round((best.score - medianScore) / Math.max(0.01, peak - medianScore) * 100)));

  const barFrames = Math.max(best.lag, Math.round(best.lag * meterBeats(meter)));
  let bestPhase = 0, bestPhaseScore = -1, phaseTotal = 0, phaseCount = 0;
  for (let phase = 0; phase < barFrames; phase++) {
    let score = 0;
    for (let frame = phase; frame < frameCount; frame += barFrames) {
      score += onset[frame] ?? 0;
      if (frame + 1 < frameCount) score += (onset[frame + 1] ?? 0) * 0.35;
    }
    phaseTotal += score;
    phaseCount++;
    if (score > bestPhaseScore) { bestPhase = phase; bestPhaseScore = score; }
  }
  const meanPhase = phaseTotal / Math.max(1, phaseCount);
  const downbeatConfidence = Math.max(0, Math.min(100, Math.round((bestPhaseScore - meanPhase) / Math.max(1e-9, bestPhaseScore) * 100)));
  return { bpm, tempoConfidence, downbeatMs: bestPhase * frameMs, downbeatConfidence };
}
