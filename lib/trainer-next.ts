import { compatibleFillPatterns, isGroovePattern } from "./fill-practice";
import type { TrainerRoutineStep } from "./trainer-enhancements";
import type { TrainerRound } from "./trainer";
import type { Groove, Instrument, PracticePattern, RatedHit } from "./types";

export type TrainerTimingZone = "straight" | "offbeat" | "backbeat" | "fill";
export type TrainerFillFacets = { sticking: string; orchestration: string; length: string; difficulty: string };

export function timingZoneForHit(pattern: PracticePattern, step: number, instrument: Instrument): TrainerTimingZone {
  const sections = (pattern as PracticePattern & { trainerFillStepRanges?: Array<[number, number]> }).trainerFillStepRanges;
  if (sections?.some(([start, end]) => step >= start && step < end)) return "fill";
  if (isGroovePattern(pattern) && pattern.style === "Fill study") return "fill";

  const stepsPerBeat = pattern.subdivision / 4;
  if (step % stepsPerBeat !== 0) return "offbeat";
  if (instrument === "snare") {
    const meter = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : "";
    const bars = Math.max(1, Number(meter.match(/^(\d+)\s+bars?\b/i)?.[1] ?? 1));
    const beatsPerBar = pattern.beats / bars;
    const beatInBar = Math.floor(step / stepsPerBeat) % Math.max(1, Math.round(beatsPerBar));
    if (beatInBar === 1 || beatInBar === 3) return "backbeat";
  }
  return "straight";
}

export function getWeakSpotTempoPlan(
  rounds: TrainerRound[],
  pattern: PracticePattern,
  instrument: Instrument,
  beat: number,
  variationId = "base"
) {
  const stepStart = Math.floor((beat - 1) * pattern.subdivision / 4);
  const stepEnd = stepStart + pattern.subdivision / 4;
  const attempts = rounds
    .filter(round => round.patternId === pattern.id && (round.variationId ?? "base") === variationId && round.mode === "scored" && !round.inputClipped && !round.uncertainDetections && !round.focusedDrill && !round.learningMode && (!round.limbFocus || round.limbFocus === "all") && (!round.adaptation || round.adaptation === "standard"))
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt))
    .slice(0, 5);
  const weakHits = attempts.flatMap(round => (round.hits ?? []).filter(hit => hit.instrument === instrument && hit.step !== undefined && hit.step >= stepStart && hit.step < stepEnd && hit.transition !== "landing"));
  const offsets = weakHits.flatMap(hit => typeof hit.offsetMs === "number" && hit.rating !== "extra" ? [Math.abs(hit.offsetMs)] : []);
  const expectedHits = weakHits.filter(hit => hit.rating !== "extra");
  const accuracy = expectedHits.length ? Math.round(expectedHits.filter(hit => hit.rating === "great" || hit.rating === "good").length / expectedHits.length * 100) : null;
  const recentTempo = attempts[0]?.bpm ?? pattern.defaultBpm;
  const base = accuracy === null ? recentTempo : accuracy < 70 ? recentTempo - Math.max(5, Math.round(recentTempo * 0.08)) : accuracy < 85 ? recentTempo - 4 : recentTempo;
  const startBpm = Math.max(pattern.tempoRange[0], Math.min(pattern.tempoRange[1], base));
  return {
    startBpm,
    progression: [0, 2, 4].map(offset => Math.min(pattern.tempoRange[1], startBpm + offset)),
    accuracy,
    typicalOffsetMs: offsets.length ? Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length) : null,
    sampleCount: weakHits.filter(hit => hit.rating !== "extra").length
  };
}

export type GrooveVariation = { id: string; name: string; pattern: PracticePattern };

