import { describe, expect, it } from 'vitest';
import { appendAssessment, assessmentComparison, assessmentContent, assessmentEducatorReview, assessmentPattern, assessmentProbeVariant, assessmentQuestionsForResult, assessmentRecommendation, assessmentRecommendationDetails, assessmentTier, emptyAssessmentStore, nextAssessmentProbe, parseAssessmentStore, scoreAssessment, shuffledAssessmentChoices, type AssessmentResult } from '@/lib/assessment';
const draft = (): AssessmentResult => ({version:1,id:'test',playedAt:'2026-10-22T12:00:00Z',input:'keyboard',inputProfile:'keyboard',adaptation:'standard',attempts:[],answers:[],skipped:[],endedEarly:false});
const probe = assessmentContent.probes[0];
function hits(p=probe,offset=0) {return assessmentPattern(p,'standard').hits.map(h=>({instrument:h.instrument,atMs:h.step*60000/p.bpm*4/p.subdivision+offset,velocity:h.accent?110:55}));}
describe('initial assessment',()=>{
 it('scores accurate hits, absolute timing, missed targets, and extras',()=>{expect(scoreAssessment(probe,'standard',hits()).passed).toBe(true);expect(scoreAssessment(probe,'standard',hits(probe,61)).passed).toBe(false);expect(scoreAssessment(probe,'standard',hits(probe,60)).meanAbsoluteMs).toBe(60);expect(scoreAssessment(probe,'standard',[]).meanAbsoluteMs).toBeNull();expect(scoreAssessment(probe,'standard',[...hits(),{instrument:'tom',atMs:500}]).extras).toBe(1);const mixed=hits().map((h,i)=>({...h,atMs:h.atMs+(i%2?80:-80)}));expect(scoreAssessment(probe,'standard',mixed).meanAbsoluteMs).toBe(80);});
 it('reports direction and consistency and uses an alternate form on retry',()=>{const mixed=hits().map((h,i)=>({...h,atMs:h.atMs+(i%2?80:-80)}));const row=scoreAssessment(probe,'standard',mixed);expect(row.meanOffsetMs).toBe(0);expect(row.timingSpreadMs).toBe(80);const alternate=assessmentContent.probes.find(p=>p.id==='pulse-3')!;expect(assessmentProbeVariant(alternate,1).hits).not.toEqual(alternate.hits);expect(scoreAssessment(assessmentProbeVariant(alternate,1),'standard',hits(assessmentProbeVariant(alternate,1)),1)).toMatchObject({variant:1,passed:true});});
 it('selects a stable, balanced quiz form and gives a measurable recommendation goal',()=>{const first=assessmentQuestionsForResult({id:'learner-one',answers:[]});expect(first).toHaveLength(4);expect(first.filter(q=>q.kind==='listening')).toHaveLength(2);expect(first.filter(q=>q.kind==='reading')).toHaveLength(2);expect(assessmentQuestionsForResult({id:'learner-one',answers:[]})).toEqual(first);expect(assessmentQuestionsForResult({id:'learner-two',answers:[]})).not.toEqual(first);const r=draft();r.attempts=[scoreAssessment(probe,'standard',[])];expect(assessmentRecommendationDetails(r)?.goal).toContain('85');expect(assessmentRecommendationDetails(r)?.evidence).toContain('missed');});
 it('exports educator review data without learner identifiers or timestamps',()=>{const r=draft();r.id='private-id';r.inputProfile='midi:serial-123';r.playedAt='2026-10-22T12:00:00Z';r.attempts=[scoreAssessment(probe,'standard',hits())];const exported=JSON.stringify(assessmentEducatorReview(r));expect(exported).toContain('drum-hero-assessment-review');expect(exported).not.toContain('private-id');expect(exported).not.toContain('serial-123');expect(exported).not.toContain(r.playedAt);});
 it('reads saved v1 attempts that predate optional diagnostics',()=>{const r=draft();const old={probeId:'pulse-1',score:0,accuracy:0,meanAbsoluteMs:null,misses:16,extras:0,dynamicsContrast:null,passed:false};r.attempts=[old];expect(parseAssessmentStore(JSON.stringify({...emptyAssessmentStore(),results:[r]})).results).toHaveLength(1);});
 it('rejects a saved attempt variant that the probe does not contain',()=>{const r=draft();r.attempts=[{...scoreAssessment(probe,'standard',[]),variant:1}];expect(parseAssessmentStore(JSON.stringify({...emptyAssessmentStore(),results:[r]})).results).toEqual([]);});
 it('compares only an earlier result from the same input profile and adaptation',()=>{const previous=draft();previous.playedAt='2026-10-21T12:00:00Z';previous.attempts=[scoreAssessment(probe,'standard',hits())];const current=draft();current.id='later';current.playedAt='2026-10-22T12:00:00Z';current.attempts=[scoreAssessment(probe,'standard',hits()),scoreAssessment(assessmentContent.probes[1],'standard',hits(assessmentContent.probes[1]))];expect(assessmentComparison(current,[previous])?.summary).toContain('pulse: 1/3 → 2/3');expect(assessmentComparison({...current,inputProfile:'touch'},[previous])).toBeNull();});
 it('advances only after passing, retries once, then changes domain',()=>{const r=draft();const fail=scoreAssessment(probe,'standard',[]);r.attempts.push(fail);expect(nextAssessmentProbe(r)?.id).toBe('pulse-1');r.attempts.push(fail);expect(nextAssessmentProbe(r)?.id).toBe('subdivisions-1');r.attempts=[];r.attempts.push(scoreAssessment(probe,'standard',hits()));expect(nextAssessmentProbe(r)?.id).toBe('pulse-2');expect(assessmentTier(r,'pulse')).toBe(1);});
 it('supports skipped domains and adaptations without colliding targets',()=>{const r=draft();r.skipped=['pulse-1','subdivisions-1'];r.adaptation='single-voice';expect(nextAssessmentProbe(r)).toBeNull();const adapted=assessmentPattern(assessmentContent.probes[6],'hands-only');expect(adapted.hits.some(h=>h.instrument==='kick')).toBe(false);expect(new Set(adapted.hits.map(h=>`${h.step}:${h.instrument}`)).size).toBe(adapted.hits.length);});
 it('requires varied MIDI velocities and adequate matching for dynamics',()=>{const p=assessmentContent.probes.at(-1)!;expect(scoreAssessment(p,'standard',hits(p)).passed).toBe(true);expect(scoreAssessment(p,'standard',hits(p).map(h=>({...h,velocity:80}))).dynamicsContrast).toBeNull();expect(scoreAssessment(p,'standard',hits(p).slice(0,8)).passed).toBe(false);expect(scoreAssessment(p,'standard',hits(p).map(h=>({...h,velocity:h.velocity===110?75:55}))).passed).toBe(true);});
 it('maps prerequisites and does not apply a wholly skipped assessment',()=>{const r=draft();expect(assessmentRecommendation(r)).toBeNull();r.attempts=[scoreAssessment(probe,'standard',[])];expect(assessmentRecommendation(r)).toBe('count-the-grid');r.attempts=[];r.answers=[{questionId:'read-1',choice:0}];expect(assessmentRecommendation(r)).toBe('count-the-grid');});
 it('validates saved data, preserves applied baselines, and caps history',()=>{const r=draft();r.attempts=[scoreAssessment(probe,'standard',hits())];let store: ReturnType<typeof emptyAssessmentStore>={...emptyAssessmentStore(),results:[r],appliedId:r.id};for(let i=0;i<25;i++)store=appendAssessment(store,{...r,id:`retake-${i}`});expect(store.results).toHaveLength(20);expect(store.results[0].id).toBe('test');expect(parseAssessmentStore(JSON.stringify(store))).toEqual(store);expect(parseAssessmentStore('{')).toEqual(emptyAssessmentStore());const corrupt={...r,attempts:[{...r.attempts[0],score:NaN}]};expect(parseAssessmentStore(JSON.stringify({...store,results:[corrupt]})).results).toEqual([]);const invalid={...r,attempts:[{...r.attempts[0],probeId:'pulse-3'}]};expect(parseAssessmentStore(JSON.stringify({...store,results:[invalid]})).results).toEqual([]);});
 it('shuffles choices deterministically without changing their answer IDs',()=>{const q=assessmentContent.questions[0];expect(shuffledAssessmentChoices(q,77)).toEqual(shuffledAssessmentChoices(q,77));expect(shuffledAssessmentChoices(q,77).find(c=>c.choice===q.answer)?.label).toBe(q.choices[q.answer]);});
});

