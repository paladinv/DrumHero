import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { migrateSongLibrary, stripOriginalMusicXml, type SongLibraryState } from "./song-library";
let client: SupabaseClient | undefined;
export const SONG_CLOUD_SYNC_KEY = "drum-hero:song-cloud-sync:v1";
export type SongCloudCheckpoint = { accountId: string; libraryId: string; revision: number; signature: string };
export function readSongCloudCheckpoint(): SongCloudCheckpoint | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(SONG_CLOUD_SYNC_KEY) || "null");
    return value?.version === 1 && typeof value.accountId === "string" && typeof value.libraryId === "string" && Number.isInteger(value.revision) && typeof value.signature === "string" ? { accountId:value.accountId,libraryId:value.libraryId,revision:value.revision,signature:value.signature } : null;
  } catch { return null; }
}
export function songCloudConfigured() { return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); }
export function getSongCloudClient() {
  if (!songCloudConfigured()) return null;
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "drum-hero:cloud-account:v1" } });
  return client;
}
export function cloudLibraryState(state: SongLibraryState): SongLibraryState { return { ...state, songs: state.songs.map(stripOriginalMusicXml), recordings: [], referenceTracks: [] }; }
export type CloudLibrary = { id: string; name: string; owner_id: string; revision: number; state: SongLibraryState; updated_at: string; share_scope?: boolean };
export function readCloudLibrary(value: unknown): CloudLibrary {
  if (!value || typeof value !== "object") throw new Error("Invalid cloud response.");
  const row = value as CloudLibrary;
  if (typeof row.id !== "string" || typeof row.owner_id !== "string" || !Number.isInteger(row.revision) || !row.state || row.state.version !== 1 || !Array.isArray(row.state.songs)) throw new Error("Unsupported cloud library.");
  return { ...row, share_scope: row.share_scope === true, state: cloudLibraryState(migrateSongLibrary(row.state)) };
}
export function cloudSongConflicts(local: SongLibraryState, remote: SongLibraryState) { return local.songs.flatMap((song) => { const other = remote.songs.find((item) => item.id === song.id); return other && JSON.stringify(stableValue(song)) !== JSON.stringify(stableValue(other)) ? [{ id: song.id, title: song.title, local: song, remote: other }] : []; }); }

function stableValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(stableValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stableValue(child)])); return value; }
export function librarySyncSignature(state: SongLibraryState): string { const text = JSON.stringify(stableValue(cloudLibraryState(state))); let a = 2166136261, b = 0x9e3779b9; for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b ^ text.charCodeAt(i), 2246822507); } return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`; }