export function controlledGrooveVariations(pattern: PracticePattern): GrooveVariation[] {
  if (!isGroovePattern(pattern) || pattern.style === "Fill study" || pattern.style === "Groove + fill" || pattern.beats !== 4 || ![8, 16].includes(pattern.subdivision)) return [];
  const totalSteps = Math.round(pattern.beats * pattern.subdivision / 4);
  const stepsPerBar = totalSteps / Math.max(1, Number((pattern.meter ?? "").match(/^(\d+)\s+bars?\b/i)?.[1] ?? 1));
  const stepsPerBeat = pattern.subdivision / 4;
  const variations: GrooveVariation[] = [];

  const kickHits = pattern.hits.map(hit => ({ ...hit }));
  let kickChanges = 0;
  for (let bar = 0; bar * stepsPerBar < totalSteps; bar += 1) {
    const start = bar * stepsPerBar, end = Math.min(totalSteps, start + stepsPerBar);
    const candidates = kickHits.filter(hit => hit.instrument === "kick" && hit.step >= start + stepsPerBeat && hit.step < end && hit.step % stepsPerBeat === 0).sort((a, b) => b.step - a.step);
    const target = candidates.find(hit => !kickHits.some(other => other !== hit && other.instrument === "kick" && other.step === hit.step - 1));
    if (target) { target.step -= 1; kickChanges += 1; }
  }
  if (kickChanges) variations.push({ id: "kick-pickups", name: "Kick pickups", pattern: { ...pattern, name: `${pattern.name} · kick pickups`, description: `${pattern.description} The variation anticipates a kick on the final offbeat before a later beat.`, hits: kickHits } });

  const snareHits = pattern.hits.map(hit => ({ ...hit }));
  let snareChanges = 0;
  const eighthOffset = Math.max(1, Math.round(stepsPerBeat / 2));
  for (let bar = 0; bar * stepsPerBar < totalSteps; bar += 1) {
    const start = bar * stepsPerBar, end = Math.min(totalSteps, start + stepsPerBar);
    const candidates = snareHits.filter(hit => hit.instrument === "snare" && hit.step >= start && hit.step < end && hit.step % stepsPerBeat === 0 && [1, 3].includes(Math.floor((hit.step - start) / stepsPerBeat))).sort((a, b) => a.step - b.step);
    const target = candidates.find(hit => hit.step + eighthOffset < end && !snareHits.some(other => other !== hit && other.instrument === "snare" && other.step === hit.step + eighthOffset));
    if (target) { target.step += eighthOffset; snareChanges += 1; }
  }
  if (snareChanges) variations.push({ id: "displaced-backbeat", name: "Displaced backbeat", pattern: { ...pattern, name: `${pattern.name} · displaced backbeat`, description: `${pattern.description} The variation places one backbeat on an eighth-note offbeat in each bar.`, hits: snareHits } });

  const hatHits = pattern.hits.map(hit => ({ ...hit }));
  let removedHats = 0;
  for (let bar = 0; bar * stepsPerBar < totalSteps; bar += 1) {
    const start = bar * stepsPerBar, end = Math.min(totalSteps, start + stepsPerBar);
    const candidates = hatHits.filter(hit => hit.instrument === "hihat" && hit.step >= start && hit.step < end && hit.step % stepsPerBeat !== 0).sort((a, b) => b.step - a.step);
    if (candidates.length > 1) { hatHits.splice(hatHits.indexOf(candidates[0]), 1); removedHats += 1; }
  }
  if (removedHats) variations.push({ id: "hat-space", name: "Hi-hat space", pattern: { ...pattern, name: `${pattern.name} · hi-hat space`, description: `${pattern.description} The variation removes one offbeat hi-hat in each bar to make the pulse feel more open.`, hits: hatHits } });
  return variations;
}

export function trainerFillFacets(pattern: Groove): TrainerFillFacets {
  const text = `${pattern.id} ${pattern.name} ${pattern.focus} ${pattern.description}`.toLowerCase();
  const instruments = new Set(pattern.hits.map(hit => hit.instrument));
  const sticking = /paradiddle/.test(text) ? "Paradiddle" : /double|diddle/.test(text) ? "Double strokes" : /linear/.test(text) ? "Linear" : /drag|flam|buzz|roll|triplet/.test(text) ? "Rudiment / roll" : /single|alternat/.test(text) ? "Alternating singles" : "Alternating / other";
  const orchestration = instruments.has("kick") && instruments.has("tom") ? "Kick + toms" : instruments.has("snare") && instruments.has("tom") ? "Snare + toms" : instruments.has("snare") && instruments.has("kick") ? "Snare + kick" : instruments.has("tom") ? "Toms" : instruments.has("crash") ? "Cymbal ending" : "Snare";
  const meter = pattern.meter ?? "";
  const length = meter.match(/\d+\s+bars?\b/i)?.[0] ?? (pattern.beats >= 4 ? `${Math.ceil(pattern.beats / 4)} bar` : `${pattern.beats} beats`);
  return { sticking, orchestration, length, difficulty: pattern.level };
}

function accuracy(round: TrainerRound) {
  if (round.result) return round.result.accuracy;
  const total = round.ratings.length;
  return total ? Math.round(round.ratings.filter(value => value === "clean").length / total * 100) : 0;
}

