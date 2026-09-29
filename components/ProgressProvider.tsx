"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addSession, defaultProgress, parseProgress, STORAGE_KEY } from "@/lib/progress";
import type { ProgressState, SessionResult } from "@/lib/types";

type ProgressContextValue = {
  progress: ProgressState;
  hydrated: boolean;
  completeLesson: (id: string) => void;
  recordSession: (result: SessionResult) => void;
  recordTrainerRound: (date: string) => void;
  setSound: (sound: boolean) => void;
};

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<ProgressState>(defaultProgress);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      setProgress(parseProgress(window.localStorage.getItem(STORAGE_KEY)));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);
  useEffect(() => { if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }, [hydrated, progress]);
  const completeLesson = useCallback((id: string) => setProgress((state) => ({ ...state, completedLessons: state.completedLessons.includes(id) ? state.completedLessons : [...state.completedLessons, id] })), []);
  const recordSession = useCallback((result: SessionResult) => setProgress((state) => addSession(state, result)), []);
  const recordTrainerRound = useCallback((date: string) => setProgress((state) => ({ ...state, practiceDates: [...new Set([...state.practiceDates, date])].sort() })), []);
  const setSound = useCallback((sound: boolean) => setProgress((state) => ({ ...state, settings: { ...state.settings, sound } })), []);
  const value = useMemo(() => ({ progress, hydrated, completeLesson, recordSession, recordTrainerRound, setSound }), [progress, hydrated, completeLesson, recordSession, recordTrainerRound, setSound]);
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const context = useContext(ProgressContext);
  if (!context) throw new Error("useProgress must be used inside ProgressProvider");
  return context;
}
