#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const files = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
if (process.argv.includes('--help') || files.length === 0) {
  process.stdout.write('Usage: node scripts/summarize-assessment-pilot.mjs <anonymous-review.json> [more-review.json ...]\n');
  process.stdout.write('Reads learner-approved educator review exports with teacher comparison fields filled in. Emits only grouped counts and item statistics.\n');
  process.exit(files.length === 0 && !process.argv.includes('--help') ? 2 : 0);
}

const levelAliases = new Map([
  ['needs foundation', 1], ['foundation', 1], ['developing', 2], ['independent', 3],
  ['1', 1], ['2', 2], ['3', 3]
]);
function teacherLevel(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3) return value === 0 ? null : value;
  if (typeof value !== 'string') return null;
  return levelAliases.get(value.trim().toLowerCase()) ?? null;
}
function wilson95(successes, total) {
  if (!total) return null;
  const z = 1.96, p = successes / total, z2 = z * z, denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) / total) + (z2 / (4 * total * total))) / denominator;
  return { lower: Number(Math.max(0, center - margin).toFixed(3)), upper: Number(Math.min(1, center + margin).toFixed(3)) };
}
function recordFor(file) {
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${basename(file)}: ${error.message}`); }
  if (data?.format !== 'drum-hero-assessment-review' || data.version !== 1 || !Array.isArray(data.attempts) || !Array.isArray(data.questions)) {
    throw new Error(`${basename(file)} is not a supported anonymous assessment review export`);
  }
  return data;
}

const groups = new Map();
const items = new Map();
const repeatCases = new Map();
let accepted = 0;
for (const file of files) {
  const review = recordFor(file);
  accepted++;
  const groupKey = [review.contentVersion ?? 'unknown', review.input ?? 'unknown', review.adaptation ?? 'unknown'].join('|');
  if (!groups.has(groupKey)) groups.set(groupKey, {
    contentVersion: review.contentVersion ?? null, input: review.input ?? 'unknown', adaptation: review.adaptation ?? 'unknown',
    assessments: 0, skillComparisons: {}, recommendationFit: { yes: 0, no: 0, unanswered: 0 }, learnerFeedback: {}, recommendedLessons: {}
  });
  const group = groups.get(groupKey);
  if (typeof review.pilotCode === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(review.pilotCode)) {
    const caseKey = `${groupKey}|${review.pilotCode}`;
    const rows = repeatCases.get(caseKey) ?? { contentVersion: review.contentVersion ?? null, input: review.input ?? 'unknown', adaptation: review.adaptation ?? 'unknown', reviews: [] };
    rows.reviews.push(review); repeatCases.set(caseKey, rows);
  }
  group.assessments++;
  const lesson = typeof review.recommendedLesson === 'string' ? review.recommendedLesson : 'none';
  group.recommendedLessons[lesson] = (group.recommendedLessons[lesson] ?? 0) + 1;
  const teacher = review.educatorComparisonTemplate?.teacherEstimatedLevel ?? {};
  for (const skill of ['pulse', 'subdivisions', 'coordination', 'reading']) {
    const estimate = teacherLevel(teacher[skill]);
    const appTier = review.appTiers?.[skill];
    if (estimate === null || !Number.isInteger(appTier) || appTier < 0 || appTier > 3) continue;
    const stats = group.skillComparisons[skill] ??= { compared: 0, exact: 0, withinOneTier: 0, absoluteTierDifference: 0 };
    const difference = Math.abs(estimate - appTier);
    stats.compared++;
    stats.exact += difference === 0 ? 1 : 0;
    stats.withinOneTier += difference <= 1 ? 1 : 0;
    stats.absoluteTierDifference += difference;
  }
  const recommendationFits = review.educatorComparisonTemplate?.recommendedLessonFits;
  group.recommendationFit[recommendationFits === true ? 'yes' : recommendationFits === false ? 'no' : 'unanswered']++;
  for (const feedback of Array.isArray(review.learnerFeedback) ? review.learnerFeedback : []) {
    if (!['pulse', 'subdivisions', 'coordination'].includes(feedback?.domain) || !['easy', 'about-right', 'hard', 'input-issue'].includes(feedback?.rating)) continue;
    const stat = group.learnerFeedback[feedback.domain] ??= { responses: 0, easy: 0, aboutRight: 0, hard: 0, inputIssue: 0 };
    stat.responses++;
    stat[feedback.rating === 'about-right' ? 'aboutRight' : feedback.rating === 'input-issue' ? 'inputIssue' : feedback.rating]++;
  }
  for (const question of review.questions) {
    if (typeof question.itemId !== 'string' || !Number.isInteger(question.answer)) continue;
    const stat = items.get(question.itemId) ?? {
      itemId: question.itemId, kind: question.kind ?? 'unknown', prompt: question.prompt ?? '',
      choices: Array.isArray(question.choices) ? question.choices : [], correctChoice: question.answer, attempts: 0, correct: 0, incorrect: 0, unanswered: 0, distractorCounts: {}
    };
    stat.attempts++;
    if (Number.isInteger(question.selectedChoice) && question.selectedChoice >= 0 && question.selectedChoice < stat.choices.length) {
      if (question.selectedChoice === question.answer) stat.correct++;
      else { stat.incorrect++; const choice = String(question.selectedChoice); stat.distractorCounts[choice] = (stat.distractorCounts[choice] ?? 0) + 1; }
    } else stat.unanswered++;
    items.set(question.itemId, stat);
  }
}

for (const group of groups.values()) {
  for (const stats of Object.values(group.skillComparisons)) {
    stats.exactAgreementRate = Number((stats.exact / stats.compared).toFixed(3));
    stats.withinOneTierRate = Number((stats.withinOneTier / stats.compared).toFixed(3));
    stats.meanAbsoluteTierDifference = Number((stats.absoluteTierDifference / stats.compared).toFixed(2));
    stats.exactAgreementWilson95CI = wilson95(stats.exact, stats.compared);
    stats.withinOneTierWilson95CI = wilson95(stats.withinOneTier, stats.compared);
  }
  const fitSample = group.recommendationFit.yes + group.recommendationFit.no;
  group.recommendationFit.rated = fitSample;
  group.recommendationFit.fitRate = fitSample ? Number((group.recommendationFit.yes / fitSample).toFixed(3)) : null;
  group.recommendationFit.fitWilson95CI = wilson95(group.recommendationFit.yes, fitSample);
  for (const stats of Object.values(group.learnerFeedback)) {
    stats.inputIssueRate = Number((stats.inputIssue / stats.responses).toFixed(3));
    stats.inputIssueWilson95CI = wilson95(stats.inputIssue, stats.responses);
  }
}
for (const stat of items.values()) {
  stat.correctRate = stat.attempts ? Number((stat.correct / stat.attempts).toFixed(3)) : null;
  stat.correctRateWilson95CI = wilson95(stat.correct, stat.attempts);
}
const repeatability = [];
for (const row of repeatCases.values()) {
  if (row.reviews.length < 2) continue;
  const domains = {};
  const probes = {};
  for (let i = 1; i < row.reviews.length; i++) {
    const before = row.reviews[i - 1], after = row.reviews[i];
    for (const skill of ['pulse', 'subdivisions', 'coordination', 'reading']) {
      const a = before.appTiers?.[skill], b = after.appTiers?.[skill];
      if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
      const stat = domains[skill] ??= { pairedRetakes: 0, exactTierRepeats: 0, absoluteTierDifference: 0 };
      const difference = Math.abs(a - b); stat.pairedRetakes++; stat.exactTierRepeats += difference === 0 ? 1 : 0; stat.absoluteTierDifference += difference;
    }
    const byId = new Map((before.attempts ?? []).filter(item => typeof item.probeId === 'string').map(item => [item.probeId, item]));
    for (const attempt of after.attempts ?? []) {
      const prior = byId.get(attempt.probeId);
      if (!prior || !Number.isFinite(prior.score) || !Number.isFinite(attempt.score)) continue;
      const stat = probes[attempt.probeId] ??= { pairedRetakes: 0, exactPassRepeats: 0, absoluteScoreDifference: 0, absoluteTimingDifferenceMs: 0, timingPairs: 0 };
      stat.pairedRetakes++; stat.exactPassRepeats += prior.passed === attempt.passed ? 1 : 0; stat.absoluteScoreDifference += Math.abs(prior.score - attempt.score);
      if (Number.isFinite(prior.meanAbsoluteMs) && Number.isFinite(attempt.meanAbsoluteMs)) { stat.absoluteTimingDifferenceMs += Math.abs(prior.meanAbsoluteMs - attempt.meanAbsoluteMs); stat.timingPairs++; }
    }
  }
  for (const stat of Object.values(domains)) { stat.exactTierRepeatRate = Number((stat.exactTierRepeats / stat.pairedRetakes).toFixed(3)); stat.exactTierRepeatWilson95CI = wilson95(stat.exactTierRepeats, stat.pairedRetakes); stat.meanAbsoluteTierDifference = Number((stat.absoluteTierDifference / stat.pairedRetakes).toFixed(2)); }
  for (const stat of Object.values(probes)) { stat.passRepeatRate = Number((stat.exactPassRepeats / stat.pairedRetakes).toFixed(3)); stat.passRepeatWilson95CI = wilson95(stat.exactPassRepeats, stat.pairedRetakes); stat.meanAbsoluteScoreDifference = Number((stat.absoluteScoreDifference / stat.pairedRetakes).toFixed(2)); stat.meanAbsoluteTimingDifferenceMs = stat.timingPairs ? Number((stat.absoluteTimingDifferenceMs / stat.timingPairs).toFixed(1)) : null; delete stat.exactPassRepeats; delete stat.absoluteScoreDifference; delete stat.absoluteTimingDifferenceMs; }
  repeatability.push({ contentVersion: row.contentVersion, input: row.input, adaptation: row.adaptation, pairedAssessments: row.reviews.length, pairedRetakes: row.reviews.length - 1, domains, probes });
}
process.stdout.write(`${JSON.stringify({ format: 'drum-hero-assessment-pilot-summary', assessments: accepted, interpretation: 'Descriptive pilot evidence only. Wilson intervals show sampling uncertainty; they do not validate placement thresholds or establish population norms.', groups: [...groups.values()], repeatability, items: [...items.values()].sort((a, b) => a.itemId.localeCompare(b.itemId)) }, null, 2)}\n`);
