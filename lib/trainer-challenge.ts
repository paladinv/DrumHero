import { parseCustomGrooves } from './custom-grooves';
import type { Groove, PracticePattern } from './types';

export type TrainerChallenge = { format: 'drum-hero-peer-challenge'; version: 2; title: string; goal: string; attribution: string; bpm: number; targetAccuracy: number; durationSeconds: 30 | 60 | 120; pattern: Groove; patterns: Groove[] };

function cleanPattern(pattern: PracticePattern, goal: string, bpm: number): Groove {
  return {
    id: `custom-challenge-${crypto.randomUUID()}`,
    name: pattern.name.slice(0, 60), level: pattern.level, beats: pattern.beats, subdivision: pattern.subdivision,
    defaultBpm: bpm, tempoRange: [40, 200], description: 'Imported peer drum challenge.', style: 'Peer challenge', focus: goal,
    hits: pattern.hits.map(hit => ({ step: hit.step, instrument: hit.instrument, accent: hit.accent === true, ...(hit.sticking ? { sticking: hit.sticking } : {}), ...(hit.articulation ? { articulation: hit.articulation } : {}) }))
  };
}

export function createTrainerChallenge(patterns: PracticePattern[] | PracticePattern, settings: { bpm: number; goal: string; attribution: string; targetAccuracy: number; durationSeconds: 30 | 60 | 120 }): TrainerChallenge {
  const items = (Array.isArray(patterns) ? patterns : [patterns]).slice(0, 20).map((pattern) => cleanPattern(pattern, settings.goal.trim(), settings.bpm));
  const first = items[0];
  if (!first) throw new Error('Choose at least one pattern for the challenge.');
  return parseTrainerChallenge(JSON.stringify({ format: 'drum-hero-peer-challenge', version: 2, title: `${first.name} practice challenge`.slice(0, 80), goal: settings.goal.trim(), attribution: settings.attribution.trim(), bpm: settings.bpm, targetAccuracy: settings.targetAccuracy, durationSeconds: settings.durationSeconds, patterns: items }));
}

export function parseTrainerChallenge(raw: string): TrainerChallenge {
  if (new TextEncoder().encode(raw).byteLength > 200000) throw new Error('Challenge files must be smaller than 200 KB.');
  let value: unknown; try { value = JSON.parse(raw); } catch { throw new Error('This challenge is not valid JSON.'); }
  if (!value || typeof value !== 'object') throw new Error('Invalid challenge file.');
  const item = value as Record<string, unknown>;
  const text = (candidate: unknown, limit: number): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0 && candidate.length <= limit;
  const rawPatterns = item.version === 1 ? [item.pattern] : item.patterns;
  const patternCount = Array.isArray(rawPatterns) ? rawPatterns.length : 0;
  const patterns = Array.isArray(rawPatterns) && rawPatterns.length > 0 && rawPatterns.length <= 20
    ? parseCustomGrooves(JSON.stringify(rawPatterns)) : [];
  if (item.format !== 'drum-hero-peer-challenge' || (item.version !== 1 && item.version !== 2) || !text(item.title, 80) || !text(item.goal, 300) || !text(item.attribution, 300) || !Number.isInteger(item.bpm) || Number(item.bpm) < 40 || Number(item.bpm) > 200 || !Number.isInteger(item.targetAccuracy) || Number(item.targetAccuracy) < 50 || Number(item.targetAccuracy) > 100 || ![30, 60, 120].includes(Number(item.durationSeconds)) || patterns.length !== patternCount || patterns.some(pattern => !pattern.hits.length)) throw new Error('Challenge needs valid patterns, attribution, tempo, duration, and accuracy goal.');
  const cleanPatterns = patterns.map((pattern, index) => ({
    id: pattern.id, name: pattern.name, level: pattern.level, beats: pattern.beats, subdivision: pattern.subdivision,
    defaultBpm: Number(item.bpm), tempoRange: [40, 200] as [number, number], description: 'Imported peer drum challenge.',
    style: 'Peer challenge', focus: String(item.goal).trim(),
    hits: pattern.hits.map(hit => ({ step: hit.step, instrument: hit.instrument, accent: hit.accent === true, ...(hit.sticking ? { sticking: hit.sticking } : {}), ...(hit.articulation ? { articulation: hit.articulation } : {}) }))
  }));
  return { format: 'drum-hero-peer-challenge', version: 2, title: item.title.trim(), goal: item.goal.trim(), attribution: item.attribution.trim(), bpm: Number(item.bpm), targetAccuracy: Number(item.targetAccuracy), durationSeconds: Number(item.durationSeconds) as 30 | 60 | 120, patterns: cleanPatterns, pattern: cleanPatterns[0] };
}
