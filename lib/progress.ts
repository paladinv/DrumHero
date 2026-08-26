import { lessons } from "./curriculum";
import type { Level, ProgressState, SessionResult } from "./types";

export const STORAGE_KEY = "drum-hero:progress:v1";
export const defaultProgress: ProgressState = { version: 1, completedLessons: [], sessions: [], bestScores: {}, practiceDates: [], settings: { sound: true, preferredBpm: 80 } };

export function parseProgress(raw: string | null): ProgressState {
  if (!raw) return structuredClone(defaultProgress);
  try {
    const value = JSON.parse(raw) as Partial<ProgressState>;
    if (value.version !== 1 || !Array.isArray(value.completedLessons) || !Array.isArray(value.sessions) || !value.settings) return structuredClone(defaultProgress);
    return {
      version: 1,
      completedLessons: value.completedLessons.filter((id): id is string => typeof id === "string"),
      sessions: value.sessions.filter((session): session is SessionResult => Boolean(session && typeof session.score === "number")).slice(0, 50),
      bestScores: value.bestScores && typeof value.bestScores === "object" ? value.bestScores : {},
      practiceDates: Array.isArray(value.practiceDates) ? value.practiceDates.filter((date): date is string => typeof date === "string") : [],
      settings: { sound: value.settings.sound !== false, preferredBpm: Math.min(200, Math.max(40, Number(value.settings.preferredBpm) || 80)) }
    };
  } catch { return structuredClone(defaultProgress); }
}

export function addSession(state: ProgressState, result: SessionResult): ProgressState {
  const day = result.playedAt.slice(0, 10);
  return {
    ...state,
    sessions: [result, ...state.sessions].slice(0, 50),
    bestScores: { ...state.bestScores, [result.patternId]: Math.max(state.bestScores[result.patternId] ?? 0, result.score) },
    practiceDates: [...new Set([...state.practiceDates, day])].sort()
  };
}

export function calculateStreak(dates: string[], today = new Date()) {
  const days = new Set(dates);
  let cursor = new Date(today);
  const todayKey = cursor.toISOString().slice(0, 10);
  if (!days.has(todayKey)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) { streak += 1; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return streak;
}

export function levelProgress(completed: string[], level: Level) {
  const levelLessons = lessons.filter((lesson) => lesson.level === level);
  const done = levelLessons.filter((lesson) => completed.includes(lesson.id)).length;
  return { done, total: levelLessons.length, percent: Math.round((done / levelLessons.length) * 100) };
}

export function recommendNext(completed: string[]) {
  return lessons.find((lesson) => !completed.includes(lesson.id)) ?? lessons[0];
}

