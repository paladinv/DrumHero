"use client";

import { recommendTrainerStyleSteps, TRAINER_STYLE_PROGRESSIONS, type TrainerStyleProgression } from "@/lib/trainer-style-progressions";
import type { TrainerRound } from "@/lib/trainer";
import type { PracticePattern } from "@/lib/types";

export function TrainerStyleProgressions({ patterns, rounds, disabled, onStart }: {
  patterns: PracticePattern[];
  rounds: TrainerRound[];
  disabled: boolean;
  onStart: (path: TrainerStyleProgression, steps: Array<{ pattern: PracticePattern; bpm: number }>) => void;
}) {
  return <section className="trainer-style-progressions" aria-label="Curated groove and fill progressions">
    <div><span className="eyebrow">Style progressions</span><h3>Practise a groove, then make it musical.</h3><p>Short, ordered sets move from a steady foundation to a style-specific groove and a groove-to-fill transition.</p></div>
    <div className="trainer-style-progression-list">{TRAINER_STYLE_PROGRESSIONS.map(path => {
      const steps = recommendTrainerStyleSteps(path, patterns, rounds);
      const stepsByPattern = new Map(steps.map(step => [step.pattern.id, step]));
      const complete = steps.length === path.steps.length;
      return <article key={path.id}>
        <div><h4>{path.title}</h4><p>{path.cue}</p></div>
        <ol>{path.steps.map((step, index) => {
          const recommendation = stepsByPattern.get(step.patternId);
          return <li key={step.patternId}>{recommendation ? <><strong>{index + 1}. {recommendation.pattern.name}</strong><span>{recommendation.pattern.level} · {recommendation.bpm} BPM · {"style" in recommendation.pattern && recommendation.pattern.style === "Groove + fill" ? "groove → fill → return" : "groove"}</span><small>{recommendation.note}</small></> : <><strong>{index + 1}. Pattern unavailable</strong><span>{step.patternId}</span></>}</li>;
        })}</ol>
        <button type="button" className="button-secondary" disabled={disabled || !complete} onClick={() => onStart(path, steps.map(({ pattern, bpm }) => ({ pattern, bpm })))}>Start {path.title}</button>
      </article>;
    })}</div>
  </section>;
}
