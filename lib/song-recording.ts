import type { DrumPart } from "./song-library";
export type SongRecording = {
  id: string;
  songId: string;
  sectionId?: string;
  createdAt: string;
  durationMs: number;
  mimeType: string;
  timingConsistency: number | null;
  hitCount: number;
  matchedHits?: number;
  missedTargets?: number;
  extraHits?: number;
  meanOffsetMs?: number | null;
  onsetTimes?: number[];
  confidence?: "low" | "medium" | "high";
  targetBpm?: number;
  patternFingerprint?: string;
};

export type DrumRecordingComparison = {
  referenceMatchRate: number;
  studentMatchRate: number;
  matchRateDelta: number;
  referenceMeanTimingErrorMs: number | null;
  studentMeanTimingErrorMs: number | null;
  meanTimingErrorDeltaMs: number | null;
  referenceExtraHitsPer100: number;
  studentExtraHitsPer100: number;
  extraHitsPer100Delta: number;
  confidence: "low" | "medium" | "high";
  summary: string;
};

export function drumPartFingerprint(part?: Pick<DrumPart, "beats" | "subdivision" | "hits">): string | null {
  if (!part) return null;
  const hits = part.hits
    .map((hit) => [hit.step, hit.instrument, Boolean(hit.accent)] as const)
    .sort((left, right) => left[0] - right[0] || left[1].localeCompare(right[1]) || Number(left[2]) - Number(right[2]));
  return JSON.stringify({ beats: part.beats, subdivision: part.subdivision, hits });
}

export function compareDrumRecordings(student: SongRecording, reference: SongRecording): DrumRecordingComparison | null {
  if (
    student.songId !== reference.songId ||
    (student.sectionId ?? "") !== (reference.sectionId ?? "") ||
    !student.patternFingerprint ||
    student.patternFingerprint !== reference.patternFingerprint ||
    typeof student.targetBpm !== "number" ||
    !Number.isFinite(student.targetBpm) ||
    student.targetBpm !== reference.targetBpm ||
    typeof student.timingConsistency !== "number" ||
    !Number.isFinite(student.timingConsistency) ||
    typeof reference.timingConsistency !== "number" ||
    !Number.isFinite(reference.timingConsistency) ||
    typeof student.matchedHits !== "number" ||
    !Number.isFinite(student.matchedHits) ||
    typeof reference.matchedHits !== "number" ||
    !Number.isFinite(reference.matchedHits) ||
    typeof student.missedTargets !== "number" ||
    !Number.isFinite(student.missedTargets) ||
    typeof reference.missedTargets !== "number" ||
    !Number.isFinite(reference.missedTargets) ||
    typeof student.extraHits !== "number" ||
    !Number.isFinite(student.extraHits) ||
    typeof reference.extraHits !== "number" ||
    !Number.isFinite(reference.extraHits)
  ) return null;

  const studentExpected = student.matchedHits + student.missedTargets;
  const referenceExpected = reference.matchedHits + reference.missedTargets;
  if (!studentExpected || !referenceExpected) return null;

  const round = (value: number) => Math.round(value * 10) / 10;
  const studentMatchRate = round((student.matchedHits / studentExpected) * 100);
  const referenceMatchRate = round((reference.matchedHits / referenceExpected) * 100);
  const studentExtraHitsPer100 = round((student.extraHits / studentExpected) * 100);
  const referenceExtraHitsPer100 = round((reference.extraHits / referenceExpected) * 100);
  const studentMeanTimingErrorMs = typeof student.meanOffsetMs === "number" && Number.isFinite(student.meanOffsetMs) ? student.meanOffsetMs : null;
  const referenceMeanTimingErrorMs = typeof reference.meanOffsetMs === "number" && Number.isFinite(reference.meanOffsetMs) ? reference.meanOffsetMs : null;
  const matchRateDelta = round(studentMatchRate - referenceMatchRate);
  const extraHitsPer100Delta = round(studentExtraHitsPer100 - referenceExtraHitsPer100);
  const meanTimingErrorDeltaMs = studentMeanTimingErrorMs !== null && referenceMeanTimingErrorMs !== null
    ? Math.round(studentMeanTimingErrorMs - referenceMeanTimingErrorMs)
    : null;
  const confidence = student.confidence === "high" && reference.confidence === "high"
    ? "high"
    : student.confidence === "medium" && reference.confidence === "medium"
      ? "medium"
      : "low";
  const matchSummary = matchRateDelta === 0
    ? `Your take matched the same share of expected hits as the reference (${studentMatchRate}%).`
    : `Your take matched ${Math.abs(matchRateDelta)} percentage points ${matchRateDelta > 0 ? "more" : "fewer"} expected hits than the reference (${studentMatchRate}% vs ${referenceMatchRate}%).`;
  const timingSummary = meanTimingErrorDeltaMs === null
    ? "Average timing error is unavailable for one of the takes."
    : meanTimingErrorDeltaMs === 0
      ? "Average timing error matches the reference."
      : `Average timing error is ${Math.abs(meanTimingErrorDeltaMs)} ms ${meanTimingErrorDeltaMs < 0 ? "lower" : "higher"} than the reference.`;
  const extraSummary = extraHitsPer100Delta === 0
    ? "Extra-hit rate matches the reference."
    : `Extra-hit rate is ${Math.abs(extraHitsPer100Delta)} per 100 expected hits ${extraHitsPer100Delta < 0 ? "lower" : "higher"} than the reference.`;

  return {
    referenceMatchRate,
    studentMatchRate,
    matchRateDelta,
    referenceMeanTimingErrorMs,
    studentMeanTimingErrorMs,
    meanTimingErrorDeltaMs,
    referenceExtraHitsPer100,
    studentExtraHitsPer100,
    extraHitsPer100Delta,
    confidence,
    summary: `${matchSummary} ${timingSummary} ${extraSummary}`
  };
}

