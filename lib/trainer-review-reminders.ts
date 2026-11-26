import type { Instrument, PracticePattern } from "./types";
import type { TrainerRound } from "./trainer";

export type TrainerReviewFocus = { instrument: Instrument; beat: number };
export type TrainerReviewReminder = {
  id: string;
  patternId: string;
  patternName: string;
  dueAt: string;
  repeatDays: 0 | 7 | 14;
  focus?: TrainerReviewFocus;
  sourceRoundId?: string;
};

export function recommendTrainerWeakSpot(rounds: TrainerRound[], patterns: PracticePattern[]) {
  const patternById = new Map(patterns.map(pattern => [pattern.id, pattern]));
  const reliable = rounds.filter(round => round.mode === "scored" && round.result && !round.inputClipped && !round.uncertainDetections && !round.focusedDrill && !round.learningMode && (!round.adaptation || round.adaptation === "standard"))
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 20);
  const metrics = new Map<string, { patternId: string; instrument: Instrument; beat: number; total: number; onTime: number; sourceRoundId: string }>();
  for (const round of reliable) {
    const pattern = patternById.get(round.patternId);
    const spots = round.compactAnalysis?.byBeatVoice;
    if (spots?.length) {
      for (const spot of spots) {
        const key = `${round.patternId}:${spot.instrument}:${spot.beat}`;
        const current = metrics.get(key) ?? { patternId: round.patternId, instrument: spot.instrument, beat: spot.beat, total: 0, onTime: 0, sourceRoundId: round.id };
        current.total += spot.total; current.onTime += spot.onTime;
        metrics.set(key, current);
      }
      continue;
    }
    if (!pattern || !round.hits?.length) continue;
    const stepsPerBeat = pattern.subdivision / 4;
    for (const hit of round.hits) {
      if (hit.rating === "extra" || hit.transition === "landing" || !Number.isInteger(hit.step)) continue;
      const beat = Math.floor(hit.step! / stepsPerBeat) + 1;
      const key = `${round.patternId}:${hit.instrument}:${beat}`;
      const current = metrics.get(key) ?? { patternId: round.patternId, instrument: hit.instrument, beat, total: 0, onTime: 0, sourceRoundId: round.id };
      current.total += 1;
      if (hit.rating === "great" || hit.rating === "good") current.onTime += 1;
      metrics.set(key, current);
    }
  }
  const weakest = [...metrics.values()].filter(item => item.total >= 4 && item.onTime / item.total < 0.8)
    .sort((a, b) => a.onTime / a.total - b.onTime / b.total || b.total - a.total)[0];
  return weakest ? { ...weakest, accuracy: Math.round(weakest.onTime / weakest.total * 100) } : null;
}

export const TRAINER_REVIEW_REMINDERS_EVENT = "drum-hero:trainer-review-reminders-change";

export function trainerReviewRemindersKey(profileId: string) {
  return `drum-hero:trainer-review-reminders:v1:${profileId}`;
}

export function parseTrainerReviewReminders(raw: string | null): TrainerReviewReminder[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.slice(0, 30).flatMap((item): TrainerReviewReminder[] => {
      if (!item || typeof item !== "object") return [];
      const reminder = item as Record<string, unknown>;
      if (typeof reminder.id !== "string" || typeof reminder.patternId !== "string" || typeof reminder.patternName !== "string" ||
        typeof reminder.dueAt !== "string" || !Number.isFinite(Date.parse(reminder.dueAt))) return [];
      const repeatDays = reminder.repeatDays === 7 || reminder.repeatDays === 14 ? reminder.repeatDays : 0;
      const focusValue = reminder.focus && typeof reminder.focus === "object" ? reminder.focus as Record<string, unknown> : null;
      const focus = focusValue && ["kick", "snare", "hihat", "tom", "crash"].includes(String(focusValue.instrument)) && Number.isInteger(focusValue.beat) && Number(focusValue.beat) >= 1 && Number(focusValue.beat) <= 64
        ? { instrument: focusValue.instrument as Instrument, beat: Number(focusValue.beat) } : undefined;
      const sourceRoundId = typeof reminder.sourceRoundId === "string" && reminder.sourceRoundId.length <= 120 ? reminder.sourceRoundId : undefined;
      return [{ id: reminder.id.slice(0, 100), patternId: reminder.patternId.slice(0, 200), patternName: reminder.patternName.slice(0, 80), dueAt: reminder.dueAt, repeatDays, ...(focus ? { focus } : {}), ...(sourceRoundId ? { sourceRoundId } : {}) }];
    });
  } catch { return []; }
}

export function readTrainerReviewReminders(profileId: string): TrainerReviewReminder[] {
  if (typeof window === "undefined") return [];
  try { return parseTrainerReviewReminders(localStorage.getItem(trainerReviewRemindersKey(profileId))); }
  catch { return []; }
}

export function writeTrainerReviewReminders(profileId: string, reminders: TrainerReviewReminder[]) {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(trainerReviewRemindersKey(profileId), JSON.stringify(reminders.slice(0, 30)));
    window.dispatchEvent(new CustomEvent(TRAINER_REVIEW_REMINDERS_EVENT));
    return true;
  } catch { return false; }
}

export function completeTrainerReviewForPattern(profileId: string, patternId: string, practicedFocus?: TrainerReviewFocus, now = Date.now()) {
  let changed = false;
  const reminders = readTrainerReviewReminders(profileId).flatMap(item => {
    if (item.patternId !== patternId) return [item];
    if (item.focus && (item.focus.instrument !== practicedFocus?.instrument || item.focus.beat !== practicedFocus.beat)) return [item];
    changed = true;
    if (!item.repeatDays) return [];
    const due = new Date(now);
    due.setDate(due.getDate() + item.repeatDays);
    due.setHours(0, 0, 0, 0);
    return [{ ...item, dueAt: due.toISOString() }];
  });
  if (changed) writeTrainerReviewReminders(profileId, reminders);
}

export function snoozeTrainerReviewReminder(profileId: string, reminderId: string, days: 1 | 7, now = Date.now()) {
  const due = new Date(now);
  due.setDate(due.getDate() + days);
  due.setHours(0, 0, 0, 0);
  const reminders = readTrainerReviewReminders(profileId);
  if (!reminders.some(item => item.id === reminderId)) return;
  writeTrainerReviewReminders(profileId, reminders.map(item => item.id === reminderId ? { ...item, dueAt: due.toISOString() } : item));
}
