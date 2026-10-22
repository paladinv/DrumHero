"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addSession, defaultProgress, parseProgress, STORAGE_KEY } from "@/lib/progress";
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
  replaceProgress: (next: ProgressState) => void;
};

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children, initialLocale, initialPreference, initialCatalog }: { children: React.ReactNode; initialLocale: Locale; initialPreference: LanguagePreference; initialCatalog: Catalog }) {
  const [progress, setProgress] = useState<ProgressState>(defaultProgress);
  const [profileId, setProfileId] = useState("default");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      const nextProfileId = learnerProfileIdFromBrowser();
      setProfileId(nextProfileId);
      setProgress(parseProgress(window.localStorage.getItem(learnerStorageKey(STORAGE_KEY, nextProfileId))));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);
  useEffect(() => {
    const changeProfile = (event: Event) => {
      const requested = (event as CustomEvent<{ profileId?: string }>).detail?.profileId;
      const profiles = readLearnerProfiles(window.localStorage.getItem(LEARNER_PROFILES_KEY));
      const nextProfileId = requested && profiles.some((profile) => profile.id === requested) ? requested : learnerProfileIdFromBrowser();
      setProgress(parseProgress(window.localStorage.getItem(learnerStorageKey(STORAGE_KEY, nextProfileId))));
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
  useEffect(() => { if (hydrated) window.localStorage.setItem(learnerStorageKey(STORAGE_KEY, profileId), JSON.stringify(progress)); }, [hydrated, profileId, progress]);
  const completeLesson = useCallback((id: string) => setProgress((state) => ({ ...state, completedLessons: state.completedLessons.includes(id) ? state.completedLessons : [...state.completedLessons, id] })), []);
  const recordSession = useCallback((result: SessionResult) => setProgress((state) => addSession(state, result)), []);
  const recordTrainerRound = useCallback((date: string) => setProgress((state) => ({ ...state, practiceDates: [...new Set([...state.practiceDates, date])].sort() })), []);
  const setSound = useCallback((sound: boolean) => setProgress((state) => ({ ...state, settings: { ...state.settings, sound } })), []);
  const replaceProgress = useCallback((next: ProgressState) => setProgress(parseProgress(JSON.stringify(next))), []);
  const value = useMemo(() => ({ progress, profileId, hydrated, completeLesson, recordSession, recordTrainerRound, setSound, replaceProgress }), [progress, profileId, hydrated, completeLesson, recordSession, recordTrainerRound, setSound, replaceProgress]);
  return <LocalizationProvider initialLocale={initialLocale} initialPreference={initialPreference} initialCatalog={initialCatalog}>
    <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>
  </LocalizationProvider>;
}

export function useProgress() {
  const context = useContext(ProgressContext);
  if (!context) throw new Error("useProgress must be used inside ProgressProvider");
  return context;
}
