import { parseImprovisationWorkspace, type ImprovisationAssignment } from './improvisation';

export const IMPROVISATION_PLAYLIST_FORMAT = 'drum-hero-improvisation-playlist-v1';
const MAX_BYTES = 1_000_000;

export function createImprovisationPlaylistFile(assignment: ImprovisationAssignment) {
  return JSON.stringify({ application: 'Drum Hero', format: IMPROVISATION_PLAYLIST_FORMAT, version: 1, exportedAt: new Date().toISOString(), assignment }, null, 2);
}

export function parseImprovisationPlaylistFile(raw: string): ImprovisationAssignment {
  if (raw.length > MAX_BYTES) throw new Error('This playlist file is too large.');
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON.'); }
  if (!data || typeof data !== 'object' || (data as Record<string, unknown>).application !== 'Drum Hero' || (data as Record<string, unknown>).format !== IMPROVISATION_PLAYLIST_FORMAT || (data as Record<string, unknown>).version !== 1) throw new Error('This is not a Drum Hero improvisation playlist.');
  const assignment = (data as Record<string, unknown>).assignment;
  const workspace = parseImprovisationWorkspace(JSON.stringify({ version: 1, assignments: [assignment], presets: [], completedSteps: [] }));
  const parsed = workspace.assignments?.[0];
  if (!parsed || !Array.isArray((assignment as { steps?: unknown[] } | null)?.steps) || parsed.steps.length !== (assignment as { steps: unknown[] }).steps.length) throw new Error('This playlist has invalid settings or steps.');
  return { ...parsed, id: crypto.randomUUID(), steps: parsed.steps.map(step => ({ ...step, id: crypto.randomUUID() })) };
}
