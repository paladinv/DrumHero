import type { PracticePattern, RatedHit } from "./types";

export type TrainerDynamicsExercise = "contrast" | "crescendo" | "evenness";

export function applyDynamicsTargets(pattern: PracticePattern, exercise: TrainerDynamicsExercise): PracticePattern {
  const stepsPerBar = pattern.beats * pattern.subdivision / 4 / getPatternBarCount(pattern);
  if (exercise === "contrast") {
    const stepsPerBeat = pattern.subdivision / 4;
    const hits = pattern.hits.map((hit) => {
      const beatInBar = Math.floor((hit.step % stepsPerBar) / stepsPerBeat) + 1;
      const backbeat = hit.instrument === "snare" && (beatInBar === 2 || beatInBar === 4);
      const accent = Boolean(hit.accent || backbeat);
      return { ...hit, accent, velocityTarget: accent ? 105 : 45 };
    });
    const snareSteps = new Set(hits.filter(hit => hit.instrument === "snare").map(hit => hit.step));
    const ghosts = stepsPerBeat > 1 ? hits.flatMap(hit => {
      const beatInBar = Math.floor((hit.step % stepsPerBar) / stepsPerBeat) + 1;
      const backbeat = hit.instrument === "snare" && (beatInBar === 2 || beatInBar === 4);
      const ghostStep = hit.step - 1;
      if (!backbeat || ghostStep < 0 || snareSteps.has(ghostStep)) return [];
      snareSteps.add(ghostStep);
      return [{ step: ghostStep, instrument: "snare" as const, accent: false, velocityTarget: 45 }];
    }) : [];
    return { ...pattern, hits: [...hits, ...ghosts].sort((a, b) => a.step - b.step) };
  }
  return {
    ...pattern,
    hits: pattern.hits.map((hit) => {
      if (exercise === "evenness") return { ...hit, velocityTarget: 70 };
      const positionInBar = ((hit.step % stepsPerBar) + stepsPerBar) % stepsPerBar;
      const progress = stepsPerBar <= 1 ? 1 : positionInBar / (stepsPerBar - 1);
      return { ...hit, velocityTarget: Math.round(42 + progress * 63) };
    }),
  };
}

export function summarizeDynamics(hits: RatedHit[]) {
  const measured = hits.filter((hit) => hit.rating !== "miss" && typeof hit.velocity === "number" && typeof hit.velocityTarget === "number");
  if (!measured.length) return { count: 0, targetAverage: null, playedAverage: null, meanError: null, message: "Use a MIDI kit or calibrated audio input to measure strike strength for this exercise." };

  const targetAverage = Math.round(measured.reduce((sum, hit) => sum + hit.velocityTarget!, 0) / measured.length);
  const playedAverage = Math.round(measured.reduce((sum, hit) => sum + hit.velocity!, 0) / measured.length);
  const meanError = Math.round(measured.reduce((sum, hit) => sum + Math.abs(hit.velocity! - hit.velocityTarget!), 0) / measured.length);
  const message = meanError <= 15
    ? "Good control: your strokes are close to the exercise targets."
    : playedAverage < targetAverage
      ? "Bring the stronger strokes up toward the targets while keeping softer notes controlled."
      : "Soften the stronger strokes toward the targets and keep the volume even.";
  return { count: measured.length, targetAverage, playedAverage, meanError, message };
}

function getPatternBarCount(pattern: PracticePattern) {
  const meter = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : "";
  const phraseBars = Number(meter.match(/^(\d+)\s+bars?\b/i)?.[1] ?? 1);
  return Math.max(1, Number.isFinite(phraseBars) ? phraseBars : 1);
}
