import source from '@/shared/assessment-v1.json';
import { scoreEarAttempt } from './ear-training';
import { patterns } from './curriculum';
import type { Instrument, PatternHit, PracticePattern } from './types';
import type { TrainerRound } from './trainer';

export type AssessmentInput = 'keyboard' | 'touch' | 'midi';
export type AssessmentAdaptation = 'standard' | 'hands-only' | 'single-voice';
export type AssessmentGoal = 'balanced' | 'play-with-others' | 'read-notation' | 'play-expressively';
export type AssessmentQuizFormat = 'visual' | 'audio';
export type AssessmentDomain = 'pulse' | 'subdivisions' | 'coordination' | 'dynamics' | 'transfer' | 'internal-pulse';
export type AssessmentProbe = { id: string; domain: AssessmentDomain; tier: number; name: string; bpm: number; subdivision: 4 | 8 | 12 | 16; hits: PatternHit[]; alternates?: PatternHit[][] };
export type AssessmentQuestion = { id: string; kind: 'listening' | 'reading'; prompt: string; probeId: string; choices: string[]; answer: number };
export const assessmentContent = source as { version: number; rules: typeof source.rules; tempoCheck: { probeId: string; bpms: number[]; minimumScore: number; minimumAccuracy: number; maximumMeanAbsoluteMs: number; retriesPerTempo: number }; probes: AssessmentProbe[]; questions: AssessmentQuestion[]; lessons: typeof source.lessons; focusPatterns: Record<string,string> };
export const ASSESSMENT_KEY = 'drum-hero:assessment:v1';
export const ASSESSMENT_EVENT = 'drum-hero:assessment-change';
export const ASSESSMENT_DRAFT_KEY = 'drum-hero:assessment-draft:v1';
export const ASSESSMENT_DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const assessmentDomains: AssessmentDomain[] = ['pulse', 'subdivisions', 'coordination'];
export type AssessmentHit = { instrument: Instrument; atMs: number; velocity?: number };
export type AssessmentAttempt = { probeId: string; variant?: number; score: number; accuracy: number; meanAbsoluteMs: number | null; meanOffsetMs?: number | null; timingSpreadMs?: number | null; clickOnMeanAbsoluteMs?: number | null; clickOffMeanAbsoluteMs?: number | null; dropoutDriftMs?: number | null; misses: number; extras: number; dynamicsContrast: number | null; passed: boolean };
export type AssessmentTempoAttempt = { bpm: number; score: number; accuracy: number; meanAbsoluteMs?: number | null; meanOffsetMs?: number | null; passed: boolean };
export type AssessmentEducatorComparison = { teacherEstimatedLevel: { pulse: number | null | undefined; subdivisions: number | null | undefined; coordination: number | null | undefined; reading: number | null | undefined }; recommendedLessonFits?: boolean | null; disagreementNotes: string; pilotCode?: string };
export type AssessmentAnswer = { questionId: string; choice: number };
export type AssessmentReflection = { domain: 'pulse'|'subdivisions'|'coordination'; rating: 'easy'|'about-right'|'hard'|'input-issue' };
export type AssessmentConfirmation = { probeId: string; attempt: AssessmentAttempt };
export type AssessmentResult = { version: 1; contentVersion?: number; id: string; playedAt: string; input: AssessmentInput; inputProfile: string; adaptation: AssessmentAdaptation; goal?: AssessmentGoal; quizFormat?: AssessmentQuizFormat; rhythmFirst?: boolean; timingCorrectionMs?: number; timingCalibrated?: boolean; largeNotation?: boolean; slowDemonstration?: boolean; extendedCountIn?: boolean; largePads?: boolean; spokenCountIn?: boolean; hapticCountIn?: boolean; questionIds?: string[]; attempts: AssessmentAttempt[]; confirmations?: AssessmentConfirmation[]; reflections?: AssessmentReflection[]; transferAttempt?: AssessmentAttempt; transferAttemptedAt?: string; transferFollowUpAttempt?: AssessmentAttempt; transferFollowUpAttemptedAt?: string; reportedPracticeMinutes?: number; internalPulseAttempt?: AssessmentAttempt; tempoAttempts?: AssessmentTempoAttempt[]; educatorComparison?: AssessmentEducatorComparison; answers: AssessmentAnswer[]; skipped: string[]; endedEarly: boolean };
export type AssessmentStore = { version: 1; results: AssessmentResult[]; appliedId: string | null };
export const emptyAssessmentStore = (): AssessmentStore => ({ version: 1, results: [], appliedId: null });
export function assessmentProbeVariant(probe: AssessmentProbe, variant: number): AssessmentProbe {
  const alternate = Number.isInteger(variant) && variant > 0 ? probe.alternates?.[variant - 1] : undefined;
  return alternate ? { ...probe, hits: alternate } : probe;
}
function stableSeed(value: string) { return Array.from(value).reduce((hash, character) => Math.imul((hash ^ character.codePointAt(0)!) >>> 0, 0x01000193) >>> 0, 0x811c9dc5); }
function shuffled<T>(items: T[], seed: number): T[] {
  let state = seed >>> 0; const result = [...items];
  for (let i=result.length-1;i>0;i--) { state=(Math.imul(state,1664525)+1013904223)>>>0; const j=Math.floor(state/4294967296*(i+1)); [result[i],result[j]]=[result[j],result[i]]; }
  return result;
}
export function assessmentQuestionsForResult(result: Pick<AssessmentResult, 'id'|'answers'|'quizFormat'|'rhythmFirst'|'questionIds'> & { skipped?: string[] }) {
  if (result.questionIds?.length) {
    const selected = result.questionIds.flatMap(id => { const question=assessmentContent.questions.find(item=>item.id===id); return question?[question]:[]; });
    if (selected.length === result.questionIds.length) return selected;
  }
  const seed = stableSeed(result.id);
  const listening = shuffled(assessmentContent.questions.filter(q=>q.kind==='listening'), seed + 17).slice(0,2);
  const reading = shuffled(assessmentContent.questions.filter(q=>q.kind==='reading'), seed + 31).slice(0,2);
  let selected = result.quizFormat === 'audio' || result.rhythmFirst
    ? shuffled(assessmentContent.questions.filter(q=>q.kind==='listening'), seed + 17)
    : [listening[0], reading[0], listening[1], reading[1]].filter((q): q is AssessmentQuestion => !!q);
  // Keep answered and skipped items visible when old saved results use a previous selection seed.
  const preserved = [...new Set([...result.answers.map(answer=>answer.questionId),...(result.skipped??[])])].flatMap(id=>{const question=assessmentContent.questions.find(q=>q.id===id);return question?[question]:[];});
  selected = [...preserved,...selected.filter(question=>!preserved.some(old=>old.id===question.id))].slice(0,8);
  return selected;
}
export function assessmentReadingSummary(result:AssessmentResult){
  const questions=assessmentQuestionsForResult(result).filter(question=>question.kind==='reading');
  const answers=result.answers.filter(answer=>questions.some(question=>question.id===answer.questionId));
  const correct=answers.filter(answer=>questions.some(question=>question.id===answer.questionId&&question.answer===answer.choice)).length;
  const tier=questions.length>0&&answers.length===questions.length?Math.min(3,Math.round(2*correct/questions.length)+1):null;
  const byDomain=Object.fromEntries(assessmentDomains.map(domain=>{
    const rows=questions.filter(question=>question.probeId.startsWith(`${domain}-`));
    const domainAnswers=answers.filter(answer=>rows.some(question=>question.id===answer.questionId));
    return [domain,{correct:domainAnswers.filter(answer=>rows.some(question=>question.id===answer.questionId&&question.answer===answer.choice)).length,answered:domainAnswers.length,total:rows.length}];
  })) as Record<typeof assessmentDomains[number],{correct:number;answered:number;total:number}>;
  return {tier,correct,answered:answers.length,total:questions.length,byDomain,provisional:assessmentDomains.some(domain=>byDomain[domain].total===1)};
}
function assessmentReadingConcern(result:AssessmentResult){
  const questions=assessmentQuestionsForResult(result).filter(question=>question.kind==='reading');
  for(const domain of assessmentDomains){
    const rows=questions.filter(question=>question.probeId.startsWith(`${domain}-`));
    const answers=result.answers.filter(answer=>rows.some(question=>question.id===answer.questionId));
    const correct=answers.filter(answer=>rows.some(question=>question.id===answer.questionId&&question.answer===answer.choice)).length;
    if(answers.length&&answers.length-correct>correct){
      const answer=answers.find(item=>rows.some(question=>question.id===item.questionId&&question.answer!==item.choice));
      if(answer){const question=rows.find(item=>item.id===answer.questionId);if(question)return {question,answer};}
    }
  }
  return null;
}
export function selectAssessmentQuestions(id: string, quizFormat: AssessmentQuizFormat | undefined, history: AssessmentResult[] = []) {
  const seed=stableSeed(id);
  const listening=shuffled(assessmentContent.questions.filter(q=>q.kind==='listening'),seed+17);
  const reading=shuffled(assessmentContent.questions.filter(q=>q.kind==='reading'),seed+31);
  const prior=new Set(history.flatMap(row=>row.questionIds??assessmentQuestionsForResult(row).map(q=>q.id)));
  const choose=(pool:AssessmentQuestion[],count:number)=>[...pool.filter(q=>!prior.has(q.id)),...pool.filter(q=>prior.has(q.id))].slice(0,count);
  if(quizFormat==='audio')return choose(listening,4).map(q=>q.id);
  const audio=choose(listening,2);
  const readingPool=choose(reading,reading.length);
  const notation:AssessmentQuestion[]=[];
  for(const domain of assessmentDomains){const item=readingPool.find(question=>question.probeId.startsWith(`${domain}-`)&&!notation.some(selected=>selected.id===question.id));if(item)notation.push(item);}
  for(const item of readingPool)if(notation.length<3&&!notation.some(selected=>selected.id===item.id))notation.push(item);
  notation.splice(3);
  return [audio[0],notation[0],audio[1],notation[1],notation[2]].filter((question):question is AssessmentQuestion=>!!question).map(q=>q.id);
}
export function assessmentReadingFollowUpQuestion(result: AssessmentResult, answeredQuestionId: string, history: AssessmentResult[] = []) {
  if (result.quizFormat === 'audio' || result.rhythmFirst || !result.questionIds?.length) return null;
  const question=assessmentContent.questions.find(item=>item.id===answeredQuestionId&&item.kind==='reading');
  const answer=result.answers.find(item=>item.questionId===answeredQuestionId);
  if(!question||!answer)return null;
  const domain=assessmentDomains.find(item=>question.probeId.startsWith(`${item}-`));
  if(!domain||!result.attempts.some(attempt=>attempt.probeId.startsWith(`${domain}-`)))return null;
  const current=assessmentQuestionsForResult(result);
  if(current.filter(item=>item.kind==='reading'&&item.probeId.startsWith(`${domain}-`)).length>=2)return null;
  const tier=assessmentTier(result,domain), correct=answer.choice===question.answer;
  if(!((tier>=2&&!correct)||(tier<=1&&correct)))return null;
  const used=new Set(result.questionIds);
  const candidates=assessmentContent.questions.filter(item=>item.kind==='reading'&&item.probeId.startsWith(`${domain}-`)&&!used.has(item.id));
  if(!candidates.length)return null;
  const prior=new Set(history.flatMap(row=>row.questionIds??assessmentQuestionsForResult(row).map(item=>item.id)));
  const ordered=shuffled(candidates,stableSeed(`${result.id}:${question.id}:reading-follow-up`));
  return ordered.find(item=>!prior.has(item.id))??ordered[0];
}
export function assessmentQuestionChoiceSeed(result: Pick<AssessmentResult, 'id'>, question: AssessmentQuestion) {
  return stableSeed(result.id) + Math.max(0, assessmentContent.questions.findIndex(candidate=>candidate.id===question.id));
}
export function assessmentPattern(probe: AssessmentProbe, adaptation: AssessmentAdaptation, bars = 4): PracticePattern {
  // Move the foot to a distinct hand voice; never merge simultaneous targets.
  const hits = probe.hits.map(h => ({ ...h, instrument: adaptation === 'hands-only' && h.instrument === 'kick' ? 'tom' as const : h.instrument }));
  const steps = probe.subdivision;
  return { id: `assessment-${probe.id}-${adaptation}`, name: probe.name, level: 'Beginner', description: 'Assessment probe', beats: bars * 4, subdivision: probe.subdivision, defaultBpm: probe.bpm, tempoRange: [60, 90], hits: Array.from({ length: bars }, (_, bar) => hits.map(h => ({ ...h, step: h.step + bar * steps }))).flat() };
}
function median(values: number[]) { const sorted = [...values].sort((a,b) => a-b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i-1] + sorted[i]) / 2; }
export function passedAssessment(attempt: Omit<AssessmentAttempt, 'passed'>) {
  const rules = assessmentContent.rules;
  return attempt.probeId === 'internal-pulse-1'
    ? attempt.accuracy >= rules.pulseDropoutAccuracy && attempt.clickOffMeanAbsoluteMs != null && attempt.clickOffMeanAbsoluteMs <= rules.meanAbsoluteMs && attempt.dropoutDriftMs != null && Math.abs(attempt.dropoutDriftMs) <= rules.pulseDropoutDriftMs
    : attempt.probeId === 'dynamics-1'
    ? attempt.accuracy >= rules.dynamicsAccuracy && attempt.dynamicsContrast !== null && attempt.dynamicsContrast >= rules.dynamicsContrast
    : attempt.score >= rules.score && attempt.meanAbsoluteMs !== null && attempt.meanAbsoluteMs <= rules.meanAbsoluteMs;
}
export function scoreAssessment(probe: AssessmentProbe, adaptation: AssessmentAdaptation, hits: AssessmentHit[], variant = 0): AssessmentAttempt {
  const pattern = assessmentPattern(probe, adaptation);
  const validHits = hits.filter(h => Number.isFinite(h.atMs) && ['kick','snare','hihat','tom','crash'].includes(h.instrument)).slice(0, 10000);
  const { rated, summary } = scoreEarAttempt(pattern, probe.bpm, validHits);
  const signedOffsets = rated.flatMap(h => h.offsetMs === null ? [] : [h.offsetMs]);
  const offsets = signedOffsets.map(Math.abs);
  const meanOffsetMs = signedOffsets.length ? signedOffsets.reduce((a,b)=>a+b,0)/signedOffsets.length : null;
  const timingSpreadMs = meanOffsetMs === null ? null : Math.sqrt(signedOffsets.reduce((sum,offset)=>sum+(offset-meanOffsetMs)**2,0)/signedOffsets.length);
  let clickOnMeanAbsoluteMs: number | null | undefined;
  let clickOffMeanAbsoluteMs: number | null | undefined;
  let dropoutDriftMs: number | null | undefined;
  if (probe.domain === 'internal-pulse') {
    const boundary = probe.subdivision * 2;
    const on = rated.filter(hit => hit.step !== undefined && hit.step < boundary && hit.offsetMs !== null).map(hit => hit.offsetMs!);
    const off = rated.filter(hit => hit.step !== undefined && hit.step >= boundary && hit.offsetMs !== null).map(hit => hit.offsetMs!);
    const mean = (values: number[]) => values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : null;
    const onMean = mean(on), offMean = mean(off);
    clickOnMeanAbsoluteMs = on.length ? on.reduce((sum,value)=>sum+Math.abs(value),0)/on.length : null;
    clickOffMeanAbsoluteMs = off.length ? off.reduce((sum,value)=>sum+Math.abs(value),0)/off.length : null;
    dropoutDriftMs = onMean === null || offMean === null ? null : offMean - onMean;
  }
  let dynamicsContrast: number | null = null;
  if (probe.domain === 'dynamics') {
    // Reuse the same nearest-unmatched matching, retaining velocities for matched targets.
    const remaining = pattern.hits.map(h => ({ ...h, at: h.step * 60000 / probe.bpm * 4 / probe.subdivision, matched: false }));
    const soft: number[] = [], accents: number[] = [];
    for (const hit of [...validHits].sort((a,b) => a.atMs-b.atMs)) {
      const closest = remaining.filter(h => !h.matched && h.instrument === hit.instrument).sort((a,b) => Math.abs(a.at-hit.atMs)-Math.abs(b.at-hit.atMs))[0];
      if (!closest || Math.abs(closest.at-hit.atMs) > 100) continue;
      closest.matched = true;
      if (Number.isInteger(hit.velocity) && hit.velocity! > 0 && hit.velocity! <= 127) (closest.accent ? accents : soft).push(hit.velocity!);
    }
    if (soft.length >= 2 && accents.length >= 2 && new Set([...soft,...accents]).size > 1) dynamicsContrast = median(accents)-median(soft);
  }
  const attempt = { probeId: probe.id, variant, score: summary.score, accuracy: summary.accuracy, meanAbsoluteMs: offsets.length ? offsets.reduce((a,b) => a+b,0)/offsets.length : null, meanOffsetMs, timingSpreadMs, ...(probe.domain === 'internal-pulse' ? { clickOnMeanAbsoluteMs, clickOffMeanAbsoluteMs, dropoutDriftMs } : {}), misses: summary.miss, extras: summary.extra, dynamicsContrast };
  return { ...attempt, passed: passedAssessment(attempt) };
}
export function assessmentTier(result: AssessmentResult, domain: AssessmentDomain) { return Math.max(0, ...result.attempts.filter(a => a.passed && a.probeId.startsWith(`${domain}-`)).map(a => Number(a.probeId.split('-')[1]))); }
function fastTrackTriggered(result: AssessmentResult, domain: AssessmentDomain) {
  const first = assessmentContent.probes.find(probe => probe.domain === domain && probe.tier === 1);
  const attempt = first && result.attempts.find(row => row.probeId === first.id);
  return !!attempt && attempt.passed && attempt.score >= assessmentContent.rules.fastTrackScore && attempt.meanAbsoluteMs !== null && attempt.meanAbsoluteMs <= assessmentContent.rules.fastTrackMeanAbsoluteMs;
}
export function fastTrackedProbeIds(result: AssessmentResult) {
  return assessmentDomains.flatMap(domain => {
    if (!fastTrackTriggered(result, domain)) return [];
    const middle = assessmentContent.probes.find(probe => probe.domain === domain && probe.tier === 2);
    const challenge = assessmentContent.probes.find(probe => probe.domain === domain && probe.tier === 3);
    return middle && challenge && result.attempts.some(row => row.probeId === challenge.id) && !result.attempts.some(row => row.probeId === middle.id) ? [middle.id] : [];
  });
}
export type AssessmentConfidence = 'not-tested' | 'limited-evidence' | 'tentative' | 'supported';
export function assessmentConfidence(result: AssessmentResult, domain: AssessmentDomain): AssessmentConfidence {
  const attempts = result.attempts.filter(a => a.probeId.startsWith(`${domain}-`));
  if (!attempts.length) return 'not-tested';
  if (fastTrackedProbeIds(result).some(id => id.startsWith(`${domain}-`))) return 'tentative';
  const passed = attempts.filter(a => a.passed);
  if (!passed.length) return 'limited-evidence';
  const distinctPassed = new Set(passed.map(a => a.probeId)).size;
  const strongest = passed.filter(a => Number(a.probeId.split('-')[1]) === assessmentTier(result, domain)).at(-1)!;
  const comfortablyClear = strongest.score >= 90 && strongest.meanAbsoluteMs !== null && strongest.meanAbsoluteMs <= 45;
  return distinctPassed >= 2 && attempts.every(a => a.passed) && comfortablyClear ? 'supported' : 'tentative';
}
export function assessmentGoalLabel(goal: AssessmentGoal | undefined) {
  switch (goal ?? 'balanced') {
    case 'play-with-others': return 'Play with others';
    case 'read-notation': return 'Read drum notation';
    case 'play-expressively': return 'Play expressively';
    default: return 'Build a balanced foundation';
  }
}
export function nextAssessmentProbe(result: AssessmentResult): AssessmentProbe | null {
  for (const domain of [...assessmentDomains, ...(result.input === 'midi' ? ['dynamics' as const] : [])]) {
    if (domain === 'coordination' && result.adaptation === 'single-voice') continue;
    for (const probe of assessmentContent.probes.filter(p => p.domain === domain)) {
      if (result.skipped.includes(probe.id)) break;
      const attempts = result.attempts.filter(a => a.probeId === probe.id);
      if (fastTrackTriggered(result, domain) && probe.tier === 2) {
        const challenge = assessmentContent.probes.find(p => p.domain === domain && p.tier === 3);
        const challengeAttempts = challenge ? result.attempts.filter(a => a.probeId === challenge.id) : [];
        if (challengeAttempts.length < 2 || challengeAttempts.some(a => a.passed)) continue;
      }
      if (attempts.some(a => a.passed)) continue;
      if (attempts.length >= 2 || (domain === 'dynamics' && attempts.length)) break;
      return probe;
    }
  }
  return null;
}
export function assessmentProbeVariantIndex(result: AssessmentResult, probe: AssessmentProbe) {
  const alternatives = probe.alternates?.length ?? 0;
  if (!alternatives) return 0;
  const retries = result.attempts.filter(attempt=>attempt.probeId===probe.id).length;
  return ((stableSeed(result.id) + retries) >>> 0) % (alternatives + 1);
}
export function assessmentBorderlineAttempts(result: AssessmentResult) {
  const confirmed=new Set((result.confirmations??[]).map(row=>row.probeId));
  const latestByProbe=new Map<string,AssessmentAttempt>();
  for(const attempt of result.attempts)latestByProbe.set(attempt.probeId,attempt);
  return [...latestByProbe].flatMap(([probeId,attempt])=>{
    const probe=assessmentContent.probes.find(row=>row.id===probeId);
    if(!probe||!['pulse','subdivisions','coordination'].includes(probe.domain)||confirmed.has(probeId))return[];
    const nearScore=Math.abs(attempt.score-assessmentContent.rules.score)<=5;
    const nearTiming=attempt.meanAbsoluteMs!==null&&Math.abs(attempt.meanAbsoluteMs-assessmentContent.rules.meanAbsoluteMs)<=5;
    return nearScore||nearTiming?[{probe,attempt}]:[];
  });
}
export function assessmentConfirmationVariant(result:AssessmentResult,probe:AssessmentProbe,originalVariant=0){
  const forms=(probe.alternates?.length??0)+1;
  return forms>1?(originalVariant+1)%forms:0;
}
export function assessmentConfirmationLabel(original:AssessmentAttempt,confirmation:AssessmentAttempt){
  return original.passed===confirmation.passed?'Consistent on the follow-up check':'Results differed on the follow-up check';
}
export function assessmentRecommendation(result: AssessmentResult): string | null {
  if (!result.attempts.length && !result.answers.length && !result.internalPulseAttempt) return null;
  const has = (domain: AssessmentDomain) => result.attempts.some(a => a.probeId.startsWith(`${domain}-`));
  const wrongReading = !!assessmentReadingConcern(result);
  const dynamicsNeedsPractice = result.attempts.some(a => a.probeId === 'dynamics-1' && a.dynamicsContrast !== null && !a.passed);
  if (result.internalPulseAttempt && !result.internalPulseAttempt.passed) return 'count-the-grid';
  if (result.goal === 'read-notation' && result.quizFormat !== 'audio' && result.answers.some(a => assessmentContent.questions.some(q => q.id === a.questionId && q.kind === 'reading'))) return 'count-the-grid';
  if (has('pulse') && assessmentTier(result, 'pulse') < 1) return 'count-the-grid';
  if (result.goal === 'play-with-others' && result.adaptation !== 'single-voice' && has('coordination') && assessmentTier(result, 'coordination') < 1) return 'first-backbeat';
  if (result.goal === 'play-expressively' && dynamicsNeedsPractice && assessmentTier(result, 'pulse') >= 1) return 'dynamic-arc';
  if (wrongReading) return 'count-the-grid';
  if ((has('pulse') && assessmentTier(result,'pulse') < 2) || wrongReading) return 'count-the-grid';
  if (has('coordination') && assessmentTier(result,'coordination') < 1) return 'first-backbeat';
  if (has('subdivisions') && assessmentTier(result,'subdivisions') < 3) return 'sixteenth-control';
  if ((has('pulse') && assessmentTier(result,'pulse') < 3) || (has('coordination') && assessmentTier(result,'coordination') < 2)) return 'syncopated-pocket';
  if (has('coordination') && assessmentTier(result,'coordination') < 3) return 'limb-independence';
  if (dynamicsNeedsPractice) return 'dynamic-arc';
  return has('coordination') ? 'limb-independence' : 'count-the-grid';
}
export function assessmentRecommendationReason(result: AssessmentResult): string {
  switch (assessmentRecommendation(result)) {
    case 'count-the-grid': return 'Your assessment points to pulse or reading practice.';
    case 'first-backbeat': return 'Your assessment points to basic coordination practice.';
    case 'sixteenth-control': return 'Your assessment points to subdivision practice.';
    case 'syncopated-pocket': return 'Your assessment points to syncopated groove practice.';
    case 'limb-independence': return 'Your assessment points to limb coordination.';
    case 'dynamic-arc': return 'Your assessment points to dynamic control.';
    default: return 'Your assessment suggests repeating a short practice round.';
  }
}
export function assessmentRecommendationDetails(result: AssessmentResult) {
  const lessonId = assessmentRecommendation(result);
  if (!lessonId) return null;
  const question = assessmentReadingConcern(result)?.question;
  let domain: AssessmentDomain = 'pulse';
  if (lessonId==='first-backbeat'||lessonId==='limb-independence') domain='coordination';
  else if (lessonId==='sixteenth-control') domain='subdivisions';
  else if (lessonId==='dynamic-arc') domain='dynamics';
  else if (lessonId==='syncopated-pocket' && assessmentTier(result,'pulse')>=3) domain='coordination';
  const latest = result.attempts.filter(a=>a.probeId.startsWith(`${domain}-`)).at(-1);
  const probe = latest ? assessmentContent.probes.find(p=>p.id===latest.probeId) : undefined;
  const dropout = result.internalPulseAttempt && !result.internalPulseAttempt.passed ? result.internalPulseAttempt : null;
  const evidence = dropout && lessonId==='count-the-grid' ? `Metronome dropout check: ${dropout.accuracy}% matched; timing drifted ${Math.round(Math.abs(dropout.dropoutDriftMs??0))} ms after the click stopped.` : question ? `${question.prompt} Correct answer: ${question.choices[question.answer]}.` : latest && probe ? `${probe.name}: ${latest.accuracy}% matched, ${latest.misses} missed, ${latest.extras} extra${latest.meanOffsetMs===undefined||latest.meanOffsetMs===null?'':`, average ${latest.meanOffsetMs>0?'late':latest.meanOffsetMs<0?'early':'on time'} by ${Math.round(Math.abs(latest.meanOffsetMs))} ms`}${latest.timingSpreadMs===undefined||latest.timingSpreadMs===null?'':`, timing spread ${Math.round(latest.timingSpreadMs)} ms`}.` : 'This is the earliest skill in the starting path without enough evidence yet.';
  const goal = dropout && lessonId==='count-the-grid' ? `Keep matched timing error at or below ${assessmentContent.rules.meanAbsoluteMs} ms and drift at or below ${assessmentContent.rules.pulseDropoutDriftMs} ms through two quiet bars.` : lessonId==='dynamic-arc' ? `Match at least ${assessmentContent.rules.dynamicsAccuracy}% of strokes with velocity contrast of ${assessmentContent.rules.dynamicsContrast} or more.` : lessonId==='count-the-grid' && question ? 'Identify the rhythms in the notation questions, then demonstrate pulse tier 2.' : `Reach a score of ${assessmentContent.rules.score} or higher with mean absolute timing error at or below ${assessmentContent.rules.meanAbsoluteMs} ms on the next ${domain} probe.`;
  return { lessonId, evidence, goal, learnerGoal: assessmentGoalLabel(result.goal) };
}
function recommendationDomain(lessonId: string): AssessmentDomain {
  if (lessonId === 'first-backbeat' || lessonId === 'limb-independence') return 'coordination';
  if (lessonId === 'sixteenth-control') return 'subdivisions';
  if (lessonId === 'dynamic-arc') return 'dynamics';
  return 'pulse';
}
export function assessmentPracticeTip(result: AssessmentResult): string {
  const lesson = assessmentRecommendation(result);
  if (!lesson) return 'Complete one short task to get a focused practice tip.';
  const domain = lesson === 'syncopated-pocket' && assessmentTier(result, 'pulse') >= 3 ? 'coordination' : recommendationDomain(lesson);
  const latest = result.attempts.filter(a => a.probeId.startsWith(`${domain}-`)).at(-1);
  if (!latest) return `Start slowly and count each beat aloud while you practice ${domain}.`;
  if (latest.extras > 0 && latest.extras >= latest.misses) return 'Leave every unmarked space quiet. Count through the rests before adding more notes.';
  if (latest.misses > 0) return 'Keep the tempo comfortable and count aloud. Add the missed notes only after the pulse feels steady.';
  if ((latest.timingSpreadMs ?? 0) > 55) return 'Relax your hands and aim for even spacing. A smaller timing spread means steadier notes.';
  if ((latest.meanOffsetMs ?? 0) > 18) return 'Your notes tended to arrive late. Stay close to the count-in and let the beat carry you.';
  if ((latest.meanOffsetMs ?? 0) < -18) return 'Your notes tended to arrive early. Let the beat land before each stroke.';
  return `Your timing was steady on this task. Practice ${lesson.replaceAll('-', ' ')} at an easy tempo, then build speed gradually.`;
}
export function assessmentMicroPractice(result:AssessmentResult){
  const lessonId=assessmentRecommendation(result);
  const domain=lessonId==='first-backbeat'||lessonId==='limb-independence'||lessonId==='syncopated-pocket'&&assessmentTier(result,'pulse')>=3?'coordination':lessonId==='sixteenth-control'?'subdivisions':lessonId==='dynamic-arc'?'dynamics':'pulse';
  const latest=[...result.attempts].reverse().find(attempt=>attempt.probeId.startsWith(`${domain}-`));
  const baseProbe=latest?assessmentContent.probes.find(item=>item.id===latest.probeId):undefined;
  const probe=baseProbe?assessmentProbeVariant(baseProbe,latest?.variant??0):undefined;
  const reportedHard=result.reflections?.some(row=>row.domain===domain&&row.rating==='hard')??false;
  const bpm=Math.max(50,Math.round(((probe?.bpm??72)*(reportedHard?0.75:0.85))/5)*5);
  const notes=probe?.hits??[];
  const measuredVoice=notes.length?notes.reduce((best,hit)=>notes.filter(other=>other.instrument===hit.instrument).length>notes.filter(other=>other.instrument===best).length?hit.instrument:best,notes[0].instrument):null;
  const voice=result.adaptation==='single-voice'?'snare':result.adaptation==='hands-only'&&measuredVoice==='kick'?'tom':measuredVoice;
  const focus=latest&&latest.extras>0&&latest.extras>=latest.misses?'Count through the rests; keep unmarked spaces quiet.':latest&&latest.misses>0?'Count aloud, then add the missed strokes only after the pulse feels steady.':latest&&(latest.timingSpreadMs??0)>55?'Aim for even spacing and relaxed strokes.':latest&&(latest.meanOffsetMs??0)>18?'Wait for the beat; your notes tended late.':latest&&(latest.meanOffsetMs??0)<-18?'Let the beat land before the stroke; your notes tended early.':'Play the groove evenly and build speed only when it feels comfortable.';
  return {durationSeconds:60,bpm,domain,voice,focus,probe:probe?{...probe,bpm}:undefined,steps:[`0–20 seconds: count the pulse aloud at ${bpm} BPM.`,`20–40 seconds: read and practice the notation one bar at a time; ${focus}`,`40–60 seconds: play the full notated groove while keeping the same pulse.`]};
}
export function assessmentTransferProbe() { return assessmentContent.probes.find(probe => probe.id === 'transfer-1') ?? null; }
export function assessmentTransferVariant(result: AssessmentResult) {
  const probe = assessmentTransferProbe();
  return probe ? stableSeed(result.id) % ((probe.alternates?.length ?? 0) + 1) : 0;
}
export function assessmentTransferFollowUpVariant(result: AssessmentResult) {
  const probe=assessmentTransferProbe();
  if(!probe||!result.transferAttempt)return assessmentTransferVariant(result);
  const forms=(probe.alternates?.length??0)+1;
  return forms>1?((result.transferAttempt.variant??assessmentTransferVariant(result))+1)%forms:0;
}
export function assessmentInternalPulseProbe() { return assessmentContent.probes.find(probe => probe.id === 'internal-pulse-1') ?? null; }
export function assessTempoProgress(result: Pick<AssessmentResult, 'tempoAttempts'>) {
  const { bpms, retriesPerTempo } = assessmentContent.tempoCheck;
  let highestBpm: number | null = null;
  let nextBpm: number | null = null;
  for (const bpm of bpms) {
    const rows = (result.tempoAttempts ?? []).filter(row => row.bpm === bpm);
    if (rows.some(row => row.passed)) { highestBpm = bpm; continue; }
    if (rows.length <= retriesPerTempo) nextBpm = bpm;
    break;
  }
  return { highestBpm, nextBpm, complete: nextBpm === null, attempts: result.tempoAttempts ?? [] };
}
export function scoreTempoAttempt(bpm: number, attempt: AssessmentAttempt): AssessmentTempoAttempt {
  const rules = assessmentContent.tempoCheck;
  const passed = rules.bpms.includes(bpm) && attempt.score >= rules.minimumScore && attempt.accuracy >= rules.minimumAccuracy && attempt.meanAbsoluteMs != null && attempt.meanAbsoluteMs <= rules.maximumMeanAbsoluteMs;
  return { bpm, score: attempt.score, accuracy: attempt.accuracy, meanAbsoluteMs: attempt.meanAbsoluteMs ?? null, meanOffsetMs: attempt.meanOffsetMs ?? null, passed };
}
export function updateAssessmentResult(store: AssessmentStore, result: AssessmentResult): AssessmentStore {
  const next = appendAssessment(store, result);
  return { ...next, results: next.results.map(row => row.id === result.id ? result : row) };
}
export function assessmentQuality(result: AssessmentResult) {
  const expected = assessmentContent.probes.filter(probe =>
    ['pulse','subdivisions','coordination'].includes(probe.domain) && !(result.adaptation === 'single-voice' && probe.domain === 'coordination') ||
    probe.domain === 'dynamics' && result.input === 'midi'
  );
  const questionIds = new Set(assessmentQuestionsForResult(result).map(question => question.id));
  const attempted = new Set(result.attempts.filter(attempt => expected.some(probe => probe.id === attempt.probeId)).map(attempt => attempt.probeId));
  const answered = result.answers.filter(answer => questionIds.has(answer.questionId)).length;
  const evidenceTasks = attempted.size + answered;
  const accelerated = fastTrackedProbeIds(result);
  const expectedTasks = expected.length + questionIds.size - accelerated.filter(id => expected.some(probe => probe.id === id)).length;
  const rows = result.attempts.filter(attempt => expected.some(probe => probe.id === attempt.probeId));
  const flags: string[] = [];
  if (evidenceTasks < expectedTasks || result.skipped.length || result.endedEarly) flags.push(`Limited coverage: ${evidenceTasks} of ${expectedTasks} core tasks produced evidence. Skipped and untested tasks remain unknown.`);
  if (rows.some(attempt => attempt.accuracy < 60 || attempt.score < 50)) flags.push('Some tasks had very few matched hits. Check input mapping and timing correction before interpreting those results.');
  if (rows.some(attempt => (attempt.score >= assessmentContent.rules.score - 5 && attempt.score <= assessmentContent.rules.score + 5) || (attempt.meanAbsoluteMs !== null && attempt.meanAbsoluteMs >= assessmentContent.rules.meanAbsoluteMs - 5 && attempt.meanAbsoluteMs <= assessmentContent.rules.meanAbsoluteMs + 5))) flags.push('Some scores were close to a cutoff. A retake after checking calibration may give a clearer estimate.');
  if (rows.some(attempt => rows.filter(other => other.probeId === attempt.probeId).length > 1)) flags.push('At least one skill needed a retry; treat that tier as tentative.');
  if (result.timingCorrectionMs !== undefined && Math.abs(result.timingCorrectionMs) >= 80) flags.push(`A large timing correction (${Math.round(result.timingCorrectionMs)} ms) was active. Compare retakes with the same setup.`);
  if (result.timingCalibrated === false) flags.push('Timing was not calibrated for this input profile. Device latency may affect comparisons; calibrate before interpreting close results.');
  if (accelerated.length) flags.push('A strong early result skipped an intermediate probe. That tier remains untested; the harder probe gives a faster placement estimate.');
  if (!flags.length) flags.push('Broad coverage with no obvious input or cutoff warning. This remains a starting-point estimate.');
  return { evidenceTasks, expectedTasks, flags, level: evidenceTasks < expectedTasks || rows.some(attempt => attempt.accuracy < 60 || attempt.score < 50) ? 'limited' as const : result.timingCalibrated === false || accelerated.length || flags.length > 1 ? 'review' as const : 'broad' as const };
}
export function parseAssessmentDraft(raw: string | null, now = Date.now()): AssessmentResult | null {
  try {
    const checkpoint = JSON.parse(raw ?? 'null') as { version?: unknown; savedAt?: unknown; result?: unknown } | null;
    if (!checkpoint || checkpoint.version !== 1 || typeof checkpoint.savedAt !== 'string' || !Number.isFinite(Date.parse(checkpoint.savedAt)) || now - Date.parse(checkpoint.savedAt) > ASSESSMENT_DRAFT_TTL_MS || now < Date.parse(checkpoint.savedAt) - 60_000) return null;
    return validResult(checkpoint.result) && !checkpoint.result.endedEarly ? checkpoint.result : null;
  } catch { return null; }
}
export function serializeAssessmentDraft(result: AssessmentResult, savedAt = new Date().toISOString()) {
  return JSON.stringify({ version: 1, savedAt, result });
}
export function assessmentEducatorReview(result: AssessmentResult, practiceContext: { rounds: number; minutes: number | null } | null = null) {
  const questions = assessmentQuestionsForResult(result);
  const readingTier = assessmentReadingSummary(result).tier;
  const transferStart=Date.parse(result.transferAttemptedAt??''),transferEnd=Date.parse(result.transferFollowUpAttemptedAt??'');
  const transferElapsedSeconds=Number.isFinite(transferStart)&&Number.isFinite(transferEnd)&&transferEnd>=transferStart?Math.round((transferEnd-transferStart)/1000):null;
  return {
    format: 'drum-hero-assessment-review', version: 1,
    input: result.input, adaptation: result.adaptation, goal: assessmentGoalLabel(result.goal), quizFormat: result.quizFormat ?? 'visual', accessibilityOptions:{rhythmFirst:result.rhythmFirst??false,largeNotation:result.largeNotation??false,slowDemonstration:result.slowDemonstration??false,extendedCountIn:result.extendedCountIn??false,largePads:result.largePads??false,spokenCountIn:result.spokenCountIn??false,hapticCountIn:result.hapticCountIn??false}, timingCorrectionMs: result.timingCorrectionMs ?? null, timingCalibrated: result.timingCalibrated ?? null, pilotCode: result.educatorComparison?.pilotCode?.trim() || null, recommendedLesson: assessmentRecommendation(result), appTiers: { ...Object.fromEntries(assessmentDomains.map(domain => [domain, result.attempts.some(attempt=>attempt.probeId.startsWith(`${domain}-`)) ? assessmentTier(result, domain) : null])), reading: readingTier }, readingSummary:assessmentReadingSummary(result), endedEarly: result.endedEarly,
    contentVersion: result.contentVersion ?? null,
    attempts: result.attempts.map(attempt=>({
      probeId: attempt.probeId, task: assessmentContent.probes.find(probe=>probe.id===attempt.probeId)?.name ?? attempt.probeId,
      domain: assessmentContent.probes.find(probe=>probe.id===attempt.probeId)?.domain ?? 'unknown',
      tier: assessmentContent.probes.find(probe=>probe.id===attempt.probeId)?.tier ?? 0,
      variant: attempt.variant ?? 0, score: attempt.score, matchedPercent: attempt.accuracy, misses: attempt.misses, extras: attempt.extras,
      meanAbsoluteMs: attempt.meanAbsoluteMs, meanOffsetMs: attempt.meanOffsetMs ?? null, timingSpreadMs: attempt.timingSpreadMs ?? null,
      dynamicsContrast: attempt.dynamicsContrast, passed: attempt.passed
    })),
    transfer: result.transferAttempt ? { task: 'Fresh groove pre-practice baseline', ...result.transferAttempt } : null,
    transferFollowUp: result.transferFollowUpAttempt ? { task: 'Fresh groove after-practice check', elapsedSinceBaselineSeconds: transferElapsedSeconds, trainerPracticeRounds: practiceContext?.rounds ?? null, trainerPracticeMinutes: practiceContext?.minutes ?? null, reportedPracticeMinutes: result.reportedPracticeMinutes ?? null, ...result.transferFollowUpAttempt } : null,
    internalPulse: result.internalPulseAttempt ? { task: 'Metronome dropout pulse check', ...result.internalPulseAttempt } : null,
    tempoCheck: (result.tempoAttempts?.length ?? 0) ? { highestDemonstratedBpm: assessTempoProgress(result).highestBpm, attempts: result.tempoAttempts } : null,
    confirmations: (result.confirmations??[]).map(row=>({probeId:row.probeId,passed:row.attempt.passed,score:row.attempt.score,matchedPercent:row.attempt.accuracy,meanAbsoluteMs:row.attempt.meanAbsoluteMs})),
    educatorComparisonTemplate: { scale: ['not assessed', 'needs foundation', 'developing', 'independent'], ...(result.educatorComparison ?? { teacherEstimatedLevel: { pulse: null, subdivisions: null, coordination: null, reading: null }, recommendedLessonFits: null, disagreementNotes: '' }) },
    learnerFeedback: result.reflections ?? [],
    questions: questions.map(question=>{
      const answer=result.answers.find(row=>row.questionId===question.id);
      return { itemId: question.id, kind: question.kind, prompt: question.prompt, readingDomain: question.kind==='reading'?question.probeId.split('-')[0]:null, choices: question.choices, selectedChoice: answer?.choice ?? null, answer: question.answer, correct: answer ? answer.choice===question.answer : null };
    })
  };
}
export function assessmentComparison(result: AssessmentResult, history: AssessmentResult[]) {
  const currentDate = Date.parse(result.playedAt);
  const previous = history.filter(row=>row.id!==result.id&&row.inputProfile===result.inputProfile&&row.adaptation===result.adaptation&&row.contentVersion===result.contentVersion&&row.quizFormat===result.quizFormat&&row.timingCalibrated===result.timingCalibrated&&row.rhythmFirst===result.rhythmFirst&&row.largeNotation===result.largeNotation&&row.slowDemonstration===result.slowDemonstration&&row.extendedCountIn===result.extendedCountIn&&row.largePads===result.largePads&&row.spokenCountIn===result.spokenCountIn&&row.hapticCountIn===result.hapticCountIn&&Math.abs((row.timingCorrectionMs??0)-(result.timingCorrectionMs??0))<10&&Date.parse(row.playedAt)<currentDate).sort((a,b)=>Date.parse(b.playedAt)-Date.parse(a.playedAt))[0];
  if (!previous) return null;
  const summary = assessmentDomains.flatMap(domain=>{
    const currentAttempt = result.attempts.some(a=>a.probeId.startsWith(`${domain}-`));
    const previousAttempt = previous.attempts.some(a=>a.probeId.startsWith(`${domain}-`));
    if (!currentAttempt && !previousAttempt) return [];
    if(!currentAttempt||!previousAttempt)return [`${domain}: ${previousAttempt?`${assessmentTier(previous,domain)}/3`: 'untested'} → ${currentAttempt?`${assessmentTier(result,domain)}/3`: 'untested'}`];
    const latest=(row:AssessmentResult)=>[...row.attempts].reverse().find(attempt=>attempt.probeId.startsWith(`${domain}-`));
    const before=latest(previous),after=latest(result);
    const stats:string[]=[`${domain}: ${assessmentTier(previous,domain)}/3 → ${assessmentTier(result,domain)}/3`];
    if(before&&after)stats.push(`${before.accuracy}% → ${after.accuracy}% matched`,`${before.meanAbsoluteMs===null?'—':`${Math.round(before.meanAbsoluteMs)} ms`} → ${after.meanAbsoluteMs===null?'—':`${Math.round(after.meanAbsoluteMs)} ms`} timing error`);
    return [stats.join(' · ')];
  });
  if(result.transferAttempt&&previous.transferAttempt)summary.push(`fresh-pattern transfer: ${previous.transferAttempt.accuracy}% → ${result.transferAttempt.accuracy}% matched`);
  if(result.internalPulseAttempt&&previous.internalPulseAttempt)summary.push(`internal-pulse drift: ${Math.round(Math.abs(previous.internalPulseAttempt.dropoutDriftMs??0))} ms → ${Math.round(Math.abs(result.internalPulseAttempt.dropoutDriftMs??0))} ms`);
  if(previous.tempoAttempts?.length&&result.tempoAttempts?.length){const label=(bpm:number|null)=>bpm===null?'not demonstrated':`${bpm} BPM`;summary.push(`tempo ceiling: ${label(assessTempoProgress(previous).highestBpm)} → ${label(assessTempoProgress(result).highestBpm)}`);}
  return summary.length ? { previous, summary:summary.join(' · ') } : null;
}
export function assessmentTrend(result: AssessmentResult, history: AssessmentResult[], limit = 6) {
  const comparable = history.filter(row => row.id !== result.id && row.inputProfile === result.inputProfile && row.adaptation === result.adaptation && row.contentVersion === result.contentVersion && row.quizFormat === result.quizFormat && row.timingCalibrated === result.timingCalibrated && row.rhythmFirst===result.rhythmFirst && row.largeNotation===result.largeNotation && row.slowDemonstration === result.slowDemonstration && row.extendedCountIn === result.extendedCountIn && row.largePads===result.largePads && row.spokenCountIn===result.spokenCountIn && row.hapticCountIn===result.hapticCountIn && Math.abs((row.timingCorrectionMs ?? 0) - (result.timingCorrectionMs ?? 0)) < 10);
  return [...comparable, result].sort((a,b)=>Date.parse(a.playedAt)-Date.parse(b.playedAt)).slice(-Math.max(2,limit)).map(row=>{
    const detail=(domain:AssessmentDomain)=>{const attempts=row.attempts.filter(attempt=>attempt.probeId.startsWith(`${domain}-`));const latest=attempts.at(-1);return {tier:attempts.length?assessmentTier(row,domain):null,matched:latest?.accuracy??null,timing:latest?.meanAbsoluteMs??null};};
    return {id:row.id,playedAt:row.playedAt,pulse:detail('pulse'),subdivisions:detail('subdivisions'),coordination:detail('coordination')};
  });
}
export function shuffledAssessmentChoices(question: AssessmentQuestion, seed: number) {
  let state = seed >>> 0;
  const values = question.choices.map((label, choice) => ({ label, choice }));
  for (let i=values.length-1;i>0;i--) { state = (Math.imul(state,1664525)+1013904223)>>>0; const j=Math.floor(state/4294967296*(i+1)); [values[i],values[j]]=[values[j],values[i]]; }
  return values;
}
function validResult(value: unknown): value is AssessmentResult {
  if (!value || typeof value !== 'object') return false;
  const r = value as AssessmentResult;
  if (r.version !== 1 || (r.contentVersion !== undefined && (!Number.isInteger(r.contentVersion) || r.contentVersion < 1 || r.contentVersion > 1000)) || typeof r.id !== 'string' || !r.id || r.id.length > 100 || typeof r.playedAt !== 'string' || !Number.isFinite(Date.parse(r.playedAt)) || !['keyboard','touch','midi'].includes(r.input) || typeof r.inputProfile !== 'string' || r.inputProfile.length > 200 || !['standard','hands-only','single-voice'].includes(r.adaptation) || (r.goal !== undefined && !['balanced','play-with-others','play-expressively','read-notation'].includes(r.goal)) || (r.quizFormat !== undefined && !['visual','audio'].includes(r.quizFormat)) || (r.timingCorrectionMs !== undefined && (!Number.isFinite(r.timingCorrectionMs) || Math.abs(r.timingCorrectionMs) > 250)) || (r.timingCalibrated !== undefined && typeof r.timingCalibrated !== 'boolean') || [r.rhythmFirst,r.largeNotation,r.slowDemonstration,r.extendedCountIn,r.largePads,r.spokenCountIn,r.hapticCountIn].some(value=>value!==undefined&&typeof value!=='boolean') || typeof r.endedEarly !== 'boolean') return false;
  if ([r.transferAttemptedAt,r.transferFollowUpAttemptedAt].some(value=>value!==undefined&&(typeof value!=='string'||!Number.isFinite(Date.parse(value)))) || (r.transferAttemptedAt!==undefined&&!r.transferAttempt) || (r.transferFollowUpAttemptedAt!==undefined&&(!r.transferFollowUpAttempt||r.transferAttemptedAt===undefined||Date.parse(r.transferFollowUpAttemptedAt)<Date.parse(r.transferAttemptedAt))) || (r.transferFollowUpAttempt!==undefined&&!r.transferAttempt) || (r.reportedPracticeMinutes!==undefined&&(!r.transferAttempt||!Number.isInteger(r.reportedPracticeMinutes)||r.reportedPracticeMinutes<0||r.reportedPracticeMinutes>600))) return false;
  if (!Array.isArray(r.attempts) || r.attempts.length > 20 || !Array.isArray(r.answers) || r.answers.length > 8 || !Array.isArray(r.skipped) || r.skipped.length > 20) return false;
  const ids = [...assessmentContent.probes, ...assessmentContent.questions].map(p=>p.id);
  if(r.questionIds!==undefined&&(!Array.isArray(r.questionIds)||r.questionIds.length<4||r.questionIds.length>8||new Set(r.questionIds).size!==r.questionIds.length||!r.questionIds.every(id=>assessmentContent.questions.some(question=>question.id===id))))return false;
  if (!r.skipped.every(id => typeof id === 'string' && ids.includes(id)) || new Set(r.skipped).size !== r.skipped.length) return false;
  if (!r.attempts.every(a => {
    const probe = a && assessmentContent.probes.find(p=>p.id===a.probeId);
    const optionalTiming = [a.clickOnMeanAbsoluteMs, a.clickOffMeanAbsoluteMs].every(n=>n===undefined||n===null||Number.isFinite(n)&&n>=0&&n<=100) && (a.dropoutDriftMs===undefined||a.dropoutDriftMs===null||Number.isFinite(a.dropoutDriftMs)&&Math.abs(a.dropoutDriftMs)<=100);
    return !!probe && (a.variant===undefined || Number.isInteger(a.variant)&&a.variant>=0&&a.variant<=(probe.alternates?.length??0)) && [a.score,a.accuracy].every(n=>Number.isInteger(n)&&n>=0&&n<=100) && [a.misses,a.extras].every(n=>Number.isInteger(n)&&n>=0&&n<=10000) && (a.meanAbsoluteMs === null || (Number.isFinite(a.meanAbsoluteMs)&&a.meanAbsoluteMs>=0&&a.meanAbsoluteMs<=100)) && (a.meanOffsetMs===undefined || a.meanOffsetMs===null || Number.isFinite(a.meanOffsetMs)&&Math.abs(a.meanOffsetMs)<=100) && (a.timingSpreadMs===undefined || a.timingSpreadMs===null || Number.isFinite(a.timingSpreadMs)&&a.timingSpreadMs>=0&&a.timingSpreadMs<=100) && optionalTiming && (a.dynamicsContrast === null || (Number.isFinite(a.dynamicsContrast)&&Math.abs(a.dynamicsContrast)<=126)) && typeof a.passed === 'boolean' && a.passed === passedAssessment(a);
  })) return false;
  if (r.tempoAttempts !== undefined && (!Array.isArray(r.tempoAttempts) || r.tempoAttempts.length > assessmentContent.tempoCheck.bpms.length * (assessmentContent.tempoCheck.retriesPerTempo + 1) || !r.tempoAttempts.every(row => row && assessmentContent.tempoCheck.bpms.includes(row.bpm) && [row.score,row.accuracy].every(n=>Number.isInteger(n)&&n>=0&&n<=100) && (row.meanAbsoluteMs==null || Number.isFinite(row.meanAbsoluteMs)&&row.meanAbsoluteMs>=0&&row.meanAbsoluteMs<=100) && (row.meanOffsetMs==null || Number.isFinite(row.meanOffsetMs)&&Math.abs(row.meanOffsetMs)<=100) && typeof row.passed==='boolean' && row.passed===scoreTempoAttempt(row.bpm,{probeId:'tempo-check',score:row.score,accuracy:row.accuracy,meanAbsoluteMs:row.meanAbsoluteMs??null,meanOffsetMs:row.meanOffsetMs??null,misses:0,extras:0,dynamicsContrast:null,passed:false}).passed))) return false;
  if (r.tempoAttempts !== undefined) {
    const replay: AssessmentTempoAttempt[]=[];
    for (const attempt of r.tempoAttempts) {
      if (assessTempoProgress({tempoAttempts:replay}).nextBpm !== attempt.bpm) return false;
      replay.push(attempt);
    }
  }
  if (r.educatorComparison !== undefined) {
    const comparison = r.educatorComparison;
    const levels = comparison?.teacherEstimatedLevel;
    const values = levels ? [levels.pulse,levels.subdivisions,levels.coordination,levels.reading] : [];
    if (!comparison || values.length !== 4 || !values.every(level => level == null || Number.isInteger(level) && level >= 1 && level <= 3) || !(comparison.recommendedLessonFits == null || typeof comparison.recommendedLessonFits === 'boolean') || typeof comparison.disagreementNotes !== 'string' || comparison.disagreementNotes.length > 1000 || (comparison.pilotCode!==undefined&&(typeof comparison.pilotCode!=='string'||comparison.pilotCode.length>40||!/^[a-zA-Z0-9_-]*$/.test(comparison.pilotCode)))) return false;
  }
  if(r.confirmations!==undefined&&(!Array.isArray(r.confirmations)||r.confirmations.length>3||new Set(r.confirmations.map(row=>row?.probeId)).size!==r.confirmations.length||!r.confirmations.every(row=>{const probe=assessmentContent.probes.find(item=>item.id===row?.probeId);const attempt=row?.attempt;return !!probe&&['pulse','subdivisions','coordination'].includes(probe.domain)&&attempt?.probeId===probe.id&&(attempt.variant===undefined||Number.isInteger(attempt.variant)&&attempt.variant>=0&&attempt.variant<=(probe.alternates?.length??0))&&[attempt.score,attempt.accuracy].every(n=>Number.isInteger(n)&&n>=0&&n<=100)&&[attempt.misses,attempt.extras].every(n=>Number.isInteger(n)&&n>=0&&n<=10000)&&(attempt.meanAbsoluteMs===null||Number.isFinite(attempt.meanAbsoluteMs)&&attempt.meanAbsoluteMs>=0&&attempt.meanAbsoluteMs<=100)&&(attempt.meanOffsetMs===undefined||attempt.meanOffsetMs===null||Number.isFinite(attempt.meanOffsetMs)&&Math.abs(attempt.meanOffsetMs)<=100)&&(attempt.timingSpreadMs===undefined||attempt.timingSpreadMs===null||Number.isFinite(attempt.timingSpreadMs)&&attempt.timingSpreadMs>=0&&attempt.timingSpreadMs<=100)&&attempt.dynamicsContrast===null&&typeof attempt.passed==='boolean'&&attempt.passed===passedAssessment(attempt)&&r.attempts.some(original=>original.probeId===probe.id)})))return false;
  if(r.reflections!==undefined&&(!Array.isArray(r.reflections)||r.reflections.length>3||new Set(r.reflections.map(row=>row?.domain)).size!==r.reflections.length||!r.reflections.every(row=>row&&['pulse','subdivisions','coordination'].includes(row.domain)&&['easy','about-right','hard','input-issue'].includes(row.rating))))return false;
  if (r.transferAttempt !== undefined) {
    const attempt = r.transferAttempt;
    const probe = assessmentContent.probes.find(p=>p.id==='transfer-1');
    if (!probe || attempt.probeId !== 'transfer-1' || (attempt.variant!==undefined&&(!Number.isInteger(attempt.variant)||attempt.variant<0||attempt.variant>(probe.alternates?.length??0))) || ![attempt.score,attempt.accuracy].every(n=>Number.isInteger(n)&&n>=0&&n<=100) || ![attempt.misses,attempt.extras].every(n=>Number.isInteger(n)&&n>=0&&n<=10000) || !(attempt.meanAbsoluteMs===null||Number.isFinite(attempt.meanAbsoluteMs)&&attempt.meanAbsoluteMs>=0&&attempt.meanAbsoluteMs<=100) || !(attempt.meanOffsetMs===undefined||attempt.meanOffsetMs===null||Number.isFinite(attempt.meanOffsetMs)&&Math.abs(attempt.meanOffsetMs)<=100) || !(attempt.timingSpreadMs===undefined||attempt.timingSpreadMs===null||Number.isFinite(attempt.timingSpreadMs)&&attempt.timingSpreadMs>=0&&attempt.timingSpreadMs<=100) || attempt.dynamicsContrast!==null || typeof attempt.passed!=='boolean' || attempt.passed!==passedAssessment(attempt)) return false;
  }
  if (r.transferFollowUpAttempt !== undefined) {
    const attempt=r.transferFollowUpAttempt;
    const probe=assessmentTransferProbe();
    if(!r.transferAttempt||!probe||attempt.probeId!==probe.id||(attempt.variant!==undefined&&(!Number.isInteger(attempt.variant)||attempt.variant<0||attempt.variant>(probe.alternates?.length??0)))||!Number.isInteger(attempt.score)||attempt.score<0||attempt.score>100||!Number.isInteger(attempt.accuracy)||attempt.accuracy<0||attempt.accuracy>100||!Number.isInteger(attempt.misses)||attempt.misses<0||attempt.misses>10000||!Number.isInteger(attempt.extras)||attempt.extras<0||attempt.extras>10000||!(attempt.meanAbsoluteMs===null||Number.isFinite(attempt.meanAbsoluteMs)&&attempt.meanAbsoluteMs>=0&&attempt.meanAbsoluteMs<=100)||!(attempt.meanOffsetMs===undefined||attempt.meanOffsetMs===null||Number.isFinite(attempt.meanOffsetMs)&&Math.abs(attempt.meanOffsetMs)<=100)||!(attempt.timingSpreadMs===undefined||attempt.timingSpreadMs===null||Number.isFinite(attempt.timingSpreadMs)&&attempt.timingSpreadMs>=0&&attempt.timingSpreadMs<=100)||attempt.dynamicsContrast!==null||typeof attempt.passed!=='boolean'||attempt.passed!==passedAssessment(attempt))return false;
  }
  if (r.internalPulseAttempt !== undefined) {
    const attempt = r.internalPulseAttempt;
    const probe = assessmentInternalPulseProbe();
    if (!probe || attempt.probeId !== probe.id || (attempt.variant !== undefined && attempt.variant !== 0) || ![attempt.score,attempt.accuracy].every(n=>Number.isInteger(n)&&n>=0&&n<=100) || ![attempt.misses,attempt.extras].every(n=>Number.isInteger(n)&&n>=0&&n<=10000) || !(attempt.meanAbsoluteMs===null||Number.isFinite(attempt.meanAbsoluteMs)&&attempt.meanAbsoluteMs>=0&&attempt.meanAbsoluteMs<=100) || !(attempt.meanOffsetMs===undefined||attempt.meanOffsetMs===null||Number.isFinite(attempt.meanOffsetMs)&&Math.abs(attempt.meanOffsetMs)<=100) || !(attempt.timingSpreadMs===undefined||attempt.timingSpreadMs===null||Number.isFinite(attempt.timingSpreadMs)&&attempt.timingSpreadMs>=0&&attempt.timingSpreadMs<=100) || attempt.clickOnMeanAbsoluteMs===undefined || attempt.clickOffMeanAbsoluteMs===undefined || attempt.dropoutDriftMs===undefined || !(attempt.clickOnMeanAbsoluteMs===null||Number.isFinite(attempt.clickOnMeanAbsoluteMs)&&attempt.clickOnMeanAbsoluteMs>=0&&attempt.clickOnMeanAbsoluteMs<=100) || !(attempt.clickOffMeanAbsoluteMs===null||Number.isFinite(attempt.clickOffMeanAbsoluteMs)&&attempt.clickOffMeanAbsoluteMs>=0&&attempt.clickOffMeanAbsoluteMs<=100) || !(attempt.dropoutDriftMs===null||Number.isFinite(attempt.dropoutDriftMs)&&Math.abs(attempt.dropoutDriftMs)<=100) || attempt.dynamicsContrast!==null || typeof attempt.passed!=='boolean' || attempt.passed!==passedAssessment(attempt)) return false;
  }
  if (!r.answers.every(a => a && assessmentContent.questions.some(q=>q.id===a.questionId) && Number.isInteger(a.choice)&&a.choice>=0&&a.choice<4) || new Set(r.answers.map(a=>a.questionId)).size !== r.answers.length) return false;
  // Validate adaptive ordering so corrupted backups cannot invent higher placement.
  const replay = { ...r, attempts: [] as AssessmentAttempt[], skipped: [] as string[] };
  for (const attempt of r.attempts) {
    while (nextAssessmentProbe(replay)?.id !== attempt.probeId) {
      const next = nextAssessmentProbe(replay);
      if (!next || !r.skipped.includes(next.id)) break;
      replay.skipped.push(next.id);
    }
    if (nextAssessmentProbe(replay)?.id !== attempt.probeId) return false;
    replay.attempts.push(attempt);
  }
  return true;
}
export function parseAssessmentStore(raw: string | null): AssessmentStore {
  try { const data = JSON.parse(raw ?? '{}'); if (data.version !== 1 || !Array.isArray(data.results)) return emptyAssessmentStore();
    const seen = new Set<string>(); const results: AssessmentResult[] = data.results.filter((r: unknown) => validResult(r) && !seen.has(r.id) && !!seen.add(r.id)).slice(-20);
    return { version: 1, results, appliedId: results.some(r=>r.id===data.appliedId && assessmentRecommendation(r)) ? data.appliedId : null };
  } catch { return emptyAssessmentStore(); }
}
export function appendAssessment(store: AssessmentStore, result: AssessmentResult): AssessmentStore {
  let results = [...store.results.filter(r=>r.id!==result.id),result];
  // Retain the explicitly applied baseline even after many un-applied retakes.
  if (results.length > 20) { const remove = results.findIndex(r=>r.id!==store.appliedId); results.splice(remove,1); }
  return { ...store, results };
}
export function appliedAssessment(store: AssessmentStore) { return store.results.find(r=>r.id===store.appliedId); }
export function comparableAssessmentRound(round: TrainerRound, baseline: AssessmentResult) {
  const adaptation = baseline.adaptation === 'hands-only' ? 'seated' : baseline.adaptation;
  const calibrated = baseline.timingCalibrated === undefined || round.timingCalibrated === baseline.timingCalibrated;
  const correction = Math.abs((round.timingCorrectionMs ?? 0) - (baseline.timingCorrectionMs ?? 0)) < 10;
  return round.mode === 'scored' && !!round.result && round.playedAt > baseline.playedAt && round.inputProfile === baseline.inputProfile && (round.adaptation ?? 'standard') === adaptation && calibrated && correction && !round.uncertainDetections && !round.inputClipped && !round.focusedDrill && !round.learningMode;
}

