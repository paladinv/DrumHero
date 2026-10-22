import type { TrainerFeel } from "./trainer";
import type { RatedHit } from "./types";

export type TrainerLiveTiming = { count: number; averageOffsetMs: number; typicalDistanceMs: number; message: string };

export function summarizeTrainerLiveTiming(hits: RatedHit[], feel: TrainerFeel = "straight", pocketMs = 35, swingRatio = 2 / 3): TrainerLiveTiming | null {
  const measured = hits.filter(hit => typeof hit.offsetMs === "number" && (hit.rating === "great" || hit.rating === "good")).slice(-8);
  if (measured.length < 3) return null;
  const averageOffsetMs = Math.round(measured.reduce((sum, hit) => sum + (hit.offsetMs ?? 0), 0) / measured.length);
  const typicalDistanceMs = Math.round(measured.reduce((sum, hit) => sum + Math.abs(hit.offsetMs ?? 0), 0) / measured.length);
  const direction = averageOffsetMs > 12 ? "late" : averageOffsetMs < -12 ? "early" : "steady";
  const feelContext = feel === "shuffle-laid-back"
    ? `against the ${Math.round(swingRatio * 100)}% swung subdivision and ${pocketMs} ms laid-back snare target`
    : feel === "shuffle" ? `against the ${Math.round(swingRatio * 100)}% swung subdivision`
      : feel === "laid-back" ? `against the ${pocketMs} ms laid-back snare target`
        : "against the straight pulse";
  const message = direction === "steady" && typicalDistanceMs <= 30
    ? `Recent hits are sitting in the pocket ${feelContext}. Keep the same relaxed stroke.`
    : direction === "late"
      ? `Recent hits are trending ${averageOffsetMs} ms late ${feelContext}. Nudge the stroke toward the target.`
      : direction === "early"
        ? `Recent hits are trending ${Math.abs(averageOffsetMs)} ms early ${feelContext}. Let the target arrive before you strike.`
        : `Your timing is moving around by about ${typicalDistanceMs} ms ${feelContext}. Keep the subdivision even and relax between strokes.`;
  return { count: measured.length, averageOffsetMs, typicalDistanceMs, message };
}
