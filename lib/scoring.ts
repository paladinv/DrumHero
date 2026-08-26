import type { HitRating, Instrument, RatedHit, SessionResult } from "./types";

export function classifyOffset(offsetMs: number): HitRating {
  const absolute = Math.abs(offsetMs);
  if (absolute <= 50) return "great";
  if (absolute <= 100) return "good";
  return "miss";
}

export function stepDurationMs(bpm: number, subdivision: number) {
  return (60_000 / bpm) * (4 / subdivision);
}

export function expectedTimeline(bpm: number, subdivision: number, steps: number, startAt = 0) {
  const duration = stepDurationMs(bpm, subdivision);
  return Array.from({ length: steps }, (_, index) => startAt + index * duration);
}

export function summarizeHits(hits: RatedHit[], patternId: string, patternName: string, bpm: number, playedAt = new Date().toISOString()): SessionResult {
  const counts = { great: 0, good: 0, miss: 0, extra: 0 };
  let combo = 0;
  let maxCombo = 0;
  hits.forEach((hit) => {
    counts[hit.rating] += 1;
    if (hit.rating === "great" || hit.rating === "good") {
      combo += 1;
      maxCombo = Math.max(combo, maxCombo);
    } else combo = 0;
  });
  const expected = counts.great + counts.good + counts.miss;
  const points = counts.great * 100 + counts.good * 70;
  const score = expected ? Math.max(0, Math.round(points / expected - counts.extra * 2)) : 0;
  const accuracy = expected ? Math.round(((counts.great + counts.good) / expected) * 100) : 0;
  return { id: `${patternId}-${playedAt}`, patternId, patternName, bpm, playedAt, score, accuracy, ...counts, maxCombo };
}

export function findClosestExpected(now: number, expected: Array<{ at: number; instrument: Instrument; matched: boolean }>, instrument: Instrument) {
  let bestIndex = -1;
  let bestOffset = Number.POSITIVE_INFINITY;
  expected.forEach((hit, index) => {
    if (hit.matched || hit.instrument !== instrument) return;
    const offset = now - hit.at;
    if (Math.abs(offset) < Math.abs(bestOffset)) { bestOffset = offset; bestIndex = index; }
  });
  return { index: bestIndex, offset: bestOffset };
}

