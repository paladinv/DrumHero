import { describe, expect, it } from 'vitest';
import { needsTrainerRecovery, trainerSkillMap } from '../../lib/trainer-skill-map';
import type { TrainerRound } from '../../lib/trainer';
const makeRound = (overrides: Partial<TrainerRound> = {}): TrainerRound => ({ id: 'round', patternId: 'groove', patternName: 'Groove', bpm: 80, playedAt: '2026-10-19T12:00:00Z', mode: 'scored', source: 'midi', ratings: [], result: { id: 'score', patternId: 'groove', patternName: 'Groove', bpm: 80, playedAt: '2026-10-19T12:00:00Z', score: 60, accuracy: 60, great: 3, good: 3, miss: 4, extra: 0, maxCombo: 3 }, hits: Array.from({ length: 8 }, () => ({ instrument: 'kick', offsetMs: 20, rating: 'good' })), ...overrides });
describe('trainer coaching evidence', () => {
  it('withholds skill scores without sufficient reliable hits', () => {
    expect(trainerSkillMap([]).every(skill => skill.score === null)).toBe(true);
    expect(trainerSkillMap([makeRound({ inputClipped: true })]).every(skill => skill.score === null)).toBe(true);
    expect(trainerSkillMap([makeRound({ uncertainDetections: 1 })]).every(skill => skill.score === null)).toBe(true);
    expect(trainerSkillMap([makeRound({ mode: 'self' })]).every(skill => skill.score === null)).toBe(true);
  });
  it('distinguishes foot evidence from missing hand and dynamics evidence', () => {
    const skills = trainerSkillMap([makeRound()]);
    expect(skills.find(skill => skill.id === 'feet')?.score).toBe(80);
    expect(skills.find(skill => skill.id === 'hands')?.score).toBeNull();
    expect(skills.find(skill => skill.id === 'dynamics')?.score).toBeNull();
  });
  it('requires both accented and soft velocity samples for dynamics', () => {
    const hits = Array.from({ length: 8 }, (_, index) => ({ instrument: 'snare' as const, offsetMs: 0, rating: 'great' as const, velocity: index < 4 ? 96 : 64, accentTarget: index < 4 }));
    expect(trainerSkillMap([makeRound({ hits })]).find(skill => skill.id === 'dynamics')?.score).toBe(100);
    expect(trainerSkillMap([makeRound({ hits: hits.slice(0, 4) })]).find(skill => skill.id === 'dynamics')?.score).toBeNull();
  });
  it('offers recovery after two difficult rounds of the same pattern', () => {
    expect(needsTrainerRecovery([makeRound()], 'groove')).toBe(false);
    expect(needsTrainerRecovery([makeRound(), makeRound()], 'groove')).toBe(true);
    expect(needsTrainerRecovery([makeRound(), makeRound({ inputClipped: true })], 'groove')).toBe(false);
    expect(needsTrainerRecovery([makeRound(), makeRound()], 'other')).toBe(false);
    expect(needsTrainerRecovery([makeRound({ mode: 'self', ratings: ['missed'] }), makeRound({ mode: 'self', ratings: ['needsWork'] })], 'groove')).toBe(true);
  });
});
