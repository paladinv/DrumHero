import type { SongLibraryState } from "./song-library";

/** Learner-owned practice data; song charts and library organization remain shared on this device. */
const learnerDataFields = [
  "goals",
  "queues",
  "referenceTracks",
  "learningPaths",
  "rehearsalRuns",
  "progress",
  "journals",
  "notes",
  "schedules",
  "recordings",
  "reviews",
  "tempoRamps",
  "rubricAssessments",
] as const;

type LearnerRecord = { learnerId?: string };
const ownerOf = (value: unknown) => {
  if (!value || typeof value !== "object") return "default";
  const learnerId = (value as LearnerRecord).learnerId;
  return typeof learnerId === "string" && learnerId.length <= 80 ? learnerId : "default";
};

export function songLibraryForLearner(state: SongLibraryState, learnerId: string): SongLibraryState {
  const result = { ...state } as unknown as Record<string, unknown>;
  for (const field of learnerDataFields) {
    const records = state[field];
    result[field] = Array.isArray(records) ? records.filter((record) => ownerOf(record) === learnerId) : [];
  }
  return result as unknown as SongLibraryState;
}

/** Replaces one learner's private records while preserving every other learner's records. */
export function mergeSongLibraryLearner(state: SongLibraryState, learnerState: SongLibraryState, learnerId: string): SongLibraryState {
  const result = { ...state, ...learnerState } as unknown as Record<string, unknown>;
  for (const field of learnerDataFields) {
    const existing = state[field] as LearnerRecord[] | undefined;
    const incoming = learnerState[field] as LearnerRecord[] | undefined;
    result[field] = [
      ...(existing ?? []).filter((record) => ownerOf(record) !== learnerId),
      ...(incoming ?? []).map((record) => ({ ...record, learnerId })),
    ];
  }
  return result as unknown as SongLibraryState;
}

export function removeSongLibraryLearner(state: SongLibraryState, learnerId: string): SongLibraryState {
  const result = { ...state } as unknown as Record<string, unknown>;
  for (const field of learnerDataFields) {
    const records = state[field] as LearnerRecord[] | undefined;
    result[field] = (records ?? []).filter((record) => ownerOf(record) !== learnerId);
  }
  return result as unknown as SongLibraryState;
}
