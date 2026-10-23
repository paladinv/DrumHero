"use client";

import { useLocalization } from "@/components/LocalizationProvider";
import { useThemePreference } from "@/components/ThemeProvider";
import type { ThemePreference } from "@/lib/theme-preference";

export function ThemeSettings() {
  const { preference, setPreference } = useThemePreference();
  const { t } = useLocalization();

  return <label className="theme-picker">
    <span>{t("Appearance")}</span>
    <select aria-label={t("Color theme")} value={preference} onChange={(event) => setPreference(event.target.value as ThemePreference)}>
      <option value="system">{t("System (device)")}</option>
      <option value="light">{t("Light")}</option>
      <option value="dark">{t("Dark")}</option>
    </select>
  </label>;
}
