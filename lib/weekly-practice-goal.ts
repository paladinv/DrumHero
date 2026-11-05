export const WEEKLY_GOAL_KEY = "drum-hero:weekly-goal:v1";

export type WeeklyGoalType = "days" | "lessons" | "focus";
export type WeeklyFocusMode = "timing" | "listening" | "reading" | "creative" | "songs";
export type WeeklyGoal = { version: 1; type: WeeklyGoalType; target: number; focus: WeeklyFocusMode };

export const WEEKLY_FOCUS_MODES: WeeklyFocusMode[] = ["timing", "listening", "reading", "creative", "songs"];
export const DEFAULT_WEEKLY_GOAL: WeeklyGoal = { version: 1, type: "days", target: 3, focus: "timing" };

export function parseWeeklyGoal(value: unknown): WeeklyGoal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<WeeklyGoal>;
  if (candidate.version === 1 && ["days", "lessons", "focus"].includes(String(candidate.type)) &&
      Number.isInteger(candidate.target) && candidate.target! >= 1 && candidate.target! <= 7 &&
      WEEKLY_FOCUS_MODES.includes(candidate.focus as WeeklyFocusMode)) return candidate as WeeklyGoal;
  return null;
}

export function parseWeeklyGoalJson(raw: string | null): WeeklyGoal {
  try { return parseWeeklyGoal(JSON.parse(raw ?? "null")) ?? DEFAULT_WEEKLY_GOAL; }
  catch { return DEFAULT_WEEKLY_GOAL; }
}
