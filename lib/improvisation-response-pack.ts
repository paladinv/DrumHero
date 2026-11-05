import { createImprovisationMidi } from './improvisation-midi';
import { parseImprovisationHistory, parseImprovisationTakes, parseImprovisationWorkspace, type ImprovisationAssignment, type ImprovisationSummary, type ImprovisationTake } from './improvisation';

export const IMPROVISATION_RESPONSE_PACK_FORMAT = 'drum-hero-improvisation-response-v1';
const MAX_PACK_CHARS = 2_000_000;

export type ImprovisationResponsePack = {
  summary: ImprovisationSummary;
  take: ImprovisationTake;
  assignment?: ImprovisationAssignment;
  midiBase64: string;
  exportedAt: string;
};

function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

export function decodeResponseMidi(base64: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length > 1_500_000) throw new Error('This response pack has invalid MIDI data.');
  let binary: string;
  try { binary = atob(base64); } catch { throw new Error('This response pack has invalid MIDI data.'); }
  if (binary.length < 14 || binary.slice(0, 4) !== 'MThd') throw new Error('This response pack is missing its MIDI file.');
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function createImprovisationResponsePack(summary: ImprovisationSummary, take: ImprovisationTake, assignment?: ImprovisationAssignment) {
  if (summary.input === 'unscored' || !take.hits.length || summary.id !== take.id) throw new Error('A response pack requires a scored session with a captured take.');
  const midiBase64 = encodeBase64(createImprovisationMidi(take));
  return JSON.stringify({ application: 'Drum Hero', format: IMPROVISATION_RESPONSE_PACK_FORMAT, version: 1, exportedAt: new Date().toISOString(), summary, take, assignment, midiBase64 }, null, 2);
}

export function parseImprovisationResponsePack(raw: string): ImprovisationResponsePack {
  if (raw.length > MAX_PACK_CHARS) throw new Error('This response pack is too large.');
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON.'); }
  if (!data || typeof data !== 'object') throw new Error('This is not a Drum Hero response pack.');
  const record = data as Record<string, unknown>;
  if (record.application !== 'Drum Hero' || record.format !== IMPROVISATION_RESPONSE_PACK_FORMAT || record.version !== 1) throw new Error('This is not a Drum Hero response pack.');
  const summaries = parseImprovisationHistory(JSON.stringify({ version: 1, sessions: [record.summary] }));
  const takes = parseImprovisationTakes(JSON.stringify({ version: 1, takes: [record.take] }));
  if (summaries.length !== 1 || takes.length !== 1 || summaries[0].input === 'unscored' || summaries[0].id !== takes[0].id || !takes[0].hits.length || JSON.stringify(summaries[0].settings) !== JSON.stringify(takes[0].settings) || summaries[0].phrases.length !== takes[0].phrases) throw new Error('This response pack has invalid session or take data.');
  const midiBase64 = typeof record.midiBase64 === 'string' ? record.midiBase64 : '';
  const midi = decodeResponseMidi(midiBase64);
  if (midi.length > 1_000_000) throw new Error('This response pack MIDI file is too large.');
  let assignment: ImprovisationAssignment | undefined;
  if (record.assignment !== undefined) {
    const workspace = parseImprovisationWorkspace(JSON.stringify({ version: 1, assignments: [record.assignment], presets: [], completedSteps: [] }));
    assignment = workspace.assignments?.[0];
    if (!assignment) throw new Error('This response pack has an invalid practice assignment.');
  }
  if (typeof record.exportedAt !== 'string' || !Number.isFinite(Date.parse(record.exportedAt))) throw new Error('This response pack has an invalid export date.');
  return { summary: summaries[0], take: { ...takes[0], id: crypto.randomUUID(), name: `Shared · ${takes[0].name}` }, ...(assignment ? { assignment } : {}), midiBase64, exportedAt: record.exportedAt };
}
