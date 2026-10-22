import type { TrainerRound } from "./trainer";

export type TrainerPlacementSummary = {
  completedRounds: number;
  totalRounds: number;
  averageAccuracy: number;
  title: string;
  recommendation: string;
};

function roundAccuracy(round: TrainerRound) {
  if (round.result) return round.result.accuracy;
  const total = round.ratings.length;
  if (!total) return null;
  const points = round.ratings.reduce((sum, rating) => sum + (rating === "clean" ? 100 : rating === "needsWork" ? 50 : 0), 0);
  return Math.round(points / total);
}

export function summarizeTrainerPlacement(rounds: TrainerRound[], patternIds: string[]): TrainerPlacementSummary | null {
  const latestByPattern = new Map<string, TrainerRound>();
  for (const round of rounds) {
    if (patternIds.includes(round.patternId) && roundAccuracy(round) !== null) {
      const previous = latestByPattern.get(round.patternId);
      if (!previous || round.playedAt > previous.playedAt) latestByPattern.set(round.patternId, round);
    }
  }
  const scores = patternIds.flatMap(id => {
    const round = latestByPattern.get(id);
    const accuracy = round ? roundAccuracy(round) : null;
    return accuracy === null ? [] : [accuracy];
  });
  if (scores.length < patternIds.length || !scores.length) return null;
  const averageAccuracy = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  if (averageAccuracy >= 85) return { completedRounds: scores.length, totalRounds: patternIds.length, averageAccuracy, title: "Ready to build tempo", recommendation: "Keep the pulse steady as you add more subdivisions, fills, and faster grooves." };
  if (averageAccuracy >= 65) return { completedRounds: scores.length, totalRounds: patternIds.length, averageAccuracy, title: "A solid foundation to build on", recommendation: "Keep practising the groove-to-fill transition and add tempo only when the beat stays relaxed." };
  return { completedRounds: scores.length, totalRounds: patternIds.length, averageAccuracy, title: "Start with the fundamentals", recommendation: "Work on a comfortable quarter-note pulse and simple backbeat before adding fills or speed." };
}
