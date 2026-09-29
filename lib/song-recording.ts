import type { DrumPart } from "./song-library";
export type SongRecording = { id: string; songId: string; sectionId?: string; createdAt: string; durationMs: number; mimeType: string; timingConsistency: number | null; hitCount: number; matchedHits?: number; missedTargets?: number; extraHits?: number; meanOffsetMs?: number | null; onsetTimes?: number[]; confidence?: "low" | "medium" | "high" };
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
