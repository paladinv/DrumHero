import type { TrainerRound } from './trainer';
import type { RatedHit } from './types';

export type TrainerSkill = { id: string; label: string; score: number | null; samples: number; cue: string };
export function trainerSkillMap(rounds: TrainerRound[]): TrainerSkill[] {
  const reliable = rounds.filter(round => round.mode === 'scored' && !round.inputClipped && !round.uncertainDetections && !round.learningMode && (!round.adaptation || round.adaptation === 'standard')).slice(0, 30);
  const hits = reliable.flatMap(round => round.hits ?? []);
  const timing = (values: RatedHit[]) => {
    const offsets = values.flatMap(hit => hit.offsetMs !== null && hit.rating !== 'extra' && Number.isFinite(hit.offsetMs) ? [Math.abs(hit.offsetMs)] : []);
    return { score: offsets.length >= 8 ? Math.round(Math.max(0, 100 - offsets.reduce((a, b) => a + b, 0) / offsets.length)) : null, samples: offsets.length };
  };
  const velocity = hits.filter(hit => hit.rating !== 'miss' && hit.rating !== 'extra' && typeof hit.velocity === 'number' && hit.accentTarget !== undefined);
  const loud = velocity.filter(hit => hit.accentTarget).map(hit => hit.velocity!);
  const soft = velocity.filter(hit => !hit.accentTarget).map(hit => hit.velocity!);
  const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  const dynamics = loud.length >= 4 && soft.length >= 4 ? Math.round(Math.max(0, Math.min(100, (average(loud) - average(soft)) / 32 * 100))) : null;
  return [
    { id: 'timing', label: 'Pulse timing', ...timing(hits), cue: 'Play quarter notes on the snare at a relaxed tempo for 60 seconds.' },
    { id: 'hands', label: 'Hand timing', ...timing(hits.filter(hit => hit.instrument !== 'kick')), cue: 'Alternate soft snare strokes for 60 seconds, keeping both hands even.' },
    { id: 'feet', label: 'Foot timing', ...timing(hits.filter(hit => hit.instrument === 'kick')), cue: 'Play a steady kick pulse for 60 seconds before adding the hi-hat.' },
    { id: 'dynamics', label: 'Accent contrast', score: dynamics, samples: velocity.length, cue: 'Alternate accented and soft snare strokes without changing the pulse.' }
  ];
}
export function needsTrainerRecovery(rounds: TrainerRound[], patternId: string) {
  const recent = rounds.filter(round => round.patternId === patternId).slice(0, 2);
  return recent.length === 2 && recent.every(round => !round.inputClipped && !round.uncertainDetections && (round.mode === 'scored' ? round.result !== null && round.result.accuracy < 70 : round.ratings.length > 0 && round.ratings.filter(value => value !== 'clean').length / round.ratings.length >= 0.5));
}
