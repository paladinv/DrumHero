import { describe, expect, it } from 'vitest';
import { DEFAULT_IMPROVISATION_SETTINGS as defaults, challengeInstruction, challengeReference, challengeTargets, improvisationAudioEvents, improvisationScoreGrid, matchChallenge, normalizeImprovisationSettings, notationFlagCount, parseImprovisationHistory, parseImprovisationWorkspace, phraseDuration, playerPhraseStart, repeatPhraseSettings, summarizeImprovisation, suggestImprovisationPractice, timingDistance, timingReview, virtualDrummerPhrase, virtualDrummerResponse, type ImprovisationHit, type ImprovisationSettings, type ImprovisationSummary } from '@/lib/improvisation';

const config = (update: Partial<ImprovisationSettings> = {}) => ({ ...defaults, bpm: 120, bars: 2 as const, ...update });
const summary = (id: string, update: Partial<ImprovisationSettings> = {}): ImprovisationSummary => ({ version: 1, engineVersion: 2, id, playedAt: '2026-10-24T12:00:00Z', settings: config(update), input: 'keyboard', inputContext: 'keyboard:test', phrases: summarizeImprovisation(config(update), [], 'keyboard') });

describe('improvisation challenges and practice tools', () => {
  it('supports deterministic player-aware drummer responses and score reveal settings', () => {
    const source: ImprovisationHit[] = [{ instrument: 'kick', atMs: 0 }, { instrument: 'snare', atMs: 250 }];
    const copy = virtualDrummerResponse(1, config({ response: 'copy' }), source);
    expect(copy.map(hit => [hit.step, hit.instrument])).toEqual([[0, 'kick'], [2, 'snare']]);
    const variation = virtualDrummerResponse(1, config({ response: 'vary' }), source);
    expect(variation).toEqual(virtualDrummerResponse(1, config({ response: 'vary' }), source));
    expect(variation).toContainEqual(expect.objectContaining({ step: 2, instrument: 'snare' }));
    expect(normalizeImprovisationSettings({ scoreReveal: 'live' }).scoreReveal).toBe('live');
    expect(normalizeImprovisationSettings({ scoreReveal: 'unknown' as never }).scoreReveal).toBe('full');
  });

  it('maps common, sixteenth, and triplet notation events to readable flags', () => {
    expect(notationFlagCount(config(), 0)).toBe(0);
    expect(notationFlagCount(config(), 2)).toBe(1);
    expect(notationFlagCount(config({ subdivision: 'sixteenth' }), 1)).toBe(2);
    expect(notationFlagCount(config({ style: 'shuffle' }), 4 / 3)).toBe(1);
    expect(notationFlagCount(config({ meter: '6/8' }), 0)).toBe(1);
    expect(notationFlagCount(config({ meter: '6/8' }), 1)).toBe(2);
  });

  it('shares meter-aware score grids, including swing labels and long odd meters', () => {
    const swung = improvisationScoreGrid(config({ groove: 'style', style: 'shuffle' }));
    expect(swung.map(mark => mark.label).filter(Boolean)).toContain('trip');
    expect(swung.map(mark => mark.label).filter(Boolean)).toContain('let');
    for (const meter of ['3/4', '5/4', '6/8', '7/8'] as const) {
      const settings = config({ meter });
      const grid = improvisationScoreGrid(settings);
      expect(grid[0]).toMatchObject({ step: 0, label: '1', beat: true });
      expect(grid.at(-1)!.step).toBeLessThan(settings.bars * (meter.endsWith('/4') ? Number(meter.split('/')[0]) * 4 : Number(meter.split('/')[0]) * 2));
    }
  });

  it('migrates old settings and clamps additions', () => {
    expect(normalizeImprovisationSettings({})).toMatchObject({ challenge: 'none', clickTraining: 'steady', bassLevel: 0.7, intention: '' });
    expect(normalizeImprovisationSettings({ bassLevel: 4, intention: 'a'.repeat(201) })).toMatchObject({ bassLevel: 1, intention: 'a'.repeat(200) });
  });
  it('plays the same original reference through the motif sequence and changes only the task', () => {
    const settings = config({ challenge: 'development', phrases: 4 });
    expect(virtualDrummerPhrase(0, settings)).toEqual(virtualDrummerPhrase(3, settings));
    expect(challengeTargets(settings, 0)).toHaveLength(8);
    expect(challengeTargets(settings, 1).every(hit => hit.instrument === 'tom')).toBe(true);
    expect(challengeTargets(settings, 2)).toHaveLength(4);
    expect(challengeTargets(settings, 3)).toEqual([]);
    expect(challengeInstruction(settings, 3)).toContain('closing');
  });
  it('matches explicit targets one-to-one, accepts creative extras, and reports silence as missing targets', () => {
    const settings = config({ challenge: 'echo', entry: 'none' });
    const hits = challengeReference(settings).map(hit => ({ instrument: hit.instrument, atMs: hit.step * 125 }));
    expect(matchChallenge(settings, 0, [...hits, { instrument: 'crash', atMs: 1300 }])).toEqual({ matched: 8, total: 8 });
    expect(matchChallenge(settings, 0, Array(8).fill(hits[0]))).toEqual({ matched: 1, total: 8 });
    const silent = summarizeImprovisation(settings, [], 'keyboard')[0];
    expect(silent).toMatchObject({ timingDistanceMs: null, challenge: { matched: 0, total: 8 } });
    expect(summarizeImprovisation(settings, [], 'unscored')[0].challenge).toBeUndefined();
  });
  it('leaves changed endings ungraded and enforces only the requested answer voice', () => {
    const settings = config({ challenge: 'ending' });
    const opening = challengeTargets(settings, 0).map(hit => ({ instrument: hit.instrument, atMs: hit.step * 125 }));
    expect(matchChallenge(settings, 0, [...opening, { instrument: 'crash', atMs: 3900 }])).toEqual({ matched: 4, total: 4 });
    const moved = config({ challenge: 'orchestrate', answerVoice: 'snare' });
    expect(matchChallenge(moved, 0, opening).matched).toBeLessThan(4);
    expect(challengeTargets(moved, 0).every(hit => hit.instrument === 'snare')).toBe(true);
  });
  it('retries the selected motif stage instead of restarting its development', () => {
    const settings = config({ challenge: 'development', response: 'copy' });
    const retry = repeatPhraseSettings(settings, 2, true);
    expect(challengeTargets(retry, 0)).toEqual(challengeTargets(settings, 2));
    expect(challengeInstruction(retry, 0)).toBe(challengeInstruction(settings, 2));
  });
  it('never matches a target across a player phrase boundary', () => {
    const settings = config({ challenge: 'echo' });
    const start = playerPhraseStart(settings, 0);
    expect(summarizeImprovisation(settings, [{ instrument: 'kick', atMs: start - 1 }, { instrument: 'kick', atMs: start + phraseDuration(settings) }], 'keyboard')[0]).toMatchObject({ hitCount: 0, challenge: { matched: 0, total: 8 } });
  });
  it('uses triplet reference and signed timing offsets for swing', () => {
    const settings = config({ style: 'shuffle', challenge: 'echo' });
    expect(challengeReference(settings).every(hit => timingDistance(settings, hit.step * 125) < 0.001)).toBe(true);
    expect(timingReview(settings, [{ instrument: 'snare', atMs: 160 }, { instrument: 'kick', atMs: 175 }]).map(hit => hit.offsetMs)).toEqual([-7, 8]);
    expect(timingReview(config(), [{ instrument: 'kick', atMs: 120 }])[0].offsetMs).toBe(-5);
  });
  it('drops metronome bars on one clock and returns at the expected bar', () => {
    const alternate = improvisationAudioEvents(config({ clickTraining: 'alternate' })).filter(e => e.kind === 'click');
    expect(alternate.every(e => Math.floor(e.atMs / 2000) % 2 === 0)).toBe(true);
    const faded = improvisationAudioEvents(config({ clickTraining: 'fade' })).filter(e => e.kind === 'click');
    expect(faded.find(e => e.atMs === 2000)?.level).toBe(0.35);
    expect(faded.some(e => e.atMs === 4000)).toBe(false);
    expect(faded.some(e => e.atMs === 8000)).toBe(true);
  });
  it('uses progression roots and leaves only downbeats under player turns when requested', () => {
    const settings = config({ progression: 'pop', leaveSpace: true });
    const bass = improvisationAudioEvents(settings).filter(e => e.kind === 'bass');
    expect(bass.find(e => e.atMs === 0)?.frequency).toBeCloseTo(65.41, 2);
    expect(bass.find(e => e.atMs === 2000)?.frequency).toBeCloseTo(98, 0);
    expect(bass.filter(e => e.atMs >= 4000 && e.atMs < 8000).map(e => e.atMs)).toEqual([4000, 6000]);
  });
  it('suggests changes only from repeated comparable evidence and never changes the original setup', () => {
    const sessions = [summary('a'), summary('b')];
    sessions.forEach(session => { session.phrases[0].timingDistanceMs = 70; });
    expect(suggestImprovisationPractice([sessions[0]])).toBeNull();
    expect(suggestImprovisationPractice(sessions)).toMatchObject({ settings: { bpm: 96, bars: 2 } });
    expect(sessions[1].settings.bpm).toBe(120);
    expect(suggestImprovisationPractice([sessions[0], { ...sessions[1], inputContext: 'another-device' }])).toBeNull();
    expect(suggestImprovisationPractice([summary('silent-a'), summary('silent-b')])).toBeNull();
  });
  it('preserves intentions, assignment references and challenge summaries without raw hits', () => {
    const session = summary('a', { challenge: 'echo', intention: 'Leave space' }); session.assignment = { id: 'assignment', stepId: 'step' };
    const parsed = parseImprovisationHistory(JSON.stringify({ version: 1, sessions: [{ ...session, hits: [1, 2] }] }))[0];
    expect(parsed.settings.intention).toBe('Leave space'); expect(parsed.assignment).toEqual(session.assignment);
    expect(parsed.phrases[0].challenge).toEqual({ matched: 0, total: 8 }); expect(parsed).not.toHaveProperty('hits');
  });
  it('validates bounded teacher sequences, rejects partial invalid steps and open-ended assignments', () => {
    const assignment = { id: 'a', name: 'Motifs', steps: [{ id: 's', name: 'Echo', settings: config({ challenge: 'echo' }) }] };
    const parse = (assignments: unknown[]) => parseImprovisationWorkspace(JSON.stringify({ version: 1, assignments }));
    expect(parse([assignment]).assignments).toEqual([assignment]);
    expect(parse([{ ...assignment, steps: [...assignment.steps, { id: 'bad', name: 'Invalid', settings: {} }] }]).assignments).toEqual([]);
    expect(parse([{ ...assignment, steps: [{ ...assignment.steps[0], settings: config({ openEnded: true }) }] }]).assignments).toEqual([]);
    expect(parse(Array(14).fill(assignment)).assignments).toHaveLength(12);
  });
});
