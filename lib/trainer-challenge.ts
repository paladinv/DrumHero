import { parseCustomGrooves } from './custom-grooves';
import type { Groove, PracticePattern } from './types';
export type TrainerChallenge = { format: 'drum-hero-peer-challenge'; version: 1; title: string; goal: string; attribution: string; bpm: number; targetAccuracy: number; durationSeconds: 30 | 60 | 120; pattern: Groove };
export function createTrainerChallenge(pattern: PracticePattern, settings: { bpm: number; goal: string; attribution: string; targetAccuracy: number; durationSeconds: 30 | 60 | 120 }): TrainerChallenge {
  const id = `custom-challenge-${crypto.randomUUID()}`;
  const clean: Groove = { id, name: pattern.name.slice(0, 60), level: pattern.level, beats: pattern.beats, subdivision: pattern.subdivision, defaultBpm: settings.bpm, tempoRange: [40, 200], description: 'Imported peer drum challenge.', style: 'Peer challenge', focus: settings.goal.trim(), hits: pattern.hits.map(hit => ({ step: hit.step, instrument: hit.instrument, accent: hit.accent === true, ...(hit.articulation ? { articulation: hit.articulation } : {}) })) };
  return parseTrainerChallenge(JSON.stringify({ format: 'drum-hero-peer-challenge', version: 1, title: `${pattern.name} challenge`.slice(0, 80), goal: settings.goal.trim(), attribution: settings.attribution.trim(), bpm: settings.bpm, targetAccuracy: settings.targetAccuracy, durationSeconds: settings.durationSeconds, pattern: clean }));
}
export function parseTrainerChallenge(raw: string): TrainerChallenge {
  if (new TextEncoder().encode(raw).byteLength > 200000) throw new Error('Challenge files must be smaller than 200 KB.');
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error('This challenge is not valid JSON.'); }
  if (!value || typeof value !== 'object') throw new Error('Invalid challenge file.');
  const item = value as Partial<TrainerChallenge>;
  const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
  const patterns = parseCustomGrooves(JSON.stringify([item.pattern]));
  if (item.format !== 'drum-hero-peer-challenge' || item.version !== 1 || !text(item.title, 80) || !text(item.goal, 300) || !text(item.attribution, 300) || !Number.isInteger(item.bpm) || item.bpm! < 40 || item.bpm! > 200 || !Number.isInteger(item.targetAccuracy) || item.targetAccuracy! < 50 || item.targetAccuracy! > 100 || ![30, 60, 120].includes(item.durationSeconds ?? 0) || patterns.length !== 1 || !patterns[0].hits.length) throw new Error('Challenge needs a valid drum pattern, attribution, tempo, duration, and accuracy goal.');
  // Build a fresh allowlisted record: uploaded profile/audio fields never enter storage.
  const pattern = patterns[0];
  return { format: 'drum-hero-peer-challenge', version: 1, title: item.title.trim(), goal: item.goal.trim(), attribution: item.attribution.trim(), bpm: item.bpm!, targetAccuracy: item.targetAccuracy!, durationSeconds: item.durationSeconds!, pattern: { id: pattern.id, name: pattern.name, level: pattern.level, beats: pattern.beats, subdivision: pattern.subdivision, defaultBpm: item.bpm!, tempoRange: [40, 200], description: 'Imported peer drum challenge.', style: 'Peer challenge', focus: item.goal.trim(), hits: pattern.hits.map(hit => ({ step: hit.step, instrument: hit.instrument, accent: hit.accent === true, ...(hit.articulation ? { articulation: hit.articulation } : {}) })) } };
}
