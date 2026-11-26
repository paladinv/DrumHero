import type { SongInstrument } from "./types";

const DATABASE = "drum-hero-song-builder-kit";
const STORE = "custom-samples";
const VERSION = 1;
export const MAX_CUSTOM_SAMPLE_BYTES = 12 * 1024 * 1024;
export type CustomSampleAlternate = { name: string; blob: Blob };
export type CustomSampleRecord = { instrument: SongInstrument; name: string; blob: Blob; softName?: string; softBlob?: Blob; accentName?: string; accentBlob?: Blob; alternates?: Partial<Record<"primary" | "soft" | "accent", CustomSampleAlternate[]>>; updatedAt: string };
export type CustomSampleLayers = { primary: Blob; soft?: Blob; accent?: Blob; alternates?: Partial<Record<"primary" | "soft" | "accent", Blob[]>> };
export type CustomSampleLayer = "soft" | "primary" | "accent";
export const MAX_ROUND_ROBIN_SAMPLES = 4;

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

export async function replaceCustomSampleRecords(records: CustomSampleRecord[]) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      store.clear();
      records.forEach(record => store.put(record));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not restore the custom kit samples."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Custom kit sample restore was interrupted."));
    });
  } finally { database.close(); }
}

export async function readCustomSamples() {
  const records = await readCustomSampleRecords();
  return Object.fromEntries(records.map((record) => [record.instrument, { primary: record.blob, ...(record.softBlob ? { soft: record.softBlob } : {}), ...(record.accentBlob ? { accent: record.accentBlob } : {}), ...(record.alternates ? { alternates: Object.fromEntries(Object.entries(record.alternates).map(([layer, samples]) => [layer, samples?.map(sample => sample.blob) ?? []])) } : {}) }])) as Partial<Record<SongInstrument, CustomSampleLayers>>;
}

export async function saveCustomSampleAlternateBlob(instrument: SongInstrument, layer: CustomSampleLayer, name: string, blob: Blob) {
  if (!blob.type.startsWith("audio/")) throw new Error("Choose an audio file such as WAV, MP3, or OGG.");
  if (blob.size > MAX_CUSTOM_SAMPLE_BYTES) throw new Error("Custom drum samples must be 12 MB or smaller.");
  const previous = await transact<CustomSampleRecord | undefined>("readonly", (store) => store.get(instrument));
  const hasLayer = layer === "primary" ? !!previous?.blob : layer === "soft" ? !!previous?.softBlob : !!previous?.accentBlob;
  if (!previous || !hasLayer) throw new Error(`Import a ${layer} sample before adding an alternate take.`);
  const current = previous.alternates?.[layer] ?? [];
  if (current.length >= MAX_ROUND_ROBIN_SAMPLES) throw new Error(`Each velocity layer supports up to ${MAX_ROUND_ROBIN_SAMPLES} alternate takes.`);
  const alternates = { ...previous.alternates, [layer]: [...current, { name: name.slice(0, 120) || `Alternate ${current.length + 1}`, blob: blob.slice(0, blob.size, blob.type) }] };
  const record = { ...previous, alternates, updatedAt: new Date().toISOString() };
  await transact<IDBValidKey>("readwrite", (store) => store.put(record));
  return record;
}

export async function deleteCustomSampleAlternate(instrument: SongInstrument, layer: CustomSampleLayer, index: number) {
  const previous = await transact<CustomSampleRecord | undefined>("readonly", (store) => store.get(instrument));
  if (!previous?.alternates?.[layer]?.[index]) return;
  const items = [...previous.alternates[layer]!]; items.splice(index, 1);
  const alternates = { ...previous.alternates };
  if (items.length) alternates[layer] = items; else delete alternates[layer];
  const record = { ...previous, alternates: Object.keys(alternates).length ? alternates : undefined, updatedAt: new Date().toISOString() };
  await transact<IDBValidKey>("readwrite", (store) => store.put(record));
}

