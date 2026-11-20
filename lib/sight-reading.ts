import { classifyOffset, findClosestExpected, stepDurationMs, summarizeHits } from './scoring';
import type { Instrument, Level, MidiArticulation, PatternHit, RatedHit } from './types';
import type { ArrangementBar } from './song-builder';

export const SIGHT_HISTORY_KEY = 'drum-hero:sight-reading:v1';
export const SIGHT_HISTORY_CHANGED_EVENT = 'drum-hero:sight-reading-change';
export const SIGHT_SEEN_KEY = 'drum-hero:sight-reading-seen:v1';
export const SIGHT_VERSION = 1;
export const SIGHT_VOICES: Instrument[] = ['kick', 'snare', 'hihat', 'tom', 'crash'];
export type SightStyle = 'varied' | 'rock' | 'shuffle' | 'fill' | 'half-time' | 'funk' | 'latin';
export type SightRhythmFocus = 'mixed' | 'quarters' | 'eighths' | 'sixteenths' | 'triplets';
export type SightDensity = 'light' | 'balanced' | 'dense';
export type SightCountSubdivision = 'quarter' | 'eighth' | 'sixteenth';
export type SightMeter = '4/4' | '3/4' | '5/4' | '7/8';
export type SightSettings = { level: Level; bpm: number; bars: number; meter: SightMeter; mixedMeters?: boolean; articulationFocus?: MidiArticulation | null; triplets: boolean; snareOnly: boolean; focusVoice: Instrument | 'mixed'; focusRhythm: SightRhythmFocus; style: SightStyle; density: SightDensity };
export const DEFAULT_SIGHT_SETTINGS: SightSettings = { level: 'Beginner', bpm: 80, bars: 10, meter: '4/4', mixedMeters: false, articulationFocus: null, triplets: false, snareOnly: false, focusVoice: 'mixed', focusRhythm: 'mixed', style: 'varied', density: 'balanced' };
export type SightExercise = { version: 1 | 2 | 3; seed: number; settings: SightSettings; subdivision: 4 | 8 | 12 | 16; beatsPerBar: number; stepsPerBar: number; barMeters?: SightMeter[]; hits: PatternHit[]; sourceLabel?: string };
export type SightPhase = 'setup' | 'preview' | 'count-in' | 'playing' | 'results';
export type SightInput = 'keyboard' | 'touch' | 'midi' | 'audio-voices';
export type SightHit = { instrument: Instrument; atMs: number; midiArticulation?: MidiArticulation };
export type SightFluency = Partial<Record<'quarters' | 'eighths' | 'sixteenths' | 'triplets' | 'syncopation' | 'rests', number>>;
export type SightAttempt = { id: string; playedAt: string; version: 1 | 2 | 3; seed: number; settings: SightSettings; source: SightInput; inputProfile: string; classification: 'reading' | 'practice' | 'assisted'; targetPlayback?: boolean; score: number; accuracy: number; meanOffsetMs: number | null; timingSpreadMs?: number | null; pulseRecovery?: number | null; confidence?: number | null; inputCalibrated?: boolean; inputCalibrationSpreadMs?: number | null; inputCalibrationAt?: string | null; inputTimingCorrectionMs?: number; earlyHits?: number; lateHits?: number; fingerprint?: string; misses: number; extras: number; fluency?: SightFluency; voiceScores?: Partial<Record<Instrument, number>>; sourceLabel?: string; previewSeconds?: 0 | 5 | 10; countInBars?: 0 | 1 | 2; assignmentTitle?: string; assignmentDueDate?: string; assignmentMinimumAccuracy?: number };
export type SightSourcePattern = { id: string; label: string; level: Level; meter: string; subdivision: number; beats: number; bpm: number; hits: PatternHit[] };
export function sightMeterBeats(meter: SightMeter) { return meter === '7/8' ? 3.5 : Number(meter[0]); }
export function sightExerciseMeters(exercise: SightExercise): SightMeter[] { return exercise.barMeters?.length === exercise.settings.bars ? exercise.barMeters : Array.from({ length: exercise.settings.bars }, () => exercise.settings.meter); }
export function sightBarStarts(exercise: SightExercise): number[] {
  const starts: number[] = []; let step = 0;
  for (const meter of sightExerciseMeters(exercise)) { starts.push(step); step += Math.round(sightMeterBeats(meter) * exercise.subdivision / 4); }
  return starts;
}
export function sightBarSteps(exercise: SightExercise, bar: number) { return Math.round(sightMeterBeats(sightExerciseMeters(exercise)[bar] ?? exercise.settings.meter) * exercise.subdivision / 4); }
export function sightTotalSteps(exercise: SightExercise) { const starts = sightBarStarts(exercise); return starts.length ? starts.at(-1)! + sightBarSteps(exercise, starts.length - 1) : 0; }
export function sightStepBar(exercise: SightExercise, step: number) {
  const starts = sightBarStarts(exercise); let low = 0, high = starts.length;
  while (low < high) { const mid = (low + high) >>> 1; if (starts[mid] <= step) low = mid + 1; else high = mid; }
  return Math.max(0, Math.min(starts.length - 1, low - 1));
}
export function sightStepLocal(exercise: SightExercise, step: number) { const bar = sightStepBar(exercise, step); return step - (sightBarStarts(exercise)[bar] ?? 0); }
export function sightTotalBeats(exercise: SightExercise) { return sightExerciseMeters(exercise).reduce((sum, meter) => sum + sightMeterBeats(meter), 0); }
export function sightBarBeatStarts(exercise: SightExercise) {
  const starts: number[] = []; let beat = 0;
  for (const meter of sightExerciseMeters(exercise)) { starts.push(beat); beat += sightMeterBeats(meter); }
  return starts;
}
export function sightBeatBar(exercise: SightExercise, beat: number) {
  const starts = sightBarBeatStarts(exercise); let low = 0, high = starts.length;
  while (low < high) { const mid = (low + high) >>> 1; if (starts[mid] <= beat) low = mid + 1; else high = mid; }
  return Math.max(0, Math.min(starts.length - 1, low - 1));
}
export function sightMeters(level: Level): SightSettings['meter'][] { return level === 'Beginner' ? ['4/4'] : level === 'Intermediate' ? ['4/4', '3/4'] : ['4/4', '3/4', '5/4', '7/8']; }
export function sightBarsForDuration(settings: Pick<SightSettings, 'bpm' | 'meter'> & Partial<Pick<SightSettings, 'level' | 'mixedMeters'>>, seconds: 30 | 60 | 90) {
  const meters = settings.level ? sightMeters(settings.level) : [settings.meter];
  const beatsPerBar = settings.mixedMeters ? meters.reduce((sum, meter) => sum + sightMeterBeats(meter), 0) / meters.length : sightMeterBeats(settings.meter);
  return Math.max(1, Math.min(80, Math.ceil(seconds * settings.bpm / (60 * beatsPerBar))));
}
/** Extracts a seeded, contiguous excerpt from a supported repertoire part. */
export function createSightExerciseFromPattern(settings: SightSettings, pattern: SightSourcePattern, seed: number): SightExercise | null {
  const meter = pattern.meter.match(/^(4\/4|3\/4|5\/4|7\/8)/)?.[1] as SightSettings['meter'] | undefined;
  const subdivision = pattern.subdivision;
  if (!meter || ![4, 8, 12, 16].includes(subdivision) || meter === '7/8' && subdivision % 8 !== 0) return null;
  const beatsPerBar = meter === '7/8' ? 3.5 : Number(meter[0]);
  const stepsPerBar = Math.round(beatsPerBar * subdivision / 4);
  const sourceBars = Math.floor((pattern.beats + 0.00001) / beatsPerBar);
  if (sourceBars < 1 || stepsPerBar < 1) return null;
  const bars = Math.max(1, Math.min(80, settings.bars, sourceBars));
  const finalSettings = normalizeSightSettings({ ...settings, level: pattern.level, meter, mixedMeters: false, articulationFocus: null, bars });
  const choices = Math.max(1, sourceBars - bars + 1);
  const offset = (seed >>> 0) % choices * stepsPerBar;
  const hits = pattern.hits.filter(hit => SIGHT_VOICES.includes(hit.instrument) && hit.step >= offset && hit.step < offset + bars * stepsPerBar)
    .map(hit => ({ ...hit, step: hit.step - offset }))
    .sort((a, b) => a.step - b.step || SIGHT_VOICES.indexOf(a.instrument) - SIGHT_VOICES.indexOf(b.instrument));
  if (!hits.length) return null;
  return { version: 1, seed: seed >>> 0, settings: finalSettings, subdivision: subdivision as SightExercise['subdivision'], beatsPerBar, stepsPerBar, hits, sourceLabel: pattern.label.slice(0, 160) };
}
export function sightVoiceScores(exercise: SightExercise, rated: RatedHit[]): Partial<Record<Instrument, number>> {
  const scores: Partial<Record<Instrument, number>> = {};
  for (const voice of SIGHT_VOICES) {
    const targets = exercise.hits.filter(hit => hit.instrument === voice);
    if (!targets.length) continue;
    const matched = targets.filter(target => rated.some(hit => hit.step === target.step && hit.instrument === voice && (hit.rating === 'great' || hit.rating === 'good'))).length;
    scores[voice] = Math.round(matched * 100 / targets.length);
  }
  return scores;
}
export function assignSightSticking(hits: PatternHit[]): PatternHit[] {
  let handIndex = 0;
  return [...hits].sort((a, b) => a.step - b.step || SIGHT_VOICES.indexOf(a.instrument) - SIGHT_VOICES.indexOf(b.instrument)).map(hit => {
    if (hit.instrument === 'kick') return { ...hit };
    const sticking = hit.sticking ?? (handIndex % 2 === 0 ? 'R' : 'L');
    handIndex++;
    return { ...hit, sticking };
  });
}
/** Starting points, in quarter-note beats, for audible count-in group accents. */
export function sightMeterGroupStarts(meter: SightSettings['meter']): number[] {
  return meter === '5/4' ? [0, 3] : meter === '7/8' ? [0, 1, 2] : meter === '4/4' ? [0, 2] : [0];
}
export function sightArticulationVoice(articulation: MidiArticulation): Instrument {
  if (['open-hat', 'closed-hat', 'pedal-hat', 'foot-splash', 'ride'].includes(articulation)) return 'hihat';
  if (['rimshot', 'side-stick'].includes(articulation)) return 'snare';
  return 'crash';
}
function applyArticulationTargets(hits: PatternHit[], settings: SightSettings, starts: number[], lengths: number[]) {
  const articulation = settings.articulationFocus;
  if (!articulation) return hits;
  const voice = sightArticulationVoice(articulation);
  for (let bar = 0; bar < starts.length; bar++) {
    const start = starts[bar], end = start + lengths[bar];
    const existing = hits.find(hit => hit.instrument === voice && hit.step >= start && hit.step < end);
    if (existing) { existing.midiArticulationTarget = articulation; continue; }
    const step = Array.from({ length: lengths[bar] }, (_, local) => start + local).find(candidate => hits.filter(hit => hit.step === candidate).length < 3);
    if (step !== undefined) hits.push({ step, instrument: voice, accent: false, midiArticulationTarget: articulation });
  }
  return hits.sort((a, b) => a.step - b.step || SIGHT_VOICES.indexOf(a.instrument) - SIGHT_VOICES.indexOf(b.instrument));
}
/** Suggests one small next step; retries and assisted attempts are filtered by the caller. */
export function adaptiveSightSettings(settings: SightSettings, accuracy: number, timingSpreadMs: number | null): SightSettings | null {
  const next = { ...settings };
  if (accuracy >= 88 && (timingSpreadMs === null || timingSpreadMs <= 55)) {
    if (next.focusRhythm === 'quarters') next.focusRhythm = 'eighths';
    else if (next.focusRhythm === 'eighths' && next.level !== 'Beginner') next.focusRhythm = 'sixteenths';
    else if (next.focusRhythm === 'sixteenths' && next.level === 'Advanced' && next.meter !== '7/8') next.focusRhythm = 'triplets';
    else if (next.style === 'varied' && next.density === 'light') next.density = 'balanced';
    else if (next.style === 'varied' && next.density === 'balanced') next.density = 'dense';
    else if (next.bpm < 200) next.bpm = Math.min(200, next.bpm + 5);
    else return null;
  } else if (accuracy < 75 || (timingSpreadMs !== null && timingSpreadMs > 95)) {
    if (next.style === 'varied' && next.density === 'dense') next.density = 'balanced';
    else if (next.style === 'varied' && next.density === 'balanced') next.density = 'light';
    else if (next.bpm > 40) next.bpm = Math.max(40, next.bpm - 5);
    else return null;
  } else return null;
  return normalizeSightSettings(next);
}
export function adaptiveSightPreviewSeconds(current: 0 | 5 | 10, accuracy: number, timingSpreadMs: number | null): 0 | 5 | 10 | null {
  if (accuracy >= 88 && (timingSpreadMs === null || timingSpreadMs <= 55)) return current > 0 ? (current === 10 ? 5 : 0) : null;
  if (accuracy < 75 || (timingSpreadMs !== null && timingSpreadMs > 95)) return current < 10 ? (current === 0 ? 5 : 10) : null;
  return null;
}
/** Estimates whether the next two beats stayed in time after a miss or extra hit. */
export function sightPulseRecovery(exercise: SightExercise, rated: RatedHit[]): number | null {
  const errors = rated.filter(hit => hit.rating === 'miss' || hit.rating === 'extra').map(hit => hit.step).filter((step): step is number => step !== undefined);
  if (!errors.length) return null;
  const stepsPerBeat = exercise.subdivision / 4;
  const recoveryTargets = new Map<string, PatternHit>();
  for (const errorStep of errors) for (const target of exercise.hits) {
    if (target.step > errorStep && target.step <= errorStep + stepsPerBeat * 2) recoveryTargets.set(`${target.step}:${target.instrument}`, target);
  }
  if (!recoveryTargets.size) return null;
  let recovered = 0;
  for (const target of recoveryTargets.values()) {
    const played = rated.find(hit => hit.step === target.step && hit.instrument === target.instrument && hit.rating !== 'miss' && hit.rating !== 'extra');
    if (played && (played.rating === 'great' || played.rating === 'good')) recovered++;
  }
  return Math.round(recovered * 100 / recoveryTargets.size);
}
export function normalizeSightSettings(value: SightSettings): SightSettings {
  const level = ['Beginner', 'Intermediate', 'Advanced'].includes(value.level) ? value.level : 'Beginner';
  const meter = sightMeters(level).includes(value.meter) ? value.meter : '4/4';
  const requestedBars = Number(value.bars);
  const bars = Math.max(1, Math.min(80, Number.isFinite(requestedBars) ? Math.round(requestedBars) : 2));
  const focusRhythm = ['mixed', 'quarters', 'eighths', 'sixteenths', 'triplets'].includes(value.focusRhythm) ? value.focusRhythm : 'mixed';
  const mixedMeters = level !== 'Beginner' && bars > 1 && value.mixedMeters === true;
  const rhythmAllowed = focusRhythm !== 'triplets' || level === 'Advanced' && meter !== '7/8' && !mixedMeters;
  const rhythmLevelAllowed = focusRhythm !== 'sixteenths' || level !== 'Beginner';
  const focusVoice = level === 'Beginner' && value.snareOnly ? 'snare' : value.focusVoice === 'mixed' || SIGHT_VOICES.includes(value.focusVoice) ? value.focusVoice : 'mixed';
  const styles: SightStyle[] = level === 'Beginner' ? ['varied', 'rock'] : level === 'Intermediate' ? ['varied', 'rock', 'fill', 'half-time', 'funk'] : ['varied', 'rock', 'shuffle', 'fill', 'half-time', 'funk', 'latin'];
  const style = styles.includes(value.style) && (value.style !== 'shuffle' || meter !== '7/8' && !mixedMeters) ? value.style : 'varied';
  let normalizedRhythm = rhythmAllowed && rhythmLevelAllowed ? focusRhythm : 'mixed';
  if ((meter === '7/8' || mixedMeters && level === 'Advanced') && normalizedRhythm === 'quarters') normalizedRhythm = 'eighths';
  const density: SightDensity = ['light','balanced','dense'].includes(value.density) ? value.density : 'balanced';
  const articulations: MidiArticulation[] = ['closed-hat','open-hat','pedal-hat','foot-splash','ride','crash','rimshot','side-stick'];
  const articulationFocus = level !== 'Beginner' && articulations.includes(value.articulationFocus as MidiArticulation) ? value.articulationFocus as MidiArticulation : null;
  return { level, bpm: Math.max(40, Math.min(200, Math.round(Number(value.bpm) || 80))), bars, meter, mixedMeters, articulationFocus, triplets: level === 'Advanced' && value.triplets === true && meter !== '7/8' && !mixedMeters, snareOnly: level === 'Beginner' && value.snareOnly === true, focusVoice, focusRhythm: style === 'shuffle' && !['mixed','triplets'].includes(normalizedRhythm) || mixedMeters && normalizedRhythm === 'triplets' ? 'mixed' : normalizedRhythm, style, density };
}
export function sightFingerprint(exercise: SightExercise) {
  const meters = sightExerciseMeters(exercise), meterSignature = meters.every(meter => meter === meters[0]) ? meters[0] : meters.join('-');
  return `${meterSignature}:${exercise.subdivision}:${exercise.hits.map(h => `${h.step}/${h.instrument}/${Number(h.accent ?? false)}${h.midiArticulationTarget ? `/${h.midiArticulationTarget}` : ''}`).join(',')}`;
}
/** v1 LCG and integer template choices are mirrored in Swift; fixtures pin the wire-independent musical output. */
export function generateSightExercise(settings: SightSettings, seed: number, previous?: string): SightExercise {
  const config = normalizeSightSettings(settings);
  if (config.mixedMeters) return generateMixedSightExercise(config, seed, previous);
  let actualSeed = seed >>> 0;
  for (let attempt = 0; ; attempt++, actualSeed = (actualSeed + 1) >>> 0) {
    let state = actualSeed;
    const next = (max: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 4294967296 * max); };
    const beatsPerBar = config.meter === '7/8' ? 3.5 : Number(config.meter[0]);
    const subdivision = config.style === 'shuffle' ? 12 : config.focusRhythm === 'quarters' ? 4 : config.focusRhythm === 'eighths' ? 8 : config.focusRhythm === 'sixteenths' ? 16 : config.focusRhythm === 'triplets' ? 12 : config.triplets ? 12 : config.level === 'Beginner' ? (actualSeed % 2 === 0 ? 4 : 8) : 16;
    const stepsPerBar = Math.round(beatsPerBar * subdivision / 4);
    const hits: PatternHit[] = [];
    // Each beat chooses a small playable rhythm; at most two hands plus one foot at any instant.
    const templates = subdivision === 4 ? [[0], [0], [], [0]] : subdivision === 8 ? [[0], [0, 1], [1], []] : subdivision === 12 ? [[0, 1, 2], [0, 2], [1], []] : [[0, 2], [0, 3], [1, 2], [0, 1, 3], [2], []];
    const unit = subdivision / 4;
    for (let bar = 0; bar < config.bars; bar++) {
      if (['half-time', 'funk', 'latin'].includes(config.style)) {
        const beats = Math.ceil(beatsPerBar);
        const offbeat = Math.floor(unit / 2);
        const handVoice: Instrument = config.focusVoice !== 'mixed' && config.focusVoice !== 'kick' && config.focusVoice !== 'hihat' ? config.focusVoice : 'snare';
        for (let beat = 0; beat < beats; beat++) {
          const base = beat * unit;
          if (base >= stepsPerBar) continue;
          const hats = subdivision === 4 ? [0] : config.style === 'latin' ? [0, Math.max(1, unit - 1)] : [0, offbeat];
          if (config.focusVoice === 'mixed' || config.focusVoice === 'hihat') for (const offset of hats) if (base + offset < stepsPerBar) hits.push({ step: bar * stepsPerBar + base + offset, instrument: 'hihat', accent: offset === 0 && beat % 2 === 0 });
          const kickBeats = config.style === 'half-time' ? [0] : config.style === 'funk' ? [0, 2] : [0, Math.max(1, beats - 1)];
          const snareBeats = config.style === 'half-time' ? [2] : config.style === 'funk' ? [1, 3] : [1, Math.max(1, beats - 1)];
          const includeKick = config.focusVoice === 'mixed' || config.focusVoice === 'kick';
          const includeHand = config.focusVoice === 'mixed' || !['kick', 'hihat'].includes(config.focusVoice);
          if (includeKick && kickBeats.includes(beat)) hits.push({ step: bar * stepsPerBar + base, instrument: 'kick', accent: beat === 0 });
          if (includeKick && config.style === 'funk' && beat === Math.min(3, beats - 1) && offbeat > 0 && base + offbeat < stepsPerBar) hits.push({ step: bar * stepsPerBar + base + offbeat, instrument: 'kick', accent: false });
          if (includeHand && snareBeats.includes(beat)) hits.push({ step: bar * stepsPerBar + base, instrument: handVoice, accent: beat === 1 || beat === 3 });
          if (includeHand && config.style === 'latin' && beat === Math.min(2, beats - 1) && offbeat > 0 && base + offbeat < stepsPerBar) hits.push({ step: bar * stepsPerBar + base + offbeat, instrument: handVoice, accent: false });
        }
        continue;
      }
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
      const densityTemplates = config.density === 'balanced' ? templates : subdivision === 4
        ? templates
        : subdivision === 8
          ? (config.density === 'light' ? [[0], [0], [], [0]] : [[0, 1], [0, 1], [1], [0]])
          : subdivision === 12
            ? (config.density === 'light' ? [[0], [0], [2], []] : [[0, 1, 2], [0, 2], [1, 2], [0, 1, 2]])
            : (config.density === 'light' ? [[0], [0, 2], [2], []] : [[0, 1, 2, 3], [0, 2, 3], [0, 1, 3], [1, 2, 3]]);
      const template = densityTemplates[next(densityTemplates.length)];
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
    applyArticulationTargets(hits, config, Array.from({ length: config.bars }, (_, bar) => bar * stepsPerBar), Array.from({ length: config.bars }, () => stepsPerBar));
    const exercise: SightExercise = { version: config.articulationFocus ? 3 : 1, seed: actualSeed, settings: config, subdivision, beatsPerBar, stepsPerBar, hits };
    if (!previous || sightFingerprint(exercise) !== previous || attempt >= 100) return exercise;
  }
}
/** v2 composes meter-specific one-bar phrases on a shared quarter-note grid. */
function generateMixedSightExercise(config: SightSettings, seed: number, previous?: string): SightExercise {
  let actualSeed = seed >>> 0;
  for (let retry = 0; retry < 100; retry++, actualSeed = (actualSeed + 1) >>> 0) {
    let state = actualSeed;
    const next = (max: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 4294967296 * max); };
    const choices = sightMeters(config.level);
    const barMeters: SightMeter[] = [config.meter];
    for (let bar = 1; bar < config.bars; bar++) {
      const nextChoices = choices.filter(meter => meter !== barMeters[bar - 1]);
      barMeters.push(nextChoices[next(nextChoices.length)] ?? config.meter);
    }
    const hits: PatternHit[] = [], starts: number[] = [], lengths: number[] = []; let startStep = 0;
    for (let bar = 0; bar < config.bars; bar++) {
      const meter = barMeters[bar], barSettings = normalizeSightSettings({ ...config, meter, mixedMeters: false, bars: 1 });
      starts.push(startStep);
      const barSeed = (actualSeed + Math.imul(bar + 1, 0x9e3779b9)) >>> 0;
      const phrase = generateSightExercise(barSettings, barSeed);
      hits.push(...phrase.hits.map(hit => ({ ...hit, step: hit.step + startStep })));
      lengths.push(Math.round(sightMeterBeats(meter) * phrase.subdivision / 4));
      startStep += lengths.at(-1)!;
    }
    applyArticulationTargets(hits, config, starts, lengths);
    const first = generateSightExercise(normalizeSightSettings({ ...config, mixedMeters: false, bars: 1 }), actualSeed);
    const exercise: SightExercise = { version: config.articulationFocus ? 3 : 2, seed: actualSeed, settings: config, subdivision: first.subdivision, beatsPerBar: sightMeterBeats(barMeters[0]), stepsPerBar: Math.round(sightMeterBeats(barMeters[0]) * first.subdivision / 4), barMeters, hits: hits.sort((a, b) => a.step - b.step || SIGHT_VOICES.indexOf(a.instrument) - SIGHT_VOICES.indexOf(b.instrument)) };
    if (!previous || sightFingerprint(exercise) !== previous || retry === 99) return exercise;
  }
  throw new Error('Could not generate a mixed-meter exercise.');
}
/** Generates a new phrase without repeating any of the learner's recently seen phrases. */
export function generateFreshSightExercise(settings: SightSettings, seed: number, recentFingerprints: readonly string[] = []): SightExercise {
  let candidate = seed >>> 0;
  const recent = new Set(recentFingerprints.slice(-32));
  for (let attempt = 0; attempt <= 32; attempt++) {
    const exercise = generateSightExercise(settings, candidate);
    if (!recent.has(sightFingerprint(exercise))) return exercise;
    candidate = (candidate + 1) >>> 0;
  }
  return generateSightExercise(settings, candidate);
}
export function recentSightFingerprints(history: readonly SightAttempt[], limit = 24): string[] {
  return history.slice(-limit).map(row => row.fingerprint ?? sightFingerprint(generateSightExercise(row.settings, row.seed)));
}
export function parseSightFingerprints(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw ?? '[]');
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0 && entry.length <= 20000).slice(-32) : [];
  } catch { return []; }
}
/** Plain-language event list for screen readers and assistive reading tools. */
export function describeSightExercise(exercise: SightExercise): string {
  const unitsPerBeat = exercise.subdivision / 4;
  const labelAt = (step: number) => {
    const within = step % unitsPerBeat;
    const beat = Math.floor(step / unitsPerBeat) + 1;
    if (within === 0) return `beat ${beat}`;
    if (exercise.subdivision === 8) return `beat ${beat} and`;
    if (exercise.subdivision === 12) return `beat ${beat}, triplet ${within + 1}`;
    return `beat ${beat}, ${['','e','and','a'][within] ?? `subdivision ${within + 1}`}`;
  };
  const starts = sightBarStarts(exercise), meters = sightExerciseMeters(exercise);
  return Array.from({ length: exercise.settings.bars }, (_, bar) => {
    const events = Array.from({ length: sightBarSteps(exercise, bar) }, (_, localStep) => {
      const step = starts[bar] + localStep;
      const hits = exercise.hits.filter(hit => hit.step === step);
      const content = hits.length ? hits.map(hit => `${hit.instrument}${hit.accent ? ', accent' : ''}${hit.midiArticulationTarget ? `, ${hit.midiArticulationTarget.replaceAll('-', ' ')}` : ''}`).join(' and ') : 'rest';
      return `${labelAt(localStep)}: ${content}`;
    });
    return `Bar ${bar + 1}, ${meters[bar]}: ${events.join('; ')}.`;
  }).join(' ');
}
export function sightDuration(exercise: SightExercise) { return sightTotalBeats(exercise) * 60000 / exercise.settings.bpm; }
export function scoreSightAttempt(exercise: SightExercise, attempts: SightHit[]) {
  const stepMs = stepDurationMs(exercise.settings.bpm, exercise.subdivision);
  const expected = exercise.hits.map(hit => ({ ...hit, at: hit.step * stepMs, matched: false }));
  const rated: RatedHit[] = [];
  for (const hit of [...attempts].sort((a, b) => a.atMs - b.atMs)) {
    const closest = findClosestExpected(hit.atMs, expected, hit.instrument);
    if (closest.index >= 0 && Math.abs(closest.offset) <= 100) {
      const target = expected[closest.index];
      if (target.midiArticulationTarget && target.midiArticulationTarget !== hit.midiArticulation) {
        rated.push({ instrument: hit.instrument, rating: 'extra', offsetMs: null, atMs: hit.atMs, step: target.step, midiArticulation: hit.midiArticulation });
        continue;
      }
      target.matched = true;
      rated.push({ instrument: hit.instrument, rating: classifyOffset(closest.offset), offsetMs: Math.round(closest.offset), atMs: hit.atMs, step: target.step, midiArticulation: hit.midiArticulation, midiArticulationTarget: target.midiArticulationTarget });
    } else rated.push({ instrument: hit.instrument, rating: 'extra', offsetMs: null, atMs: hit.atMs, step: Math.max(0, Math.min(sightTotalSteps(exercise) - 1, Math.floor(hit.atMs / stepMs))), midiArticulation: hit.midiArticulation });
  }
  for (const target of expected) if (!target.matched) rated.push({ instrument: target.instrument, rating: 'miss', offsetMs: null, step: target.step, atMs: target.at, midiArticulationTarget: target.midiArticulationTarget });
  const offsets = rated.flatMap(hit => hit.offsetMs === null ? [] : [hit.offsetMs]);
  const meanOffsetMs = offsets.length ? Math.round(offsets.reduce((a, b) => a + b, 0) / offsets.length) : null;
  const timingSpreadMs = offsets.length && meanOffsetMs !== null ? Math.round(offsets.reduce((sum, value) => sum + Math.abs(value - meanOffsetMs), 0) / offsets.length) : null;
  const buckets: Record<string, { total: number; correct: number }> = {};
  const add = (name: string, correct: boolean) => { const row = buckets[name] ??= { total: 0, correct: 0 }; row.total++; if (correct) row.correct++; };
  const stepsPerBeat = exercise.subdivision / 4;
  const rhythmFor = (step: number) => {
    const withinBeat = step % stepsPerBeat;
    if (withinBeat === 0) return 'quarters';
    if (exercise.subdivision === 12) return 'triplets';
    if (exercise.subdivision === 8) return 'eighths';
    return withinBeat % 2 === 0 ? 'eighths' : 'sixteenths';
  };
  for (const target of exercise.hits) {
    const played = rated.find(hit => hit.step === target.step && hit.instrument === target.instrument && hit.rating !== 'miss' && hit.rating !== 'extra');
    const correct = !!played && (played.rating === 'great' || played.rating === 'good');
    add(rhythmFor(target.step), correct);
    if (target.step % stepsPerBeat !== 0) add('syncopation', correct);
  }
  const expectedSteps = new Set(exercise.hits.map(hit => hit.step));
  const extraSteps = new Set(rated.filter(hit => hit.rating === 'extra').map(hit => hit.step ?? -1));
  for (let step = 0; step < sightTotalSteps(exercise); step++) if (!expectedSteps.has(step)) add('rests', !extraSteps.has(step));
  const fluency = Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, Math.round(value.correct * 100 / value.total)])) as SightFluency;
  return { rated, fluency, summary: summarizeHits(rated, `sight-v1-${exercise.seed}`, 'Sight reading', exercise.settings.bpm), meanOffsetMs, timingSpreadMs, pulseRecovery: sightPulseRecovery(exercise, rated), earlyHits: offsets.filter(value => value < 0).length, lateHits: offsets.filter(value => value > 0).length };
}
export function createSightBarDrill(exercise: SightExercise, bar: number): SightExercise {
  const sourceBar = Math.max(0, Math.min(exercise.settings.bars - 1, Math.floor(bar)));
  const starts = sightBarStarts(exercise), sourceStart = starts[sourceBar], barSteps = sightBarSteps(exercise, sourceBar), meter = sightExerciseMeters(exercise)[sourceBar];
  const sourceHits = exercise.hits.filter(hit => hit.step >= sourceStart && hit.step < sourceStart + barSteps)
    .map(hit => ({ ...hit, step: hit.step - sourceStart }));
  const hits = [...sourceHits, ...sourceHits.map(hit => ({ ...hit, step: hit.step + barSteps }))]
    .sort((a, b) => a.step - b.step || SIGHT_VOICES.indexOf(a.instrument) - SIGHT_VOICES.indexOf(b.instrument));
  const settings = normalizeSightSettings({ ...exercise.settings, meter, mixedMeters: false, bars: 2 });
  return { ...exercise, version: settings.articulationFocus ? 3 : settings.mixedMeters ? 2 : 1, settings, barMeters: [meter, meter], beatsPerBar: sightMeterBeats(meter), stepsPerBar: barSteps, hits };
}
export function createSightRangeDrill(exercise: SightExercise, startBar: number, endBar: number, repeats = 2): SightExercise {
  const start = Math.max(0, Math.min(exercise.settings.bars - 1, Math.floor(startBar)));
  const count = Math.max(2, Math.min(4, Math.floor(repeats)));
  const maxRangeBars = Math.floor(80 / count);
  const end = Math.max(start, Math.min(exercise.settings.bars - 1, start + maxRangeBars - 1, Math.floor(endBar)));
  const rangeBars = end - start + 1;
  const bars = rangeBars * count;
  const starts = sightBarStarts(exercise), sourceOffset = starts[start], rangeEnd = starts[end + 1] ?? sightTotalSteps(exercise);
  const rangeSteps = rangeEnd - sourceOffset, sourceMeters = sightExerciseMeters(exercise).slice(start, end + 1);
  const sourceHits = exercise.hits.filter(hit => hit.step >= sourceOffset && hit.step < sourceOffset + rangeSteps).map(hit => ({ ...hit, step: hit.step - sourceOffset }));
  const hits = Array.from({ length: count }, (_, repeat) => sourceHits.map(hit => ({ ...hit, step: hit.step + repeat * rangeSteps }))).flat()
    .sort((a, b) => a.step - b.step || SIGHT_VOICES.indexOf(a.instrument) - SIGHT_VOICES.indexOf(b.instrument));
  const barMeters = Array.from({ length: count }, () => sourceMeters).flat();
  const settings = normalizeSightSettings({ ...exercise.settings, meter: barMeters[0], mixedMeters: new Set(barMeters).size > 1, bars });
  return { ...exercise, version: settings.articulationFocus ? 3 : settings.mixedMeters ? 2 : 1, settings, barMeters, beatsPerBar: sightMeterBeats(barMeters[0]), stepsPerBar: Math.round(sightMeterBeats(barMeters[0]) * exercise.subdivision / 4), hits };
}
export function weakestSightBar(exercise: SightExercise, rated: RatedHit[]) {
  let weakest = 0, worst = -1;
  for (let bar = 0; bar < exercise.settings.bars; bar++) {
    const errors = rated.filter(hit => sightStepBar(exercise, hit.step ?? 0) === bar && (hit.rating === 'miss' || hit.rating === 'extra')).length;
    if (errors > worst) { worst = errors; weakest = bar; }
  }
  return weakest;
}
export const SIGHT_LEARNING_PATH: Array<{ title: string; settings: Pick<SightSettings, 'level' | 'meter' | 'focusRhythm'> }> = [
  { title: 'Steady quarter notes', settings: { level: 'Beginner', meter: '4/4', focusRhythm: 'quarters' } },
  { title: 'Eighth-note pulse', settings: { level: 'Beginner', meter: '4/4', focusRhythm: 'eighths' } },
  { title: 'Three-beat measures', settings: { level: 'Intermediate', meter: '3/4', focusRhythm: 'eighths' } },
  { title: 'Sixteenth-note reading', settings: { level: 'Intermediate', meter: '4/4', focusRhythm: 'sixteenths' } },
  { title: 'Five-quarter grouping', settings: { level: 'Advanced', meter: '5/4', focusRhythm: 'sixteenths' } },
  { title: 'Seven-eighth grouping', settings: { level: 'Advanced', meter: '7/8', focusRhythm: 'sixteenths' } },
];
export function nextSightLearningPathStep(history: SightAttempt[]) {
  return SIGHT_LEARNING_PATH.findIndex(step => !history.some(row => row.classification === 'reading' && row.accuracy >= 80 && row.settings.level === step.settings.level && row.settings.meter === step.settings.meter && row.settings.focusRhythm === step.settings.focusRhythm));
}
export function sightClassification(attempted: boolean, assisted: boolean): SightAttempt['classification'] { return assisted ? 'assisted' : attempted ? 'practice' : 'reading'; }
export type SightGoal = { level: Level; meter: SightSettings['meter']; bpm: number; focusRhythm: SightRhythmFocus; accuracy: number; targetReads: number };
export type SightErrorFocus = SightRhythmFocus | 'syncopation' | 'rests';
export function sightSupportedRhythms(level: Level, meter: SightSettings['meter']): SightRhythmFocus[] {
  return ['quarters', 'eighths', ...(level !== 'Beginner' ? ['sixteenths' as const] : []), ...(level === 'Advanced' && meter !== '7/8' ? ['triplets' as const] : [])];
}
export function sightVarietySummary(history: readonly SightAttempt[]) {
  const recent = history.filter(row => row.classification === 'reading').slice(-100);
  return { attempts: recent.length, uniquePhrases: new Set(recent.map(row => row.fingerprint ?? `${row.settings.meter}|${row.settings.focusRhythm}|${row.settings.style}|${row.seed}`)).size, meters: new Set(recent.map(row => row.settings.meter)).size, rhythmSettings: new Set(recent.map(row => `${row.settings.meter}|${row.settings.focusRhythm}`)).size, styles: new Set(recent.map(row => row.settings.style)).size };
}
/** Chooses the least-practiced supported meter/rhythm pair for deliberate coverage. */
export function leastPracticedSightSettings(current: SightSettings, history: readonly SightAttempt[]): SightSettings {
  const candidates = sightMeters(current.level).flatMap(meter => sightSupportedRhythms(current.level, meter).map(focusRhythm => normalizeSightSettings({ ...current, meter, focusRhythm, focusVoice: 'mixed', style: 'varied', density: 'light' })));
  const ranked = candidates.map(settings => {
    const matches = history.filter(row => row.classification === 'reading' && row.settings.level === settings.level && row.settings.meter === settings.meter && row.settings.focusRhythm === settings.focusRhythm);
    return { settings, count: matches.length, last: matches.at(-1)?.playedAt ?? '' };
  }).sort((a, b) => a.count - b.count || a.last.localeCompare(b.last));
  return ranked.find(row => row.settings.meter !== current.meter || row.settings.focusRhythm !== current.focusRhythm)?.settings ?? ranked[0]?.settings ?? current;
}
/** Builds a five-phrase route from an easier warm-up to a goal, with a review stop. */
export function buildSightGoalPath(goal: SightGoal, history: readonly SightAttempt[]): SightSettings[] {
  const target = normalizeSightSettings({ ...DEFAULT_SIGHT_SETTINGS, level: goal.level, meter: goal.meter, bpm: goal.bpm, focusRhythm: goal.focusRhythm, style: 'varied', density: 'balanced' });
  const rhythms = sightSupportedRhythms(target.level, target.meter);
  const targetIndex = rhythms.indexOf(target.focusRhythm);
  const easierRhythm = rhythms[Math.max(0, targetIndex - 1)] ?? 'quarters';
  const reviewGroups = new Map<string, { settings: SightSettings; rows: SightAttempt[]; last: string }>();
  for (const row of history.filter(item => item.classification === 'reading' && item.settings.level === goal.level)) {
    const key = `${row.settings.meter}|${row.settings.focusRhythm}`;
    const group = reviewGroups.get(key) ?? { settings: row.settings, rows: [], last: '' };
    group.rows.push(row); group.last = row.playedAt; reviewGroups.set(key, group);
  }
  const review = [...reviewGroups.values()].map(group => ({ ...group, average: group.rows.reduce((sum, row) => sum + row.accuracy, 0) / group.rows.length }))
    .filter(group => group.settings.meter !== target.meter || group.settings.focusRhythm !== target.focusRhythm)
    .sort((a, b) => a.average - b.average || a.last.localeCompare(b.last))[0];
  const reviewSettings = review?.settings ?? normalizeSightSettings({ ...target, bpm: Math.max(40, target.bpm - 5), focusRhythm: easierRhythm, density: 'light' });
  const path = [
    normalizeSightSettings({ ...target, bpm: Math.max(40, target.bpm - 15), focusRhythm: easierRhythm, density: 'light' }),
    normalizeSightSettings({ ...target, bpm: Math.max(40, target.bpm - 10), density: 'light' }),
    normalizeSightSettings({ ...reviewSettings, bpm: Math.min(reviewSettings.bpm, target.bpm), bars: 2, style: 'varied', density: 'light' }),
    target,
    normalizeSightSettings({ ...target, bpm: target.bpm < 200 ? target.bpm + 5 : target.bpm, density: 'dense' }),
  ];
  return path;
}
/** Turns the most common miss/extra into a short, easier two-bar phrase drill. */
export function createSightErrorDrill(exercise: SightExercise, rated: RatedHit[], seed: number, previous: string[] = [], history: readonly SightAttempt[] = []): { exercise: SightExercise; focus: SightErrorFocus; voice: Instrument | 'mixed' } {
  const errors = rated.filter(hit => (hit.rating === 'miss' || hit.rating === 'extra') && hit.step !== undefined);
  const stepsPerBeat = exercise.subdivision / 4;
  const rhythmAt = (step: number): SightRhythmFocus => {
    const within = step % stepsPerBeat;
    if (within === 0) return 'quarters';
    if (exercise.subdivision === 12) return 'triplets';
    if (exercise.subdivision === 8) return 'eighths';
    return within % 2 === 0 ? 'eighths' : 'sixteenths';
  };
  const counts = new Map<SightErrorFocus, number>();
  for (const error of errors) {
    const step = error.step ?? 0;
    const expectedHere = exercise.hits.some(hit => hit.step === step);
    const focus: SightErrorFocus = error.rating === 'extra' && !expectedHere ? 'rests' : step % stepsPerBeat !== 0 ? 'syncopation' : rhythmAt(step);
    counts.set(focus, (counts.get(focus) ?? 0) + 1);
  }
  let focus = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mixed';
  const recentReadings = history.filter(row => row.classification === 'reading' && row.settings.level === exercise.settings.level && row.settings.meter === exercise.settings.meter).slice(-5);
  if (recentReadings.length >= 2) {
    const recurrent = (['quarters','eighths','sixteenths','triplets','syncopation','rests'] as const).map(name => {
      const values = recentReadings.flatMap(row => row.fluency?.[name] === undefined ? [] : [row.fluency[name]!]);
      return { name, count: values.length, average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 101 };
    }).filter(row => row.count >= 2 && row.average <= 80).sort((a, b) => a.average - b.average)[0];
    if (recurrent) focus = recurrent.name;
  }
  const voiceCounts = new Map<Instrument, number>();
  for (const error of errors) voiceCounts.set(error.instrument, (voiceCounts.get(error.instrument) ?? 0) + 1);
  const voice = [...voiceCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mixed';
  const supported = sightSupportedRhythms(exercise.settings.level, exercise.settings.meter);
  const rhythm = supported.includes(focus as SightRhythmFocus) ? focus as SightRhythmFocus : 'mixed';
  const useFunk = focus === 'syncopation' && exercise.settings.level !== 'Beginner' && exercise.settings.meter !== '7/8';
  const settings = normalizeSightSettings({ ...exercise.settings, bars: 2, bpm: Math.max(40, exercise.settings.bpm - 10), focusRhythm: rhythm, focusVoice: voice, style: useFunk ? 'funk' : 'varied', density: 'light' });
  return { exercise: generateFreshSightExercise(settings, seed, previous), focus, voice };
}
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
export function recommendSightSettings(history: SightAttempt[], settings: SightSettings, source?: SightAttempt['source'], now = Date.now()): { settings: SightSettings; reason: string } | null {
  const dueReviews = new Map<string, { settings: SightSettings; rows: SightAttempt[]; last: number }>();
  for (const row of history.filter(item => item.classification === 'reading' && (!source || item.source === source))) {
    const key = `${row.settings.level}|${row.settings.meter}|${row.settings.focusRhythm}`;
    const group = dueReviews.get(key) ?? { settings: row.settings, rows: [], last: 0 };
    group.rows.push(row); group.last = Date.parse(row.playedAt); dueReviews.set(key, group);
  }
  const overdue = [...dueReviews.values()].map(group => ({ ...group, average: group.rows.slice(-3).reduce((sum, row) => sum + row.accuracy, 0) / Math.min(group.rows.length, 3) }))
    .filter(group => now - group.last >= 7 * 24 * 60 * 60 * 1000)
    .sort((a, b) => a.average - b.average || a.last - b.last)[0];
  if (overdue) return { settings: normalizeSightSettings({ ...overdue.settings, bars: 2, style: 'varied', density: 'light' }), reason: `Spaced review: ${overdue.settings.meter} ${overdue.settings.focusRhythm} has not been read for at least a week; recent accuracy was ${Math.round(overdue.average)}%.` };
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
      if (!item || typeof item.id !== 'string' || item.id.length > 100 || typeof item.playedAt !== 'string' || !Number.isFinite(Date.parse(item.playedAt)) || ![1, 2, 3].includes(item.version) || !Number.isInteger(item.seed) || item.seed < 0 || item.seed > 0xffffffff || !item.settings || !['keyboard','touch','midi','audio-voices'].includes(item.source) || typeof item.inputProfile !== 'string' || item.inputProfile.length > 200 || !['reading','practice','assisted'].includes(item.classification) || (item.targetPlayback !== undefined && typeof item.targetPlayback !== 'boolean') || (item.targetPlayback === true && item.classification !== 'assisted') || ![item.score,item.accuracy].every(n => Number.isFinite(n) && n >= 0 && n <= 100) || !(item.meanOffsetMs === null || (Number.isFinite(item.meanOffsetMs) && Math.abs(item.meanOffsetMs) <= 100)) || (item.timingSpreadMs !== undefined && !(item.timingSpreadMs === null || Number.isFinite(item.timingSpreadMs) && item.timingSpreadMs >= 0 && item.timingSpreadMs <= 100)) || (item.pulseRecovery !== undefined && !(item.pulseRecovery === null || Number.isInteger(item.pulseRecovery) && item.pulseRecovery >= 0 && item.pulseRecovery <= 100)) || (item.confidence !== undefined && !(item.confidence === null || Number.isInteger(item.confidence) && item.confidence >= 1 && item.confidence <= 5)) || (item.inputCalibrated !== undefined && typeof item.inputCalibrated !== 'boolean') || (item.inputCalibrationAt !== undefined && !(item.inputCalibrationAt === null || typeof item.inputCalibrationAt === 'string' && Number.isFinite(Date.parse(item.inputCalibrationAt)))) || (item.inputCalibrationSpreadMs !== undefined && !(item.inputCalibrationSpreadMs === null || Number.isFinite(item.inputCalibrationSpreadMs) && item.inputCalibrationSpreadMs >= 0 && item.inputCalibrationSpreadMs <= 240)) || (item.inputTimingCorrectionMs !== undefined && (!Number.isFinite(item.inputTimingCorrectionMs) || Math.abs(item.inputTimingCorrectionMs) > 250)) || (item.earlyHits !== undefined && (!Number.isInteger(item.earlyHits) || item.earlyHits < 0 || item.earlyHits > 100000)) || (item.lateHits !== undefined && (!Number.isInteger(item.lateHits) || item.lateHits < 0 || item.lateHits > 100000)) || (item.fingerprint !== undefined && (typeof item.fingerprint !== 'string' || item.fingerprint.length > 20000)) || ![item.misses,item.extras].every(n => Number.isInteger(n) && n >= 0 && n <= 100000) || (item.fluency !== undefined && (!item.fluency || typeof item.fluency !== 'object' || Object.entries(item.fluency).some(([key, value]) => !['quarters','eighths','sixteenths','triplets','syncopation','rests'].includes(key) || !Number.isInteger(value) || value < 0 || value > 100))) || (item.voiceScores !== undefined && (!item.voiceScores || typeof item.voiceScores !== 'object' || Object.entries(item.voiceScores).some(([key, value]) => !SIGHT_VOICES.includes(key as Instrument) || typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100))) || (item.sourceLabel !== undefined && (typeof item.sourceLabel !== 'string' || item.sourceLabel.length > 160)) || (item.previewSeconds !== undefined && ![0,5,10].includes(item.previewSeconds)) || (item.countInBars !== undefined && ![0,1,2].includes(item.countInBars)) || (item.assignmentTitle !== undefined && (typeof item.assignmentTitle !== 'string' || item.assignmentTitle.length > 80)) || (item.assignmentDueDate !== undefined && (typeof item.assignmentDueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.assignmentDueDate))) || (item.assignmentMinimumAccuracy !== undefined && (!Number.isInteger(item.assignmentMinimumAccuracy) || item.assignmentMinimumAccuracy < 50 || item.assignmentMinimumAccuracy > 100))) return false;
      const normalized = normalizeSightSettings(item.settings);
      return Object.keys(item.settings).every(key => key in normalized) && Object.entries(normalized).every(([key, value]) => item.settings[key as keyof SightSettings] === value || item.settings[key as keyof SightSettings] === undefined && value === DEFAULT_SIGHT_SETTINGS[key as keyof SightSettings]) && (!normalized.mixedMeters || item.version >= 2) && (!normalized.articulationFocus || item.version >= 3);
    }).map((row: SightAttempt) => ({ ...row, settings: normalizeSightSettings(row.settings) })).slice(-100);
  } catch { return []; }
}
export function mergeSightAttempts(...histories: readonly SightAttempt[][]): SightAttempt[] {
  const byId = new Map<string, SightAttempt>();
  for (const history of histories) for (const attempt of history) byId.set(attempt.id, attempt);
  return [...byId.values()].sort((a, b) => a.playedAt.localeCompare(b.playedAt)).slice(-100);
}
export function sightNotationBars(exercise: SightExercise, showSticking = false): ArrangementBar[] {
  const notationHits = showSticking ? assignSightSticking(exercise.hits) : exercise.hits;
  const starts = sightBarStarts(exercise), meters = sightExerciseMeters(exercise);
  return Array.from({ length: exercise.settings.bars }, (_, index) => {
    const start = starts[index], steps = sightBarSteps(exercise, index), meter = meters[index], beats = sightMeterBeats(meter);
    return { index, number: index + 1, sectionId: 'sight', sectionName: exercise.sourceLabel ?? 'Sight reading', sectionKind: 'other', sectionRepeat: 0, sectionBar: index, sectionBars: exercise.settings.bars, partId: 'sight', partName: exercise.sourceLabel ?? 'Reading exercise', meter: meter === '7/8' ? '7/8 (2+2+3)' : meter === '5/4' ? '5/4 (3+2)' : meter, bpm: exercise.settings.bpm, subdivision: exercise.subdivision, partBeats: beats, beats, measureBeats: beats, partBeatOffset: 0, hits: notationHits.filter(h => h.step >= start && h.step < start + steps).map(h => { const local = h.step - start; return { beat: local * 4 / exercise.subdivision, fraction: local / steps, step: local, instrument: h.instrument, accent: !!h.accent, velocity: h.accent ? 110 : 85, ghost: false, sticking: h.sticking, notationCue: h.midiArticulationTarget }; }) };
  });
}
