import { lessons } from "./curriculum";
import { localDateKey } from "./progress";
import { parseDailyPracticeSession, pauseDailyPracticeSession, type DailyPracticeSession } from "./daily-practice-session";
import { parseWeeklyGoal, type WeeklyGoal } from "./weekly-practice-goal";
import { normalizeSong, type DrumSong } from "./song-library";
import { parseCustomGrooves } from "./custom-grooves";
import { parsePortableEarHistory, type EarResult } from "./ear-training";
import { parseSightGoal, parseSightHistory, parseSightTemplates, type SightAttempt, type SightCustomTemplate, type SightGoal } from "./sight-reading";
import type { Groove } from "./types";
import type { ProgressState, SessionResult } from "./types";
import { parseTrainerPortableCoachFeedback, parseTrainerPortableCueSequences, parseTrainerPortableRounds, parseTrainerPortableRoutine, type TrainerPortableData } from "./trainer";

export const PROGRESS_TRANSFER_FORMAT = "drum-hero-learning-archive-v1";
export const LEGACY_PROGRESS_TRANSFER_FORMAT = "drum-hero-progress-transfer-v1";
export const PROGRESS_TRANSFER_MAX_BYTES = 32 * 1024 * 1024;

export type PortableLessonCompletion = { id: string; completedAt?: string };
export type PortableProgressTransfer = {
  application: "Drum Hero";
  format: typeof PROGRESS_TRANSFER_FORMAT | typeof LEGACY_PROGRESS_TRANSFER_FORMAT;
  version: 1;
  exportedAt: string;
  completedLessons: PortableLessonCompletion[];
  practiceSessions: SessionResult[];
  bestScores: Record<string, number>;
  preferredBpm: number;
  guidedPracticeSession?: DailyPracticeSession;
  weeklyGoal?: WeeklyGoal;
  personalSongs?: DrumSong[];
  customGrooves?: Groove[];
  trainerPractice?: TrainerPortableData;
  earTraining?: EarResult[];
  sightReading?: { attempts: SightAttempt[]; goal?: SightGoal; templates?: SightCustomTemplate[] };
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
  extras: { guidedPracticeSession?: DailyPracticeSession | null; weeklyGoal?: WeeklyGoal; personalSongs?: DrumSong[]; customGrooves?: Groove[]; trainerPractice?: TrainerPortableData; earTraining?: EarResult[]; sightReading?: PortableProgressTransfer["sightReading"] } = {}
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
  if (extras.personalSongs?.length) transfer.personalSongs = extras.personalSongs.filter(song => song.bundled !== true).slice(0, 200);
  if (extras.customGrooves?.length) transfer.customGrooves = extras.customGrooves.slice(0, 100);
  if (extras.trainerPractice) transfer.trainerPractice = extras.trainerPractice;
  if (extras.earTraining?.length) transfer.earTraining = extras.earTraining.slice(-100);
  if (extras.sightReading) transfer.sightReading = { attempts: extras.sightReading.attempts.slice(-100), ...(extras.sightReading.goal ? { goal: extras.sightReading.goal } : {}), ...(extras.sightReading.templates?.length ? { templates: extras.sightReading.templates.slice(-40) } : {}) };
  return transfer;
}

