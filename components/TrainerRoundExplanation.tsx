import type { TrainerRound } from "@/lib/trainer";
import type { PracticePattern } from "@/lib/types";
import { summarizeTrainerRoundInsight } from "@/lib/trainer-round-insights";

export function TrainerRoundExplanation({ round, pattern }: { round: TrainerRound; pattern: PracticePattern }) {
  const insight = summarizeTrainerRoundInsight(round, pattern);
  if (!insight) return null;
  return <section className="trainer-round-explanation" aria-labelledby="trainer-round-explanation-title">
    <h4 id="trainer-round-explanation-title">{insight.title}</h4>
    <p>{insight.message}</p>
    {insight.warning && <p className="trainer-round-explanation-warning" role="status">{insight.warning}</p>}
    <p><strong>Try next:</strong> {insight.nextStep}</p>
    <small>{insight.reliability}</small>
  </section>;
}
