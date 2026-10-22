"use client";

import { useEffect, useState } from "react";
import type { Instrument } from "@/lib/types";
import { useLocalization } from "./LocalizationProvider";

type Limb = "Right hand" | "Left hand" | "Right foot" | "Left foot";
type Action = { limb: Limb; voice: Instrument; force?: "Low" | "Medium" | "Accented" };
type Step = { actions: Action[] };
type Demonstration = { cue: string; steps: Step[] };
const tap = (limb: Limb, voice: Instrument = "snare", force?: Action["force"]): Action => ({ limb, voice, force });
const h = (limb: "Right hand" | "Left hand") => tap(limb, "hihat");
const s = (actions: Action[]): Step => ({ actions });

const demonstrations: Record<string, Demonstration> = {
  "meet-the-kit": { cue: "lesson.meet-the-kit.idea", steps: [s([tap("Right foot", "kick")]), s([tap("Left hand", "snare")]), s([h("Right hand")]), s([tap("Left hand", "tom")]), s([tap("Right hand", "crash")])] },
  "count-the-grid": { cue: "lesson.count-the-grid.idea", steps: [s([h("Right hand")]), s([h("Left hand")]), s([h("Right hand")]), s([h("Left hand")])] },
  "first-backbeat": { cue: "lesson.first-backbeat.idea", steps: [s([h("Right hand"), tap("Right foot", "kick")]), s([h("Left hand")]), s([h("Right hand"), tap("Left hand", "snare")]), s([h("Left hand")]), s([h("Right hand"), tap("Right foot", "kick")]), s([h("Left hand")]), s([h("Right hand"), tap("Left hand", "snare")]), s([h("Left hand")])] },
  "first-fill": { cue: "lesson.first-fill.idea", steps: [s([tap("Right hand", "snare")]), s([tap("Left hand", "tom")]), s([tap("Right hand", "tom")]), s([tap("Right hand", "crash"), tap("Right foot", "kick")])] },
  "sixteenth-control": { cue: "lesson.sixteenth-control.idea", steps: [s([tap("Right hand", "snare")]), s([tap("Left hand", "snare")]), s([tap("Right hand", "snare")]), s([tap("Left hand", "snare")])] },
  "paradiddle-voices": { cue: "lesson.paradiddle-voices.idea", steps: [s([tap("Right hand", "snare", "Accented")]), s([tap("Left hand", "snare")]), s([tap("Right hand", "tom")]), s([tap("Right hand", "tom")]), s([tap("Left hand", "snare", "Accented")]), s([tap("Right hand", "snare")]), s([tap("Left hand", "tom")]), s([tap("Left hand", "tom")])] },
  "syncopated-pocket": { cue: "lesson.syncopated-pocket.idea", steps: [s([h("Right hand"), tap("Right foot", "kick")]), s([h("Left hand")]), s([h("Right hand"), tap("Left hand", "snare")]), s([h("Left hand"), tap("Right foot", "kick")]), s([h("Right hand")]), s([h("Left hand"), tap("Left hand", "snare")])] },
  "linear-fill": { cue: "lesson.linear-fill.idea", steps: [s([tap("Right foot", "kick")]), s([tap("Right hand", "snare")]), s([tap("Left hand", "tom")]), s([tap("Right foot", "kick")]), s([tap("Right hand", "tom")]), s([tap("Left hand", "snare")])] },
  "limb-independence": { cue: "lesson.limb-independence.idea", steps: [s([h("Right hand"), tap("Right foot", "kick")]), s([h("Left hand")]), s([h("Right hand")]), s([h("Left hand"), tap("Left hand", "snare")]), s([h("Right hand"), tap("Right foot", "kick")]), s([h("Left hand")]), s([h("Right hand")]), s([h("Left hand"), tap("Left hand", "snare")])] },
  "five-four": { cue: "lesson.five-four.idea", steps: [s([h("Right hand"), tap("Right foot", "kick")]), s([h("Left hand")]), s([h("Right hand"), tap("Left hand", "snare")]), s([h("Left hand")]), s([h("Right hand"), tap("Right foot", "kick")])] },
  "dynamic-arc": { cue: "lesson.dynamic-arc.idea", steps: [s([tap("Right hand", "snare", "Low")]), s([tap("Left hand", "snare", "Low")]), s([tap("Right hand", "snare", "Medium")]), s([tap("Left hand", "snare", "Accented")]), s([tap("Right hand", "snare", "Medium")]), s([tap("Left hand", "snare", "Low")])] },
  "three-over-two": { cue: "lesson.three-over-two.idea", steps: [s([h("Right hand"), tap("Right foot", "kick")]), s([]), s([h("Right hand")]), s([tap("Right foot", "kick")]), s([h("Right hand")]), s([])] }
};