export function parseProgressTransfer(raw: string): PortableProgressTransfer {
  if (new TextEncoder().encode(raw).byteLength > PROGRESS_TRANSFER_MAX_BYTES) throw new Error("This learning archive is larger than 32 MB.");
  let input: unknown;
  try { input = JSON.parse(raw); } catch { throw new Error("This file is not a valid Drum Hero learning archive."); }
  if (!input || typeof input !== "object") throw new Error("This file is not a valid Drum Hero learning archive.");
  const value = input as Partial<PortableProgressTransfer>;
  if (value.application !== "Drum Hero" || (value.format !== PROGRESS_TRANSFER_FORMAT && value.format !== LEGACY_PROGRESS_TRANSFER_FORMAT) || value.version !== 1 || !isDate(value.exportedAt)) {
    throw new Error("This file is not a supported Drum Hero learning archive.");
  }
  if (!Number.isInteger(value.preferredBpm) || value.preferredBpm! < 40 || value.preferredBpm! > 200 ||
      !Array.isArray(value.completedLessons) || value.completedLessons.length > 100 ||
      !Array.isArray(value.practiceSessions) || value.practiceSessions.length > 100 ||
      !value.bestScores || typeof value.bestScores !== "object" || Array.isArray(value.bestScores) || Object.keys(value.bestScores).length > 256 ||
      !Object.entries(value.bestScores).every(([id, score]) => id.length > 0 && id.length <= 160 && Number.isInteger(score) && score >= 0 && score <= 100)) {
    throw new Error("The learning archive has invalid or unsupported data.");
  }
  const lessonIds = new Set<string>();
  for (const lesson of value.completedLessons) {
    if (!lesson || typeof lesson.id !== "string" || !lesson.id || lesson.id.length > 120 ||
        (lesson.completedAt !== undefined && !isDate(lesson.completedAt)) || lessonIds.has(lesson.id)) {
      throw new Error("The learning archive contains an invalid lesson record.");
    }
    lessonIds.add(lesson.id);
  }
  if (value.guidedPracticeSession !== undefined && !parseDailyPracticeSession(JSON.stringify(value.guidedPracticeSession))) {
    throw new Error("The learning archive contains an invalid guided practice session.");
  }
  if (value.weeklyGoal !== undefined && !parseWeeklyGoal(value.weeklyGoal)) {
    throw new Error("The learning archive contains an invalid weekly practice goal.");
  }
  if (value.personalSongs !== undefined && (!Array.isArray(value.personalSongs) || value.personalSongs.length > 200 || !value.personalSongs.every(song => normalizeSong(song) !== null))) {
    throw new Error("The learning archive contains an invalid personal song.");
  }
  if (value.customGrooves !== undefined && (!Array.isArray(value.customGrooves) || value.customGrooves.length > 100 || parseCustomGrooves(JSON.stringify(value.customGrooves)).length !== value.customGrooves.length)) {
    throw new Error("The learning archive contains an invalid custom groove.");
  }
  let trainerPractice: TrainerPortableData | undefined;
  if (value.trainerPractice !== undefined) {
    const rawTrainer = value.trainerPractice as Partial<TrainerPortableData> | null;
    if (!rawTrainer || typeof rawTrainer !== "object" || !Array.isArray(rawTrainer.rounds)) throw new Error("The learning archive contains invalid Trainer data.");
    const rounds = parseTrainerPortableRounds(rawTrainer.rounds);
    const routine = rawTrainer.routine === undefined ? undefined : parseTrainerPortableRoutine(rawTrainer.routine);
    const cueSequences = rawTrainer.cueSequences === undefined ? undefined : parseTrainerPortableCueSequences(rawTrainer.cueSequences);
    const coachFeedback = rawTrainer.coachFeedback === undefined ? undefined : parseTrainerPortableCoachFeedback(rawTrainer.coachFeedback);
    if (!rounds || (rawTrainer.routine !== undefined && !routine) || (rawTrainer.cueSequences !== undefined && !cueSequences) || (rawTrainer.coachFeedback !== undefined && !coachFeedback)) {
      throw new Error("The learning archive contains invalid Trainer rounds, routines, cue sequences, or coach notes.");
    }
    trainerPractice = { rounds, ...(routine ? { routine } : {}), ...(cueSequences ? { cueSequences } : {}), ...(coachFeedback ? { coachFeedback } : {}) };
  }
  const earTraining = value.earTraining === undefined ? undefined : parsePortableEarHistory(value.earTraining);
  if (value.earTraining !== undefined && !earTraining) throw new Error("The learning archive contains invalid ear-training history.");
  let sightReading: PortableProgressTransfer["sightReading"];
  if (value.sightReading !== undefined) {
    const rawSight = value.sightReading;
    if (!rawSight || typeof rawSight !== "object" || !Array.isArray(rawSight.attempts) || rawSight.attempts.length > 100 ||
        (rawSight.goal !== undefined && !parseSightGoal(JSON.stringify(rawSight.goal))) ||
        (rawSight.templates !== undefined && (!Array.isArray(rawSight.templates) || rawSight.templates.length > 40 || parseSightTemplates(JSON.stringify(rawSight.templates)).length !== rawSight.templates.length))) {
      throw new Error("The learning archive contains invalid sight-reading data.");
    }
    const parsedAttempts = parseSightHistory(JSON.stringify({ version: 1, attempts: rawSight.attempts }));
    if (parsedAttempts.length !== rawSight.attempts.length || new Set(parsedAttempts.map(row => row.id)).size !== parsedAttempts.length) throw new Error("The learning archive contains invalid sight-reading attempts.");
    sightReading = { attempts: parsedAttempts, ...(rawSight.goal ? { goal: parseSightGoal(JSON.stringify(rawSight.goal))! } : {}), ...(rawSight.templates?.length ? { templates: parseSightTemplates(JSON.stringify(rawSight.templates)) } : {}) };
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
      throw new Error("The learning archive contains an invalid practice session.");
    }
    sessionIds.add(session.id);
  }
  return {
    ...value,
    personalSongs: value.personalSongs?.map(song => normalizeSong(song)!).filter(song => song.bundled !== true),
    customGrooves: value.customGrooves === undefined ? undefined : parseCustomGrooves(JSON.stringify(value.customGrooves)),
    trainerPractice,
    earTraining,
    sightReading
  } as PortableProgressTransfer;
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
