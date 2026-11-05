"use client";

import { useEffect, useMemo, useState } from "react";
import { EAR_HISTORY_KEY, parseEarHistory } from "@/lib/ear-training";
import { IMPROVISATION_KEY, parseImprovisationHistory } from "@/lib/improvisation";
import { SIGHT_HISTORY_KEY, parseSightHistory } from "@/lib/sight-reading";
import { readActiveSongLibrary } from "@/lib/song-library";
import { trainerStorageKey, parseTrainerState, type TrainerRound } from "@/lib/trainer";
import { learnerStorageKey } from "@/lib/learner-profiles";
import { isInCurrentLocalWeek, localDateKey } from "@/lib/progress";
import type { ProgressState } from "@/lib/types";
import { useLocalization } from "./LocalizationProvider";
import { DEFAULT_WEEKLY_GOAL, WEEKLY_FOCUS_MODES, WEEKLY_GOAL_KEY, parseWeeklyGoalJson, type WeeklyFocusMode, type WeeklyGoal, type WeeklyGoalType } from "@/lib/weekly-practice-goal";

type FocusMode = WeeklyFocusMode;
type WeeklySnapshot = { practiceDays: number; lessons: number; focusCounts: Record<FocusMode, number> };
const EMPTY_SNAPSHOT: WeeklySnapshot = { practiceDays: 0, lessons: 0, focusCounts: { timing: 0, listening: 0, reading: 0, creative: 0, songs: 0 } };

function weekSnapshot(progress: ProgressState, trainerRounds: TrainerRound[], profileId: string): WeeklySnapshot {
  const allDays = new Set<string>();
  const focusCounts: WeeklySnapshot["focusCounts"] = { timing: 0, listening: 0, reading: 0, creative: 0, songs: 0 };
  const note = (at: string, mode?: FocusMode) => {
    const date = localDateKey(at);
    if (!date || !isInCurrentLocalWeek(date)) return;
    allDays.add(date);
    if (mode) focusCounts[mode] += 1;
  };
  progress.practiceDates.forEach((date) => { if (isInCurrentLocalWeek(date)) allDays.add(localDateKey(date)); });
  progress.sessions.forEach((session) => note(session.playedAt, "timing"));
  trainerRounds.forEach((round) => note(round.playedAt, "timing"));
  try {
    parseEarHistory(localStorage.getItem(learnerStorageKey(EAR_HISTORY_KEY, profileId))).filter((item) => !item.assisted).forEach((item) => note(item.playedAt, "listening"));
    parseSightHistory(localStorage.getItem(learnerStorageKey(SIGHT_HISTORY_KEY, profileId))).filter((item) => item.classification === "reading").forEach((item) => note(item.playedAt, "reading"));
    parseImprovisationHistory(localStorage.getItem(learnerStorageKey(IMPROVISATION_KEY, profileId))).forEach((item) => note(item.playedAt, "creative"));
    readActiveSongLibrary().progress.flatMap((item) => item.attempts ?? []).filter((item) => item.completePart !== false).forEach((item) => note(item.playedAt, "songs"));
  } catch { /* Progress available from other modes remains countable. */ }
  const lessons = Object.values(progress.lessonCompletedAt ?? {}).filter((at) => isInCurrentLocalWeek(at)).length;
  return { practiceDays: allDays.size, lessons, focusCounts };
}

export function WeeklyPracticeGoal({ progress, profileId }: { progress: ProgressState; profileId: string }) {
  const { formatNumber, t } = useLocalization();
  const [goal, setGoal] = useState<WeeklyGoal>(DEFAULT_WEEKLY_GOAL);
  const [snapshot, setSnapshot] = useState<WeeklySnapshot>(EMPTY_SNAPSHOT);
  const storageKey = useMemo(() => learnerStorageKey(WEEKLY_GOAL_KEY, profileId), [profileId]);

  useEffect(() => {
    const load = () => {
      try { setGoal(parseWeeklyGoalJson(localStorage.getItem(storageKey))); } catch { setGoal(DEFAULT_WEEKLY_GOAL); }
      let trainerRounds: TrainerRound[] = [];
      try { trainerRounds = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))).rounds; } catch { /* Other practice sources can still count. */ }
      setSnapshot(weekSnapshot(progress, trainerRounds, profileId));
    };
    const timer = window.setTimeout(load, 0);
    const storage = () => load();
    window.addEventListener("storage", storage);
    window.addEventListener("drum-hero:song-library-change", load);
    window.addEventListener("drum-hero:learner-profile-change", load);
    window.addEventListener("drum-hero:trainer-state-import", load);
    window.addEventListener("drum-hero:weekly-goal-change", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", storage);
      window.removeEventListener("drum-hero:song-library-change", load);
      window.removeEventListener("drum-hero:learner-profile-change", load);
      window.removeEventListener("drum-hero:trainer-state-import", load);
      window.removeEventListener("drum-hero:weekly-goal-change", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, [profileId, progress, storageKey]);

  const current = goal.type === "days" ? snapshot.practiceDays : goal.type === "lessons" ? snapshot.lessons : snapshot.focusCounts[goal.focus];
  const progressValue = Math.min(goal.target, current);
  const updateGoal = (next: WeeklyGoal) => {
    setGoal(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new Event("drum-hero:weekly-goal-change")); } catch { /* The choice remains active for this page session. */ }
  };
  const goalName = goal.type === "days" ? t("practice days") : goal.type === "lessons" ? t("lesson completions") : t("{area} sessions", { area: t(goal.focus) });

  return <section className="weekly-goal card" aria-labelledby="weekly-goal-heading">
    <div className="weekly-goal-heading"><div><span className="eyebrow">{t("A goal that fits your week")}</span><h2 id="weekly-goal-heading">{t("Weekly practice goal")}</h2></div><p>{t("Choose a flexible target. Progress follows your local week and does not depend on a daily streak.")}</p></div>
    <div className="weekly-goal-controls">
      <label><span>{t("I want to")}</span><select aria-label={t("Choose a weekly goal type")} value={goal.type} onChange={(event) => updateGoal({ ...goal, type: event.target.value as WeeklyGoalType })}><option value="days">{t("Practice on a number of days")}</option><option value="lessons">{t("Complete lessons")}</option><option value="focus">{t("Focus on one practice area")}</option></select></label>
      {goal.type === "focus" && <label><span>{t("Practice area")}</span><select aria-label={t("Choose a practice area")} value={goal.focus} onChange={(event) => updateGoal({ ...goal, focus: event.target.value as FocusMode })}>{WEEKLY_FOCUS_MODES.map((mode) => <option key={mode} value={mode}>{t(mode)}</option>)}</select></label>}
      <label><span>{t("Weekly target")}</span><select aria-label={t("Choose a weekly target")} value={goal.target} onChange={(event) => updateGoal({ ...goal, target: Number(event.target.value) })}>{Array.from({ length: 7 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{formatNumber(value)}</option>)}</select></label>
    </div>
    <div className="weekly-goal-progress"><div><strong>{t("{current} of {target} {goal}", { current: formatNumber(current), target: formatNumber(goal.target), goal: goalName })}</strong><span>{current >= goal.target ? t("Goal met for this week") : t("There is still time this week")}</span></div><progress aria-label={t("Weekly goal progress")} max={goal.target} value={progressValue} /></div>
  </section>;
}