const kitTargets: Record<Instrument, { x: number; y: number; label: string }> = {
  crash: { x: 264, y: 49, label: "Crash" },
  hihat: { x: 66, y: 82, label: "Hi-hat" },
  tom: { x: 207, y: 82, label: "Tom" },
  snare: { x: 131, y: 117, label: "Snare" },
  kick: { x: 168, y: 174, label: "Kick" }
};
const handOrigins: Record<Limb, { x: number; y: number }> = {
  "Right hand": { x: 108, y: 190 },
  "Left hand": { x: 221, y: 190 },
  "Right foot": { x: 145, y: 220 },
  "Left foot": { x: 179, y: 220 }
};

export function TechniqueDemonstration({ lessonId }: { lessonId: string }) {
  const demonstration = demonstrations[lessonId];
  const steps = demonstration?.steps ?? [];
  const { t, formatNumber } = useLocalization();
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches || document.documentElement.dataset.reduceMotion === "true");
    update();
    query.addEventListener("change", update);
    window.addEventListener("drum-hero:accessibility-change", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("drum-hero:accessibility-change", update);
    };
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    const timer = window.setTimeout(() => {
      if (stepIndex >= steps.length - 1) setPlaying(false);
      else setStepIndex((index) => index + 1);
    }, 850);
    return () => window.clearTimeout(timer);
  }, [playing, reducedMotion, stepIndex, steps.length]);

  if (!demonstration) return null;
  const step = steps[stepIndex] ?? steps[0];
  const activeVoices = new Set(step.actions.map((action) => action.voice));
  const spokenActions = step.actions.length
    ? step.actions.map((action) => `${t(action.limb)} → ${t(kitTargets[action.voice].label)}${action.force ? ` · ${t(action.force)}` : ""}`).join(" · ")
    : t("Rest");

  const move = (direction: -1 | 1) => {
    setPlaying(false);
    setStepIndex((index) => (index + direction + steps.length) % steps.length);
  };
  const togglePlayback = () => {
    if (reducedMotion) move(1);
    else if (playing) setPlaying(false);
    else {
      if (stepIndex >= steps.length - 1) setStepIndex(0);
      setPlaying(true);
    }
  };

  return <section className="technique-demo" aria-labelledby={`technique-demo-${lessonId}`}>
    <div className="technique-demo-copy"><h4 id={`technique-demo-${lessonId}`}>{t("Technique demonstration")}</h4><p>{t(demonstration.cue)}</p></div>
    <div className="technique-demo-layout">
      <figure className="technique-demo-kit">
        <svg viewBox="0 0 320 240" role="img" aria-labelledby={`technique-svg-title-${lessonId}`}>
          <title id={`technique-svg-title-${lessonId}`}>{t("Silent visual technique demonstration")}</title>
          <ellipse cx="165" cy="178" rx="57" ry="34" className="demo-kick-shell" />
          {(["crash", "hihat", "tom", "snare"] as Instrument[]).map((voice) => {
            const target = kitTargets[voice];
            return <g key={voice} className={activeVoices.has(voice) ? "demo-target is-active" : "demo-target"}>
              <circle cx={target.x} cy={target.y} r={voice === "crash" || voice === "hihat" ? 23 : 22} />
              <text x={target.x} y={target.y + 4} textAnchor="middle">{t(target.label)}</text>
            </g>;
          })}
          <g className={activeVoices.has("kick") ? "demo-target is-active" : "demo-target"}>
            <circle cx={kitTargets.kick.x} cy={kitTargets.kick.y} r="23" />
            <text x={kitTargets.kick.x} y={kitTargets.kick.y + 4} textAnchor="middle">{t("Kick")}</text>
          </g>
          {step.actions.map((action, index) => {
            const start = handOrigins[action.limb];
            const end = kitTargets[action.voice];
            return <g key={`${action.limb}-${action.voice}-${index}`} className={`demo-stick demo-stick-${action.limb === "Right hand" ? "right" : action.limb === "Left hand" ? "left" : "foot"}`}>
              <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
              <circle cx={start.x} cy={start.y} r="5" />
              <text x={start.x} y={start.y - 8} textAnchor="middle">{t(action.limb)}</text>
            </g>;
          })}
        </svg>
        <figcaption>{t("Silent visual reference. Follow the lesson count and practice pattern for timing.")}</figcaption>
      </figure>
      <div className="technique-demo-steps">
        <p className="technique-demo-step" role="status" aria-live="polite"><strong>{t("Step {step} of {total}", { step: formatNumber(stepIndex + 1), total: formatNumber(steps.length) })}</strong><span>{spokenActions}</span></p>
        <div className="technique-demo-meter" aria-hidden="true">{steps.map((_, index) => <span className={index === stepIndex ? "is-current" : index < stepIndex ? "is-past" : ""} key={index} />)}</div>
        <div className="technique-demo-controls">
          <button type="button" className="button-secondary" onClick={() => move(-1)} aria-label={t("Previous step")}>←</button>
          <button type="button" className="button" onClick={togglePlayback}>{reducedMotion ? t("Next step") : playing ? t("Pause demonstration") : t("Play demonstration")}</button>
          <button type="button" className="button-secondary" onClick={() => move(1)} aria-label={t("Next step")}>→</button>
        </div>
      </div>
    </div>
  </section>;
}