export type AssessmentPracticeReadiness = { consecutive: number; required: 3; ready: boolean; latestScore: number | null; latestAccuracy: number | null; latestTimingMs: number | null };
export function assessmentPracticeReadiness(rounds: TrainerRound[], baseline: Pick<AssessmentResult, 'adaptation' | 'playedAt' | 'inputProfile' | 'timingCorrectionMs' | 'timingCalibrated'>, patternId: string): AssessmentPracticeReadiness {
  const adaptation = baseline.adaptation === 'hands-only' ? 'seated' : baseline.adaptation;
  const candidates = rounds.filter(round => round.patternId === patternId && round.playedAt > baseline.playedAt && round.inputProfile === baseline.inputProfile && (round.adaptation ?? 'standard') === adaptation && (baseline.timingCalibrated === undefined || round.timingCalibrated === baseline.timingCalibrated) && Math.abs((round.timingCorrectionMs ?? 0) - (baseline.timingCorrectionMs ?? 0)) < 10).sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  let consecutive = 0;
  let latestScore: number | null = null, latestAccuracy: number | null = null, latestTimingMs: number | null = null;
  for (const round of candidates) {
    const matched = round.hits?.filter(hit => (hit.rating === 'great' || hit.rating === 'good') && typeof hit.offsetMs === 'number' && Number.isFinite(hit.offsetMs)) ?? [];
    const timing = matched.length ? matched.reduce((sum, hit) => sum + Math.abs(hit.offsetMs!), 0) / matched.length : null;
    const score = round.result?.score ?? null, accuracy = round.result?.accuracy ?? null;
    const reliable = round.mode === 'scored' && !!round.result && !round.focusedDrill && !round.learningMode && !round.uncertainDetections && !round.inputClipped && round.targetVoice === undefined && (!round.variationId || round.variationId === 'base');
    const ready = reliable && score !== null && score >= 85 && accuracy !== null && accuracy >= 85 && timing !== null && timing <= 60;
    if (!ready) break;
    consecutive += 1;
    if (consecutive === 1) { latestScore = score; latestAccuracy = accuracy; latestTimingMs = timing; }
  }
  return { consecutive, required: 3, ready: consecutive >= 3, latestScore, latestAccuracy, latestTimingMs };
}
export function assessmentTransferPracticeContext(rounds: TrainerRound[], result: AssessmentResult) {
  const start=Date.parse(result.transferAttemptedAt??''),end=Date.parse(result.transferFollowUpAttemptedAt??'');
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
  const adaptation=result.adaptation==='hands-only'?'seated':result.adaptation;
  const matches=rounds.filter(round=>{
    const date=Date.parse(round.playedAt);
    return round.mode==='scored'&&!!round.result&&date>start&&date<=end&&round.inputProfile===result.inputProfile&&(round.adaptation??'standard')===adaptation&&
      (result.timingCalibrated===undefined||round.timingCalibrated===result.timingCalibrated)&&Math.abs((round.timingCorrectionMs??0)-(result.timingCorrectionMs??0))<10&&
      !round.uncertainDetections&&!round.inputClipped&&!round.focusedDrill&&!round.learningMode;
  });
  let allDurationsKnown=matches.length>0;
  const seconds=matches.reduce((sum,round)=>{
    if(typeof round.durationSeconds==='number'&&Number.isFinite(round.durationSeconds))return sum+round.durationSeconds;
    const pattern=patterns.find(item=>item.id===round.patternId);
    if(!pattern){allDurationsKnown=false;return sum;}
    return sum+pattern.beats*(round.repetitions??10)*60/round.bpm;
  },0);
  return { rounds:matches.length, minutes:allDurationsKnown?Math.round(seconds/60):null };
}