import fixtures from '@/shared/assessment-fixtures-v1.json';
describe('shared web/iOS assessment fixtures',()=>{
 for(const fixture of fixtures.cases)it(fixture.name,()=>{
  const p=assessmentProbeVariant(assessmentContent.probes.find(p=>p.id===fixture.probeId)!,fixture.variant??0);
  const notes=hits(p,fixture.offsetMs).slice(fixture.missing).map(h=>({...h,velocity:fixture.velocity==='constant'?80:fixture.velocity==='threshold'?(h.velocity===110?75:55):h.velocity}));
  for(let i=0;i<fixture.extras;i++)notes.push({instrument:'tom',atMs:500+i*20,velocity:80});
  const actual=scoreAssessment(p,'standard',notes,fixture.variant??0);
  expect(actual).toMatchObject({score:fixture.score,accuracy:fixture.accuracy,meanAbsoluteMs:fixture.meanAbsoluteMs,meanOffsetMs:fixture.meanOffsetMs,timingSpreadMs:fixture.timingSpreadMs,passed:fixture.passed,dynamicsContrast:fixture.dynamicsContrast});
 });
 for(const fixture of fixtures.quizForms)it(`selects the shared quiz form for ${fixture.resultId}`,()=>{
  expect(assessmentQuestionsForResult({id:fixture.resultId,answers:[]}).map(q=>q.id)).toEqual(fixture.selectedIds);
 });
});

