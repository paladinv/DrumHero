"use client";

import { useEffect, useState } from "react";
import type { PracticePattern } from "@/lib/types";
import type { TrainerRound } from "@/lib/trainer";
import { readTrainerReviewReminders, recommendTrainerWeakSpot, TRAINER_REVIEW_REMINDERS_EVENT, trainerReviewRemindersKey, writeTrainerReviewReminders, type TrainerReviewFocus, type TrainerReviewReminder } from "@/lib/trainer-review-reminders";

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function TrainerReviewReminders({ profileId, patterns, rounds, disabled, onPractice }: { profileId: string; patterns: PracticePattern[]; rounds: TrainerRound[]; disabled: boolean; onPractice: (patternId: string, focus?: TrainerReviewFocus, sourceRoundId?: string) => void }) {
  const [reminders, setReminders] = useState<TrainerReviewReminder[]>([]);
  const [ready, setReady] = useState(false);
  const [patternId, setPatternId] = useState(patterns[0]?.id ?? "");
  const [repeatDays, setRepeatDays] = useState<0 | 7 | 14>(0);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const [dueDate, setDueDate] = useState(dayKey(tomorrow));
  const today = dayKey(new Date());

  useEffect(() => {
    const timer = window.setTimeout(() => { setReminders(readTrainerReviewReminders(profileId)); setReady(true); }, 0);
    return () => window.clearTimeout(timer);
  }, [profileId]);

  useEffect(() => {
    if (!ready) return;
    const weakSpot = recommendTrainerWeakSpot(rounds, patterns);
    if (!weakSpot || reminders.some(item => item.sourceRoundId === weakSpot.sourceRoundId)) return;
    const pattern = patterns.find(item => item.id === weakSpot.patternId);
    if (!pattern) return;
    const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(0, 0, 0, 0);
    const generated: TrainerReviewReminder = {
      id: crypto.randomUUID(), patternId: pattern.id, patternName: pattern.name, dueAt: due.toISOString(), repeatDays: 0,
      focus: { instrument: weakSpot.instrument, beat: weakSpot.beat }, sourceRoundId: weakSpot.sourceRoundId,
    };
    const next = [generated, ...reminders.filter(item => item.patternId !== pattern.id || !item.focus)].slice(0, 30);
    if (writeTrainerReviewReminders(profileId, next)) setReminders(next);
  }, [patterns, profileId, ready, reminders, rounds]);

  useEffect(() => {
    const update = () => setReminders(readTrainerReviewReminders(profileId));
    const onStorage = (event: StorageEvent) => { if (event.key === trainerReviewRemindersKey(profileId)) update(); };
    window.addEventListener(TRAINER_REVIEW_REMINDERS_EVENT, update);
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener(TRAINER_REVIEW_REMINDERS_EVENT, update); window.removeEventListener("storage", onStorage); };
  }, [profileId]);

  const save = (next: TrainerReviewReminder[]) => {
    if (writeTrainerReviewReminders(profileId, next)) setReminders(next);
  };
  const add = () => {
    const selected = patterns.find(item => item.id === patternId);
    if (!selected || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return;
    const due = new Date(`${dueDate}T00:00:00`);
    if (!Number.isFinite(due.getTime()) || dueDate < today) return;
    save([{ id: crypto.randomUUID(), patternId: selected.id, patternName: selected.name, dueAt: due.toISOString(), repeatDays }, ...reminders.filter(item => item.patternId !== selected.id)].slice(0, 30));
  };
  const snooze = (item: TrainerReviewReminder, days: 1 | 7) => {
    const due = new Date(); due.setDate(due.getDate() + days); due.setHours(0, 0, 0, 0);
    save(reminders.map(entry => entry.id === item.id ? { ...entry, dueAt: due.toISOString() } : entry));
  };
  const due = reminders.filter(item => dayKey(new Date(item.dueAt)) <= today);

  return <details className="trainer-review-reminders">
    <summary>Review reminders · {due.length} due</summary>
    <p>Due reminders also appear on Home. Completing a scored round for a reminder pattern clears it or schedules its next repeat.</p>
    <div className="trainer-review-reminder-form">
      <label>Pattern<select value={patternId} disabled={disabled || !patterns.length} onChange={event => setPatternId(event.target.value)}>{patterns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Review on<input type="date" min={today} value={dueDate} disabled={disabled} onChange={event => setDueDate(event.target.value)} /></label>
      <label>Repeat<select value={repeatDays} disabled={disabled} onChange={event => setRepeatDays(Number(event.target.value) as typeof repeatDays)}><option value={0}>One time</option><option value={7}>Weekly</option><option value={14}>Every 2 weeks</option></select></label>
      <button type="button" disabled={disabled || !ready || !patternId || dueDate < today} onClick={add}>Set reminder</button>
    </div>
    {reminders.length ? <ul>{reminders.map(item => {
      const isDue = dayKey(new Date(item.dueAt)) <= today;
      const isAvailable = patterns.some(pattern => pattern.id === item.patternId);
      return <li key={item.id} className={isDue ? "is-due" : ""}>
        <div><strong>{item.patternName}</strong><span>{item.focus ? `Weak spot · ${item.focus.instrument} · beat ${item.focus.beat}` : ""}{item.sourceRoundId ? " · suggested from recent accuracy" : ""}{isAvailable ? isDue ? " · Review is due" : ` · Review on ${new Date(item.dueAt).toLocaleDateString()}` : " · Pattern no longer available"}{item.repeatDays ? ` · repeats every ${item.repeatDays} days` : ""}</span></div>
        <button type="button" disabled={disabled || !isAvailable} onClick={() => onPractice(item.patternId, item.focus, item.sourceRoundId)}>{item.focus ? "Practise weak spot" : "Practise"}</button>
        {isDue && <><button type="button" className="button-secondary" disabled={disabled} onClick={() => snooze(item, 1)}>Snooze 1 day</button><button type="button" className="button-secondary" disabled={disabled} onClick={() => snooze(item, 7)}>Snooze 1 week</button></>}
        <button type="button" className="button-secondary" disabled={disabled} onClick={() => save(reminders.filter(entry => entry.id !== item.id))}>{isDue ? "Done" : "Remove"}</button>
      </li>;
    })}</ul> : <p>No review reminders saved yet.</p>}
  </details>;
}
