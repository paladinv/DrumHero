import { describe, expect, it } from 'vitest';
import { assertArrangementChangesAllowed, emptySongLibrary, examples, migrateSongLibrary } from '@/lib/song-library';
import { createTrainerChallenge, parseTrainerChallenge } from '@/lib/trainer-challenge';
import { parseLocalBackup } from '@/lib/local-backup';
import { parseTrainerState } from '@/lib/trainer';
import { patterns } from '@/lib/curriculum';

const baseBackup = () => ({ application: 'Drum Hero', format: 'drum-hero-full-backup', version: 1, createdAt: '2026-10-21T00:00:00Z', localStorage: {}, songRecordings: [], customSamples: [] });
const trainerTake = () => ({ id: 'take', name: 'Weekly check', patternId: 'groove', patternName: 'Groove', bpm: 80, pinned: true, createdAt: '2026-10-21T00:00:00Z', expectedMarkersMs: [0, 750], actualMarkersMs: [5, 748], blob: { mimeType: 'audio/wav', data: 'YWJj' } });
describe('additional Chord Hero adaptations', () => {
  it('keeps older backups compatible and validates Trainer recording metadata', () => {
    expect(parseLocalBackup(JSON.stringify(baseBackup())).trainerRecordings).toBeUndefined();
    const raw = { ...baseBackup(), trainerRecordings: [trainerTake()] };
    expect(parseLocalBackup(JSON.stringify(raw)).trainerRecordings?.[0].expectedMarkersMs).toEqual([0, 750]);
    expect(() => parseLocalBackup(JSON.stringify({ ...raw, trainerRecordings: [trainerTake(), trainerTake()] }))).toThrow(/metadata/);
    expect(() => parseLocalBackup(JSON.stringify({ ...raw, trainerRecordings: [{ ...trainerTake(), actualMarkersMs: ['bad'] }] }))).toThrow(/metadata/);
    expect(() => parseLocalBackup(JSON.stringify({ ...raw, trainerRecordings: [{ ...trainerTake(), blob: { mimeType: 'audio/wav', data: '!!!' } }] }))).toThrow(/audio/);
  });
  it('rejects more than four pinned references during restore', () => {
    expect(() => parseLocalBackup(JSON.stringify({ ...baseBackup(), trainerRecordings: Array.from({ length: 5 }, (_, index) => ({ ...trainerTake(), id: `take-${index}` })) }))).toThrow(/four pinned/);
  });
  it('protects locked arrangements against edits, removal, and replacement imports', () => {
    const song = { ...structuredClone(examples[0]), arrangementLocked: true, bundled: false };
    const previous = { ...emptySongLibrary(), songs: [song] };
    expect(() => assertArrangementChangesAllowed(previous, { ...previous, songs: [{ ...song, bpm: song.bpm + 5 }] })).toThrow(/locked/);
    expect(() => assertArrangementChangesAllowed(previous, emptySongLibrary())).toThrow(/locked/);
    expect(() => assertArrangementChangesAllowed(previous, { ...previous, songs: [{ ...song, arrangementLocked: false, sections: [] }] })).toThrow(/locked/);
    expect(() => assertArrangementChangesAllowed(previous, { ...previous, songs: [{ ...song, title: 'Renamed' }] })).not.toThrow();
    const unlocked = { ...previous, songs: [{ ...song, arrangementLocked: false }] };
    expect(() => assertArrangementChangesAllowed(previous, unlocked)).toThrow(/locked/);
    expect(() => assertArrangementChangesAllowed(previous, unlocked, { unlockSongId: song.id })).not.toThrow();
    expect(() => assertArrangementChangesAllowed(unlocked, { ...unlocked, songs: [{ ...song, arrangementLocked: false, bpm: 99 }] })).not.toThrow();
    expect(migrateSongLibrary(previous).songs[0].arrangementLocked).toBe(true);
  });
  it('exports a portable challenge without profile or recording fields', () => {
    const challenge = createTrainerChallenge({ ...patterns[0], description: 'Private annotation' }, { bpm: 80, goal: 'Even pulse', attribution: 'Original exercise', targetAccuracy: 85, durationSeconds: 60 });
    const imported = parseTrainerChallenge(JSON.stringify({ ...challenge, recordingId: 'private-take', profile: { name: 'Student' } }));
    expect(imported.pattern.hits).toEqual(challenge.pattern.hits);
    expect(JSON.stringify(imported)).not.toMatch(/private-take|Student|Private annotation/);
    expect(() => parseTrainerChallenge(JSON.stringify({ ...challenge, bpm: 400 }))).toThrow();
    expect(() => parseTrainerChallenge(JSON.stringify({ ...challenge, attribution: '' }))).toThrow();
    expect(() => parseTrainerChallenge('x'.repeat(200001))).toThrow(/200 KB/);
  });
  it('preserves rudiment articulation in challenge exchange', () => {
    const pattern = patterns.find(pattern => pattern.hits.some(hit => hit.articulation === 'flam'))!;
    const challenge = createTrainerChallenge(pattern, { bpm: 60, goal: 'Clear flams', attribution: 'Original drill', targetAccuracy: 80, durationSeconds: 30 });
    expect(parseTrainerChallenge(JSON.stringify(challenge)).pattern.hits.some(hit => hit.articulation === 'flam')).toBe(true);
  });
  it('retains timed rehearsal history with nonstandard repetition counts', () => {
    const round = { id: 'timed', patternId: 'single-stroke', patternName: 'Singles', bpm: 70, mode: 'scored', source: 'keyboard', ratings: [], result: { score: 80, accuracy: 80 }, repetitions: 18, durationSeconds: 60, playedAt: '2026-10-21T00:00:00Z' };
    expect(parseTrainerState(JSON.stringify({ version: 2, rounds: [round] })).rounds).toHaveLength(1);
    expect(parseTrainerState(JSON.stringify({ version: 2, rounds: [{ ...round, durationSeconds: undefined }] })).rounds).toHaveLength(0);
  });
});
