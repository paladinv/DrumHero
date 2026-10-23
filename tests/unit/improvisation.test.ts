import { describe, expect, it } from 'vitest';
import { DEFAULT_IMPROVISATION_SETTINGS as defaults, IMPROVISATION_KEY, ImprovisationTransport, improvisationAudioEvents, improvisationPosition, normalizeImprovisationSettings, parseImprovisationHistory, phraseDuration, playerPhraseStart, promptForPhrase, sessionDuration, summarizeImprovisation, virtualDrummerPhrase, type ImprovisationHit, type ImprovisationSettings, type ImprovisationSummary } from '@/lib/improvisation';
import { learnerStorageKey } from '@/lib/learner-profiles';
import { getTrainerDeviceProfile, midiNoteFromMessage, midiVelocityFromMessage, parseTrainerState } from '@/lib/trainer';
import { parseLocalBackup } from '@/lib/local-backup';

const settings = (patch: Partial<ImprovisationSettings> = {}) => ({ ...defaults, bpm: 120, phrases: 2 as const, ...patch });
const summary = (input: ImprovisationSummary['input'] = 'keyboard'): ImprovisationSummary => ({ version: 1, id: 'one', playedAt: '2026-10-22T12:00:00Z', settings: settings(), input, phrases: summarizeImprovisation(settings(), [], input) });

describe('improvisation transport', () => {
  it('normalizes tempo and discrete settings', () => {
    expect(normalizeImprovisationSettings({ bpm: 999, clickLevel: -2 })).toMatchObject({ bpm: 200, clickLevel: 0, phrases: 4 });
    expect(normalizeImprovisationSettings({ bpm: NaN })).toMatchObject({ bpm: 80 });
  });
  it('assigns exact four-bar turn boundaries and finishes after the requested exchanges', () => {
    const config = settings(), phrase = phraseDuration(config);
    expect(phrase).toBe(8000); expect(sessionDuration(config)).toBe(32000);
    expect(improvisationPosition(config, -1).phase).toBe('count-in');
    expect(improvisationPosition(config, phrase - 0.1)).toMatchObject({ phase: 'partner', phrase: 0, bar: 4, beat: 4, warning: true });
    expect(improvisationPosition(config, phrase)).toMatchObject({ phase: 'player', phrase: 0, bar: 1, beat: 1, warning: false });
    expect(improvisationPosition(config, 2 * phrase)).toMatchObject({ phase: 'partner', phrase: 1 });
    expect(improvisationPosition(config, 3 * phrase)).toMatchObject({ phase: 'player', phrase: 1 });
    expect(improvisationPosition(config, 4 * phrase).phase).toBe('complete');
  });
  it('guided phrases have no partner turn and cycle from the selected prompt', () => {
    const config = settings({ mode: 'guided', prompt: 'space', cyclePrompts: true, phrases: 4 });
    expect([0, 1, 2, 3].map(i => promptForPhrase(config, i))).toEqual(['space', 'free', 'backbeat', 'two-voices']);
    expect(improvisationPosition(config, 0).phase).toBe('player');
    expect(improvisationPosition(config, 8000)).toMatchObject({ phase: 'player', phrase: 1 });
    expect(sessionDuration(config)).toBe(32000);
    expect(promptForPhrase({ ...config, mode: 'trading' }, 1)).toBe('space');
  });
  it('freezes musical time and inserts a fresh count-in on resume', () => {
    const clock = new ImprovisationTransport(settings()); clock.start(1000);
    expect(clock.position(1000)).toMatchObject({ phase: 'count-in', beat: 1 });
    expect(clock.position(3000)).toMatchObject({ phase: 'partner', elapsedMs: 0 });
    clock.pause(12000); expect(clock.position(20000)).toMatchObject({ phase: 'paused', elapsedMs: 9000 });
    clock.resume(20000); expect(clock.position(21000)).toMatchObject({ phase: 'count-in', elapsedMs: 9000 });
    expect(clock.position(22000)).toMatchObject({ phase: 'player', elapsedMs: 9000 });
    expect(clock.position(22500)).toMatchObject({ elapsedMs: 9500 });
    clock.stop(22500); expect(clock.position(50000)).toMatchObject({ phase: 'stopped', elapsedMs: 9500 });
  });
  it('pausing count-in does not consume a phrase', () => {
    const clock = new ImprovisationTransport(settings({ mode: 'guided' })); clock.start(0); clock.pause(750); clock.resume(10000);
    expect(clock.position(12000)).toMatchObject({ phase: 'player', elapsedMs: 0 });
  });
  it('corrects latency before turn ownership and never accepts count-in or paused hits', () => {
    const clock = new ImprovisationTransport(settings()); clock.start(0);
    expect(clock.capture('kick', 1000, 0)).toBeNull();
    expect(clock.capture('kick', 9999, 0)).toBeNull();
    expect(clock.capture('kick', 10020, 40)).toBeNull();
    expect(clock.capture('kick', 10040, 40)).toEqual({ instrument: 'kick', atMs: 8000 });
    clock.pause(11000); expect(clock.capture('kick', 11000, 0)).toBeNull();
    clock.resume(20000); expect(clock.capture('kick', 21000, 0)).toBeNull();
    expect(clock.capture('kick', 22000, 0)).toEqual({ instrument: 'kick', atMs: 9000 });
  });
});

