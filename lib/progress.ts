import { lessons } from "./curriculum";
import type { Level, ProgressState, SessionResult } from "./types";

export const STORAGE_KEY = "drum-hero:progress:v1";
export const defaultProgress: ProgressState = { version: 1, completedLessons: [], lessonCompletedAt: {}, sessions: [], bestScores: {}, practiceDates: [], settings: { sound: true, preferredBpm: 80 } };

/** Return a stable calendar key in the current learner's local time zone. */
export function localDateKey(value: Date | string = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const calendarDate = new Date(year, month - 1, day);
    return calendarDate.getFullYear() === year && calendarDate.getMonth() === month - 1 && calendarDate.getDate() === day ? value : "";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseProgress(raw: string | null): ProgressState {
  if (!raw) return structuredClone(defaultProgress);
  try {
    const value = JSON.parse(raw) as Partial<ProgressState>;
    if (value.version !== 1 || !Array.isArray(value.completedLessons) || !Array.isArray(value.sessions) || !value.settings) return structuredClone(defaultProgress);
    return {
      version: 1,
      completedLessons: value.completedLessons.filter((id): id is string => typeof id === "string"),
      lessonCompletedAt: value.lessonCompletedAt && typeof value.lessonCompletedAt === "object" && !Array.isArray(value.lessonCompletedAt)
        ? Object.fromEntries(Object.entries(value.lessonCompletedAt).filter(([id, at]) => typeof id === "string" && id.length <= 120 && typeof at === "string" && Number.isFinite(Date.parse(at))).slice(0, 100))
        : {},
      sessions: value.sessions.filter((session): session is SessionResult => Boolean(session && typeof session.score === "number")).slice(0, 50),
      bestScores: value.bestScores && typeof value.bestScores === "object" ? value.bestScores : {},
      practiceDates: Array.isArray(value.practiceDates) ? [...new Set(value.practiceDates.filter((date): date is string => typeof date === "string" && localDateKey(date) === date))].sort() : [],
      settings: { sound: value.settings.sound !== false, preferredBpm: Math.min(200, Math.max(40, Number(value.settings.preferredBpm) || 80)) }
    };
  } catch { return structuredClone(defaultProgress); }
}

export function addSession(state: ProgressState, result: SessionResult): ProgressState {
  const day = localDateKey(result.playedAt);
  return {
    ...state,
    sessions: [result, ...state.sessions].slice(0, 50),
    bestScores: { ...state.bestScores, [result.patternId]: Math.max(state.bestScores[result.patternId] ?? 0, result.score) },
    practiceDates: day ? [...new Set([...state.practiceDates, day])].sort() : state.practiceDates
  };
}

export function calculateStreak(dates: string[], today = new Date()) {
  const days = new Set(dates);
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayKey = localDateKey(cursor);
  if (!days.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localDateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

export function currentLocalWeekStart(today = new Date()): string {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return localDateKey(start);
}

export function isInCurrentLocalWeek(value: string, today = new Date()): boolean {
  const key = localDateKey(value);
  return !!key && key >= currentLocalWeekStart(today) && key <= localDateKey(today);
}

export function levelProgress(completed: string[], level: Level) {
  const levelLessons = lessons.filter((lesson) => lesson.level === level);
  const done = levelLessons.filter((lesson) => completed.includes(lesson.id)).length;
  return { done, total: levelLessons.length, percent: Math.round((done / levelLessons.length) * 100) };
}

export function recommendNext(completed: string[]) {
  return lessons.find((lesson) => !completed.includes(lesson.id)) ?? lessons[0];
}

