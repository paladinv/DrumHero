export type ThemePreference = "system" | "light" | "dark";

export const THEME_PREFERENCE_COOKIE = "drumHeroTheme";

export function parseThemePreference(value: string | undefined): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