describe('virtual drummer and audio timeline', () => {
  it('generates repeatable four-bar phrases with a short final-bar variation', () => {
    const hits = virtualDrummerPhrase(2);
    expect(hits).toEqual(virtualDrummerPhrase(2));
    expect(hits.filter(h => h.instrument === 'kick')).toHaveLength(8);
    expect(hits.filter(h => h.step >= 60).map(h => h.step)).toEqual([60, 62, 63]);
    expect(virtualDrummerPhrase(1)).not.toEqual(hits);
  });
  it('schedules no virtual drummer during player turns, while bass and click continue', () => {
    const config = settings(), events = improvisationAudioEvents(config);
    expect(events.filter(e => e.kind === 'drum').every(e => improvisationPosition(config, e.atMs).phase === 'partner')).toBe(true);
    expect(events.some(e => e.kind === 'bass' && improvisationPosition(config, e.atMs).phase === 'player')).toBe(true);
    expect(events.filter(e => e.kind === 'click')).toHaveLength(64);
    expect(improvisationAudioEvents({ ...config, mode: 'guided', bass: false }).every(e => e.kind === 'click')).toBe(true);
  });
});

describe('musical constraint feedback', () => {
  it('keeps silence without timing evidence or an entry kick', () => {
    const [result] = summarizeImprovisation(settings({ prompt: 'backbeat' }), [], 'keyboard');
    expect(result).toMatchObject({ hitCount: 0, timingDistanceMs: null, entryOffsetMs: null, backbeats: { matched: 0, total: 8 } });
  });
  it('allows creative notes, reports absolute grid distance, and only accepts kick entries', () => {
    const config = settings(), start = playerPhraseStart(config, 0);
    const hits: ImprovisationHit[] = [{ instrument: 'snare', atMs: start }, { instrument: 'kick', atMs: start + 20 }, { instrument: 'tom', atMs: start + 145 }];
    expect(summarizeImprovisation(config, hits, 'touch')[0]).toMatchObject({ hitCount: 3, entryOffsetMs: 20, timingDistanceMs: 13, backbeats: null, voiceCompliance: null, restViolations: null });
  });
  it('matches each required backbeat at most once', () => {
    const config = settings({ prompt: 'backbeat' }), start = playerPhraseStart(config, 0);
    const hits: ImprovisationHit[] = Array.from({ length: 8 }, (_, i) => ({ instrument: 'snare', atMs: start + (i * 2 + 1) * 500 }));
    expect(summarizeImprovisation(config, [...hits, ...hits], 'midi')[0].backbeats).toEqual({ matched: 8, total: 8 });
    expect(summarizeImprovisation(config, Array.from({ length: 8 }, () => hits[0]), 'midi')[0].backbeats?.matched).toBe(1);
  });
  it('bounds required targets by a quarter beat at high tempos', () => {
    const config = settings({ prompt: 'backbeat', bpm: 200 }), start = playerPhraseStart(config, 0);
    const hits: ImprovisationHit[] = [{ instrument: 'kick', atMs: start + 76 }, { instrument: 'snare', atMs: start + 376 }];
    expect(summarizeImprovisation(config, hits, 'keyboard')[0]).toMatchObject({ entryOffsetMs: null, backbeats: { matched: 0, total: 8 } });
  });
  it('reports allowed voices without treating silence as compliance evidence', () => {
    const config = settings({ prompt: 'two-voices' }), start = playerPhraseStart(config, 0);
    expect(summarizeImprovisation(config, [], 'keyboard')[0].voiceCompliance).toBeNull();
    expect(summarizeImprovisation(config, [{ instrument: 'kick', atMs: start }, { instrument: 'tom', atMs: start + 500 }], 'keyboard')[0].voiceCompliance).toBe(50);
  });
  it('counts beat-four notes and assigns boundary notes to exactly one phrase', () => {
    const config = settings({ mode: 'guided', prompt: 'space' });
    const hits: ImprovisationHit[] = [1499, 1500, 1999, 2000, 7999, 8000, 16000].map(atMs => ({ instrument: 'snare', atMs }));
    const result = summarizeImprovisation(config, hits, 'keyboard');
    expect(result[0]).toMatchObject({ hitCount: 5, restViolations: 3 });
    expect(result[1]).toMatchObject({ hitCount: 1, restViolations: 0 });
  });
  it('stores no metrics for unscored acoustic sessions', () => {
    const config = settings({ mode: 'guided', prompt: 'backbeat' });
    expect(summarizeImprovisation(config, [{ instrument: 'kick', atMs: 0 }], 'unscored')[0]).toMatchObject({ hitCount: 0, timingDistanceMs: null, entryOffsetMs: null, backbeats: null });
  });
});

