export type TrainerReviewReminder = {
  id: string;
  patternId: string;
  patternName: string;
  dueAt: string;
  repeatDays: 0 | 7 | 14;
};

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
      return [{ id: reminder.id.slice(0, 100), patternId: reminder.patternId.slice(0, 200), patternName: reminder.patternName.slice(0, 80), dueAt: reminder.dueAt, repeatDays }];
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

export function completeTrainerReviewForPattern(profileId: string, patternId: string, now = Date.now()) {
  let changed = false;
  const reminders = readTrainerReviewReminders(profileId).flatMap(item => {
    if (item.patternId !== patternId) return [item];
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
