import type { TrainerRound } from "./trainer";
import type { PracticePattern } from "./types";

export type TrainerRoundInsight = {
  title: string;
  message: string;
  nextStep: string;
  reliability: string;
  warning?: string;
};

export function summarizeTrainerRoundInsight(round: TrainerRound, pattern: PracticePattern): TrainerRoundInsight | null {
  if (round.mode !== "scored" || !round.result) return null;
  const hits = round.hits ?? [];
  const targetHits = hits.filter(hit => hit.rating !== "extra");
  const offsets = targetHits.flatMap(hit => typeof hit.offsetMs === "number" ? [hit.offsetMs] : []);
  const meanOffset = offsets.length ? offsets.reduce((sum, value) => sum + value, 0) / offsets.length : null;
  const meanDistance = offsets.length ? offsets.reduce((sum, value) => sum + Math.abs(value), 0) / offsets.length : null;
  const timingSummary = meanOffset === null
    ? "This input did not provide measured hit timing."
    : `Measured hits averaged ${Math.round(Math.abs(meanOffset))} ms ${meanOffset > 8 ? "late" : meanOffset < -8 ? "early" : "from the target"}; typical timing distance was ${Math.round(meanDistance ?? 0)} ms.`;
  const sourceName = round.inputProfile ?? round.source;
  const reliability = `Scored with ${sourceName}. Compare progress using the same input profile and setup.`;
  const warningParts = [
    round.inputClipped ? "The audio input clipped; lower gain or move the microphone farther away." : "",
    round.uncertainDetections ? `${round.uncertainDetections} audio detections were uncertain; recalibrate before comparing this score.` : "",
  ].filter(Boolean);
  const warning = warningParts.length ? warningParts.join(" ") : undefined;

  if (warning) {
    return {
      title: "Check the input before using this score",
      message: `${round.result.accuracy}% of scored targets were Great or Good. ${timingSummary}`,
      nextStep: round.inputClipped ? "Adjust microphone gain, then run the strike signal check again." : "Recalibrate the uncertain drum voices, then score another round.",
      reliability,
      warning,
    };
  }

  const missesByTarget = new Map<string, { instrument: string; beat: number; count: number }>();
  for (const hit of hits) {
    if (hit.rating !== "miss" || hit.step === undefined) continue;
    const beat = Math.floor(hit.step / (pattern.subdivision / 4)) + 1;
    const key = `${hit.instrument}:${beat}`;
    const group = missesByTarget.get(key) ?? { instrument: hit.instrument, beat, count: 0 };
    group.count += 1;
    missesByTarget.set(key, group);
  }
  const weakest = [...missesByTarget.values()].sort((a, b) => b.count - a.count)[0];
  if (weakest) {
    return {
      title: "Focus on the missed strokes",
      message: `${round.result.accuracy}% accuracy. ${weakest.instrument} on beat ${weakest.beat} had the most missed targets (${weakest.count}). ${timingSummary}`,
      nextStep: `Loop beat ${weakest.beat} at ${Math.max(pattern.tempoRange[0], round.bpm - 5)} BPM, then retry the full groove.`,
      reliability,
    };
  }
  if ((round.result.extra ?? 0) > 0) {
    return {
      title: "Keep the pattern uncluttered",
      message: `${round.result.extra} extra ${round.result.extra === 1 ? "stroke was" : "strokes were"} played outside the target pattern. ${timingSummary}`,
      nextStep: "Listen to one bar, then play only the notes shown in the target grid.",
      reliability,
    };
  }
  if (meanDistance !== null && meanDistance > 50 && meanOffset !== null) {
    return {
      title: "Settle the pulse",
      message: `${round.result.accuracy}% accuracy. Hits tended ${meanOffset > 0 ? "late" : "early"} by ${Math.round(Math.abs(meanOffset))} ms on average.`,
      nextStep: `Repeat at ${Math.max(pattern.tempoRange[0], round.bpm - 5)} BPM and keep each stroke with the click.`,
      reliability,
    };
  }
  return {
    title: "Good control",
    message: `${round.result.accuracy}% accuracy with ${round.result.miss} missed targets and ${round.result.extra} extra strokes. ${timingSummary}`,
    nextStep: round.result.accuracy >= 90
      ? `Try the next tempo step or move to the next groove in your skill path.`
      : "Repeat this round once more and aim for the same steady pulse.",
    reliability,
  };
}
