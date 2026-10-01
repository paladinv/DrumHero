import type { SongInstrument } from "./types";

const DATABASE = "drum-hero-song-builder-kit";
const STORE = "custom-samples";
const VERSION = 1;
export const MAX_CUSTOM_SAMPLE_BYTES = 12 * 1024 * 1024;
export type CustomSampleRecord = { instrument: SongInstrument; name: string; blob: Blob; updatedAt: string };

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This browser does not support local sample storage.")); return; }
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "instrument" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local sample storage."));
  });
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = operation(transaction.objectStore(STORE));
      request.onerror = () => reject(request.error ?? new Error("Could not update local sample storage."));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not update local sample storage."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Local sample storage was interrupted."));
    });
  } finally { database.close(); }
}

export async function readCustomSampleRecords() {
  return await transact<CustomSampleRecord[]>("readonly", (store) => store.getAll());
}

export async function readCustomSamples() {
  const records = await readCustomSampleRecords();
  return Object.fromEntries(records.map((record) => [record.instrument, record.blob])) as Partial<Record<SongInstrument, Blob>>;
}

export async function saveCustomSample(instrument: SongInstrument, file: File) {
  return saveCustomSampleBlob(instrument, file.name, file);
}

export async function saveCustomSampleBlob(instrument: SongInstrument, name: string, blob: Blob) {
  if (!blob.type.startsWith("audio/")) throw new Error("Choose an audio file such as WAV, MP3, or OGG.");
  if (blob.size > MAX_CUSTOM_SAMPLE_BYTES) throw new Error("Custom drum samples must be 12 MB or smaller.");
  const record: CustomSampleRecord = { instrument, name: name.slice(0, 120) || "Custom sample", blob: blob.slice(0, blob.size, blob.type), updatedAt: new Date().toISOString() };
  await transact<IDBValidKey>("readwrite", (store) => store.put(record));
  return record;
}

export async function deleteCustomSample(instrument: SongInstrument) {
  await transact<undefined>("readwrite", (store) => store.delete(instrument));
}
