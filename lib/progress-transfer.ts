import { lessons } from "./curriculum";
import { localDateKey } from "./progress";
import { parseDailyPracticeSession, pauseDailyPracticeSession, type DailyPracticeSession } from "./daily-practice-session";
import { parseWeeklyGoal, type WeeklyGoal } from "./weekly-practice-goal";
import type { ProgressState, SessionResult } from "./types";

export const PROGRESS_TRANSFER_FORMAT = "drum-hero-progress-transfer-v1";
export const PROGRESS_TRANSFER_MAX_BYTES = 4 * 1024 * 1024;

export type PortableLessonCompletion = { id: string; completedAt?: string };
export type PortableProgressTransfer = {
  application: "Drum Hero";
  format: typeof PROGRESS_TRANSFER_FORMAT;
  version: 1;
  exportedAt: string;
  completedLessons: PortableLessonCompletion[];
  practiceSessions: SessionResult[];
  bestScores: Record<string, number>;
  preferredBpm: number;
  guidedPracticeSession?: DailyPracticeSession;
  weeklyGoal?: WeeklyGoal;
};

export type ProgressTransferMerge = {
  progress: ProgressState;
  addedLessons: number;
  addedSessions: number;
  ignoredLessons: number;
};

const isDate = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));

export function createProgressTransfer(
  progress: ProgressState,
  exportedAt = new Date().toISOString(),
  extras: { guidedPracticeSession?: DailyPracticeSession | null; weeklyGoal?: WeeklyGoal } = {}
): PortableProgressTransfer {
  const transfer: PortableProgressTransfer = {
    application: "Drum Hero",
    format: PROGRESS_TRANSFER_FORMAT,
    version: 1,
    exportedAt,
    completedLessons: progress.completedLessons.map((id) => ({ id, completedAt: progress.lessonCompletedAt?.[id] })),
    practiceSessions: progress.sessions.slice(0, 50),
    bestScores: progress.bestScores,
    preferredBpm: progress.settings.preferredBpm
  };
  if (extras.guidedPracticeSession) transfer.guidedPracticeSession = pauseDailyPracticeSession(extras.guidedPracticeSession);
  if (extras.weeklyGoal) transfer.weeklyGoal = extras.weeklyGoal;
  return transfer;
}

export function parseProgressTransfer(raw: string): PortableProgressTransfer {
  if (new TextEncoder().encode(raw).byteLength > PROGRESS_TRANSFER_MAX_BYTES) throw new Error("This progress transfer is larger than 4 MB.");
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error("This file is not a valid Drum Hero progress transfer."); }
  if (!input || typeof input !== "object") throw new Error("This file is not a valid Drum Hero progress transfer.");
  const value = input as Partial<PortableProgressTransfer>;
  if (value.application !== "Drum Hero" || value.format !== PROGRESS_TRANSFER_FORMAT || value.version !== 1 || !isDate(value.exportedAt)) {
    throw new Error("This file is not a supported Drum Hero progress transfer.");
  }
  if (!Number.isInteger(value.preferredBpm) || value.preferredBpm! < 40 || value.preferredBpm! > 200 ||
      !Array.isArray(value.completedLessons) || value.completedLessons.length > 100 ||
      !Array.isArray(value.practiceSessions) || value.practiceSessions.length > 100 ||
      !value.bestScores || typeof value.bestScores !== "object" || Array.isArray(value.bestScores) || Object.keys(value.bestScores).length > 256 ||
      !Object.entries(value.bestScores).every(([id, score]) => id.length > 0 && id.length <= 160 && Number.isInteger(score) && score >= 0 && score <= 100)) {
    throw new Error("The progress transfer has invalid or unsupported data.");
  }
  const lessonIds = new Set<string>();
  for (const lesson of value.completedLessons) {
    if (!lesson || typeof lesson.id !== "string" || !lesson.id || lesson.id.length > 120 ||
        (lesson.completedAt !== undefined && !isDate(lesson.completedAt)) || lessonIds.has(lesson.id)) {
      throw new Error("The progress transfer contains an invalid lesson record.");
    }
    lessonIds.add(lesson.id);
  }
  if (value.guidedPracticeSession !== undefined && !parseDailyPracticeSession(JSON.stringify(value.guidedPracticeSession))) {
    throw new Error("The progress transfer contains an invalid guided practice session.");
  }
  if (value.weeklyGoal !== undefined && !parseWeeklyGoal(value.weeklyGoal)) {
    throw new Error("The progress transfer contains an invalid weekly practice goal.");
  }
  const sessionIds = new Set<string>();
  for (const session of value.practiceSessions) {
    if (!session || typeof session.id !== "string" || !session.id || session.id.length > 120 || sessionIds.has(session.id) ||
        typeof session.patternId !== "string" || !session.patternId || session.patternId.length > 160 ||
        typeof session.patternName !== "string" || !session.patternName || session.patternName.length > 200 ||
        !Number.isInteger(session.bpm) || session.bpm < 40 || session.bpm > 200 || !isDate(session.playedAt) ||
        !Number.isInteger(session.score) || session.score < 0 || session.score > 100 ||
        !Number.isInteger(session.accuracy) || session.accuracy < 0 || session.accuracy > 100 ||
        ![session.great, session.good, session.miss, session.extra, session.maxCombo].every((count) => Number.isInteger(count) && count >= 0 && count <= 100_000)) {
      throw new Error("The progress transfer contains an invalid practice session.");
    }
    sessionIds.add(session.id);
  }
  return value as PortableProgressTransfer;
}

export function mergeProgressTransfer(current: ProgressState, transfer: PortableProgressTransfer): ProgressTransferMerge {
  const validLessonIds = new Set(lessons.map((lesson) => lesson.id));
  const incomingLessons = transfer.completedLessons.filter((lesson) => validLessonIds.has(lesson.id));
  const completedLessons = [...new Set([...current.completedLessons, ...incomingLessons.map((lesson) => lesson.id)])];
  const lessonCompletedAt = { ...current.lessonCompletedAt };
  for (const lesson of incomingLessons) if (lesson.completedAt && !lessonCompletedAt[lesson.id]) lessonCompletedAt[lesson.id] = lesson.completedAt;
  const sessionsById = new Map(current.sessions.map((session) => [session.id, session]));
  const existingIds = new Set(sessionsById.keys());
  for (const session of transfer.practiceSessions) {
    sessionsById.set(session.id, session);
  }
  const sessions = [...sessionsById.values()].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 50);
  const bestScores = { ...current.bestScores };
  for (const [patternId, score] of Object.entries(transfer.bestScores)) bestScores[patternId] = Math.max(bestScores[patternId] ?? 0, score);
  for (const session of transfer.practiceSessions) bestScores[session.patternId] = Math.max(bestScores[session.patternId] ?? 0, session.score);
  const practiceDates = [...new Set([
    ...current.practiceDates,
    ...transfer.practiceSessions.map((session) => localDateKey(session.playedAt))
  ])].sort();
  return {
    progress: {
      ...current,
      completedLessons,
      lessonCompletedAt,
      sessions,
      bestScores,
      practiceDates,
      settings: { ...current.settings, preferredBpm: transfer.preferredBpm }
    },
    addedLessons: incomingLessons.filter((lesson) => !current.completedLessons.includes(lesson.id)).length,
    addedSessions: sessions.filter((session) => !existingIds.has(session.id)).length,
    ignoredLessons: transfer.completedLessons.length - incomingLessons.length
  };
}
