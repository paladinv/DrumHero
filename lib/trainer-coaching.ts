import type { Instrument, PracticePattern, RatedHit } from './types';
import { expectedRoundHits, type TrainerRound, type TrainerFeel } from './trainer';

export type LearningMode = 'normal' | 'listen-copy-solo' | 'build-limbs';
export function learningStage(mode: LearningMode, repetition: number, repetitions: number) {
  if (mode === 'listen-copy-solo') return repetition === 0 ? 'Listen' : repetition < Math.max(2, Math.ceil(repetitions / 2)) ? 'Copy' : 'Play alone';
  if (mode === 'build-limbs') return repetition < Math.ceil(repetitions / 3) ? 'Feet' : repetition < Math.ceil(repetitions * 2 / 3) ? 'Hands' : 'Together';
  return 'Practice';
}
export function comparableRounds(rounds: TrainerRound[], current: TrainerRound) {
  return rounds.filter(r => r.patternId === current.patternId && (r.variationId ?? "base") === (current.variationId ?? "base") && r.mode === current.mode && r.source === current.source && Math.abs(r.bpm - current.bpm) <= 5 && (r.feel ?? 'straight') === (current.feel ?? 'straight') && (r.limbFocus ?? 'all') === (current.limbFocus ?? 'all') && (r.adaptation ?? 'standard') === (current.adaptation ?? 'standard') && (r.swingRatio ?? 2 / 3) === (current.swingRatio ?? 2 / 3) && (r.pocketMs ?? 35) === (current.pocketMs ?? 35) && (r.inputProfile ?? r.source) === (current.inputProfile ?? current.source) && r.targetVoice === current.targetVoice && (r.voicePractice ?? 'all') === (current.voicePractice ?? 'all') && r.voiceFocus === current.voiceFocus && r.voiceLayerCount === current.voiceLayerCount && !r.uncertainDetections && !r.inputClipped && !current.uncertainDetections && !current.inputClipped && !r.focusedDrill && !r.learningMode && !current.learningMode);
}
export function nextCoaching(round: TrainerRound, pattern: PracticePattern) {
  const groups = new Map<string, { instrument: Instrument; beat: number; misses: number; offsets: number[] }>();
  for (const hit of round.hits ?? []) {
    if (hit.step === undefined || hit.transition === 'landing') continue;
    const beat = Math.floor(hit.step / (pattern.subdivision / 4)) + 1;
    const key = `${hit.instrument}:${beat}`;
    const group = groups.get(key) ?? { instrument: hit.instrument, beat, misses: 0, offsets: [] };
    if (hit.rating === 'miss') group.misses++;
    if (hit.offsetMs !== null) group.offsets.push(hit.offsetMs);
    groups.set(key, group);
  }
  const worst = [...groups.values()].sort((a, b) => (b.misses * 100 + b.offsets.reduce((s, x) => s + Math.abs(x), 0)) - (a.misses * 100 + a.offsets.reduce((s, x) => s + Math.abs(x), 0)))[0];
  if (!worst) return { text: 'Repeat the phrase slowly and aim for an even pulse.', bpm: Math.max(pattern.tempoRange[0], round.bpm - 5), beat: 1, instrument: 'snare' as const };
  const offset = worst.offsets.length ? worst.offsets.reduce((s, x) => s + x, 0) / worst.offsets.length : 0;
  return { text: `${worst.instrument} on beat ${worst.beat}: ${worst.misses ? `${worst.misses} missed strokes` : Math.abs(offset) > 20 ? `tends ${offset < 0 ? 'early' : 'late'} by ${Math.round(Math.abs(offset))} ms` : 'keep the spacing even'}. Repeat this beat at ${Math.max(pattern.tempoRange[0], round.bpm - 5)} BPM.`, bpm: Math.max(pattern.tempoRange[0], round.bpm - 5), beat: worst.beat, instrument: worst.instrument };
}

export type FocusDrillProgression = {
  baselineAccuracy: number;
  drillAccuracy: number;
  baselineTimingMs: number | null;
  drillTimingMs: number | null;
  action: "repeat-slower" | "repeat" | "next-beat" | "raise-tempo";
  nextBeat: number;
  nextBpm: number;
  message: string;
};

