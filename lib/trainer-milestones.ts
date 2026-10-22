import type { TrainerRound } from "./trainer";

export type TrainerMilestone = {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  earned: boolean;
};

export function summarizeTrainerMilestones(rounds: TrainerRound[]): TrainerMilestone[] {
  const reliable = rounds.filter((round) => round.mode === "scored" && round.result && !round.inputClipped && !round.uncertainDetections);
  const uniquePatterns = new Set(reliable.map((round) => basePatternId(round.patternId))).size;
  const pocketHits = Math.max(0, ...reliable.map((round) => {
    const timed = (round.hits ?? []).filter((hit) => hit.offsetMs !== null && hit.offsetMs !== undefined && hit.rating !== "miss" && hit.rating !== "extra" && hit.transition !== "landing");
    if (round.result!.accuracy < 80) return 0;
    return timed.filter((hit) => Math.abs(hit.offsetMs!) <= 25).length;
  }));
  const goodFillReturns = reliable.reduce((sum, round) => sum + (round.hits ?? []).filter((hit) => hit.transition === "landing" && (hit.rating === "great" || hit.rating === "good")).length, 0);
  const minuteRounds = reliable.filter((round) => (round.durationSeconds ?? 0) >= 60 && round.result!.accuracy >= 80).length;

  return [
    milestone("first-score", "First scored round", "Finish one reliable scored round.", reliable.length, 1),
    milestone("five-rounds", "Five rounds", "Build a short practice streak with five reliable rounds.", reliable.length, 5),
    milestone("pattern-explorer", "Pattern explorer", "Try five different grooves, fills, or song parts.", uniquePatterns, 5),
    milestone("steady-pocket", "Steady pocket", "Land 16 hits within 25 ms in a round scoring at least 80%.", pocketHits, 16),
    milestone("fill-return", "Fill and return", "Land eight groove hits cleanly after a fill.", goodFillReturns, 8),
    milestone("minute-groove", "Minute groove", "Complete a 60-second scored round at 80% accuracy or better.", minuteRounds, 1),
  ];
}

function milestone(id: string, title: string, description: string, progress: number, target: number): TrainerMilestone {
  const safeProgress = Math.min(target, Math.max(0, Math.floor(progress)));
  return { id, title, description, progress: safeProgress, target, earned: safeProgress >= target };
}

function basePatternId(patternId: string): string {
  let current = patternId;
  while (current.startsWith("trainer-cue:")) {
    current = current.split(":").slice(2).join(":");
  }
  if (current.startsWith("loop:")) {
    const [, encodedPatternId] = current.split(":");
    try { return basePatternId(decodeURIComponent(encodedPatternId)); }
    catch { return current; }
  }
  return current;
}