import { comparableAssessmentRound, passedAssessment } from '@/lib/assessment';
import { parseLocalBackup } from '@/lib/local-backup';
import type { TrainerRound } from '@/lib/trainer';
describe('assessment recommendations and compatibility',()=>{
 it('uses inclusive score and absolute-error thresholds',()=>{
  const row={probeId:'pulse-1',score:85,accuracy:100,meanAbsoluteMs:60,misses:0,extras:0,dynamicsContrast:null};
  expect(passedAssessment(row)).toBe(true);expect(passedAssessment({...row,score:84})).toBe(false);expect(passedAssessment({...row,meanAbsoluteMs:60.01})).toBe(false);
 });
 it('keeps valid attempted evidence when the learner subsequently skips that domain',()=>{
  const r=draft();r.attempts=[scoreAssessment(probe,'standard',[])];r.skipped=['pulse-1'];
  r.attempts.push(scoreAssessment(assessmentContent.probes[3],'standard',[]));
  const store={...emptyAssessmentStore(),results:[r]};expect(parseAssessmentStore(JSON.stringify(store)).results).toHaveLength(1);
 });
 it('only prefers reliable newer practice on the same input and adaptation',()=>{
  const baseline=draft();const round={mode:'scored',result:{score:90},playedAt:'2026-10-23T00:00:00Z',inputProfile:'keyboard',adaptation:'standard'} as TrainerRound;
  expect(comparableAssessmentRound(round,baseline)).toBe(true);
  for(const change of [{inputProfile:'touch'},{adaptation:'seated'},{uncertainDetections:1},{inputClipped:true},{playedAt:'2026-10-21T00:00:00Z'},{learningMode:'copy'}])expect(comparableAssessmentRound({...round,...change} as TrainerRound,baseline)).toBe(false);
 });
 it('uses curriculum practice targets and maps every prerequisite',()=>{
  const r=draft();
  for(const p of assessmentContent.probes.filter(p=>p.domain!=='dynamics'))r.attempts.push(scoreAssessment(p,'standard',hits(p)));
  expect(assessmentRecommendation(r)).toBe('limb-independence');
  expect(assessmentContent.focusPatterns['limb-independence']).toBe('quarter-kick-backbeat');
  r.attempts=r.attempts.filter(a=>a.probeId!=='coordination-3');expect(assessmentRecommendation(r)).toBe('limb-independence');
  r.attempts=r.attempts.filter(a=>a.probeId!=='coordination-2');expect(assessmentRecommendation(r)).toBe('syncopated-pocket');
  r.attempts=r.attempts.filter(a=>a.probeId!=='coordination-1');r.attempts.push(scoreAssessment(assessmentContent.probes[6],'standard',[]));expect(assessmentRecommendation(r)).toBe('first-backbeat');
 });
 it('accepts older web backups and carries new assessment stores through the existing backup format',()=>{
  const backup={application:'Drum Hero',format:'drum-hero-full-backup',version:1,createdAt:'2026-10-22T12:00:00Z',localStorage:{},songRecordings:[],customSamples:[]};
  expect(parseLocalBackup(JSON.stringify(backup)).localStorage).toEqual({});
  const r=draft();r.answers=[{questionId:'read-1',choice:0}];const data=JSON.stringify({...emptyAssessmentStore(),results:[r],appliedId:r.id});
  expect(parseLocalBackup(JSON.stringify({...backup,localStorage:{'drum-hero:assessment:v1:profile:one':data}})).localStorage['drum-hero:assessment:v1:profile:one']).toBe(data);
 });
});
