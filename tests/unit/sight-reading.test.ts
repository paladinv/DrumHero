import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_SIGHT_SETTINGS, SIGHT_LEARNING_PATH, createSightBarDrill, generateSightExercise, matchingSightGoalAttempts, nextSightLearningPathStep, normalizeSightSettings, parseSightGoal, parseSightHistory, recommendSightSettings, scoreSightAttempt, sightClassification, sightDuration, sightFingerprint, sightMeters, sightNotationBars, weakestSightBar, type SightAttempt, type SightGoal, type SightSettings } from '../../lib/sight-reading';
import { parseLocalBackup } from '../../lib/local-backup';
import { learnerStorageKey } from '../../lib/learner-profiles';
const settings = DEFAULT_SIGHT_SETTINGS;
describe('sight reading', () => {
  it('generates playable phrases across every supported meter and subdivision', () => {
    for (const level of ['Beginner','Intermediate','Advanced'] as const) for (const meter of sightMeters(level)) for (const triplets of [false,true]) for (const bars of [1,2,4,8] as const) for (let seed=0;seed<40;seed++) {
      const exercise = generateSightExercise({ ...settings, level, meter, triplets, bars },seed);
      const seen = new Set<string>();
      for (const hit of exercise.hits) { expect(Number.isInteger(hit.step)).toBe(true); expect(hit.step).toBeGreaterThanOrEqual(0); expect(hit.step).toBeLessThan(exercise.stepsPerBar*bars); const id = `${hit.step}-${hit.instrument}`; expect(seen.has(id)).toBe(false); seen.add(id); }
      for (let bar=0;bar<bars;bar++) expect(exercise.hits.some(h => Math.floor(h.step/exercise.stepsPerBar) === bar)).toBe(true);
      for (const step of new Set(exercise.hits.map(h=>h.step))) { const hits=exercise.hits.filter(h=>h.step===step); expect(hits.filter(h=>h.instrument!=='kick').length).toBeLessThanOrEqual(2); expect(hits.length).toBeLessThanOrEqual(3); }
      expect(sightNotationBars(exercise).reduce((sum,bar)=>sum+bar.hits.length,0)).toBe(exercise.hits.length);
    }
  });
  it('pins musical output to shared Swift fixtures', () => {
    const fixtures = JSON.parse(readFileSync('shared/sight-reading-v1.json','utf8')) as Array<{ settings: SightSettings; seed: number; fingerprint: string }>;
    for (const fixture of fixtures) expect(sightFingerprint(generateSightExercise(fixture.settings,fixture.seed))).toBe(fixture.fingerprint);
  });
  it('avoids an immediately repeated phrase and normalizes level restrictions', () => {
    const first=generateSightExercise(settings,4); expect(sightFingerprint(generateSightExercise(settings,4,sightFingerprint(first)))).not.toBe(sightFingerprint(first));
    expect(normalizeSightSettings({...settings,bpm:900,meter:'7/8',triplets:true})).toEqual({...settings,bpm:200});
    expect(generateSightExercise({...settings, snareOnly:true},1).hits.every(h=>h.instrument==='snare')).toBe(true);
  });
  it('uses quarter-note BPM for odd meters', () => {
    const exercise=generateSightExercise({...settings,level:'Advanced',meter:'7/8',bpm:60,bars:2},4);
    expect(exercise.stepsPerBar).toBe(14); expect(sightDuration(exercise)).toBe(7000); expect(exercise.settings.triplets).toBe(false);
  });
  it('scores boundaries, misses, wrong voices, and extras without dynamics', () => {
    const e=generateSightExercise({...settings,bars:1,snareOnly:true},9);
    const hits=e.hits.map(h=>({instrument:h.instrument,atMs:h.step*60000/e.settings.bpm*4/e.subdivision}));
    expect(scoreSightAttempt(e,hits).summary.accuracy).toBe(100);
    expect(scoreSightAttempt(e,hits.map(h=>({...h,atMs:h.atMs+50}))).summary.great).toBe(hits.length);
    expect(scoreSightAttempt(e,hits.map(h=>({...h,atMs:h.atMs+100}))).summary.good).toBe(hits.length);
    const miss=scoreSightAttempt(e,hits.map(h=>({...h,atMs:h.atMs+101})));
    expect(miss.summary.miss).toBe(hits.length);expect(miss.summary.extra).toBe(hits.length);
    expect(scoreSightAttempt(e,hits.map(h=>({...h,instrument:'kick'}))).summary.accuracy).toBe(0);
  });
  it('accepts full backups with reading history and legacy backups without it', () => {
    const base={application:'Drum Hero',format:'drum-hero-full-backup',version:1,createdAt:new Date().toISOString(),localStorage:{},songRecordings:[],customSamples:[]};
    expect(parseLocalBackup(JSON.stringify(base)).localStorage).toEqual({});
    const key='drum-hero:sight-reading:v1:profile:reader';
    const data=JSON.stringify({version:1,attempts:[]});
    expect(parseLocalBackup(JSON.stringify({...base,localStorage:{[key]:data}})).localStorage[key]).toBe(data);
  });
  it('isolates retries, assisted attempts, corrupt histories and learner keys', () => {
    expect(sightClassification(false,false)).toBe('reading'); expect(sightClassification(true,false)).toBe('practice'); expect(sightClassification(false,true)).toBe('assisted');
    const row: SightAttempt={id:'1',playedAt:new Date().toISOString(),version:1,seed:1,settings,source:'keyboard',inputProfile:'keyboard',classification:'reading',score:80,accuracy:80,meanOffsetMs:0,misses:2,extras:0};
    expect(parseSightHistory(JSON.stringify({version:1,attempts:Array.from({length:110},()=>row)}))).toHaveLength(100);
    expect(parseSightHistory(JSON.stringify({version:1,attempts:[row,{...row,id:'assisted',classification:'assisted',targetPlayback:true}]})).map(attempt=>attempt.targetPlayback)).toEqual([undefined,true]);
    expect(parseSightHistory(JSON.stringify({version:1,attempts:[{...row,targetPlayback:'yes'}]}))).toEqual([]);
    expect(parseSightHistory(JSON.stringify({version:1,attempts:[{...row,targetPlayback:true}]}))).toEqual([]);
    expect(parseSightHistory(JSON.stringify({version:1,attempts:[{...row,score:NaN},{...row,seed:-1},{...row,settings:{...settings,meter:'7/8'}}]}))).toEqual([]);
    expect(parseSightHistory('bad')).toEqual([]);
    expect(learnerStorageKey('drum-hero:sight-reading:v1','a')).not.toBe(learnerStorageKey('drum-hero:sight-reading:v1','b'));
  });
  it('generates dedicated voice and rhythm focus phrases and musical styles', () => {
    for (const focusVoice of ['kick','snare','hihat','tom','crash'] as const) {
      const exercise = generateSightExercise({ ...settings, level:'Advanced', focusVoice }, 17);
      expect(exercise.hits.length).toBeGreaterThan(0);
      expect(exercise.hits.every(hit => hit.instrument === focusVoice)).toBe(true);
    }
    const subdivisions = { quarters:4, eighths:8, sixteenths:16, triplets:12 } as const;
    for (const [focusRhythm, subdivision] of Object.entries(subdivisions)) {
      const exercise = generateSightExercise({ ...settings, level:'Advanced', focusRhythm:focusRhythm as SightSettings['focusRhythm'] }, 19);
      expect(exercise.subdivision).toBe(subdivision);
    }
    const rock = generateSightExercise({ ...settings, level:'Advanced', style:'rock' }, 21);
    expect(new Set(rock.hits.map(hit => hit.instrument))).toEqual(new Set(['kick','snare','hihat']));
    expect(generateSightExercise({ ...settings, level:'Advanced', style:'shuffle' }, 22).subdivision).toBe(12);
    const fill = generateSightExercise({ ...settings, level:'Advanced', bars:2, style:'fill' }, 23);
    expect(fill.hits.some(hit => hit.step >= fill.stepsPerBar && hit.instrument === 'tom')).toBe(true);
    const seen = new Set<string>();
    for (const hit of fill.hits) { const key = `${hit.step}/${hit.instrument}`; expect(seen.has(key)).toBe(false); seen.add(key); }
    for (const style of ['half-time','funk','latin'] as const) {
      const groove = generateSightExercise({ ...settings, level:'Advanced', bars:2, style }, 24);
      expect(groove.hits.length).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const hit of groove.hits) { expect(hit.step).toBeLessThan(groove.stepsPerBar * 2); const key = `${hit.step}/${hit.instrument}`; expect(seen.has(key)).toBe(false); seen.add(key); }
      for (const step of new Set(groove.hits.map(hit => hit.step))) expect(groove.hits.filter(hit => hit.step === step).length).toBeLessThanOrEqual(3);
    }
  });
  it('builds repeated-bar drills and records rhythm fluency without changing first-read classification', () => {
    const exercise = generateSightExercise({ ...settings, level:'Advanced', bars:2, focusRhythm:'sixteenths' }, 91);
    const wrong = scoreSightAttempt(exercise, []);
    const bar = weakestSightBar(exercise, wrong.rated);
    const drill = createSightBarDrill(exercise, bar);
    const barHits = exercise.hits.filter(hit => Math.floor(hit.step / exercise.stepsPerBar) === bar);
    expect(drill.settings.bars).toBe(2);
    expect(drill.hits).toHaveLength(barHits.length * 2);
    expect(drill.hits.filter(hit => hit.step < drill.stepsPerBar).map(hit => hit.instrument)).toEqual(barHits.map(hit => hit.instrument));
    const perfect = scoreSightAttempt(exercise, exercise.hits.map(hit => ({ instrument: hit.instrument, atMs: hit.step * 60000 / exercise.settings.bpm * 4 / exercise.subdivision })));
    expect(Object.keys(perfect.fluency).length).toBeGreaterThan(0);
    expect(Object.values(perfect.fluency).every(value => value === 100)).toBe(true);
    expect(nextSightLearningPathStep([])).toBe(0);
    const first = SIGHT_LEARNING_PATH[0];
    const row: SightAttempt = { id:'path',playedAt:new Date().toISOString(),version:1,seed:3,settings:normalizeSightSettings({...settings,...first.settings}),source:'keyboard',inputProfile:'keyboard',classification:'reading',score:85,accuracy:85,meanOffsetMs:0,misses:1,extras:0 };
    expect(nextSightLearningPathStep([row])).toBe(1);
  });
  it('keeps older histories readable and tracks goals and adaptive suggestions', () => {
    const base: SightAttempt = { id:'legacy',playedAt:new Date().toISOString(),version:1,seed:4,settings,source:'keyboard',inputProfile:'keyboard',classification:'reading',score:90,accuracy:90,meanOffsetMs:3,misses:1,extras:0 };
    const { focusVoice: _voice, focusRhythm: _rhythm, style: _style, ...legacySettings } = settings;
    const legacy = JSON.stringify({version:1,attempts:[{...base,settings:legacySettings}]});
    expect(parseSightHistory(legacy)[0].settings).toEqual(settings);
    const recent = Array.from({length:3},(_,index)=>({...base,id:`recent-${index}`,accuracy:92,settings:{...settings}}));
    expect(recommendSightSettings(recent,settings,'keyboard')?.settings.bpm).toBe(85);
    expect(recommendSightSettings(recent.map(row=>({...row,accuracy:40})),settings,'keyboard')?.settings.focusRhythm).toBe('quarters');
    const advanced = normalizeSightSettings({...settings,level:'Advanced',bpm:200});
    const advancedRows = recent.map(row=>({...row,settings:advanced}));
    expect(recommendSightSettings(advancedRows,advanced,'keyboard')?.settings.focusRhythm).toBe('triplets');
    expect(recommendSightSettings(recent.slice(0,2),settings,'keyboard')).toBeNull();
    expect(recommendSightSettings(recent,settings,'midi')).toBeNull();
    const goal: SightGoal = {level:settings.level,meter:settings.meter,bpm:settings.bpm,focusRhythm:settings.focusRhythm,accuracy:85,targetReads:3};
    expect(parseSightGoal(JSON.stringify(goal))).toEqual(goal);
    expect(parseSightGoal(JSON.stringify({...goal,accuracy:101}))).toBeNull();
    expect(matchingSightGoalAttempts([...recent,{...base,id:'practice',classification:'practice'}],goal)).toHaveLength(3);
    const enriched = { ...base, previewSeconds:0 as const, countInBars:2 as const, fluency:{quarters:96,rests:100}, assignmentTitle:'Odd meter reading', assignmentDueDate:'2026-10-31', assignmentMinimumAccuracy:85 };
    expect(parseSightHistory(JSON.stringify({version:1,attempts:[enriched]}))[0]).toMatchObject({previewSeconds:0,countInBars:2,fluency:{quarters:96,rests:100},assignmentTitle:'Odd meter reading',assignmentDueDate:'2026-10-31',assignmentMinimumAccuracy:85});
    expect(parseSightHistory(JSON.stringify({version:1,attempts:[{...enriched,assignmentMinimumAccuracy:101}]}))).toEqual([]);
  });
});
