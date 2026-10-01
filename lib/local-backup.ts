const APP_PREFIX = "drum-hero:";
const MAX_BACKUP_BYTES = 128 * 1024 * 1024;
const MAX_TOTAL_AUDIO_BYTES = 96 * 1024 * 1024;
const SAMPLE_DATABASE = "drum-hero-song-builder-kit";
const SAMPLE_STORE = "custom-samples";
const RECORDING_DATABASE = "drum-hero-song-recordings";
const RECORDING_STORE = "takes";

type EncodedBlob = { mimeType: string; data: string };
type BackupSample = { instrument: string; name: string; updatedAt: string; blob: EncodedBlob };
type LocalBackup = {
  application: "Drum Hero";
  format: "drum-hero-full-backup";
  version: 1;
  createdAt: string;
  localStorage: Record<string, string>;
  songRecordings: Array<{ id: string; blob: EncodedBlob }>;
  customSamples: BackupSample[];
};

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("Backup contains invalid audio data.");
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encodeBlob(blob: Blob): Promise<EncodedBlob> {
  return { mimeType: blob.type || "application/octet-stream", data: encodeBase64(new Uint8Array(await blob.arrayBuffer())) };
}

function openStore(databaseName: string, storeName: string, keyPath?: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This browser does not support local backup storage.")); return; }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, keyPath ? { keyPath } : undefined);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local audio storage."));
  });
}

async function readStore(databaseName: string, storeName: string, keyPath?: string) {
  const database = await openStore(databaseName, storeName, keyPath);
  try {
    return await new Promise<Array<{ key: IDBValidKey; value: unknown }>>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);
      const values = store.getAll();
      const keys = store.getAllKeys();
      transaction.oncomplete = () => resolve(values.result.map((value, index) => ({ key: keys.result[index], value })));
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not read local audio storage."));
    });
  } finally { database.close(); }
}

async function replaceStore(databaseName: string, storeName: string, entries: Array<{ key?: IDBValidKey; value: unknown }>, keyPath?: string) {
  const database = await openStore(databaseName, storeName, keyPath);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const entry of entries) {
        if (keyPath) store.put(entry.value);
        else if (entry.key !== undefined) store.put(entry.value, entry.key);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not restore local audio storage."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Local audio restore was interrupted."));
    });
  } finally { database.close(); }
}

function storageSnapshot() {
  const values: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(APP_PREFIX)) {
      const value = localStorage.getItem(key);
      if (value !== null) values[key] = value;
    }
  }
  return values;
}

export async function createLocalBackup(): Promise<string> {
  const [recordingRows, sampleRows] = await Promise.all([
    readStore(RECORDING_DATABASE, RECORDING_STORE),
    readStore(SAMPLE_DATABASE, SAMPLE_STORE, "instrument")
  ]);
  const songRecordings = await Promise.all(recordingRows.flatMap(({ key, value }) => value instanceof Blob && typeof key === "string" ? [{ id: key, blob: value }] : []).map(async ({ id, blob }) => ({ id, blob: await encodeBlob(blob) })));
  const customSamples = await Promise.all(sampleRows.flatMap(({ value }) => {
    if (!value || typeof value !== "object") return [];
    const sample = value as { instrument?: unknown; name?: unknown; updatedAt?: unknown; blob?: unknown };
    return typeof sample.instrument === "string" && typeof sample.name === "string" && typeof sample.updatedAt === "string" && sample.blob instanceof Blob
      ? [{ instrument: sample.instrument, name: sample.name, updatedAt: sample.updatedAt, blob: sample.blob }]
      : [];
  }).map(async (sample) => ({ instrument: sample.instrument, name: sample.name, updatedAt: sample.updatedAt, blob: await encodeBlob(sample.blob) })));
  const audioBase64 = [...songRecordings.map((item) => item.blob.data), ...customSamples.map((item) => item.blob.data)];
  const audioBytes = audioBase64.reduce((total, data) => total + data.length / 4 * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0), 0);
  if (audioBytes > MAX_TOTAL_AUDIO_BYTES) throw new Error("Local audio exceeds the 96 MB backup limit. Export and remove some saved takes or custom samples, then try again.");
  const output = JSON.stringify({
    application: "Drum Hero",
    format: "drum-hero-full-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    localStorage: storageSnapshot(),
    songRecordings,
    customSamples
  } satisfies LocalBackup);
  if (new TextEncoder().encode(output).byteLength > MAX_BACKUP_BYTES) throw new Error("Your backup is larger than the 128 MB file limit. Remove some local data and try again.");
  return output;
}

