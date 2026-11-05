import { normalizeSong, type DrumSong } from './song-library';
import type { BuilderTake } from './song-builder-editing';

export type BuilderVersion = { id: string; songId: string; label: string; kind: 'autosave' | 'named'; createdAt: string; song: DrumSong };
export type BuilderBacking = {
  id: string;
  songId?: string;
  stemId?: string;
  name: string;
  blob: Blob;
  peaks: number[];
  duration: number;
  downbeat: number;
  volume: number;
  bpm?: number;
  preservePitch?: boolean;
  source?: string;
  rights?: string;
};
export type BuilderMicRecording = { id: string; songId: string; name: string; blob: Blob; mimeType: string; durationMs: number; createdAt: string };

const DATABASE = 'drum-hero-builder-workspace';

function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 4);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) return;
      for (const name of ['versions', 'takes', 'backing', 'mic-recordings']) {
        const store = database.objectStoreNames.contains(name)
          ? transaction.objectStore(name)
          : database.createObjectStore(name, { keyPath: 'id' });
        if (name !== 'backing' && !store.indexNames.contains('songId')) store.createIndex('songId', 'songId');
      }

      const backing = transaction.objectStore('backing');
      if (!backing.indexNames.contains('songId')) backing.createIndex('songId', 'songId');
      if ((event as IDBVersionChangeEvent).oldVersion < 3) {
        const cursorRequest = backing.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const value = cursor.value as BuilderBacking;
          cursor.update({
            ...value,
            songId: value.songId ?? value.id,
            stemId: value.stemId ?? 'main',
          });
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local workspace storage is unavailable.'));
  });
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function transactionAction(storeName: string, action: (store: IDBObjectStore) => void) {
  const database = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Local audio storage could not be updated.'));
    });
  } finally {
    database.close();
  }
}

export async function readBuilderVersions(songId: string) {
  const all = await transaction<BuilderVersion[]>('versions', 'readonly', (store) => store.index('songId').getAll(songId));
  return all.filter((version) => normalizeSong(version.song)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveBuilderVersion(song: DrumSong, label: string, kind: BuilderVersion['kind'], createdAt = new Date().toISOString()) {
  const previous = await readBuilderVersions(song.id);
  const latest = previous.find((version) => version.kind === kind);
  if (kind === 'autosave' && latest && JSON.stringify({ ...latest.song, updatedAt: '' }) === JSON.stringify({ ...song, updatedAt: '' })) return;
  const version: BuilderVersion = { id: crypto.randomUUID(), songId: song.id, label: label.trim().slice(0, 60) || 'Autosave', kind, createdAt, song: structuredClone(song) };
  await transaction('versions', 'readwrite', (store) => store.put(version));
  const old = previous.filter((item) => item.kind === kind).slice(kind === 'autosave' ? 11 : 19);
  for (const item of old) await transaction('versions', 'readwrite', (store) => store.delete(item.id));
}

export async function deleteBuilderVersion(id: string) { await transaction('versions', 'readwrite', (store) => store.delete(id)); }
export async function readBuilderTakes(songId: string) { return (await transaction<BuilderTake[]>('takes', 'readonly', (store) => store.index('songId').getAll(songId))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export async function saveBuilderTake(take: BuilderTake) { await transaction('takes', 'readwrite', (store) => store.put(take)); const old = (await readBuilderTakes(take.songId)).slice(10); for (const item of old) await deleteBuilderTake(item.id); }
export async function deleteBuilderTake(id: string) { await transaction('takes', 'readwrite', (store) => store.delete(id)); }

export async function readBuilderMicRecordings(songId: string) {
  return (await transaction<BuilderMicRecording[]>('mic-recordings', 'readonly', (store) => store.index('songId').getAll(songId)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function saveBuilderMicRecording(recording: BuilderMicRecording) {
  await transaction('mic-recordings', 'readwrite', (store) => store.put(recording));
  const old = (await readBuilderMicRecordings(recording.songId)).slice(10);
  for (const item of old) await deleteBuilderMicRecording(item.id);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('drum-hero:audio-storage-change'));
}
export async function deleteBuilderMicRecording(id: string) {
  await transaction('mic-recordings', 'readwrite', (store) => store.delete(id));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('drum-hero:audio-storage-change'));
}

export async function readBuilderBackings(songId: string) {
  return (await transaction<BuilderBacking[]>('backing', 'readonly', (store) => store.index('songId').getAll(songId)))
    .sort((a, b) => (a.stemId === 'main' ? -1 : b.stemId === 'main' ? 1 : a.name.localeCompare(b.name)));
}

export async function readBuilderBacking(songId: string) {
  const items = await readBuilderBackings(songId);
  return items.find((item) => item.stemId === 'main' || item.id === songId) ?? items[0];
}

export async function readAllBuilderBackings() {
  return transaction<BuilderBacking[]>('backing', 'readonly', (store) => store.getAll());
}

export async function saveBuilderBacking(value: BuilderBacking, announceStorageChange = false) {
  const normalized = { ...value, songId: value.songId ?? value.id, stemId: value.stemId ?? 'main' };
  await transaction('backing', 'readwrite', (store) => store.put(normalized));
  if (announceStorageChange && typeof window !== 'undefined') window.dispatchEvent(new Event('drum-hero:audio-storage-change'));
}

export async function replaceBuilderBackingFiles(ids: string[], values: BuilderBacking[]) {
  await transactionAction('backing', (store) => {
    ids.forEach((id) => store.delete(id));
    values.forEach((value) => store.put({ ...value, songId: value.songId ?? value.id, stemId: value.stemId ?? 'main' }));
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('drum-hero:audio-storage-change'));
}

export async function deleteBuilderBackingFiles(ids: string[]) {
  if (ids.length) await transactionAction('backing', (store) => ids.forEach((id) => store.delete(id)));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('drum-hero:audio-storage-change'));
}

export async function deleteBuilderBackingFile(id: string) { await deleteBuilderBackingFiles([id]); }

export async function deleteBuilderBacking(songId: string) {
  const items = await readBuilderBackings(songId);
  if (items.length) await transactionAction('backing', (store) => items.forEach((item) => store.delete(item.id)));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('drum-hero:audio-storage-change'));
}

export async function builderStorageInventory(songId: string) {
  const [backings, takes, versions, micRecordings, quota] = await Promise.all([
    readBuilderBackings(songId), readBuilderTakes(songId), readBuilderVersions(songId), readBuilderMicRecordings(songId),
    typeof navigator === 'undefined' ? undefined : navigator.storage?.estimate?.().catch(() => undefined),
  ]);
  const backing = backings.find((item) => item.stemId === 'main' || item.id === songId) ?? backings[0];
  return {
    backing,
    backings,
    takes,
    versions,
    quota,
    micRecordings,
    bytes: {
      backing: backings.reduce((total, item) => total + item.blob.size, 0),
      micRecordings: micRecordings.reduce((total, item) => total + item.blob.size, 0),
      takes: new Blob([JSON.stringify(takes)]).size,
      versions: new Blob([JSON.stringify(versions)]).size,
    },
  };
}
