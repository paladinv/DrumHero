import source from '@/shared/assessment-v1.json';
import { scoreEarAttempt } from './ear-training';
import type { Instrument, PatternHit, PracticePattern } from './types';
import type { TrainerRound } from './trainer';

export type AssessmentInput = 'keyboard' | 'touch' | 'midi';
export type AssessmentAdaptation = 'standard' | 'hands-only' | 'single-voice';
export type AssessmentDomain = 'pulse' | 'subdivisions' | 'coordination' | 'dynamics';
export type AssessmentProbe = { id: string; domain: AssessmentDomain; tier: number; name: string; bpm: number; subdivision: 4 | 8 | 12 | 16; hits: PatternHit[]; alternates?: PatternHit[][] };
export type AssessmentQuestion = { id: string; kind: 'listening' | 'reading'; prompt: string; probeId: string; choices: string[]; answer: number };
export const assessmentContent = source as { version: number; rules: typeof source.rules; probes: AssessmentProbe[]; questions: AssessmentQuestion[]; lessons: typeof source.lessons; focusPatterns: Record<string,string> };
export const ASSESSMENT_KEY = 'drum-hero:assessment:v1';
export const ASSESSMENT_EVENT = 'drum-hero:assessment-change';
export const assessmentDomains: AssessmentDomain[] = ['pulse', 'subdivisions', 'coordination'];
export type AssessmentHit = { instrument: Instrument; atMs: number; velocity?: number };
export type AssessmentAttempt = { probeId: string; variant?: number; score: number; accuracy: number; meanAbsoluteMs: number | null; meanOffsetMs?: number | null; timingSpreadMs?: number | null; misses: number; extras: number; dynamicsContrast: number | null; passed: boolean };
export type AssessmentAnswer = { questionId: string; choice: number };
export type AssessmentResult = { version: 1; id: string; playedAt: string; input: AssessmentInput; inputProfile: string; adaptation: AssessmentAdaptation; attempts: AssessmentAttempt[]; answers: AssessmentAnswer[]; skipped: string[]; endedEarly: boolean };
export type AssessmentStore = { version: 1; results: AssessmentResult[]; appliedId: string | null };
export const emptyAssessmentStore = (): AssessmentStore => ({ version: 1, results: [], appliedId: null });
export function assessmentProbeVariant(probe: AssessmentProbe, variant: number): AssessmentProbe {
  const alternate = Number.isInteger(variant) && variant > 0 ? probe.alternates?.[variant - 1] : undefined;
  return alternate ? { ...probe, hits: alternate } : probe;
}
function stableSeed(value: string) { return Array.from(value).reduce((sum, character) => sum + character.codePointAt(0)!, 0) >>> 0; }
function shuffled<T>(items: T[], seed: number): T[] {
  let state = seed >>> 0; const result = [...items];
  for (let i=result.length-1;i>0;i--) { state=(Math.imul(state,1664525)+1013904223)>>>0; const j=Math.floor(state/4294967296*(i+1)); [result[i],result[j]]=[result[j],result[i]]; }
  return result;
}
export function assessmentQuestionsForResult(result: Pick<AssessmentResult, 'id'|'answers'>) {
  const seed = stableSeed(result.id);
  const listening = shuffled(assessmentContent.questions.filter(q=>q.kind==='listening'), seed + 17).slice(0,2);
  const reading = shuffled(assessmentContent.questions.filter(q=>q.kind==='reading'), seed + 31).slice(0,2);
  let selected = [listening[0], reading[0], listening[1], reading[1]].filter((q): q is AssessmentQuestion => !!q);
  // Preserve the question set in saved v1 results, including older fixed-form assessments.
  for (const answer of result.answers) { const legacy = assessmentContent.questions.find(q=>q.id===answer.questionId); if (legacy && !selected.some(q=>q.id===legacy.id)) selected.unshift(legacy); }
  selected = selected.slice(0,4);
  return selected;
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
  return attempt.probeId === 'dynamics-1'
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
  const attempt = { probeId: probe.id, variant, score: summary.score, accuracy: summary.accuracy, meanAbsoluteMs: offsets.length ? offsets.reduce((a,b) => a+b,0)/offsets.length : null, meanOffsetMs, timingSpreadMs, misses: summary.miss, extras: summary.extra, dynamicsContrast };
  return { ...attempt, passed: passedAssessment(attempt) };
}
export function assessmentTier(result: AssessmentResult, domain: AssessmentDomain) { return Math.max(0, ...result.attempts.filter(a => a.passed && a.probeId.startsWith(`${domain}-`)).map(a => Number(a.probeId.split('-')[1]))); }
export function nextAssessmentProbe(result: AssessmentResult): AssessmentProbe | null {
  for (const domain of [...assessmentDomains, ...(result.input === 'midi' ? ['dynamics' as const] : [])]) {
    if (domain === 'coordination' && result.adaptation === 'single-voice') continue;
    for (const probe of assessmentContent.probes.filter(p => p.domain === domain)) {
      if (result.skipped.includes(probe.id)) break;
      const attempts = result.attempts.filter(a => a.probeId === probe.id);
      if (attempts.some(a => a.passed)) continue;
      if (attempts.length >= 2 || (domain === 'dynamics' && attempts.length)) break;
      return probe;
    }
  }
  return null;
}
export function assessmentRecommendation(result: AssessmentResult): string | null {
  if (!result.attempts.length && !result.answers.length) return null;
  const has = (domain: AssessmentDomain) => result.attempts.some(a => a.probeId.startsWith(`${domain}-`));
  const wrongReading = result.answers.some(a => { const q = assessmentContent.questions.find(q => q.id === a.questionId); return q?.kind === 'reading' && a.choice !== q.answer; });
  if ((has('pulse') && assessmentTier(result,'pulse') < 2) || wrongReading) return 'count-the-grid';
  if (has('coordination') && assessmentTier(result,'coordination') < 1) return 'first-backbeat';
  if (has('subdivisions') && assessmentTier(result,'subdivisions') < 3) return 'sixteenth-control';
  if ((has('pulse') && assessmentTier(result,'pulse') < 3) || (has('coordination') && assessmentTier(result,'coordination') < 2)) return 'syncopated-pocket';
  if (has('coordination') && assessmentTier(result,'coordination') < 3) return 'limb-independence';
  if (result.attempts.some(a => a.probeId === 'dynamics-1' && a.dynamicsContrast !== null && !a.passed)) return 'dynamic-arc';
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
  const wrongReading = result.answers.find(a=>{const q=assessmentContent.questions.find(q=>q.id===a.questionId);return q?.kind==='reading'&&q.answer!==a.choice;});
  const question = wrongReading ? assessmentContent.questions.find(q=>q.id===wrongReading.questionId) : undefined;
  let domain: AssessmentDomain = 'pulse';
  if (lessonId==='first-backbeat'||lessonId==='limb-independence') domain='coordination';
  else if (lessonId==='sixteenth-control') domain='subdivisions';
  else if (lessonId==='dynamic-arc') domain='dynamics';
  else if (lessonId==='syncopated-pocket' && assessmentTier(result,'pulse')>=3) domain='coordination';
  const latest = result.attempts.filter(a=>a.probeId.startsWith(`${domain}-`)).at(-1);
  const probe = latest ? assessmentContent.probes.find(p=>p.id===latest.probeId) : undefined;
  const evidence = question ? `${question.prompt} Correct answer: ${question.choices[question.answer]}.` : latest && probe ? `${probe.name}: ${latest.accuracy}% matched, ${latest.misses} missed, ${latest.extras} extra${latest.meanOffsetMs===undefined||latest.meanOffsetMs===null?'':`, average ${latest.meanOffsetMs>0?'late':latest.meanOffsetMs<0?'early':'on time'} by ${Math.round(Math.abs(latest.meanOffsetMs))} ms`}${latest.timingSpreadMs===undefined||latest.timingSpreadMs===null?'':`, timing spread ${Math.round(latest.timingSpreadMs)} ms`}.` : 'This is the earliest skill in the starting path without enough evidence yet.';
  const goal = lessonId==='dynamic-arc' ? `Match at least ${assessmentContent.rules.dynamicsAccuracy}% of strokes with velocity contrast of ${assessmentContent.rules.dynamicsContrast} or more.` : lessonId==='count-the-grid' && question ? 'Identify the rhythm on both notation questions, then demonstrate pulse tier 2.' : `Reach a score of ${assessmentContent.rules.score} or higher with mean absolute timing error at or below ${assessmentContent.rules.meanAbsoluteMs} ms on the next ${domain} probe.`;
  return { lessonId, evidence, goal };
}
export function assessmentEducatorReview(result: AssessmentResult) {
  return {
    format: 'drum-hero-assessment-review', version: 1, contentVersion: assessmentContent.version,
    input: result.input, adaptation: result.adaptation, endedEarly: result.endedEarly,
    attempts: result.attempts.map(attempt=>({
      task: assessmentContent.probes.find(probe=>probe.id===attempt.probeId)?.name ?? attempt.probeId,
      domain: assessmentContent.probes.find(probe=>probe.id===attempt.probeId)?.domain ?? 'unknown',
      tier: assessmentContent.probes.find(probe=>probe.id===attempt.probeId)?.tier ?? 0,
      variant: attempt.variant ?? 0, score: attempt.score, matchedPercent: attempt.accuracy, misses: attempt.misses, extras: attempt.extras,
      meanAbsoluteMs: attempt.meanAbsoluteMs, meanOffsetMs: attempt.meanOffsetMs ?? null, timingSpreadMs: attempt.timingSpreadMs ?? null,
      dynamicsContrast: attempt.dynamicsContrast, passed: attempt.passed
    })),
    questions: assessmentQuestionsForResult(result).map(question=>{
      const answer=result.answers.find(row=>row.questionId===question.id);
      return { kind: question.kind, prompt: question.prompt, choices: question.choices, selectedChoice: answer?.choice ?? null, answer: question.answer, correct: answer ? answer.choice===question.answer : null };
    })
  };
}
export function assessmentComparison(result: AssessmentResult, history: AssessmentResult[]) {
  const currentDate = Date.parse(result.playedAt);
  const previous = history.filter(row=>row.id!==result.id&&row.inputProfile===result.inputProfile&&row.adaptation===result.adaptation&&Date.parse(row.playedAt)<currentDate).sort((a,b)=>Date.parse(b.playedAt)-Date.parse(a.playedAt))[0];
  if (!previous) return null;
  const summary = assessmentDomains.flatMap(domain=>{
    const currentAttempt = result.attempts.some(a=>a.probeId.startsWith(`${domain}-`));
    const previousAttempt = previous.attempts.some(a=>a.probeId.startsWith(`${domain}-`));
    if (!currentAttempt && !previousAttempt) return [];
    return [`${domain}: ${previousAttempt?`${assessmentTier(previous,domain)}/3`: 'untested'} → ${currentAttempt?`${assessmentTier(result,domain)}/3`: 'untested'}`];
  }).join(' · ');
  return { previous, summary };
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
  if (r.version !== 1 || typeof r.id !== 'string' || !r.id || r.id.length > 100 || typeof r.playedAt !== 'string' || !Number.isFinite(Date.parse(r.playedAt)) || !['keyboard','touch','midi'].includes(r.input) || typeof r.inputProfile !== 'string' || r.inputProfile.length > 200 || !['standard','hands-only','single-voice'].includes(r.adaptation) || typeof r.endedEarly !== 'boolean') return false;
  if (!Array.isArray(r.attempts) || r.attempts.length > 20 || !Array.isArray(r.answers) || r.answers.length > 4 || !Array.isArray(r.skipped) || r.skipped.length > 14) return false;
  const ids = [...assessmentContent.probes, ...assessmentContent.questions].map(p=>p.id);
  if (!r.skipped.every(id => typeof id === 'string' && ids.includes(id)) || new Set(r.skipped).size !== r.skipped.length) return false;
  if (!r.attempts.every(a => {
    const probe = a && assessmentContent.probes.find(p=>p.id===a.probeId);
    return !!probe && (a.variant===undefined || Number.isInteger(a.variant)&&a.variant>=0&&a.variant<=(probe.alternates?.length??0)) && [a.score,a.accuracy].every(n=>Number.isInteger(n)&&n>=0&&n<=100) && [a.misses,a.extras].every(n=>Number.isInteger(n)&&n>=0&&n<=10000) && (a.meanAbsoluteMs === null || (Number.isFinite(a.meanAbsoluteMs)&&a.meanAbsoluteMs>=0&&a.meanAbsoluteMs<=100)) && (a.meanOffsetMs===undefined || a.meanOffsetMs===null || Number.isFinite(a.meanOffsetMs)&&Math.abs(a.meanOffsetMs)<=100) && (a.timingSpreadMs===undefined || a.timingSpreadMs===null || Number.isFinite(a.timingSpreadMs)&&a.timingSpreadMs>=0&&a.timingSpreadMs<=100) && (a.dynamicsContrast === null || (Number.isFinite(a.dynamicsContrast)&&Math.abs(a.dynamicsContrast)<=126)) && typeof a.passed === 'boolean' && a.passed === passedAssessment(a);
  })) return false;
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
  return round.mode === 'scored' && !!round.result && round.playedAt > baseline.playedAt && round.inputProfile === baseline.inputProfile && (round.adaptation ?? 'standard') === adaptation && !round.uncertainDetections && !round.inputClipped && !round.focusedDrill && !round.learningMode;
}