describe('local history and existing input/backup interfaces', () => {
  it('retains only 50 validated summaries, discards raw streams, and isolates profile keys', () => {
    const sessions = Array.from({ length: 55 }, (_, i) => ({ ...summary(), id: String(i), hits: [{ instrument: 'kick', atMs: 42 }] }));
    const parsed = parseImprovisationHistory(JSON.stringify({ version: 1, sessions }));
    expect(parsed).toHaveLength(50); expect(parsed[0].id).toBe('5'); expect(parsed[0]).not.toHaveProperty('hits');
    expect(learnerStorageKey(IMPROVISATION_KEY, 'student')).toBe(`${IMPROVISATION_KEY}:profile:student`);
    expect(learnerStorageKey(IMPROVISATION_KEY, 'default')).toBe(IMPROVISATION_KEY);
  });
  it('rejects malformed histories and round-trips settings and self ratings', () => {
    expect(parseImprovisationHistory('{')).toEqual([]);
    expect(parseImprovisationHistory(JSON.stringify({ version: 2, sessions: [summary()] }))).toEqual([]);
    const good = { ...summary(), selfRating: 'developing' };
    expect(parseImprovisationHistory(JSON.stringify({ version: 1, sessions: [good] }))).toEqual([good]);
    expect(parseImprovisationHistory(JSON.stringify({ version: 1, sessions: [{ ...good, phrases: [] }, { ...good, settings: { ...good.settings, bpm: 999 } }] }))).toEqual([]);
  });
  it('reads configured per-device MIDI maps and rejects note-off/zero-velocity messages', () => {
    const state = parseTrainerState(JSON.stringify({ version: 2, rounds: [], deviceProfiles: { 'midi:kit': { latencyMs: 35, midiMap: { 60: 'snare', 42: null } } } }));
    const profile = getTrainerDeviceProfile(state, 'midi:kit');
    expect(profile.latencyMs).toBe(35); expect(profile.midiMap[60]).toBe('snare'); expect(profile.midiMap[42]).toBeNull();
    expect(midiNoteFromMessage([0x99, 60, 90])).toBe(60); expect(midiVelocityFromMessage([0x99, 60, 90])).toBe(90);
    expect(midiNoteFromMessage([0x89, 60, 90])).toBeNull(); expect(midiNoteFromMessage([0x99, 60, 0])).toBeNull();
  });
  it('uses the full backup localStorage envelope without a format migration', () => {
    const raw = JSON.stringify({ version: 1, sessions: [summary()] });
    const backup = parseLocalBackup(JSON.stringify({ application: 'Drum Hero', format: 'drum-hero-full-backup', version: 1, createdAt: '2026-10-22T12:00:00Z', localStorage: { [IMPROVISATION_KEY]: raw }, songRecordings: [], customSamples: [] }));
    expect(parseImprovisationHistory(backup.localStorage[IMPROVISATION_KEY])).toEqual([summary()]);
  });
});