export function focusedDrillProgression(source: TrainerRound, drill: TrainerRound, pattern: PracticePattern): FocusDrillProgression | null {
  const focus = drill.focusedDrill;
  if (!focus || source.mode !== "scored" || drill.mode !== "scored" || source.inputClipped || source.uncertainDetections || drill.inputClipped || drill.uncertainDetections) return null;
  const stepStart = Math.floor((focus.beat - 1) * pattern.subdivision / 4);
  const stepEnd = stepStart + pattern.subdivision / 4;
  const measure = (round: TrainerRound) => {
    const targets = (round.hits ?? []).filter(hit => hit.instrument === focus.instrument && hit.step !== undefined && hit.step >= stepStart && hit.step < stepEnd && hit.transition !== "landing" && hit.rating !== "extra");
    if (!targets.length) return null;
    const accuracy = Math.round(targets.filter(hit => hit.rating === "great" || hit.rating === "good").length / targets.length * 100);
    const offsets = targets.flatMap(hit => typeof hit.offsetMs === "number" ? [Math.abs(hit.offsetMs)] : []);
    return { accuracy, timingMs: offsets.length ? Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length) : null };
  };
  const baseline = measure(source), current = measure(drill);
  if (!baseline || !current) return null;
  const maxTempo = pattern.tempoRange[1], minTempo = pattern.tempoRange[0];
  const stepsPerBeat = pattern.subdivision / 4;
  const nextBeat = pattern.hits
    .filter(hit => hit.instrument === focus.instrument)
    .map(hit => Math.floor(hit.step / stepsPerBeat) + 1)
    .filter(beat => beat !== focus.beat && beat >= 1 && beat <= pattern.beats)
    .sort((a, b) => (a > focus.beat ? a - focus.beat : pattern.beats + a - focus.beat) - (b > focus.beat ? b - focus.beat : pattern.beats + b - focus.beat))[0] ?? focus.beat;

  if (current.accuracy < 70 || (current.timingMs !== null && current.timingMs > 70)) {
    const nextBpm = Math.max(minTempo, drill.bpm - 5);
    return { baselineAccuracy: baseline.accuracy, drillAccuracy: current.accuracy, baselineTimingMs: baseline.timingMs, drillTimingMs: current.timingMs, action: "repeat-slower", nextBeat: focus.beat, nextBpm, message: `Repeat ${focus.instrument} on beat ${focus.beat} at ${nextBpm} BPM. Slow the pulse enough to make each stroke comfortable.` };
  }
  if (current.accuracy >= 85 && (current.timingMs === null || current.timingMs <= 35)) {
    if (nextBeat !== focus.beat) return { baselineAccuracy: baseline.accuracy, drillAccuracy: current.accuracy, baselineTimingMs: baseline.timingMs, drillTimingMs: current.timingMs, action: "next-beat", nextBeat, nextBpm: drill.bpm, message: `Good control. Move the ${focus.instrument} focus to beat ${nextBeat} at ${drill.bpm} BPM.` };
    const nextBpm = Math.min(maxTempo, drill.bpm + 2);
    return { baselineAccuracy: baseline.accuracy, drillAccuracy: current.accuracy, baselineTimingMs: baseline.timingMs, drillTimingMs: current.timingMs, action: "raise-tempo", nextBeat: focus.beat, nextBpm, message: nextBpm > drill.bpm ? `Good control. Raise the tempo to ${nextBpm} BPM and repeat beat ${focus.beat}.` : `You reached this groove's ${maxTempo} BPM limit. Repeat beat ${focus.beat} once more, then try the next groove.` };
  }
  return { baselineAccuracy: baseline.accuracy, drillAccuracy: current.accuracy, baselineTimingMs: baseline.timingMs, drillTimingMs: current.timingMs, action: "repeat", nextBeat: focus.beat, nextBpm: drill.bpm, message: `Repeat ${focus.instrument} on beat ${focus.beat} at ${drill.bpm} BPM until the timing feels more settled.` };
}
export function transitionFeedback(hits: RatedHit[], fillStartStep: number, stepsPerBar = fillStartStep) {
  const summarize = (items: RatedHit[], includeLanding = false) => { const targets = items.filter(h => h.rating !== 'extra' && (includeLanding || h.transition !== 'landing')); return targets.length ? `${Math.round(targets.filter(h => h.rating !== 'miss').length / targets.length * 100)}% hits on time` : 'No targets captured'; };
  const returns = hits.filter(h => h.transition === 'landing');
  const returnGroove = hits.filter(h => h.repetition !== undefined && h.repetition > 0 && h.step !== undefined && h.step < stepsPerBar && h.transition !== 'landing');
  return {
    groove: summarize(hits.filter(h => h.step !== undefined && h.step < fillStartStep)),
    fill: summarize(hits.filter(h => h.step !== undefined && h.step >= fillStartStep)),
    returnGroove: summarize(returnGroove),
    landing: summarize(returns, true),
  };
}
export function articulationFeedback(hits: RatedHit[]) {
  return (['flam', 'drag'] as const).flatMap(articulation => {
    const groups = new Map<string, RatedHit[]>();
    hits.filter(h => h.articulation === articulation).forEach(h => { const key = `${h.repetition}:${h.step}:${h.instrument}`; groups.set(key, [...(groups.get(key) ?? []), h]); });
    const gaps = [...groups.values()].flatMap(items => { const times = items.flatMap(h => h.atMs === undefined ? [] : [h.atMs]).sort((a, b) => a - b); return times.slice(1).map((time, i) => time - times[i]); });
    if (!gaps.length) return [];
    const mean = gaps.reduce((s, x) => s + x, 0) / gaps.length;
    const spread = Math.sqrt(gaps.reduce((s, x) => s + (x - mean) ** 2, 0) / gaps.length);
    const target = [...groups.values()].flat().find((hit) => hit.articulationSpacingMs !== undefined)?.articulationSpacingMs;
    const difference = target === undefined ? null : Math.round(mean - target);
    return [`${articulation}: ${Math.round(mean)} ms average spacing${target === undefined ? '' : ` · ${target} ms target at this tempo · ${difference && difference > 0 ? '+' : ''}${difference} ms from target`} · ${Math.round(spread)} ms variation. ${spread <= 15 && (difference === null || Math.abs(difference) <= 12) ? 'Consistent spacing.' : 'Match the grace-stroke spacing to the tempo target.'}`];
  });
}
export function musicalPhrase(base: PracticePattern, bars: 0 | 4 | 8 | 16, fill?: PracticePattern): PracticePattern {
  if (!bars) return base;
  const meter = 'meter' in base && typeof base.meter === 'string' ? base.meter : '';
  const originalBars = Number(meter.match(/^(\d+)\s+bars?\b/i)?.[1] ?? 1);
  const barBeats = meter ? base.beats / originalBars : 4;
  const steps = Math.round(barBeats * base.subdivision / 4);
  const sourceSteps = Math.round(base.beats * base.subdivision / 4);
  const fillRanges: Array<[number, number]> = [];
  const hits = Array.from({ length: bars }, (_, bar) => {
    const section = Math.floor(bar / 4);
    if (bar % 4 === 3 && fill) fillRanges.push([bar * steps, (bar + 1) * steps]);
    const barHits = bar % 4 === 3 && fill ? fill.hits.filter(hit => hit.step < steps) : Array.from({ length: steps }, (_, step) => base.hits.filter(hit => hit.step === (bar * steps + step) % sourceSteps).map(hit => ({ ...hit, step }))).flat();
    return barHits.filter(hit => !(bar % 4 === 2 && hit.step >= steps - base.subdivision / 4)).map(hit => ({ ...hit, step: hit.step + bar * steps, accent: section % 2 === 1 ? true : hit.accent }));
  }).flat();
  return { ...base, ...{ meter: `${bars} bars · ${meter.replace(/^\d+\s+bars?\s*·\s*/i, '') || '4/4'}` }, id: `phrase:${base.id}:${fill?.id ?? 'none'}:${bars}`, name: `${base.name} · ${bars}-bar arrangement`, description: 'Four-bar sections: groove, groove, last-beat rest, then fill. Alternate normal and accented sections.', beats: barBeats * bars, hits, trainerFillStepRanges: fillRanges };
}

export function guideRoundHits(pattern: PracticePattern, bpm: number, startAt: number, repetitions: number, feel: TrainerFeel, options: { swingRatio?: number; pocketMs?: number }) {
  return expectedRoundHits(pattern, bpm, startAt, repetitions, feel, options).flatMap(target => target.articulation === 'buzz' ? Array.from({ length: 6 }, (_, index) => ({ ...target, at: target.at + index * 22, accent: index === 0 && target.accent })) : [target]);
}
