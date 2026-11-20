import type { PracticePattern } from "./types";

export type TrainerContentReview = {
  id: string;
  patternId: string;
  patternName: string;
  reviewerRole: "drum-teacher" | "experienced-drummer" | "learner";
  musicalAccuracy: "accurate" | "needs-changes";
  levelFit: "too-easy" | "right" | "too-hard";
  notationClarity: "clear" | "needs-changes";
  stickingClarity: "clear" | "needs-changes";
  notes: string;
  attribution: string;
  demoName?: string;
  demo?: Blob;
  createdAt: string;
};

export type TrainerContentDecision = {
  patternId: string;
  patternRevision: string;
  status: "approved" | "changes-requested";
  reviewedBy: string;
  notes: string;
  reviewedAt: string;
};

const DATABASE = "drum-hero-trainer-content-reviews";
const STORE = "reviews";
const DECISIONS = "decisions";
const LIMIT = 100;

export function trainerPatternRevision(pattern: PracticePattern) {
  const source = JSON.stringify(pattern);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      if (!request.result.objectStoreNames.contains(DECISIONS)) request.result.createObjectStore(DECISIONS, { keyPath: "patternId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local review storage is unavailable."));
    request.onblocked = () => reject(new Error("Close other Drum Hero tabs and try again."));
  });
}

export async function readTrainerContentReviews(patternId?: string): Promise<TrainerContentReview[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE).objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as TrainerContentReview[])
        .filter(item => typeof item.patternId === "string" && (!patternId || item.patternId === patternId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export async function readAllTrainerContentReviews(): Promise<TrainerContentReview[]> {
  return readTrainerContentReviews();
}

export async function saveTrainerContentReview(review: TrainerContentReview) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const request = store.count();
      request.onsuccess = () => {
        if (request.result >= LIMIT) { transaction.abort(); return; }
        store.put(review);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(new Error(request.result >= LIMIT ? `Keep local review records to ${LIMIT} or fewer.` : "The review could not be saved."));
    });
  } finally { database.close(); }
}

export async function deleteTrainerContentReview(id: string) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

export async function readTrainerContentDecision(patternId: string): Promise<TrainerContentDecision | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(DECISIONS).objectStore(DECISIONS).get(patternId);
      request.onsuccess = () => resolve((request.result as TrainerContentDecision | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export async function readAllTrainerContentDecisions(): Promise<TrainerContentDecision[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(DECISIONS).objectStore(DECISIONS).getAll();
      request.onsuccess = () => resolve(request.result as TrainerContentDecision[]);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}

export async function saveTrainerContentDecision(decision: TrainerContentDecision) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DECISIONS, "readwrite");
      transaction.objectStore(DECISIONS).put(decision);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("The editorial decision could not be saved."));
    });
  } finally { database.close(); }
}
