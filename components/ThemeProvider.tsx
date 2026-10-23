"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { THEME_PREFERENCE_COOKIE, type ThemePreference } from "@/lib/theme-preference";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function persistThemePreference(value: ThemePreference) {
  try {
    document.cookie = `${THEME_PREFERENCE_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch { /* The active theme remains available for this visit. */ }
}

export function ThemeProvider({ children, initialPreference }: {
  children: React.ReactNode;
  initialPreference: ThemePreference;
}) {
  const [preference, setPreferenceState] = useState(initialPreference);
  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    document.documentElement.dataset.theme = value;
    persistThemePreference(value);
    window.dispatchEvent(new Event("drum-hero:theme-change"));
  }, []);
  const context = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const notifySystemThemeChange = () => {
      if (preference === "system") window.dispatchEvent(new Event("drum-hero:theme-change"));
    };
    media.addEventListener("change", notifySystemThemeChange);
    return () => media.removeEventListener("change", notifySystemThemeChange);
  }, [preference]);

  return <ThemeContext.Provider value={context}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useThemePreference must be used inside ThemeProvider");
  return context;
}