export async function replaceCustomSampleAlternates(instrument: SongInstrument, layer: CustomSampleLayer, samples: CustomSampleAlternate[]) {
  if (samples.length > MAX_ROUND_ROBIN_SAMPLES) throw new Error(`Each velocity layer supports up to ${MAX_ROUND_ROBIN_SAMPLES} alternate takes.`);
  if (samples.some(sample => !sample.blob.type.startsWith("audio/") || sample.blob.size > MAX_CUSTOM_SAMPLE_BYTES)) throw new Error("Round-robin samples must be audio files no larger than 12 MB each.");
  const previous = await transact<CustomSampleRecord | undefined>("readonly", (store) => store.get(instrument));
  if (!previous) throw new Error("Import a custom primary sample before restoring alternate takes.");
  const hasLayer = layer === "primary" ? !!previous.blob : layer === "soft" ? !!previous.softBlob : !!previous.accentBlob;
  if (samples.length && !hasLayer) throw new Error(`Import a ${layer} sample before restoring its alternate takes.`);
  const alternates = { ...previous.alternates };
  if (samples.length) alternates[layer] = samples.map(sample => ({ name: sample.name.slice(0, 120) || "Alternate take", blob: sample.blob.slice(0, sample.blob.size, sample.blob.type) }));
  else delete alternates[layer];
  const record = { ...previous, alternates: Object.keys(alternates).length ? alternates : undefined, updatedAt: new Date().toISOString() };
  await transact<IDBValidKey>("readwrite", (store) => store.put(record));
  return record;
}

export async function saveCustomSample(instrument: SongInstrument, file: File) {
  return saveCustomSampleBlob(instrument, file.name, file);
}

export async function saveCustomSampleBlob(instrument: SongInstrument, name: string, blob: Blob) {
  if (!blob.type.startsWith("audio/")) throw new Error("Choose an audio file such as WAV, MP3, or OGG.");
  if (blob.size > MAX_CUSTOM_SAMPLE_BYTES) throw new Error("Custom drum samples must be 12 MB or smaller.");
  const previous = await transact<CustomSampleRecord | undefined>("readonly", (store) => store.get(instrument));
  const record: CustomSampleRecord = { ...previous, instrument, name: name.slice(0, 120) || "Custom sample", blob: blob.slice(0, blob.size, blob.type), updatedAt: new Date().toISOString() };
  await transact<IDBValidKey>("readwrite", (store) => store.put(record));
  return record;
}

export async function saveCustomAccentSample(instrument: SongInstrument, file: File) {
  return saveCustomAccentSampleBlob(instrument, file.name, file);
}

export async function saveCustomAccentSampleBlob(instrument: SongInstrument, name: string, blob: Blob) {
  return saveCustomSampleLayerBlob(instrument, "accent", name, blob);
}

export async function saveCustomSampleLayerBlob(instrument: SongInstrument, layer: "soft" | "accent", name: string, blob: Blob) {
  if (!blob.type.startsWith("audio/")) throw new Error("Choose an audio file such as WAV, MP3, or OGG.");
  if (blob.size > MAX_CUSTOM_SAMPLE_BYTES) throw new Error("Custom drum samples must be 12 MB or smaller.");
  const previous = await transact<CustomSampleRecord | undefined>("readonly", (store) => store.get(instrument));
  if (!previous?.blob) throw new Error("Import a primary sample for this voice before adding a velocity layer.");
  const record: CustomSampleRecord = layer === "accent"
    ? { ...previous, accentName: name.slice(0, 120) || "Accent sample", accentBlob: blob.slice(0, blob.size, blob.type), updatedAt: new Date().toISOString() }
    : { ...previous, softName: name.slice(0, 120) || "Soft sample", softBlob: blob.slice(0, blob.size, blob.type), updatedAt: new Date().toISOString() };
  await transact<IDBValidKey>("readwrite", (store) => store.put(record));
  return record;
}

export async function deleteCustomSample(instrument: SongInstrument, layer?: CustomSampleLayer) {
  if (!layer || layer === "primary") {
    await transact<undefined>("readwrite", (store) => store.delete(instrument));
    return;
  }
  const previous = await transact<CustomSampleRecord | undefined>("readonly", (store) => store.get(instrument));
  if (!previous) return;
  if (layer === "accent") {
    const { accentBlob: _blob, accentName: _name, ...primary } = previous;
    const alternates = { ...primary.alternates }; delete alternates.accent;
    await transact<IDBValidKey>("readwrite", (store) => store.put({ ...primary, alternates: Object.keys(alternates).length ? alternates : undefined }));
  } else {
    const { softBlob: _blob, softName: _name, ...primary } = previous;
    const alternates = { ...primary.alternates }; delete alternates.soft;
    await transact<IDBValidKey>("readwrite", (store) => store.put({ ...primary, alternates: Object.keys(alternates).length ? alternates : undefined }));
  }
}