// The extended tools keep legacy session summaries while changing the timing engine explicitly.
import { comparableImprovisationSessions, completedPlayerPhrases, demonstrationPhrase, IMPROVISATION_PATH, learningStepSettings, parseImprovisationTakes, parseImprovisationWorkspace, phraseAdvice, repeatPhraseSettings, timingDistance, type ImprovisationTake } from '@/lib/improvisation';

describe('extended improvisation tools', () => {
  it.each([2, 4, 8] as const)('trades exact %i-bar turns and adjusts backbeat targets', bars => {
    const config = settings({ bars, prompt: 'backbeat' }), duration = bars * 2000;
    expect(phraseDuration(config)).toBe(duration);
    expect(improvisationPosition(config, duration - 1).phase).toBe('partner');
    expect(improvisationPosition(config, duration).phase).toBe('player');
    expect(summarizeImprovisation(config, [], 'keyboard')[0].backbeats?.total).toBe(bars * 2);
  });
  it('keeps open-ended sessions running, chunks audio, and credits only complete player phrases', () => {
    const config = settings({ openEnded: true, bars: 2 });
    expect(sessionDuration(config)).toBe(Infinity);
    expect(improvisationPosition(config, 40000)).toMatchObject({ phase: 'partner', phrase: 5 });
    expect(completedPlayerPhrases(config, 7999)).toBe(0);
    expect(completedPlayerPhrases(config, 8000)).toBe(1);
    expect(completedPlayerPhrases(config, 15999)).toBe(1);
    const chunk = improvisationAudioEvents(config, 5, 2);
    expect(chunk.length).toBeLessThan(300);
    expect(chunk.every(event => event.atMs >= 40000 && event.atMs < 56000)).toBe(true);
    expect(summarizeImprovisation(config, [], 'keyboard', 5)).toHaveLength(5);
  });
  it('uses triplet targets for swung styles and straight targets for rock/funk', () => {
    for (const style of ['shuffle', 'blues', 'jazz'] as const) {
      const config = settings({ style, mode: 'guided' });
      expect(timingDistance(config, 1000 / 3)).toBeCloseTo(0);
      expect(timingDistance(config, 250)).toBeCloseTo(83.33333);
      const drummer = virtualDrummerPhrase(0, config);
      expect(drummer.every(hit => timingDistance(config, hit.step * 125) < 0.0001)).toBe(true);
    }
    expect(timingDistance(settings(), 250)).toBe(0);
    expect(timingDistance(settings({ style: 'funk' }), 1000 / 3)).toBeCloseTo(41.66667);
  });
  it('varies drummer density, difficulty and style deterministically', () => {
    const sparse = virtualDrummerPhrase(0, settings({ density: 'sparse' }));
    const busy = virtualDrummerPhrase(0, settings({ density: 'busy', difficulty: 'advanced' }));
    expect(busy.length).toBeGreaterThan(sparse.length);
    expect(busy.some(hit => hit.velocityTarget! < 60)).toBe(true);
    expect(virtualDrummerPhrase(2, settings({ response: 'copy' }))).toEqual(virtualDrummerPhrase(0, settings({ response: 'copy' })));
    expect(virtualDrummerPhrase(1)).not.toEqual(virtualDrummerPhrase(3));
    expect(improvisationAudioEvents(settings({ style: 'funk' })).filter(event => event.kind === 'bass').some(event => event.atMs % 500 !== 0)).toBe(true);
    expect(new Set(improvisationAudioEvents(settings({ style: 'jazz' })).filter(event => event.kind === 'bass').map(event => event.frequency)).size).toBeGreaterThan(2);
  });
  it('supports any entry drum or no required entry', () => {
    const config = settings({ entry: 'crash' }), start = playerPhraseStart(config, 0);
    const hits: ImprovisationHit[] = [{ instrument: 'kick', atMs: start }, { instrument: 'crash', atMs: start + 20 }];
    expect(summarizeImprovisation(config, hits, 'keyboard')[0].entryOffsetMs).toBe(20);
    expect(summarizeImprovisation({ ...config, entry: 'none' }, hits, 'keyboard')[0].entryOffsetMs).toBeNull();
  });
  it('captures MIDI velocity and produces a faithful single-phrase retry setup', () => {
    const config = settings({ mode: 'guided', prompt: 'space', cyclePrompts: true });
    const clock = new ImprovisationTransport(config); clock.start(0);
    expect(clock.capture('snare', 2200, 0, 105)).toMatchObject({ velocity: 105 });
    const retry = repeatPhraseSettings(config, 1, true);
    expect(retry).toMatchObject({ phrases: 1, openEnded: false, bpm: 96, prompt: 'free', cyclePrompts: false, variationSeed: 1 });
    expect(virtualDrummerPhrase(0, retry)).toEqual(virtualDrummerPhrase(1, config));
  });
  it('demonstrates constraints and asks players to reflect on expressive prompts', () => {
    const config = settings({ mode: 'guided', prompt: 'two-voices' });
    expect(demonstrationPhrase(config).every(hit => ['kick', 'snare'].includes(hit.instrument))).toBe(true);
    expect(demonstrationPhrase({ ...config, prompt: 'space' }).every(hit => Math.floor(hit.step / 4) % 4 !== 3)).toBe(true);
    expect(new Set(demonstrationPhrase({ ...config, prompt: 'dynamics' }).map(hit => hit.velocityTarget)).size).toBeGreaterThan(4);
    const expressive = summarizeImprovisation({ ...config, prompt: 'motif', entry: 'none' }, [{ instrument: 'snare', atMs: 0 }], 'keyboard')[0];
    expect(phraseAdvice({ ...config, prompt: 'motif', entry: 'none' }, expressive, 'keyboard')).toContain('reflection');
    const missing = summarizeImprovisation({ ...config, prompt: 'backbeat' }, [], 'keyboard')[0];
    expect(phraseAdvice(config, missing, 'keyboard')).toContain('short idea');
  });
  it('provides four progressive learning steps with usable example settings', () => {
    expect(IMPROVISATION_PATH).toHaveLength(4);
    expect([0, 1, 2, 3].map(index => learningStepSettings(index).prompt)).toEqual(['free', 'space', 'motif', 'resolution']);
    for (let index = 0; index < 4; index++) expect(demonstrationPhrase(learningStepSettings(index)).length).toBeGreaterThan(0);
  });
  it('migrates original settings without adding automatic replay persistence', () => {
    const original = summary();
    const { mode, bpm, phrases, prompt, cyclePrompts, bass, clickLevel } = original.settings;
    const parsed = parseImprovisationHistory(JSON.stringify({ version: 1, sessions: [{ ...original, settings: { mode, bpm, phrases, prompt, cyclePrompts, bass, clickLevel }, hits: [{ instrument: 'snare', atMs: 0 }] }] }));
    expect(parsed).toHaveLength(1); expect(parsed[0].settings).toMatchObject({ bars: 4, style: 'rock', entry: 'kick', openEnded: false });
    expect(parsed[0]).not.toHaveProperty('hits'); expect(parsed[0].engineVersion).toBeUndefined();
  });
  it('validates optional saved takes separately from summaries and rejects out-of-phrase hits', () => {
    const config = settings({ mode: 'guided' });
    const take: ImprovisationTake = { id: 'take', name: 'My response', createdAt: '2026-10-23T12:00:00Z', settings: config, phrases: 2, hits: [{ instrument: 'snare', atMs: 0, velocity: 90 }] };
    expect(parseImprovisationTakes(JSON.stringify({ version: 1, takes: [take] }))).toEqual([take]);
    expect(parseImprovisationTakes(JSON.stringify({ version: 1, takes: [{ ...take, hits: [{ instrument: 'snare', atMs: 16000 }] }] }))).toEqual([]);
    expect(parseImprovisationTakes(JSON.stringify({ version: 1, takes: [{ ...take, hits: [{ instrument: 'snare', atMs: 0, velocity: 200 }] }] }))).toEqual([]);
    const { localStorage } = parseLocalBackup(JSON.stringify({ application: 'Drum Hero', format: 'drum-hero-full-backup', version: 1, createdAt: '2026-10-23T12:00:00Z', localStorage: { 'drum-hero:improvisation-takes:v1': JSON.stringify({ version: 1, takes: [take] }) }, songRecordings: [], customSamples: [] }));
    expect(parseImprovisationTakes(localStorage['drum-hero:improvisation-takes:v1'])).toEqual([take]);
  });
  it('saves notes and reflections without retaining extra hit streams', () => {
    const entry = { ...summary(), engineVersion: 2, notes: 'Try more space.', inputContext: 'keyboard:123', phrases: summary().phrases.map(p => ({ ...p, reflection: 'I changed the ending.', rawHits: [1, 2] })) };
    const [parsed] = parseImprovisationHistory(JSON.stringify({ version: 1, sessions: [entry] }));
    expect(parsed.notes).toBe('Try more space.'); expect(parsed.phrases[0].reflection).toBe('I changed the ending.');
    expect(parsed.phrases[0]).not.toHaveProperty('rawHits');
  });
  it('bounds presets and learning checkpoints and rejects invalid settings', () => {
    const workspace = parseImprovisationWorkspace(JSON.stringify({ version: 1, presets: [{ id: 'preset', name: 'Jazz', settings: settings({ style: 'jazz' }) }, { id: 'bad', name: 'Bad', settings: { ...settings(), bars: 3 } }], completedSteps: ['pulse', 3] }));
    expect(workspace.presets).toHaveLength(1); expect(workspace.completedSteps).toEqual(['pulse']);
    expect(parseImprovisationWorkspace('{')).toEqual({ presets: [], completedSteps: [] });
  });
  it('compares only matching timing engines, styles, calibration contexts and nearby tempos', () => {
    const reference: ImprovisationSummary = { ...summary(), engineVersion: 2, inputContext: 'keyboard:123' };
    const near = { ...reference, id: 'near', settings: { ...reference.settings, bpm: 125 } };
    const old = { ...reference, id: 'old', engineVersion: undefined };
    const otherContext = { ...reference, id: 'device', inputContext: 'keyboard:456' };
    const differentStyle = { ...reference, id: 'style', settings: { ...reference.settings, style: 'jazz' as const } };
    const tooFast = { ...reference, id: 'fast', settings: { ...reference.settings, bpm: 126 } };
    expect(comparableImprovisationSessions([reference, near, old, otherContext, differentStyle, tooFast], reference).map(item => item.id)).toEqual(['one', 'near']);
    expect(comparableImprovisationSessions([reference], { ...reference, input: 'unscored' })).toEqual([]);
  });
});

it('restores separate tool namespaces for every supported learner profile', () => {
  const localStorage: Record<string, string> = {};
  for (let index = 0; index < 25; index++) {
    for (const namespace of ['improvisation', 'improvisation-workspace', 'improvisation-takes']) localStorage[`drum-hero:${namespace}:v1:profile:learner-${index}`] = '{}';
  }
  const backup = parseLocalBackup(JSON.stringify({ application: 'Drum Hero', format: 'drum-hero-full-backup', version: 1, createdAt: '2026-10-23T12:00:00Z', localStorage, songRecordings: [], customSamples: [] }));
  expect(Object.keys(backup.localStorage)).toHaveLength(75);
});