export function createRetentionRoutine(rounds: TrainerRound[], patterns: PracticePattern[]): TrainerRoutineStep[] {
  const grooves = patterns.filter((pattern): pattern is Groove => isGroovePattern(pattern) && !["Fill study", "Groove + fill"].includes(pattern.style));
  const fillLibrary = patterns.filter((pattern): pattern is Groove => isGroovePattern(pattern) && pattern.style === "Fill study");
  const learned = grooves.flatMap(pattern => {
    const history = rounds.filter(round => round.patternId === pattern.id && !round.focusedDrill && !round.learningMode && (!round.adaptation || round.adaptation === "standard"))
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    if (history.length < 2) return [];
    const recent = history.slice(0, 4);
    const average = recent.reduce((sum, round) => sum + accuracy(round), 0) / recent.length;
    if (average < 65) return [];
    const lastPracticed = Date.parse(history[0].playedAt) || 0;
    return [{ pattern, history, average, lastPracticed }];
  }).sort((a, b) => a.average - b.average || a.lastPracticed - b.lastPracticed).slice(0, 4);

  const steps = learned.map(({ pattern, history }, index) => {
    const compatible = compatibleFillPatterns(pattern, fillLibrary);
    const fillScores = compatible.map(fill => {
      const encodedGroove = encodeURIComponent(pattern.id), encodedFill = encodeURIComponent(fill.id);
      const related = rounds.filter(round => round.patternId.startsWith(`fill-round:${encodedGroove}:${encodedFill}:`)).sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 3);
      return { fill, score: related.length ? related.reduce((sum, round) => sum + accuracy(round), 0) / related.length : fill.level === "Beginner" ? 45 : fill.level === pattern.level ? 55 : 65, attempts: related.length };
    }).sort((a, b) => a.score - b.score || a.attempts - b.attempts);
    const useFill = index % 2 === 1 && fillScores.length > 0;
    const fill = useFill ? fillScores[0].fill : undefined;
    const bestReliableTempo = history.filter(round => accuracy(round) >= 75).reduce((best, round) => Math.max(best, round.bpm), 0);
    const bpm = Math.max(pattern.tempoRange[0], Math.min(pattern.tempoRange[1], (bestReliableTempo || pattern.defaultBpm) - 3));
    return { patternId: pattern.id, bpm, repetitions: 8 as const, fillPatternId: fill?.id ?? "", fillAfterBars: 2 as const };
  });
  return steps;
}

export function summarizeTimingZones(hits: RatedHit[]) {
  const zones: TrainerTimingZone[] = ["straight", "offbeat", "backbeat", "fill"];
  return zones.map(zone => {
    const items = hits.filter(hit => hit.feelZone === zone && hit.rating !== "extra" && hit.transition !== "landing");
    const timed = items.filter(hit => typeof hit.offsetMs === "number");
    return {
      zone,
      total: items.length,
      onTime: items.filter(hit => hit.rating === "great" || hit.rating === "good").length,
      missed: items.filter(hit => hit.rating === "miss").length,
      averageOffsetMs: timed.length ? Math.round(timed.reduce((sum, hit) => sum + (hit.offsetMs ?? 0), 0) / timed.length) : null,
      typicalOffsetMs: timed.length ? Math.round(timed.reduce((sum, hit) => sum + Math.abs(hit.offsetMs ?? 0), 0) / timed.length) : null
    };
  }).filter(item => item.total > 0);
}

export function groupGrooveFamilies(patterns: PracticePattern[]) {
  const groups = new Map<string, Groove[]>();
  for (const pattern of patterns) if (isGroovePattern(pattern) && !["Fill study", "Groove + fill"].includes(pattern.style)) {
    groups.set(pattern.style, [...(groups.get(pattern.style) ?? []), pattern]);
  }
  const rank = { Beginner: 0, Intermediate: 1, Advanced: 2 };
  return [...groups.entries()].map(([style, grooves]) => ({ style, grooves: [...grooves].sort((a, b) => rank[a.level] - rank[b.level] || a.defaultBpm - b.defaultBpm || a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.style.localeCompare(b.style));
}

/** Pick an unseen pattern that preserves the source pattern's main musical constraint. */
export function recommendUnfamiliarTransferPattern(source: PracticePattern, patterns: PracticePattern[], rounds: TrainerRound[]) {
  const attempted = new Set(rounds.map(round => round.patternId));
  const sourceStyle = "style" in source ? String(source.style ?? "") : "";
  const sourceIsFill = /fill/i.test(sourceStyle) || Boolean(source.trainerFillStepRanges?.length);
  const sourceMeter = "meter" in source ? String(source.meter ?? "") : "";
  const levelRank = { Beginner: 0, Intermediate: 1, Advanced: 2 } as const;
  const candidates = patterns.flatMap(pattern => {
    if (pattern.id === source.id || attempted.has(pattern.id) || pattern.id.startsWith("song:")) return [];
    const style = "style" in pattern ? String(pattern.style ?? "") : "";
    const isFill = /fill/i.test(style) || Boolean(pattern.trainerFillStepRanges?.length);
    if (sourceIsFill !== isFill) return [];
    const meter = "meter" in pattern ? String(pattern.meter ?? "") : "";
    const sameStyle = Boolean(sourceStyle && style === sourceStyle);
    const sameMeter = Boolean(sourceMeter && meter === sourceMeter) || (source.beats === pattern.beats && source.subdivision === pattern.subdivision);
    const sameSubdivision = source.subdivision === pattern.subdivision;
    const levelGap = Math.abs(levelRank[source.level] - levelRank[pattern.level]);
    const score = Number(sameStyle) * 4 + Number(sameMeter) * 3 + Number(sameSubdivision) * 2 - levelGap;
    return [{ pattern, score }];
  }).sort((a, b) => b.score - a.score || a.pattern.name.localeCompare(b.pattern.name));
  return candidates[0]?.pattern ?? null;
}
