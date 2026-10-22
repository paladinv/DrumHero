import { readSongLibrary, writeSongLibrary } from './song-library';
import { storedRecordingBlob } from './song-recording';
import { readTrainerTakes } from './trainer-take-library';
import { deleteBuilderBackingFiles, readAllBuilderBackings } from './song-builder-storage';

export type StoredAudio = { id: string; kind: 'song' | 'trainer' | 'builder'; label: string; fileName?: string; createdAt: string; bytes: number; mimeType: string; pinned: boolean; blob: Blob };
export const AUDIO_STORAGE_EVENT = 'drum-hero:audio-storage-change';
async function songAudioRows() {
  return new Promise<Array<{ id: string; blob: Blob }>>((resolve, reject) => {
    const request = indexedDB.open('drum-hero-song-recordings', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('takes');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, transaction = database.transaction('takes');
      const store = transaction.objectStore('takes'), keys = store.getAllKeys(), values = store.getAll();
      transaction.oncomplete = () => { database.close(); resolve(values.result.flatMap((value, index) => { const blob = storedRecordingBlob(value); return blob && typeof keys.result[index] === 'string' ? [{ id: String(keys.result[index]), blob }] : []; })); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  });
}
export async function listStoredAudio(): Promise<StoredAudio[]> {
  const [trainer, song, backings] = await Promise.all([readTrainerTakes(), songAudioRows(), readAllBuilderBackings()]);
  const library = readSongLibrary();
  return [...trainer.map(take => ({ ...take, kind: 'trainer' as const, label: take.name, bytes: take.blob.size, mimeType: take.blob.type })), ...song.map(row => {
    const metadata = library.recordings.find(take => take.id === row.id);
    return { ...row, kind: 'song' as const, label: metadata ? `Song take · ${metadata.createdAt}` : `Unlinked song take · ${row.id}`, createdAt: metadata?.createdAt ?? '', bytes: row.blob.size, mimeType: row.blob.type, pinned: false };
  }), ...backings.map(item => ({
    id: item.id,
    kind: 'builder' as const,
    label: `Backing track · ${item.name}`,
    fileName: item.name,
    createdAt: '',
    bytes: item.blob.size,
    mimeType: item.blob.type,
    pinned: false,
    blob: item.blob,
  }))];
}
async function removeRows(databaseName: string, ids: string[], keyPath?: string) {
  if (!ids.length) return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('takes', keyPath ? { keyPath } : undefined);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, transaction = database.transaction('takes', 'readwrite');
      for (const id of ids) transaction.objectStore('takes').delete(id);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error('Audio deletion was interrupted. Refresh the list before trying again.')); };
    };
  });
}
export async function deleteStoredAudio(items: Pick<StoredAudio, 'id' | 'kind'>[]) {
  const songIds = new Set(items.filter(item => item.kind === 'song').map(item => item.id));
  const builderIds = items.filter(item => item.kind === 'builder').map(item => item.id);
  const trainerIds = items.filter(item => item.kind === 'trainer').map(item => item.id);
  const previous = readSongLibrary();
  // Metadata must be writable before committing permanent audio deletion.
  if (songIds.size) writeSongLibrary({ ...previous, recordings: previous.recordings.filter(take => !songIds.has(take.id)) });
  try {
    try { await removeRows('drum-hero-song-recordings', [...songIds]); }
    catch (error) {
      const current = readSongLibrary();
      writeSongLibrary({ ...current, recordings: [...current.recordings.filter(take => !songIds.has(take.id)), ...previous.recordings.filter(take => songIds.has(take.id))] });
      throw error;
    }
    await Promise.all([
      removeRows('drum-hero-trainer-takes', trainerIds, 'id'),
      deleteBuilderBackingFiles(builderIds),
    ]);
  } finally { window.dispatchEvent(new Event(AUDIO_STORAGE_EVENT)); }
}

export function downloadStoredAudio(item: StoredAudio) {
  const nameExtension = item.fileName?.split('.').pop()?.toLowerCase();
  const knownExtensions = new Set(['wav', 'mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'webm']);
  const extension = nameExtension && knownExtensions.has(nameExtension)
    ? nameExtension
    : item.mimeType.includes('wav') ? 'wav' : item.mimeType.includes('mpeg') ? 'mp3' : item.mimeType.includes('aac') ? 'aac' : item.mimeType.includes('mp4') ? 'm4a' : item.mimeType.includes('ogg') ? 'ogg' : 'webm';
  const originalName = item.fileName?.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const url = URL.createObjectURL(item.blob), link = document.createElement('a');
  link.href = url; link.download = `${(originalName || item.label).replace(/[^a-z0-9_-]/gi, '-').slice(0, 80) || 'drum-take'}.${extension}`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
