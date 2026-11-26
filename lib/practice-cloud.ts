import { parseProgress } from "@/lib/progress";
import { parseTrainerState, retainTrainerRoundHistory, trainerStateForCloud } from "@/lib/trainer";
import type { ProgressState } from "@/lib/types";
import type { TrainerState } from "@/lib/trainer";
import { parseEarChallengePacks, parseEarHistory, parseEarReviewSchedule, type EarChallengePack, type EarResult, type EarReviewItem } from "@/lib/ear-training";
import { mergeSightAttempts, parseSightHistory, type SightAttempt } from "@/lib/sight-reading";

export type EarPracticeCloudData = { history: EarResult[]; reviewSchedule: EarReviewItem[]; challengePacks: EarChallengePack[] };
export type PracticeCloudData = { version: 1; progress: ProgressState; trainer: TrainerState; earTraining?: EarPracticeCloudData; sightReading?: SightAttempt[] };

export function parseEarPracticeCloudData(raw: unknown): EarPracticeCloudData | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Partial<EarPracticeCloudData>;
  return {
    history: parseEarHistory(JSON.stringify({ version: 1, results: Array.isArray(value.history) ? value.history : [] })),
    reviewSchedule: parseEarReviewSchedule(JSON.stringify(Array.isArray(value.reviewSchedule) ? value.reviewSchedule : [])),
    challengePacks: parseEarChallengePacks(JSON.stringify({ version: 1, packs: Array.isArray(value.challengePacks) ? value.challengePacks : [] })),
  };
}

function mergeEarPractice(device?: EarPracticeCloudData, cloud?: EarPracticeCloudData): EarPracticeCloudData | undefined {
  if (!device && !cloud) return undefined;
  const historyById = new Map([...(cloud?.history ?? []), ...(device?.history ?? [])].map(item => [item.id, item]));
  const reviewBySkill = new Map([...(cloud?.reviewSchedule ?? []), ...(device?.reviewSchedule ?? [])].map(item => [item.skill, item]));
  const packsById = new Map([...(cloud?.challengePacks ?? []), ...(device?.challengePacks ?? [])].map(item => [item.id, item]));
  return {
    history: [...historyById.values()].sort((left, right) => left.playedAt.localeCompare(right.playedAt)).slice(-100),
    reviewSchedule: [...reviewBySkill.values()].sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt)),
    challengePacks: [...packsById.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-20),
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
  return value;
}

export function practiceCloudSignature(value: PracticeCloudData): string {
  const text = JSON.stringify(stableValue(value));
  let first = 2166136261, second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) { first = Math.imul(first ^ text.charCodeAt(index), 16777619); second = Math.imul(second ^ text.charCodeAt(index), 2246822507); }
  return `${text.length}:${(first >>> 0).toString(16)}:${(second >>> 0).toString(16)}`;
}

export function parsePracticeCloudData(raw: unknown): PracticeCloudData {
  if (!raw || typeof raw !== "object") throw new Error("Cloud practice data is missing.");
  const value = raw as Partial<PracticeCloudData>;
  if (value.version !== 1 || !value.progress || !value.trainer) throw new Error("This cloud snapshot has an unsupported format.");
  const earTraining = parseEarPracticeCloudData(value.earTraining);
  const sightReading = parseSightHistory(JSON.stringify({ version: 1, attempts: Array.isArray(value.sightReading) ? value.sightReading : [] }));
  return { version: 1, progress: parseProgress(JSON.stringify(value.progress)), trainer: trainerStateForCloud(parseTrainerState(JSON.stringify(value.trainer))), ...(earTraining ? { earTraining } : {}), ...(sightReading.length ? { sightReading } : {}) };
}

export function mergePracticeCloudData(device: PracticeCloudData, cloud: PracticeCloudData): PracticeCloudData {
  const sessions = new Map([...cloud.progress.sessions, ...device.progress.sessions].map((item) => [item.id, item]));
  const rounds = new Map([...cloud.trainer.rounds, ...device.trainer.rounds].map((item) => [item.id, item]));
  const cueSequences = new Map((device.trainer.cueSequences ?? []).map((item) => [item.id, item]));
  for (const item of cloud.trainer.cueSequences ?? []) if (!cueSequences.has(item.id)) cueSequences.set(item.id, item);
  const coachFeedback = new Map([...(cloud.trainer.coachFeedback ?? []), ...(device.trainer.coachFeedback ?? [])].map((item) => [item.id, item]));
  const earTraining = mergeEarPractice(device.earTraining, cloud.earTraining);
  const sightReading = mergeSightAttempts(device.sightReading ?? [], cloud.sightReading ?? []);
  const bestScores = { ...cloud.progress.bestScores };
  for (const [id, score] of Object.entries(device.progress.bestScores)) bestScores[id] = Math.max(bestScores[id] ?? 0, score);
  return {
    version: 1,
    progress: {
      ...device.progress,
      completedLessons: [...new Set([...cloud.progress.completedLessons, ...device.progress.completedLessons])],
      sessions: [...sessions.values()].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 50),
      bestScores,
      practiceDates: [...new Set([...cloud.progress.practiceDates, ...device.progress.practiceDates])].sort(),
    },
    trainer: {
      ...device.trainer,
      rounds: retainTrainerRoundHistory([...rounds.values()]),
      deviceProfiles: { ...cloud.trainer.deviceProfiles, ...device.trainer.deviceProfiles },
      ...(device.trainer.routine || cloud.trainer.routine ? { routine: device.trainer.routine ?? cloud.trainer.routine } : {}),
      ...(cueSequences.size ? { cueSequences: [...cueSequences.values()].slice(0, 30) } : {}),
      ...(coachFeedback.size ? { coachFeedback: [...coachFeedback.values()].sort((left, right) => left.receivedAt.localeCompare(right.receivedAt)).slice(-100) } : {}),
    },
    ...(earTraining ? { earTraining } : {}),
    ...(sightReading.length ? { sightReading } : {}),
  };
}