const DB_NAME = "drum-hero-song-recordings";
const STORE = "takes";
function db(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
export async function saveTake(id: string, blob: Blob) { const database = await db(); try { await new Promise<void>((resolve, reject) => { const transaction = database.transaction(STORE, "readwrite"); transaction.objectStore(STORE).put(blob, id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); } finally { database.close(); } }
export async function loadTake(id: string): Promise<Blob | null> { const database = await db(); try { return await new Promise((resolve, reject) => { const request = database.transaction(STORE).objectStore(STORE).get(id); request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null); request.onerror = () => reject(request.error); }); } finally { database.close(); } }
export async function deleteTake(id: string) { const database = await db(); try { await new Promise<void>((resolve, reject) => { const transaction = database.transaction(STORE, "readwrite"); transaction.objectStore(STORE).delete(id); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); }); } finally { database.close(); } }
export async function analyzeTake(blob: Blob, targetBpm: number, part?: Pick<DrumPart, "beats" | "subdivision" | "hits">): Promise<Pick<SongRecording, "hitCount" | "timingConsistency" | "matchedHits" | "missedTargets" | "extraHits" | "meanOffsetMs" | "onsetTimes" | "confidence">> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    const data = buffer.getChannelData(0), sampleRate = buffer.sampleRate;
    const windowSize = Math.max(256, Math.floor(sampleRate * 0.012));
    const energies: number[] = [];
    for (let offset = 0; offset < data.length; offset += windowSize) { let energy = 0; for (let i = offset; i < Math.min(data.length, offset + windowSize); i++) energy += data[i] * data[i]; energies.push(Math.sqrt(energy / windowSize)); }
    const peak = energies.reduce((maximum, energy) => Math.max(maximum, energy), 0), threshold = Math.max(0.015, peak * 0.22);
    const onsets: number[] = [];
    for (let i = 2; i < energies.length - 2; i++) if (energies[i] > threshold && energies[i] > energies[i - 1] * 1.5 && energies[i] > energies[i + 1] && (!onsets.length || i * windowSize / sampleRate - onsets[onsets.length - 1] > 0.09)) onsets.push(Math.round(i * windowSize / sampleRate * 1000) / 1000);
    if (!part || !part.hits.length || onsets.length < 2) return { hitCount: onsets.length, timingConsistency: null, matchedHits: 0, missedTargets: part?.hits.length ?? 0, extraHits: onsets.length, meanOffsetMs: null, onsetTimes: onsets.slice(0, 100), confidence: onsets.length < 3 ? "low" : "medium" };
    const stepSec = 60 / targetBpm * (4 / part.subdivision), loopSec = part.beats * 60 / targetBpm;
    const expectedOffsets = part.hits.map((hit) => hit.step * stepSec).sort((a, b) => a - b);
    const clipDuration = buffer.duration;
    const tolerance = 0.11;
    let best = { phase: 0, matched: -1, extras: onsets.length, absError: Number.POSITIVE_INFINITY, misses: 0 };
    const scan = Math.max(0.005, stepSec / 40);
    for (let phase = 0; phase < loopSec && phase < clipDuration + loopSec; phase += scan) {
      const used = new Set<number>(); let matched = 0, absError = 0, expectedCount = 0;
      for (let bar = 0; phase + bar * loopSec <= clipDuration; bar++) for (const offset of expectedOffsets) {
        const target = phase + bar * loopSec + offset;
        if (target > clipDuration) continue;
        expectedCount++;
        let bestIndex = -1, nearest = tolerance;
        onsets.forEach((onset, index) => { const delta = Math.abs(onset - target); if (!used.has(index) && delta < nearest) { nearest = delta; bestIndex = index; } });
        if (bestIndex >= 0) { used.add(bestIndex); matched++; absError += nearest; }
      }
      const extras = onsets.length - used.size, misses = expectedCount - matched;
      if (matched > best.matched || (matched === best.matched && extras < best.extras) || (matched === best.matched && extras === best.extras && absError < best.absError)) best = { phase, matched, extras, absError, misses };
    }
    const expectedTotal = best.matched + best.misses;
    const consistency = expectedTotal ? Math.round(100 * best.matched / expectedTotal) : null;
    const meanOffsetMs = best.matched ? Math.round(best.absError / best.matched * 1000) : null;
    return { hitCount: onsets.length, timingConsistency: consistency, matchedHits: best.matched, missedTargets: best.misses, extraHits: best.extras, meanOffsetMs, onsetTimes: onsets.slice(0, 100), confidence: best.matched >= 8 && onsets.length >= 8 ? "medium" : "low" };
  } finally { await context.close(); }
}
