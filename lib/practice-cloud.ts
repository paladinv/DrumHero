import { parseProgress } from "@/lib/progress";
import { parseTrainerState } from "@/lib/trainer";
import type { ProgressState } from "@/lib/types";
import type { TrainerState } from "@/lib/trainer";

export type PracticeCloudData = { version: 1; progress: ProgressState; trainer: TrainerState };

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
  return { version: 1, progress: parseProgress(JSON.stringify(value.progress)), trainer: parseTrainerState(JSON.stringify(value.trainer)) };
}

export function mergePracticeCloudData(device: PracticeCloudData, cloud: PracticeCloudData): PracticeCloudData {
  const sessions = new Map([...cloud.progress.sessions, ...device.progress.sessions].map((item) => [item.id, item]));
  const rounds = new Map([...cloud.trainer.rounds, ...device.trainer.rounds].map((item) => [item.id, item]));
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
      rounds: [...rounds.values()].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 50),
      deviceProfiles: { ...cloud.trainer.deviceProfiles, ...device.trainer.deviceProfiles },
    },
  };
}
