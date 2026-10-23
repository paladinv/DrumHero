export const SONG_LIBRARY_BACKUP_KEY = "drum-hero:song-library-last-backup:v1";

export function readSongLibraryBackupAt(): string | null {
  try {
    const value = localStorage.getItem(SONG_LIBRARY_BACKUP_KEY);
    return value && Number.isFinite(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function recordSongLibraryBackupAt(at = new Date()): string | null {
  const value = at.toISOString();
  try {
    localStorage.setItem(SONG_LIBRARY_BACKUP_KEY, value);
    return value;
  } catch {
    return null;
  }
}
