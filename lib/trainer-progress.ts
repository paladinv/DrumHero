import type { TrainerRound } from "@/lib/trainer";
import type { Instrument, PracticePattern } from "@/lib/types";

export type TrainerProgressPoint = { accuracy: number; date: string };
export type TrainerVoiceProgress = { instrument: Instrument; onTime: number; total: number; accuracy: number; averageOffsetMs: number | null };
export type TrainerTrendPoint = { value: number; date: string };
export type TrainerTrendMetric = {
  id: "tempo" | "timing" | "dynamics" | "fill-return";
  points: TrainerTrendPoint[];
};
export type TrainerProgressSummary = {
  rounds: TrainerRound[];
  points: TrainerProgressPoint[];
  delta: number | null;
  voices: TrainerVoiceProgress[];
  matchingAttemptCount: number;
  timingDistance: number | null;
  timingSpread: number | null;
  metrics: TrainerTrendMetric[];
};

function comparableProgressRounds(rounds: TrainerRound[], current: TrainerRound) {
  return rounds.filter((round) => round.patternId === current.patternId &&
    (round.variationId ?? "base") === (current.variationId ?? "base") && round.mode === "scored" &&
    round.source === current.source && (round.feel ?? "straight") === (current.feel ?? "straight") &&
    (round.limbFocus ?? "all") === (current.limbFocus ?? "all") && (round.adaptation ?? "standard") === (current.adaptation ?? "standard") &&
    (round.swingRatio ?? 2 / 3) === (current.swingRatio ?? 2 / 3) && (round.pocketMs ?? 35) === (current.pocketMs ?? 35) &&
    (round.inputProfile ?? round.source) === (current.inputProfile ?? current.source) && round.targetVoice === current.targetVoice &&
    !round.inputClipped && !round.uncertainDetections && !current.inputClipped && !current.uncertainDetections &&
    !round.focusedDrill && !round.learningMode && !current.focusedDrill && !current.learningMode &&
    (!round.limbFocus || round.limbFocus === "all") && (!round.adaptation || round.adaptation === "standard") &&
    round.result !== null);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function offsetsForRound(round: TrainerRound) {
  return (round.hits ?? []).flatMap((hit) =>
    hit.rating !== "extra" && hit.rating !== "miss" && hit.transition !== "landing" && typeof hit.offsetMs === "number"
      ? [hit.offsetMs] : []);
}

function velocityErrorsForRound(round: TrainerRound) {
  return (round.hits ?? []).flatMap((hit) =>
    hit.rating !== "extra" && hit.rating !== "miss" && typeof hit.velocity === "number" && typeof hit.velocityTarget === "number"
      ? [Math.abs(hit.velocity - hit.velocityTarget)] : []);
}

function returnsForRound(round: TrainerRound, pattern: PracticePattern, stepsPerBar: number) {
  const ranges = pattern.trainerFillStepRanges ?? [];
  if (!ranges.length) return null;
  const stepsPerPattern = pattern.beats * pattern.subdivision / 4;
  const hits = round.hits ?? [];
  const targets = hits.filter((hit) => {
    if (hit.repetition === undefined || hit.step === undefined || hit.rating === "extra" || hit.transition === "landing") return false;
    const absoluteStep = hit.repetition * stepsPerPattern + hit.step;
    const cycle = Math.floor(absoluteStep / stepsPerPattern);
    return ranges.some(([, fillEnd]) => [cycle - 1, cycle].some((fillCycle) => {
      const returnStart = fillCycle * stepsPerPattern + fillEnd;
      return returnStart >= 0 && absoluteStep >= returnStart && absoluteStep < returnStart + stepsPerBar;
    }));
  });
  return targets.length ? Math.round(targets.filter((hit) => hit.rating === "great" || hit.rating === "good").length / targets.length * 100) : null;
}

export function summarizeTrainerProgress(rounds: TrainerRound[], current: TrainerRound, pattern: PracticePattern, limit = 12): TrainerProgressSummary {
  const eligible = comparableProgressRounds(rounds, current).sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  const recent = eligible.slice(-Math.max(1, limit));
  const points = recent.map((round) => ({ accuracy: round.result?.accuracy ?? 0, date: round.playedAt }));
  const split = Math.ceil(points.length / 2);
  const previous = points.slice(0, split);
  const latest = points.slice(split);
  const delta = latest.length ? Math.round(average(latest.map((point) => point.accuracy))! - average(previous.map((point) => point.accuracy))!) : null;
  const signedOffsets = recent.flatMap(offsetsForRound);
  const timingMean = average(signedOffsets) ?? 0;
  const timingDistances = signedOffsets.map(Math.abs);
  const voiceTotals = new Map<Instrument, { onTime: number; total: number; offsets: number[] }>();
  for (const round of [...recent].reverse().slice(0, 8)) for (const hit of round.hits ?? []) {
    if (hit.rating === "extra") continue;
    const item = voiceTotals.get(hit.instrument) ?? { onTime: 0, total: 0, offsets: [] };
    item.total += 1;
    if (hit.rating === "great" || hit.rating === "good") item.onTime += 1;
    if (typeof hit.offsetMs === "number") item.offsets.push(hit.offsetMs);
    voiceTotals.set(hit.instrument, item);
  }
  const voices = [...voiceTotals.entries()].map(([instrument, item]): TrainerVoiceProgress => ({
    instrument,
    onTime: item.onTime,
    total: item.total,
    accuracy: item.total ? Math.round(item.onTime / item.total * 100) : 0,
    averageOffsetMs: item.offsets.length ? Math.round(average(item.offsets)!) : null
  }));
  const toMetric = (id: TrainerTrendMetric["id"], valueForRound: (round: TrainerRound) => number | null): TrainerTrendMetric => ({
    id,
    points: recent.flatMap((round) => {
      const value = valueForRound(round);
      return value === null ? [] : [{ value, date: round.playedAt }];
    })
  });
  const stepsPerBar = pattern.beats * pattern.subdivision / 4 / getPatternBarCount(pattern);
  const metrics: TrainerTrendMetric[] = [
    toMetric("tempo", (round) => round.bpm),
    toMetric("timing", (round) => average(offsetsForRound(round).map(Math.abs))),
    toMetric("dynamics", (round) => average(velocityErrorsForRound(round))),
    toMetric("fill-return", (round) => pattern.trainerFillStepRanges?.length ? returnsForRound(round, pattern, stepsPerBar) : null)
  ];
  return {
    rounds: recent,
    points,
    delta,
    voices,
    matchingAttemptCount: eligible.length,
    timingDistance: timingDistances.length ? Math.round(average(timingDistances)!) : null,
    timingSpread: signedOffsets.length ? Math.round(Math.sqrt(signedOffsets.reduce((sum, value) => sum + (value - timingMean) ** 2, 0) / signedOffsets.length)) : null,
    metrics
  };
}

function getPatternBarCount(pattern: PracticePattern) {
  if (pattern.id.startsWith("phrase:")) return Number(pattern.id.split(":").at(-1)) || 1;
  const explicitBars = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter.match(/^(\d+)\s+bars?\b/i) : null;
  return explicitBars ? Math.max(1, Number(explicitBars[1])) : 1;
}

