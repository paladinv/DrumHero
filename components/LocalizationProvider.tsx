"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { directionFor, isLocale, localeOptions, numberingSystemFor, resolveLocale, translateFromCatalog } from "@/lib/locale-core";
import type { Catalog, LanguagePreference, Locale } from "@/lib/locale-core";
import { loadCatalog } from "@/lib/catalog-loader";
import { translateAppCopy } from "@/lib/app-copy";
import { usePathname } from "next/navigation";
import Link from "next/link";

type LocalizationValue = {
  locale: Locale;
  preference: LanguagePreference;
  setPreference: (value: LanguagePreference) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: Date, includeTime?: boolean) => string;
};

const LocalizationContext = createContext<LocalizationValue | null>(null);
const STORAGE_KEY = "drumHero.language";
const COOKIE_KEY = "drumHeroLanguage";

function validPreference(value: string | null | undefined): LanguagePreference | null {
  if (value === "auto") return "auto";
  return value && isLocale(value) ? value : null;
}

function savePreference(value: LanguagePreference) {
  try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the active choice in memory when storage is blocked. */ }
  try { document.cookie = `${COOKIE_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`; } catch { /* Cookie persistence may be unavailable in restricted contexts. */ }
}

export function LocalizationProvider({ children, initialLocale, initialPreference, initialCatalog }: {
  children: React.ReactNode;
  initialLocale: Locale;
  initialPreference: LanguagePreference;
  initialCatalog: Catalog;
}) {
  const [preference, setPreferenceState] = useState<LanguagePreference>(initialPreference);
  const [automaticLocale, setAutomaticLocale] = useState<Locale>(initialLocale);
  const [catalog, setCatalog] = useState<Catalog>(initialCatalog);
  const pathname = usePathname();
  const locale = preference === "auto" ? automaticLocale : preference;

  const setPreference = useCallback((value: LanguagePreference) => {
    setPreferenceState(value);
    savePreference(value);
    const selectedLocale = value === "auto" ? resolveLocale(navigator.languages) : value;
    if (value === "auto") setAutomaticLocale(selectedLocale);
    void loadCatalog(selectedLocale).then(setCatalog);
  }, []);

  useEffect(() => {
    let preferenceTimer: number | undefined;
    let deviceLanguageTimer: number | undefined;
    try {
      const stored = validPreference(window.localStorage.getItem(STORAGE_KEY));
      if (stored && stored !== preference) preferenceTimer = window.setTimeout(() => setPreferenceState(stored), 0);
    } catch { /* The server-selected language remains usable without local storage. */ }
    if (preference === "auto") deviceLanguageTimer = window.setTimeout(() => setAutomaticLocale(resolveLocale(navigator.languages)), 0);
    const updateDeviceLanguage = () => {
      if (preference === "auto") setAutomaticLocale(resolveLocale(navigator.languages));
    };
    window.addEventListener("languagechange", updateDeviceLanguage);
    return () => {
      window.removeEventListener("languagechange", updateDeviceLanguage);
      if (preferenceTimer !== undefined) window.clearTimeout(preferenceTimer);
      if (deviceLanguageTimer !== undefined) window.clearTimeout(deviceLanguageTimer);
    };
  }, [preference]);

  useEffect(() => {
    let current = true;
    void loadCatalog(locale).then((loaded) => { if (current) setCatalog(loaded); });
    return () => { current = false; };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionFor(locale);
    const titles: Record<string, string> = {
      "/learn": "Learn", "/practice": "Practice Pad", "/trainer": "Trainer", "/ear-training": "Rhythm Ear Training", "/sight-reading": "Sight reading", "/rudiments": "Rudiments",
      "/grooves": "Grooves", "/kit": "Kit Guide", "/song-library": "Song Library", "/song-builder": "Song Builder",
      "/progress": "Progress", "/practice/session": "Guided practice", "/about": "About"
    };
    document.title = pathname === "/" ? "Drum Hero" : `${translateFromCatalog(locale, catalog, titles[pathname] ?? "Drum Hero")} | Drum Hero`;
  }, [catalog, locale, pathname]);

  const value = useMemo(() => ({
    locale, preference, setPreference,
    t: (key: string, values?: Record<string, string | number>) => {
      const translated = translateFromCatalog(locale, catalog, key, values);
      const catalogEntry = catalog[key];
      return catalogEntry === undefined || catalogEntry === key ? translateAppCopy(locale, key, values) : translated;
    },
    formatNumber: (number: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, { numberingSystem: numberingSystemFor(locale), ...options }).format(number),
    formatDate: (date: Date, includeTime = false) => new Intl.DateTimeFormat(locale, { ...(includeTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }), numberingSystem: numberingSystemFor(locale) }).format(date)
  }), [catalog, locale, preference, setPreference]);
  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function SkipLink() {
  const { t } = useLocalization();
  return <a className="skip-link" href="#main-content">{t("Skip to content")}</a>;
}

export function SiteFooter() {
  const { t } = useLocalization();
  return <footer className="site-footer"><div><strong>Drum Hero</strong><span>{t("Practice deliberately. Play musically.")}</span><Link href="/about">{t("About Drum Hero")}</Link></div><p>{t("Local practice works without an account.")} Audio input, recordings, and reference tracks stay on this device. Optional account sync uploads selected library data after you enable it.</p></footer>;
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error("useLocalization must be used inside LocalizationProvider");
  return context;
}

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference, t } = useLocalization();
  return <label className={`language-picker${compact ? " compact" : ""}`}>
    <span>{t("Language")}</span>
    <select aria-label={t("Select display language")} value={preference} onChange={(event) => {
      const value = event.target.value;
      if (value === "auto" || isLocale(value)) setPreference(value);
    }}>
      <option value="auto">{t("Automatic (device language)")}</option>
      {localeOptions.map(([locale, name]) => <option value={locale} key={locale}>{name}</option>)}
    </select>
  </label>;
}
