import type { PracticePattern, RatedHit } from "./types";

export type TrainerBarSummary = {
  bar: number;
  targets: number;
  onTime: number;
  missed: number;
  averageOffsetMs: number | null;
  typicalOffsetMs: number | null;
  dynamicsSamples: number;
  averageDynamicsError: number | null;
};

export type TrainerTransitionSummary = { fillBar: number; grooveBefore: string; fill: string; landing: string };

export function summarizeTrainerTransitions(hits: RatedHit[], pattern: PracticePattern): TrainerTransitionSummary[] {
  const ranges = pattern.trainerFillStepRanges ?? [];
  const barCount = getPatternBarCount(pattern);
  const totalSteps = pattern.beats * pattern.subdivision / 4;
  const stepsPerBar = totalSteps / barCount;
  if (!ranges.length || !Number.isFinite(stepsPerBar) || stepsPerBar <= 0) return [];
  const summary = (start: number, end: number, wrap = false) => {
    const targets = pattern.hits.filter(hit => hit.step >= start && hit.step < end).length;
    if (!targets) return "No targets";
    let opportunities = 0, onTime = 0;
    for (const repetition of [...new Set(hits.map(hit => hit.repetition ?? 0))]) {
      const played = hits.filter(hit => hit.repetition === repetition && hit.step !== undefined && hit.step >= start && hit.step < end);
      if (!wrap || repetition > 0) opportunities += targets;
      onTime += played.filter(hit => hit.rating === "great" || hit.rating === "good").length;
    }
    return opportunities ? `${Math.round(onTime / opportunities * 100)}% on time` : "No scored pass";
  };
  return ranges.map(([fillStart, fillEnd]) => {
    const fillBar = Math.floor(fillStart / stepsPerBar) + 1;
    const beforeStart = Math.max(0, fillStart - stepsPerBar);
    const landingStart = fillEnd % totalSteps;
    const wraps = fillEnd >= totalSteps;
    return {
      fillBar,
      grooveBefore: summary(beforeStart, fillStart),
      fill: summary(fillStart, fillEnd),
      landing: wraps ? summary(0, Math.min(stepsPerBar, totalSteps), true) : summary(landingStart, Math.min(totalSteps, landingStart + stepsPerBar)),
    };
  });
}

export function summarizeTrainerBars(hits: RatedHit[], pattern: PracticePattern): TrainerBarSummary[] {
  const barCount = getPatternBarCount(pattern);
  const totalSteps = pattern.beats * pattern.subdivision / 4;
  const stepsPerBar = totalSteps / barCount;
  if (!Number.isFinite(stepsPerBar) || stepsPerBar <= 0) return [];

  const grouped = new Map<number, RatedHit[]>();
  for (const hit of hits) {
    if (hit.step === undefined || hit.transition === "landing" || hit.rating === "extra") continue;
    const repetition = Math.max(0, hit.repetition ?? 0);
    const bar = repetition * barCount + Math.floor(hit.step / stepsPerBar) + 1;
    grouped.set(bar, [...(grouped.get(bar) ?? []), hit]);
  }

  return [...grouped.entries()].sort(([a], [b]) => a - b).map(([bar, barHits]) => {
    const timed = barHits.flatMap(hit => typeof hit.offsetMs === "number" && hit.rating !== "miss" ? [hit.offsetMs] : []);
    const dynamics = barHits.flatMap(hit => typeof hit.velocity === "number" && typeof hit.velocityTarget === "number"
      ? [Math.abs(hit.velocity - hit.velocityTarget)] : []);
    return {
      bar,
      targets: barHits.length,
      onTime: barHits.filter(hit => hit.rating === "great" || hit.rating === "good").length,
      missed: barHits.filter(hit => hit.rating === "miss").length,
      averageOffsetMs: timed.length ? Math.round(timed.reduce((sum, value) => sum + value, 0) / timed.length) : null,
      typicalOffsetMs: timed.length ? Math.round(timed.reduce((sum, value) => sum + Math.abs(value), 0) / timed.length) : null,
      dynamicsSamples: dynamics.length,
      averageDynamicsError: dynamics.length ? Math.round(dynamics.reduce((sum, value) => sum + value, 0) / dynamics.length) : null,
    };
  });
}

function getPatternBarCount(pattern: PracticePattern) {
  if (pattern.id.startsWith("phrase:")) return Number(pattern.id.split(":").at(-1)) || 1;
  const meter = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : "";
  return Math.max(1, Number(meter.match(/^(\d+)\s+bars?\b/i)?.[1] ?? 1));
}
