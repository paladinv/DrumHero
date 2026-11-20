import type { CustomSampleRecord } from "./song-builder-samples";
import { SONG_INSTRUMENTS, type SongInstrument } from "./types";

const DATABASE = "drum-hero-song-builder-kit-presets";
const STORE = "sample-snapshots";
const MAX_SNAPSHOT_BYTES = 72 * 1024 * 1024;
const MAX_LIBRARY_BYTES = 256 * 1024 * 1024;

type KitSampleSnapshot = { id: string; samples: CustomSampleRecord[]; updatedAt: string };

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This browser does not support saved kit samples.")); return; }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open saved kit samples."));
  });
}

export async function saveKitSampleSnapshot(id: string, samples: CustomSampleRecord[]) {
  const unique = new Map<SongInstrument, CustomSampleRecord>();
  for (const sample of samples) if (SONG_INSTRUMENTS.includes(sample.instrument)) unique.set(sample.instrument, sample);
  const rows = [...unique.values()].map(sample => ({ ...sample }));
  const bytes = rows.reduce((sum, sample) => sum + sample.blob.size + (sample.softBlob?.size ?? 0) + (sample.accentBlob?.size ?? 0), 0);
  if (bytes > MAX_SNAPSHOT_BYTES) throw new Error("This kit uses more than 72 MB of custom samples. Remove some layers and save it again.");
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE), request = store.getAll();
      let abortReason: Error | undefined;
      request.onsuccess = () => {
        const existing = (request.result as KitSampleSnapshot[]).filter(item => item.id !== id);
        const usedBytes = existing.reduce((sum, item) => sum + item.samples.reduce((subtotal, sample) => subtotal + sample.blob.size + (sample.softBlob?.size ?? 0) + (sample.accentBlob?.size ?? 0), 0), 0);
        if (usedBytes + bytes > MAX_LIBRARY_BYTES) { abortReason = new Error("Saved kit samples are limited to 256 MB on this device. Remove a kit preset and try again."); transaction.abort(); return; }
        store.put({ id, samples: rows, updatedAt: new Date().toISOString() } satisfies KitSampleSnapshot);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not check saved kit storage."));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save this kit's custom samples."));
      transaction.onabort = () => reject(abortReason ?? transaction.error ?? new Error("Could not save this kit's custom samples."));
    });
  } finally { database.close(); }
}

export async function readKitSampleSnapshot(id: string): Promise<CustomSampleRecord[] | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(id);
      request.onsuccess = () => {
        const value = request.result as KitSampleSnapshot | undefined;
        resolve(value && Array.isArray(value.samples) ? value.samples.filter(sample => sample && SONG_INSTRUMENTS.includes(sample.instrument) && sample.blob instanceof Blob) : null);
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read this kit's custom samples."));
    });
  } finally { database.close(); }
}

export async function deleteKitSampleSnapshot(id: string) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove this kit's sample snapshot."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Removing this kit's sample snapshot was interrupted."));
    });
  } finally { database.close(); }
}
