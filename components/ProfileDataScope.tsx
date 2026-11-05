"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { learnerStorageKey, LEARNER_PROFILES_KEY, readLearnerProfiles } from "@/lib/learner-profiles";
import { parseTrainerState, trainerStorageKey } from "@/lib/trainer";
import { dailySessionStorageKey, parseDailyPracticeSession } from "@/lib/daily-practice-session";
import { WEEKLY_GOAL_KEY, parseWeeklyGoalJson } from "@/lib/weekly-practice-goal";
import { allSongs, readSongLibrary } from "@/lib/song-library";
import { readCustomGrooves } from "@/lib/custom-grooves";
import { listStoredAudio } from "@/lib/audio-storage";
import { useProgress } from "./ProgressProvider";
import { useLocalization } from "./LocalizationProvider";

type ScopeSnapshot = {
  profileName: string;
  lessons: number;
  practiceSessions: number;
  trainerRounds: number;
  hasGuidedSession: boolean;
  weeklyGoal: ReturnType<typeof parseWeeklyGoalJson>;
  personalSongs: number;
  customGrooves: number;
  savedAudio: number | null;
};

export function ProfileDataScope() {
  const { profileId, progress } = useProgress();
  const { t, formatNumber } = useLocalization();
  const disclosure = useRef<HTMLDetailsElement | null>(null);
  const [snapshot, setSnapshot] = useState<ScopeSnapshot | null>(null);
  const refresh = useCallback(async (includeAudio = false) => {
    try {
      const profiles = readLearnerProfiles(localStorage.getItem(LEARNER_PROFILES_KEY));
      const trainer = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId)));
      const session = parseDailyPracticeSession(localStorage.getItem(dailySessionStorageKey(profileId)));
      const goal = parseWeeklyGoalJson(localStorage.getItem(learnerStorageKey(WEEKLY_GOAL_KEY, profileId)));
      const library = readSongLibrary();
      let savedAudio: number | null = null;
      if (includeAudio) try { savedAudio = (await listStoredAudio()).length; } catch { /* The IndexedDB shelf may not be available in this browser. */ }
      setSnapshot({
        profileName: profiles.find((profile) => profile.id === profileId)?.name ?? "This device",
        lessons: progress.completedLessons.length,
        practiceSessions: progress.sessions.length,
        trainerRounds: trainer.rounds.length,
        hasGuidedSession: Boolean(session && !session.completedAt),
        weeklyGoal: goal,
        personalSongs: allSongs(library).filter((song) => !song.bundled).length,
        customGrooves: readCustomGrooves().length,
        savedAudio: includeAudio ? savedAudio : null,
      });
    } catch {
      setSnapshot(null);
    }
  }, [profileId, progress]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const update = () => void refresh(Boolean(disclosure.current?.open));
    window.addEventListener("storage", update);
    window.addEventListener("drum-hero:learner-profile-change", update);
    window.addEventListener("drum-hero:trainer-state-import", update);
    window.addEventListener("drum-hero:daily-session-change", update);
    window.addEventListener("drum-hero:weekly-goal-change", update);
    window.addEventListener("drum-hero:song-library-change", update);
    window.addEventListener("drum-hero:custom-grooves-change", update);
    window.addEventListener("drum-hero:audio-storage-change", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", update);
      window.removeEventListener("drum-hero:learner-profile-change", update);
      window.removeEventListener("drum-hero:trainer-state-import", update);
      window.removeEventListener("drum-hero:daily-session-change", update);
      window.removeEventListener("drum-hero:weekly-goal-change", update);
      window.removeEventListener("drum-hero:song-library-change", update);
      window.removeEventListener("drum-hero:custom-grooves-change", update);
      window.removeEventListener("drum-hero:audio-storage-change", update);
    };
  }, [refresh]);

  return <details ref={disclosure} className="profile-data-scope song-tool-panel" onToggle={(event) => { if (event.currentTarget.open) void refresh(true); }}>
    <summary>{t("See what belongs to this learner and what is shared")}</summary>
    {snapshot ? <>
      <h3>{t("{name} · this learner profile", { name: snapshot.profileName })}</h3>
      <p>{t("{lessons} completed lessons · {sessions} Practice Pad sessions · {rounds} Trainer rounds · {sessionStatus} · weekly goal: {goal}.", { lessons: formatNumber(snapshot.lessons), sessions: formatNumber(snapshot.practiceSessions), rounds: formatNumber(snapshot.trainerRounds), sessionStatus: t(snapshot.hasGuidedSession ? "a saved guided session" : "no unfinished guided session"), goal: snapshot.weeklyGoal.type === "days" ? `${formatNumber(snapshot.weeklyGoal.target)} ${t("practice days")}` : snapshot.weeklyGoal.type === "lessons" ? `${formatNumber(snapshot.weeklyGoal.target)} ${t("lesson completions")}` : t("{target} {area} sessions", { target: formatNumber(snapshot.weeklyGoal.target), area: t(snapshot.weeklyGoal.focus) }) })}</p>
      <h3>{t("Shared charts and device data")}</h3>
      <p>{t("{songs} personal Song Library charts · {grooves} custom grooves{audio}.", { songs: formatNumber(snapshot.personalSongs), grooves: formatNumber(snapshot.customGrooves), audio: snapshot.savedAudio === null ? "" : ` · ${formatNumber(snapshot.savedAudio)} ${t("available audio items")}` })} {t("Song charts and custom grooves are shared on this device. Song Library practice history, recordings, reference audio, notes, and review plans follow the active learner. Trainer takes and imported Song Builder backing tracks are device-wide.")}</p>
    </> : <p>{t("Local data details are unavailable in this browser.")}</p>}
    <p>{t("Learner progress, Trainer rounds, guided sessions, weekly goals, and Song Library practice data follow the active profile. Full backups include the device’s local data; progress transfers merge into whichever profile is active when you import.")}</p>
  </details>;
}
