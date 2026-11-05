import type { TrainerRound } from "@/lib/trainer";
import type { PracticePattern } from "@/lib/types";
import { summarizeTrainerRoundInsight } from "@/lib/trainer-round-insights";
import { useLocalization } from "@/components/LocalizationProvider";

export function TrainerRoundExplanation({ round, pattern }: { round: TrainerRound; pattern: PracticePattern }) {
  const { t } = useLocalization();
  const insight = summarizeTrainerRoundInsight(round, pattern);
  if (!insight) return null;
  const copy = insight.localized;
  const instrumentNames: Record<string, string> = { kick: "Kick", snare: "Snare", hihat: "Hi-hat", tom: "Tom", crash: "Crash" };
  const localize = (item: typeof copy.title): string => {
    const values = { ...item.values };
    if (typeof values.direction === "string") values.direction = t(values.direction);
    if (typeof values.instrument === "string") values.instrument = t(instrumentNames[values.instrument] ?? values.instrument);
    if (item.key.includes("{great}")) {
      values.great = t("Great");
      values.good = t("Good");
    }
    if (values.timing !== undefined) values.timing = localize(copy.timingSummary);
    return t(item.key, values);
  };
  return <section className="trainer-round-explanation" aria-labelledby="trainer-round-explanation-title">
    <h4 id="trainer-round-explanation-title">{localize(copy.title)}</h4>
    <p>{localize(copy.message)}</p>
    {copy.warning.length > 0 && <p className="trainer-round-explanation-warning" role="status">{copy.warning.map(localize).join(" ")}</p>}
    <p><strong>{t("Try next:")}</strong> {localize(copy.nextStep)}</p>
    <small>{localize(copy.reliability)}</small>
  </section>;
}
