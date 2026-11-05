"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addSession, defaultProgress, localDateKey, parseProgress, STORAGE_KEY } from "@/lib/progress";
import { parseTrainerState, trainerStorageKey, updateTrainerPreferredBpm } from "@/lib/trainer";
import { ACTIVE_LEARNER_PROFILE_KEY, learnerProfileIdFromBrowser, learnerStorageKey, LEARNER_PROFILE_CHANGE_EVENT, LEARNER_PROFILES_KEY, readLearnerProfiles } from "@/lib/learner-profiles";
import { LocalizationProvider } from "@/components/LocalizationProvider";
import type { Catalog, LanguagePreference, Locale } from "@/lib/locale-core";
import type { ProgressState, SessionResult } from "@/lib/types";

type ProgressContextValue = {
  progress: ProgressState;
  profileId: string;
  hydrated: boolean;
  completeLesson: (id: string) => void;
  recordSession: (result: SessionResult) => void;
  recordTrainerRound: (date: string) => void;
  setSound: (sound: boolean) => void;
  setPreferredBpm: (bpm: number) => void;
  replaceProgress: (next: ProgressState) => void;
};

const ProgressContext = createContext<ProgressContextValue | null>(null);

function localizeRecordedPracticeDays(progress: ProgressState, profileId: string): ProgressState {
  try {
    const trainerRounds = parseTrainerState(window.localStorage.getItem(trainerStorageKey(profileId))).rounds;
    const instants = [...progress.sessions.map((session) => session.playedAt), ...trainerRounds.map((round) => round.playedAt)]
      .filter((value) => Number.isFinite(Date.parse(value)));
    const previousUtcDays = new Set(instants.map((value) => value.slice(0, 10)));
    const localDays = instants.map(localDateKey).filter(Boolean);
    return { ...progress, practiceDates: [...new Set([...progress.practiceDates.filter((day) => !previousUtcDays.has(day)), ...localDays])].sort() };
  } catch { return progress; }
}

export function ProgressProvider({ children, initialLocale, initialPreference, initialCatalog }: { children: React.ReactNode; initialLocale: Locale; initialPreference: LanguagePreference; initialCatalog: Catalog }) {
  const [progress, setProgress] = useState<ProgressState>(defaultProgress);
  const [profileId, setProfileId] = useState("default");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      const nextProfileId = learnerProfileIdFromBrowser();
      setProfileId(nextProfileId);
      setProgress(localizeRecordedPracticeDays(parseProgress(window.localStorage.getItem(learnerStorageKey(STORAGE_KEY, nextProfileId))), nextProfileId));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);
  useEffect(() => {
    const changeProfile = (event: Event) => {
      const requested = (event as CustomEvent<{ profileId?: string }>).detail?.profileId;
      const profiles = readLearnerProfiles(window.localStorage.getItem(LEARNER_PROFILES_KEY));
      const nextProfileId = requested && profiles.some((profile) => profile.id === requested) ? requested : learnerProfileIdFromBrowser();
      setProgress(localizeRecordedPracticeDays(parseProgress(window.localStorage.getItem(learnerStorageKey(STORAGE_KEY, nextProfileId))), nextProfileId));
      setProfileId(nextProfileId);
    };
    const syncActiveProfile = (event: StorageEvent) => {
      if (event.key === ACTIVE_LEARNER_PROFILE_KEY) {
        window.dispatchEvent(new CustomEvent(LEARNER_PROFILE_CHANGE_EVENT, { detail: { profileId: learnerProfileIdFromBrowser() } }));
      }
    };
    window.addEventListener(LEARNER_PROFILE_CHANGE_EVENT, changeProfile);
    window.addEventListener("storage", syncActiveProfile);
    return () => { window.removeEventListener(LEARNER_PROFILE_CHANGE_EVENT, changeProfile); window.removeEventListener("storage", syncActiveProfile); };
  }, []);
  useEffect(() => {
    const refreshPracticeDates = () => setProgress((current) => localizeRecordedPracticeDays(current, profileId));
    const syncTrainerStorage = (event: StorageEvent) => {
      if (event.key === trainerStorageKey(profileId)) refreshPracticeDates();
    };
    window.addEventListener("drum-hero:trainer-state-import", refreshPracticeDates);
    window.addEventListener("storage", syncTrainerStorage);
    return () => {
      window.removeEventListener("drum-hero:trainer-state-import", refreshPracticeDates);
      window.removeEventListener("storage", syncTrainerStorage);
    };
  }, [profileId]);
  useEffect(() => { if (hydrated) window.localStorage.setItem(learnerStorageKey(STORAGE_KEY, profileId), JSON.stringify(progress)); }, [hydrated, profileId, progress]);
  const completeLesson = useCallback((id: string) => setProgress((state) => {
    if (state.completedLessons.includes(id)) return state;
    return { ...state, completedLessons: [...state.completedLessons, id], lessonCompletedAt: { ...state.lessonCompletedAt, [id]: new Date().toISOString() } };
  }), []);
  const recordSession = useCallback((result: SessionResult) => setProgress((state) => addSession(state, result)), []);
  const recordTrainerRound = useCallback((playedAt: string) => setProgress((state) => {
    const date = localDateKey(playedAt);
    return date ? { ...state, practiceDates: [...new Set([...state.practiceDates, date])].sort() } : state;
  }), []);
  const setSound = useCallback((sound: boolean) => setProgress((state) => ({ ...state, settings: { ...state.settings, sound } })), []);
  const setPreferredBpm = useCallback((bpm: number) => {
    const preferredBpm = Math.min(200, Math.max(40, Math.round(bpm)));
    updateTrainerPreferredBpm(preferredBpm);
    setProgress((state) => state.settings.preferredBpm === preferredBpm ? state : { ...state, settings: { ...state.settings, preferredBpm } });
  }, []);
  const replaceProgress = useCallback((next: ProgressState) => setProgress(parseProgress(JSON.stringify(next))), []);
  const value = useMemo(() => ({ progress, profileId, hydrated, completeLesson, recordSession, recordTrainerRound, setSound, setPreferredBpm, replaceProgress }), [progress, profileId, hydrated, completeLesson, recordSession, recordTrainerRound, setSound, setPreferredBpm, replaceProgress]);
  return <LocalizationProvider initialLocale={initialLocale} initialPreference={initialPreference} initialCatalog={initialCatalog}>
    <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>
  </LocalizationProvider>;
}

export function useProgress() {
  const context = useContext(ProgressContext);
  if (!context) throw new Error("useProgress must be used inside ProgressProvider");
  return context;
}