export function parseLocalBackup(raw: string): LocalBackup {
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error("This backup is larger than 128 MB and cannot be restored here.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("This file is not a valid Drum Hero backup."); }
  if (!value || typeof value !== "object") throw new Error("This file is not a valid Drum Hero backup.");
  const backup = value as Partial<LocalBackup>;
  if (backup.application !== "Drum Hero" || backup.format !== "drum-hero-full-backup" || backup.version !== 1 || typeof backup.createdAt !== "string" || Number.isNaN(Date.parse(backup.createdAt))) throw new Error("This backup format is not supported.");
  if (!backup.localStorage || typeof backup.localStorage !== "object" || Array.isArray(backup.localStorage) || Object.keys(backup.localStorage).length > 64) throw new Error("Backup settings are invalid.");
  for (const [key, item] of Object.entries(backup.localStorage)) {
    if (!key.startsWith(APP_PREFIX) || key.length > 240 || typeof item !== "string" || item.length > 8_000_000) throw new Error("Backup contains invalid settings data.");
  }
  if (!Array.isArray(backup.songRecordings) || backup.songRecordings.length > 100 || !Array.isArray(backup.customSamples) || backup.customSamples.length > 16) throw new Error("Backup audio data is invalid.");
  let audioBytes = 0;
  const checkBlob = (blob: EncodedBlob) => {
    if (!blob || typeof blob.mimeType !== "string" || blob.mimeType.length > 100 || !blob.mimeType.startsWith("audio/") || typeof blob.data !== "string") throw new Error("Backup contains an invalid audio file.");
    const decoded = decodeBase64(blob.data);
    audioBytes += decoded.byteLength;
    if (audioBytes > MAX_TOTAL_AUDIO_BYTES) throw new Error("Backup audio exceeds the 96 MB restore limit.");
  };
  for (const recording of backup.songRecordings) {
    if (!recording || typeof recording.id !== "string" || !recording.id || recording.id.length > 200) throw new Error("Backup contains an invalid song recording.");
    checkBlob(recording.blob);
  }
  const validInstruments = new Set(["kick", "snare", "hihat", "tom", "crash", "openhat", "ride", "rimshot"]);
  for (const sample of backup.customSamples) {
    if (!sample || typeof sample.instrument !== "string" || !validInstruments.has(sample.instrument) || typeof sample.name !== "string" || typeof sample.updatedAt !== "string") throw new Error("Backup contains an invalid custom drum sample.");
    const bytesBeforeSample = audioBytes;
    checkBlob(sample.blob);
    if (audioBytes - bytesBeforeSample > 12 * 1024 * 1024) throw new Error("A custom audio sample exceeds the 12 MB limit.");
  }
  return backup as LocalBackup;
}

async function replaceAudioStores(backup: LocalBackup) {
  const recordings = backup.songRecordings.map(({ id, blob }) => ({ key: id, value: new Blob([decodeBase64(blob.data)], { type: blob.mimeType }) }));
  const samples = backup.customSamples.map((sample) => ({ value: { ...sample, blob: new Blob([decodeBase64(sample.blob.data)], { type: sample.blob.mimeType }) } }));
  await replaceStore(RECORDING_DATABASE, RECORDING_STORE, recordings);
  await replaceStore(SAMPLE_DATABASE, SAMPLE_STORE, samples, "instrument");
}

function replaceLocalStorage(values: Record<string, string>) {
  for (const key of Object.keys(storageSnapshot())) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
}

export async function restoreLocalBackup(backup: LocalBackup) {
  const previous = parseLocalBackup(await createLocalBackup());
  try {
    await replaceAudioStores(backup);
    replaceLocalStorage(backup.localStorage);
  } catch (error) {
    await replaceAudioStores(previous);
    replaceLocalStorage(previous.localStorage);
    throw error;
  }
}
