import { classifyOffset, findClosestExpected, stepDurationMs, summarizeHits } from './scoring';
import type { Instrument, Level, PatternHit, RatedHit } from './types';
import type { ArrangementBar } from './song-builder';

export const SIGHT_HISTORY_KEY = 'drum-hero:sight-reading:v1';
export const SIGHT_VERSION = 1;
export const SIGHT_VOICES: Instrument[] = ['kick', 'snare', 'hihat', 'tom', 'crash'];
export type SightStyle = 'varied' | 'rock' | 'shuffle' | 'fill';
export type SightRhythmFocus = 'mixed' | 'quarters' | 'eighths' | 'sixteenths' | 'triplets';
export type SightSettings = { level: Level; bpm: number; bars: 1 | 2 | 4; meter: '4/4' | '3/4' | '5/4' | '7/8'; triplets: boolean; snareOnly: boolean; focusVoice: Instrument | 'mixed'; focusRhythm: SightRhythmFocus; style: SightStyle };
export const DEFAULT_SIGHT_SETTINGS: SightSettings = { level: 'Beginner', bpm: 80, bars: 2, meter: '4/4', triplets: false, snareOnly: false, focusVoice: 'mixed', focusRhythm: 'mixed', style: 'varied' };
export type SightExercise = { version: 1; seed: number; settings: SightSettings; subdivision: 4 | 8 | 12 | 16; beatsPerBar: number; stepsPerBar: number; hits: PatternHit[] };
export type SightPhase = 'setup' | 'preview' | 'count-in' | 'playing' | 'results';
export type SightInput = 'keyboard' | 'touch' | 'midi';
export type SightHit = { instrument: Instrument; atMs: number };
export type SightAttempt = { id: string; playedAt: string; version: 1; seed: number; settings: SightSettings; source: SightInput; inputProfile: string; classification: 'reading' | 'practice' | 'assisted'; score: number; accuracy: number; meanOffsetMs: number | null; misses: number; extras: number };
export function sightMeters(level: Level): SightSettings['meter'][] { return level === 'Beginner' ? ['4/4'] : level === 'Intermediate' ? ['4/4', '3/4'] : ['4/4', '3/4', '5/4', '7/8']; }
export function normalizeSightSettings(value: SightSettings): SightSettings {
  const level = ['Beginner', 'Intermediate', 'Advanced'].includes(value.level) ? value.level : 'Beginner';
  const meter = sightMeters(level).includes(value.meter) ? value.meter : '4/4';
  const focusRhythm = ['mixed', 'quarters', 'eighths', 'sixteenths', 'triplets'].includes(value.focusRhythm) ? value.focusRhythm : 'mixed';
  const rhythmAllowed = focusRhythm !== 'triplets' || level === 'Advanced' && meter !== '7/8';
  const rhythmLevelAllowed = focusRhythm !== 'sixteenths' || level !== 'Beginner';
  const focusVoice = level === 'Beginner' && value.snareOnly ? 'snare' : value.focusVoice === 'mixed' || SIGHT_VOICES.includes(value.focusVoice) ? value.focusVoice : 'mixed';
  const styles: SightStyle[] = level === 'Beginner' ? ['varied', 'rock'] : level === 'Intermediate' ? ['varied', 'rock', 'fill'] : ['varied', 'rock', 'shuffle', 'fill'];
  const style = styles.includes(value.style) && (value.style !== 'shuffle' || meter !== '7/8') ? value.style : 'varied';
  const normalizedRhythm = rhythmAllowed && rhythmLevelAllowed ? focusRhythm : 'mixed';
  return { level, bpm: Math.max(40, Math.min(200, Math.round(Number(value.bpm) || 80))), bars: [1, 2, 4].includes(value.bars) ? value.bars : 2, meter, triplets: level === 'Advanced' && value.triplets === true && meter !== '7/8', snareOnly: level === 'Beginner' && value.snareOnly === true, focusVoice, focusRhythm: style === 'shuffle' && !['mixed','triplets'].includes(normalizedRhythm) ? 'mixed' : normalizedRhythm, style };
}
export function sightFingerprint(exercise: SightExercise) { return `${exercise.settings.meter}:${exercise.subdivision}:${exercise.hits.map(h => `${h.step}/${h.instrument}/${Number(h.accent)}`).join(',')}`; }
/** v1 LCG and integer template choices are mirrored in Swift; fixtures pin the wire-independent musical output. */
export function generateSightExercise(settings: SightSettings, seed: number, previous?: string): SightExercise {
  const config = normalizeSightSettings(settings);
  let actualSeed = seed >>> 0;
  for (let attempt = 0; ; attempt++, actualSeed = (actualSeed + 1) >>> 0) {
    let state = actualSeed;
    const next = (max: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 4294967296 * max); };
    const beatsPerBar = config.meter === '7/8' ? 3.5 : Number(config.meter[0]);
    const subdivision = config.style === 'shuffle' ? 12 : config.focusRhythm === 'quarters' ? 4 : config.focusRhythm === 'eighths' ? 8 : config.focusRhythm === 'sixteenths' ? 16 : config.focusRhythm === 'triplets' ? 12 : config.triplets ? 12 : config.level === 'Beginner' ? (actualSeed % 2 === 0 ? 4 : 8) : 16;
    const stepsPerBar = beatsPerBar * subdivision / 4;
    const hits: PatternHit[] = [];
    // Each beat chooses a small playable rhythm; at most two hands plus one foot at any instant.
    const templates = subdivision === 4 ? [[0], [0], [], [0]] : subdivision === 8 ? [[0], [0, 1], [1], []] : subdivision === 12 ? [[0, 1, 2], [0, 2], [1], []] : [[0, 2], [0, 3], [1, 2], [0, 1, 3], [2], []];
    const unit = subdivision / 4;
    for (let bar = 0; bar < config.bars; bar++) {
      if (config.style === 'rock' || config.style === 'shuffle' || config.style === 'fill') {
        const beats = Math.ceil(beatsPerBar);
        const hats = subdivision === 4 ? [0] : subdivision === 12 ? [0, 2] : [0, 2];
        const kickBeats = config.meter === '7/8' ? [0, 2] : beats >= 5 ? [0, 3] : [0, 2];
        const snareBeats = config.meter === '7/8' ? [1, 3] : beats >= 5 ? [2, 4] : [1, 3];
        const handVoice: Instrument = config.focusVoice !== 'mixed' && config.focusVoice !== 'kick' && config.focusVoice !== 'hihat' ? config.focusVoice : 'snare';
        for (let beat = 0; beat < beats; beat++) {
          const base = beat * unit;
          if (base >= stepsPerBar) continue;
          const isFillTail = config.style === 'fill' && bar === config.bars - 1 && beat >= Math.max(0, beats - 2);
          if (config.focusVoice === 'mixed' || config.focusVoice === 'hihat') {
            for (const offset of hats) if (base + offset < stepsPerBar) hits.push({ step: bar * stepsPerBar + base + offset, instrument: 'hihat', accent: false });
          }
          if (isFillTail) {
            const fillOffsets = subdivision === 4 ? [0] : subdivision === 12 ? [0, 2] : [0, 1, 2, 3];
            for (const offset of fillOffsets) {
              const step = bar * stepsPerBar + base + offset;
              const fillVoice = config.focusVoice === 'mixed' ? (offset % 2 ? 'tom' : 'snare') : config.focusVoice;
              if (step < (bar + 1) * stepsPerBar && !hits.some(hit => hit.step === step && hit.instrument === fillVoice)) hits.push({ step, instrument: fillVoice, accent: offset === 0 });
            }
            continue;
          }
          if (kickBeats.includes(beat) && (config.focusVoice === 'mixed' || config.focusVoice === 'kick')) hits.push({ step: bar * stepsPerBar + base, instrument: 'kick', accent: beat === 0 });
          if (snareBeats.includes(beat) && (config.focusVoice === 'mixed' || config.focusVoice !== 'kick' && config.focusVoice !== 'hihat')) hits.push({ step: bar * stepsPerBar + base, instrument: handVoice, accent: beat === 1 || beat === 3 });
        }
        continue;
      }
      for (let beat = 0; beat < beatsPerBar; beat++) {
        const template = templates[next(templates.length)];
        for (const offset of template) {
          const localStep = beat * unit + offset;
          if (localStep >= stepsPerBar) continue;
          const step = bar * stepsPerBar + localStep;
          let instrument: Instrument = config.focusVoice !== 'mixed' ? config.focusVoice : 'snare';
          if (config.focusVoice === 'mixed' && !config.snareOnly) instrument = config.level === 'Advanced' ? SIGHT_VOICES[1 + next(4)] : next(3) === 0 ? 'snare' : 'hihat';
          const accent = config.level !== 'Beginner' && next(4) === 0;
          hits.push({ step, instrument, accent });
          if (config.focusVoice === 'mixed' && !config.snareOnly && offset === 0 && next(3) === 0) hits.push({ step, instrument: 'kick', accent: false });
        }
      }
      if (!hits.some(hit => hit.step >= bar * stepsPerBar)) hits.push({ step: bar * stepsPerBar, instrument: config.focusVoice === 'mixed' ? 'snare' : config.focusVoice, accent: false });
    }
    hits.sort((a, b) => a.step - b.step || SIGHT_VOICES.indexOf(a.instrument) - SIGHT_VOICES.indexOf(b.instrument));
    const exercise: SightExercise = { version: 1, seed: actualSeed, settings: config, subdivision, beatsPerBar, stepsPerBar, hits };
    if (!previous || sightFingerprint(exercise) !== previous || attempt >= 100) return exercise;
  }
}
export function sightDuration(exercise: SightExercise) { return exercise.beatsPerBar * exercise.settings.bars * 60000 / exercise.settings.bpm; }
export function scoreSightAttempt(exercise: SightExercise, attempts: SightHit[]) {
  const stepMs = stepDurationMs(exercise.settings.bpm, exercise.subdivision);
  const expected = exercise.hits.map(hit => ({ ...hit, at: hit.step * stepMs, matched: false }));
  const rated: RatedHit[] = [];
  for (const hit of [...attempts].sort((a, b) => a.atMs - b.atMs)) {
    const closest = findClosestExpected(hit.atMs, expected, hit.instrument);
    if (closest.index >= 0 && Math.abs(closest.offset) <= 100) {
      const target = expected[closest.index]; target.matched = true;
      rated.push({ instrument: hit.instrument, rating: classifyOffset(closest.offset), offsetMs: Math.round(closest.offset), atMs: hit.atMs, step: target.step });
    } else rated.push({ instrument: hit.instrument, rating: 'extra', offsetMs: null, atMs: hit.atMs, step: Math.max(0, Math.min(exercise.stepsPerBar * exercise.settings.bars - 1, Math.floor(hit.atMs / stepMs))) });
  }
  for (const target of expected) if (!target.matched) rated.push({ instrument: target.instrument, rating: 'miss', offsetMs: null, step: target.step, atMs: target.at });
  const offsets = rated.flatMap(hit => hit.offsetMs === null ? [] : [hit.offsetMs]);
  return { rated, summary: summarizeHits(rated, `sight-v1-${exercise.seed}`, 'Sight reading', exercise.settings.bpm), meanOffsetMs: offsets.length ? Math.round(offsets.reduce((a, b) => a + b, 0) / offsets.length) : null };
}
export function sightClassification(attempted: boolean, assisted: boolean): SightAttempt['classification'] { return assisted ? 'assisted' : attempted ? 'practice' : 'reading'; }
export type SightGoal = { level: Level; meter: SightSettings['meter']; bpm: number; focusRhythm: SightRhythmFocus; accuracy: number; targetReads: number };
export const SIGHT_GOAL_KEY = 'drum-hero:sight-reading-goal:v1';
export function parseSightGoal(raw: string | null): SightGoal | null {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || !['Beginner', 'Intermediate', 'Advanced'].includes(value.level) || !['4/4', '3/4', '5/4', '7/8'].includes(value.meter) || !Number.isInteger(value.bpm) || value.bpm < 40 || value.bpm > 200 || !['mixed', 'quarters', 'eighths', 'sixteenths', 'triplets'].includes(value.focusRhythm) || !Number.isInteger(value.accuracy) || value.accuracy < 50 || value.accuracy > 100 || !Number.isInteger(value.targetReads) || value.targetReads < 1 || value.targetReads > 20) return null;
    if (!sightMeters(value.level).includes(value.meter) || normalizeSightSettings({ ...DEFAULT_SIGHT_SETTINGS, ...value }).focusRhythm !== value.focusRhythm) return null;
    return value as SightGoal;
  } catch { return null; }
}
export function matchingSightGoalAttempts(history: SightAttempt[], goal: SightGoal) {
  return history.filter(row => row.classification === 'reading' && row.accuracy >= goal.accuracy && row.settings.level === goal.level && row.settings.meter === goal.meter && row.settings.bpm === goal.bpm && row.settings.focusRhythm === goal.focusRhythm);
}
export function recommendSightSettings(history: SightAttempt[], settings: SightSettings, source?: SightAttempt['source']): { settings: SightSettings; reason: string } | null {
  const recent = history.filter(row => row.classification === 'reading' && row.settings.level === settings.level && row.settings.bpm === settings.bpm && row.settings.bars === settings.bars && row.settings.meter === settings.meter && row.settings.triplets === settings.triplets && row.settings.snareOnly === settings.snareOnly && row.settings.focusRhythm === settings.focusRhythm && row.settings.focusVoice === settings.focusVoice && row.settings.style === settings.style && (!source || row.source === source)).slice(-3);
  if (recent.length < 3) return null;
  const average = Math.round(recent.reduce((sum, row) => sum + row.accuracy, 0) / recent.length);
  if (average >= 88 && settings.bpm < 200) return { settings: normalizeSightSettings({ ...settings, bpm: Math.min(200, settings.bpm + 5) }), reason: `Your last three first readings averaged ${average}% at this setting.` };
  if (average >= 88 && settings.level === 'Beginner') return settings.focusRhythm !== 'eighths'
    ? { settings: normalizeSightSettings({ ...settings, focusRhythm: 'eighths' }), reason: `Your last three first readings averaged ${average}%; try a denser rhythm next.` }
    : { settings: normalizeSightSettings({ ...settings, level: 'Intermediate' }), reason: `Your last three first readings averaged ${average}%; try the next level.` };
  if (average >= 88 && settings.level === 'Intermediate') return { settings: normalizeSightSettings({ ...settings, level: 'Advanced' }), reason: `Your last three first readings averaged ${average}%; try the next level.` };
  if (average >= 88 && settings.level === 'Advanced' && settings.meter !== '7/8' && settings.focusRhythm !== 'triplets') return { settings: normalizeSightSettings({ ...settings, focusRhythm: 'triplets' }), reason: `Your last three first readings averaged ${average}%; add triplets for a denser challenge.` };
  if (average < 65) {
    const simplerRhythm: SightRhythmFocus | null = settings.focusRhythm === 'mixed' ? settings.level === 'Beginner' ? 'quarters' : 'eighths' : ['sixteenths', 'triplets'].includes(settings.focusRhythm) ? 'eighths' : settings.focusRhythm === 'eighths' ? 'quarters' : null;
    if (simplerRhythm && simplerRhythm !== settings.focusRhythm) return { settings: normalizeSightSettings({ ...settings, focusRhythm: simplerRhythm }), reason: `Your last three first readings averaged ${average}%; simplify the rhythm before raising tempo.` };
    if (settings.bpm > 40) return { settings: normalizeSightSettings({ ...settings, bpm: Math.max(40, settings.bpm - 5) }), reason: `Your last three first readings averaged ${average}%; a slower tempo may help.` };
  }
  return null;
}
export function parseSightHistory(raw: string | null): SightAttempt[] {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (data?.version !== 1 || !Array.isArray(data.attempts)) return [];
    return data.attempts.filter((item: SightAttempt) => {
      if (!item || typeof item.id !== 'string' || item.id.length > 100 || typeof item.playedAt !== 'string' || !Number.isFinite(Date.parse(item.playedAt)) || item.version !== 1 || !Number.isInteger(item.seed) || item.seed < 0 || item.seed > 0xffffffff || !item.settings || !['keyboard','touch','midi'].includes(item.source) || typeof item.inputProfile !== 'string' || item.inputProfile.length > 200 || !['reading','practice','assisted'].includes(item.classification) || ![item.score,item.accuracy].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || !(item.meanOffsetMs === null || (Number.isFinite(item.meanOffsetMs) && Math.abs(item.meanOffsetMs) <= 100)) || ![item.misses,item.extras].every(n => Number.isInteger(n) && n >= 0 && n <= 100000)) return false;
      const normalized = normalizeSightSettings(item.settings);
      return Object.keys(item.settings).every(key => key in normalized) && Object.entries(normalized).every(([key, value]) => item.settings[key as keyof SightSettings] === value || item.settings[key as keyof SightSettings] === undefined && value === DEFAULT_SIGHT_SETTINGS[key as keyof SightSettings]);
    }).map((row: SightAttempt) => ({ ...row, settings: normalizeSightSettings(row.settings) })).slice(-100);
  } catch { return []; }
}
export function sightNotationBars(exercise: SightExercise): ArrangementBar[] {
  return Array.from({ length: exercise.settings.bars }, (_, index) => ({ index, number: index + 1, sectionId: 'sight', sectionName: 'Sight reading', sectionKind: 'other', sectionRepeat: 0, sectionBar: index, sectionBars: exercise.settings.bars, partId: 'sight', partName: 'Reading exercise', meter: exercise.settings.meter === '7/8' ? '7/8 (2+2+3)' : exercise.settings.meter === '5/4' ? '5/4 (3+2)' : exercise.settings.meter, bpm: exercise.settings.bpm, subdivision: exercise.subdivision, partBeats: exercise.beatsPerBar, beats: exercise.beatsPerBar, measureBeats: exercise.beatsPerBar, partBeatOffset: 0, hits: exercise.hits.filter(h => Math.floor(h.step / exercise.stepsPerBar) === index).map(h => { const local = h.step - index * exercise.stepsPerBar; return { beat: local * 4 / exercise.subdivision, fraction: local / exercise.stepsPerBar, step: local, instrument: h.instrument, accent: !!h.accent, velocity: h.accent ? 110 : 85, ghost: false }; }) }));
}
