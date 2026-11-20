import type { NotationOptions } from "./song-builder-notation";
import { normalizeSongBuilderSettings } from "./song-builder-settings";

export const SONG_NOTATION_PROFILES_KEY = "drum-hero:song-notation-profiles:v1";

export type SongNotationProfile = {
  id: string;
  name: string;
  learnerId: string;
  kitProfileId?: string;
  notation: NotationOptions;
  updatedAt: string;
};

export function normalizeSongNotationProfiles(value: unknown): SongNotationProfile[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-100).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<SongNotationProfile>;
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 80) : "";
    const id = typeof item.id === "string" ? item.id.slice(0, 100) : "";
    const learnerId = typeof item.learnerId === "string" ? item.learnerId.slice(0, 80) : "";
    if (!name || !id || !learnerId || !item.notation || typeof item.notation !== "object") return [];
    return [{
      id,
      name,
      learnerId,
      kitProfileId: typeof item.kitProfileId === "string" ? item.kitProfileId.slice(0, 100) : undefined,
      notation: normalizeSongBuilderSettings({ notation: item.notation }).notation,
      updatedAt: typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : new Date(0).toISOString(),
    }];
  });
}

export function readSongNotationProfiles(): SongNotationProfile[] {
  if (typeof window === "undefined") return [];
  try { return normalizeSongNotationProfiles(JSON.parse(window.localStorage.getItem(SONG_NOTATION_PROFILES_KEY) || "[]")); }
  catch { return []; }
}

export function writeSongNotationProfiles(profiles: SongNotationProfile[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(SONG_NOTATION_PROFILES_KEY, JSON.stringify(normalizeSongNotationProfiles(profiles)));
    return true;
  } catch { return false; }
}
