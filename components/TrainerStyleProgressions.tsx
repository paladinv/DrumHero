"use client";

import { recommendTrainerStyleSteps, TRAINER_STYLE_PROGRESSIONS, type RecommendedTrainerStyleStep, type TrainerStyleProgression } from "@/lib/trainer-style-progressions";
import type { TrainerRound } from "@/lib/trainer";
import type { PracticePattern } from "@/lib/types";
import { TrainerNotationView } from "@/components/TrainerNotationView";
import { useLocalization } from "@/components/LocalizationProvider";

export function TrainerStyleProgressions({ patterns, rounds, accuracyTarget, timingTarget, disabled, onStart }: {
  patterns: PracticePattern[];
  rounds: TrainerRound[];
  accuracyTarget: number;
  timingTarget: number;
  disabled: boolean;
  onStart: (path: TrainerStyleProgression, steps: RecommendedTrainerStyleStep[]) => void;
}) {
  const { t } = useLocalization();
  return <section className="trainer-style-progressions" aria-label={t("Curated groove and fill progressions")}>
    <div><span className="eyebrow">{t("Style progressions")}</span><h3>{t("Practise a groove, then make it musical.")}</h3><p>{t("Short, ordered sets move from a steady foundation to a style-specific groove and a groove-to-fill transition. Follow the scores; each checkpoint unlocks the next step. Difficulty is estimated from pattern level, subdivision, offbeat density, and fills, and checkpoint targets adjust with that complexity.")}</p></div>
    <div className="trainer-style-progression-list">{TRAINER_STYLE_PROGRESSIONS.map(path => {
      const steps = recommendTrainerStyleSteps(path, patterns, rounds);
      const stepsByPattern = new Map(steps.map(step => [step.pattern.id, step]));
      const complete = steps.length === path.steps.length;
      return <article key={path.id}>
        <div><h4>{path.title}</h4><p>{path.cue}</p></div>
        <ol>{path.steps.map((step, index) => {
          const recommendation = stepsByPattern.get(step.patternId);
          return <li key={step.patternId}>{recommendation ? <>
            <strong>{t("{index}. {name}", { index: index + 1, name: recommendation.pattern.name })}</strong>
            <span>{t("{level} · {difficulty} musical difficulty · checkpoint {accuracy}% / {timing} ms · {bpm} BPM · {kind}", {
              level: t(recommendation.pattern.level), difficulty: t(recommendation.difficulty.label), bpm: recommendation.bpm,
              accuracy: Math.max(70, Math.min(95, accuracyTarget + (recommendation.difficulty.rank <= 2 ? 5 : recommendation.difficulty.rank >= 4 ? -5 : 0))),
              timing: Math.max(25, Math.min(75, timingTarget + (recommendation.difficulty.rank <= 2 ? -5 : recommendation.difficulty.rank >= 4 ? 5 : 0))),
              kind: "style" in recommendation.pattern && recommendation.pattern.style === "Groove + fill" ? t("groove → fill → return") : t("groove"),
            })}</span>
            <div className="trainer-style-score"><TrainerNotationView pattern={recommendation.pattern} compact /></div>
            <small>{recommendation.note}</small>
          </> : <><strong>{t("{index}. Pattern unavailable", { index: index + 1 })}</strong><span>{step.patternId}</span></>}</li>;
        })}</ol>
        <button type="button" className="button-secondary" disabled={disabled || !complete} onClick={() => onStart(path, steps)}>{t("Start {title}", { title: path.title })}</button>
      </article>;
    })}</div>
  </section>;
}
