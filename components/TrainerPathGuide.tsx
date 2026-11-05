"use client";

import type { TrainerRound } from "@/lib/trainer";
import type { PracticePattern } from "@/lib/types";
import { localizedPattern } from "@/lib/teaching-pattern-display";
import { useLocalization } from "@/components/LocalizationProvider";

type LocalizedStatus = { key: string; values?: Record<string, string | number> };

type Path = { id: string; name: string; patternIds: readonly string[] };

function reliableRounds(rounds: TrainerRound[], patternId: string) {
  return rounds.filter(round => round.patternId === patternId && !round.inputClipped && !round.uncertainDetections)
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

function checkpointStatus(round: TrainerRound | undefined, accuracyTarget: number, timingTarget: number): LocalizedStatus {
  if (!round) return { key: "No saved attempt yet" };
  const accuracy = round.result?.accuracy ?? (round.ratings.length
    ? Math.round(round.ratings.filter(item => item === "clean").length / round.ratings.length * 100)
    : null);
  if (accuracy === null) return { key: "No scored result yet" };
  const offsets = (round.hits ?? []).flatMap(hit => typeof hit.offsetMs === "number" && hit.rating !== "extra" ? [Math.abs(hit.offsetMs)] : []);
  const timingPassed = round.mode !== "scored" || !offsets.length || offsets.reduce((sum, value) => sum + value, 0) / offsets.length <= timingTarget;
  return accuracy >= accuracyTarget && timingPassed
    ? { key: "Latest attempt meets {accuracy}% checkpoint", values: { accuracy: accuracyTarget } }
    : offsets.length
      ? { key: "Latest attempt {accuracy}% · {timing} ms typical timing", values: { accuracy, timing: Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length) } }
      : { key: "Latest attempt {accuracy}% · timing not measured", values: { accuracy } };
}

export function TrainerPathGuide({ path, patterns, rounds, selectedId, accuracyTarget, timingTarget, disabled, onSelect }: {
  path: Path;
  patterns: PracticePattern[];
  rounds: TrainerRound[];
  selectedId: string;
  accuracyTarget: number;
  timingTarget: number;
  disabled: boolean;
  onSelect: (pattern: PracticePattern) => void;
}) {
  const { locale, t } = useLocalization();
  const steps = path.patternIds.map(id => ({ id, pattern: patterns.find(item => item.id === id), latest: reliableRounds(rounds, id)[0] }));
  const available = steps.filter(item => item.pattern);
  const firstUnpassed = available.find(item => checkpointStatus(item.latest, accuracyTarget, timingTarget).key !== "Latest attempt meets {accuracy}% checkpoint") ?? available.at(-1);
  return <section className="trainer-path-guide" aria-label={t("{path} curriculum overview", { path: t(path.name) })}>
    <div><strong>{t(path.name)}</strong><p>{t("Follow the patterns in order. Each step uses the accuracy and timing checkpoint below; you can also jump to any available step.")}</p></div>
    <ol>{steps.map((step, index) => <li key={step.id} className={step.pattern && step.id === firstUnpassed?.id ? "is-next" : ""}>
      {step.pattern ? <button type="button" disabled={disabled} aria-current={step.pattern.id === selectedId ? "step" : undefined} onClick={() => onSelect(step.pattern!)}><span>{t("Step {number}", { number: index + 1 })}</span><strong>{localizedPattern(step.pattern, locale).name}</strong><small>{t(checkpointStatus(step.latest, accuracyTarget, timingTarget).key, checkpointStatus(step.latest, accuracyTarget, timingTarget).values)}</small></button> : <div><span>{t("Step {number}", { number: index + 1 })}</span><strong>{t("Pattern unavailable")}</strong><small>{step.id}</small></div>}
    </li>)}</ol>
    <small>{t("{available} of {total} steps available · reliable scores exclude clipped audio and uncertain detections.", { available: available.length, total: steps.length })}</small>
  </section>;
}
