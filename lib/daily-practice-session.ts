import { learnerStorageKey } from "./learner-profiles";

const ALLOWED_SESSION_HREF = /^\/(?:trainer|practice|sight-reading|ear-training|improvisation|song-library)(?:\?.*)?$/;

export const DAILY_SESSION_KEY = "drum-hero:daily-practice-session:v1";
export type DailySessionStep = {
  id: string;
  title: string;
  reason: string;
  patternId: string;
  patternName: string;
  minutes: number;
  href: string;
};
export type DailyPracticeSession = {
  version: 1;
  id: string;
  createdAt: string;
  steps: DailySessionStep[];
  completedStepIds: string[];
  skippedStepIds: string[];
  elapsedMs: number;
  runStartedAt: number | null;
  completedAt: string | null;
};

export function dailySessionStorageKey(profileId: string) {
  return learnerStorageKey(DAILY_SESSION_KEY, profileId);
}

/** Freeze an active timer at export time so a transferred session always opens paused. */
export function pauseDailyPracticeSession(session: DailyPracticeSession, at = Date.now()): DailyPracticeSession {
  const elapsedMs = session.elapsedMs + (session.runStartedAt === null ? 0 : Math.max(0, at - session.runStartedAt));
  return { ...session, elapsedMs: Math.min(elapsedMs, 24 * 60 * 60 * 1000), runStartedAt: null };
}

export function parseDailyPracticeSession(raw: string | null): DailyPracticeSession | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const session = value as Partial<DailyPracticeSession>;
    if (session.version !== 1 || typeof session.id !== "string" || !session.id || typeof session.createdAt !== "string" ||
        !Number.isFinite(Date.parse(session.createdAt)) || !Array.isArray(session.steps) || session.steps.length < 1 || session.steps.length > 8 ||
        !Array.isArray(session.completedStepIds) || !Array.isArray(session.skippedStepIds) || !Number.isFinite(session.elapsedMs) || session.elapsedMs! < 0 ||
        !(session.runStartedAt == null || Number.isFinite(session.runStartedAt)) ||
        !(session.completedAt == null || typeof session.completedAt === "string" && Number.isFinite(Date.parse(session.completedAt)))) return null;
    const steps = session.steps.filter((step): step is DailySessionStep => !!step && typeof step.id === "string" && step.id.length <= 100 &&
      typeof step.title === "string" && step.title.length <= 100 && typeof step.reason === "string" && step.reason.length <= 300 &&
      typeof step.patternId === "string" && step.patternId.length <= 200 && typeof step.patternName === "string" && step.patternName.length <= 200 &&
      Number.isInteger(step.minutes) && step.minutes >= 1 && step.minutes <= 60 && typeof step.href === "string" &&
      ALLOWED_SESSION_HREF.test(step.href));
    const validIds = new Set(steps.map((step) => step.id));
    if (steps.length !== session.steps.length || validIds.size !== steps.length ||
        [...session.completedStepIds, ...session.skippedStepIds].some((id) => typeof id !== "string" || !validIds.has(id))) return null;
    const completedStepIds = [...new Set(session.completedStepIds)];
    const skippedStepIds = [...new Set(session.skippedStepIds)];
    if (completedStepIds.some((id) => skippedStepIds.includes(id))) return null;
    if (session.completedAt && steps.some((step) => !completedStepIds.includes(step.id) && !skippedStepIds.includes(step.id))) return null;
    return { ...session, steps, completedStepIds, skippedStepIds, runStartedAt: session.runStartedAt ?? null, completedAt: session.completedAt ?? null, elapsedMs: Math.min(session.elapsedMs!, 24 * 60 * 60 * 1000) } as DailyPracticeSession;
  } catch { return null; }
}
