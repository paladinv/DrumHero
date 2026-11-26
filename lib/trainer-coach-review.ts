import type { PracticePattern } from "./types";
import type { SavedTrainerTake, TrainerCoachLocation } from "./trainer-take-library";

export const TRAINER_COACH_PACKAGE_FORMAT = "drum-hero-trainer-coach-package-v1";
export const TRAINER_COACH_FEEDBACK_FORMAT = "drum-hero-trainer-coach-feedback-v1";
export const TRAINER_COACH_MAX_BYTES = 24 * 1024 * 1024;

export type CoachComment = { id: string; timeMs: number; note: string; createdAt: string; location?: TrainerCoachLocation };
export type CoachTakePackage = {
  application: "Drum Hero";
  format: typeof TRAINER_COACH_PACKAGE_FORMAT;
  version: 1;
  takeId: string;
  takeName: string;
  patternId: string;
  patternName: string;
  bpm: number;
  createdAt: string;
  mimeType: string;
  audioBase64: string;
  expectedMarkersMs: number[];
  actualMarkersMs: number[];
  expectedDynamics: NonNullable<SavedTrainerTake["expectedDynamics"]>;
  actualDynamics: NonNullable<SavedTrainerTake["actualDynamics"]>;
  beatsPerBar: number;
  pattern?: PracticePattern;
};
export type CoachFeedback = {
  application: "Drum Hero";
  format: typeof TRAINER_COACH_FEEDBACK_FORMAT;
  version: 1;
  takeId: string;
  patternName: string;
  bpm: number;
  comments: CoachComment[];
};

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  return btoa(binary);
}

function decodeBase64(value: string) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("The review package audio is invalid.");
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function validDynamicsMarkers(value: unknown) {
  return Array.isArray(value) && value.length <= 100_000 && value.every(marker =>
    marker && typeof marker === "object" && Number.isFinite(marker.timeMs) && marker.timeMs >= 0 && marker.timeMs <= 3_600_000 &&
    Number.isInteger(marker.velocity) && marker.velocity >= 0 && marker.velocity <= 127);
}

function coachPattern(value: unknown, expectedId: string): PracticePattern | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Partial<PracticePattern>;
  const voices = ["kick", "snare", "hihat", "tom", "crash"];
  if (item.id !== expectedId || typeof item.name !== "string" || item.name.length > 200 || typeof item.description !== "string" ||
      !["Beginner", "Intermediate", "Advanced"].includes(String(item.level)) || !Number.isFinite(item.beats) || item.beats! <= 0 ||
      !Number.isInteger(item.subdivision) || item.subdivision! < 4 || item.subdivision! > 240 || item.subdivision! % 4 !== 0 || !Number.isInteger(item.beats! * item.subdivision! / 4) ||
      !Number.isFinite(item.defaultBpm) || item.defaultBpm! < 40 || item.defaultBpm! > 220 || !Array.isArray(item.tempoRange) ||
      item.tempoRange.length !== 2 || !item.tempoRange.every(value => Number.isFinite(value) && value >= 40 && value <= 220) ||
      !Array.isArray(item.hits) || item.hits.length > 2048 || (item.tupletLabel !== undefined && (typeof item.tupletLabel !== "string" || item.tupletLabel.length > 20)) || (item.tupletGroupSteps !== undefined && (!Number.isInteger(item.tupletGroupSteps) || item.tupletGroupSteps! < 1 || item.tupletGroupSteps! > item.beats! * item.subdivision! / 4))) return null;
  const cells = item.beats! * item.subdivision! / 4;
  if (!item.hits.every(hit => hit && Number.isInteger(hit.step) && hit.step >= 0 && hit.step < cells && voices.includes(hit.instrument) &&
      (hit.sticking === undefined || hit.sticking === "R" || hit.sticking === "L") &&
      (hit.accent === undefined || typeof hit.accent === "boolean") &&
      (hit.grace === undefined || hit.grace === true) &&
      (hit.articulation === undefined || ["flam", "drag", "buzz"].includes(hit.articulation)) &&
      (hit.tuplet === undefined || Boolean(hit.tuplet && Number.isInteger(hit.tuplet.actualNotes) && hit.tuplet.actualNotes >= 2 && hit.tuplet.actualNotes <= 32 && Number.isInteger(hit.tuplet.normalNotes) && hit.tuplet.normalNotes >= 1 && hit.tuplet.normalNotes <= 32 && hit.tuplet.actualNotes !== hit.tuplet.normalNotes)))) return null;
  return { id: item.id!, name: item.name, level: item.level!, description: item.description.slice(0, 500),
    beats: item.beats!, subdivision: item.subdivision!, defaultBpm: item.defaultBpm!, tempoRange: [item.tempoRange[0]!, item.tempoRange[1]!],
    ...(item.tupletLabel ? { tupletLabel: item.tupletLabel } : {}), ...(item.tupletGroupSteps ? { tupletGroupSteps: item.tupletGroupSteps } : {}),
    hits: item.hits.map(hit => ({ step: hit.step, instrument: hit.instrument, accent: hit.accent === true, ...(hit.sticking ? { sticking: hit.sticking } : {}), ...(hit.articulation ? { articulation: hit.articulation } : {}), ...(hit.tuplet ? { tuplet: { actualNotes: hit.tuplet.actualNotes, normalNotes: hit.tuplet.normalNotes } } : {}), ...(hit.grace ? { grace: true as const } : {}) })) };
}

export async function createCoachTakePackage(take: SavedTrainerTake, pattern?: PracticePattern): Promise<CoachTakePackage> {
  if (take.blob.size <= 0 || take.blob.size > TRAINER_COACH_MAX_BYTES / 1.4) throw new Error("This take is larger than the 24 MB coach package limit.");
  const mimeType = take.blob.type || "audio/webm";
  if (!mimeType.startsWith("audio/")) throw new Error("Only an audio take can be shared for coach review.");
  return {
    application: "Drum Hero", format: TRAINER_COACH_PACKAGE_FORMAT, version: 1,
    takeId: take.id, takeName: take.name.slice(0, 100), patternId: take.patternId.slice(0, 200),
    patternName: take.patternName.slice(0, 200), bpm: Math.max(40, Math.min(220, Math.round(take.bpm))),
    createdAt: take.createdAt, mimeType, audioBase64: encodeBase64(new Uint8Array(await take.blob.arrayBuffer())),
    expectedMarkersMs: take.expectedMarkersMs.filter(Number.isFinite).slice(0, 100_000),
    actualMarkersMs: take.actualMarkersMs.filter(Number.isFinite).slice(0, 100_000),
    expectedDynamics: (take.expectedDynamics ?? []).filter(item => Number.isFinite(item.timeMs) && Number.isFinite(item.velocity)).slice(0, 100_000),
    actualDynamics: (take.actualDynamics ?? []).filter(item => Number.isFinite(item.timeMs) && Number.isFinite(item.velocity)).slice(0, 100_000),
    beatsPerBar: Math.max(1, Math.min(16, Math.round(take.settings?.beatsPerBar ?? 4))),
    ...(pattern?.id === take.patternId ? { pattern: coachPattern(pattern, take.patternId) ?? undefined } : {})
  };
}

export function trainerCoachLocation(timeMs: number, packageData: Pick<CoachTakePackage, "bpm" | "beatsPerBar" | "pattern">, voice?: string): TrainerCoachLocation {
  const absoluteBeat = Math.max(0, timeMs) * packageData.bpm / 60_000;
  const beatInBar = absoluteBeat % packageData.beatsPerBar;
  const subdivisionsPerBeat = packageData.pattern?.subdivision ? packageData.pattern.subdivision / 4 : 1;
  const location: TrainerCoachLocation = {
    bar: Math.floor(absoluteBeat / packageData.beatsPerBar) + 1,
    beat: Math.round((beatInBar + 1) * 4) / 4,
    ...(packageData.pattern ? { step: Math.floor(beatInBar * subdivisionsPerBeat + 0.00001) } : {}),
  };
  if (["kick", "snare", "hihat", "tom", "crash"].includes(voice ?? "")) location.voice = voice as TrainerCoachLocation["voice"];
  return location;
}

export function parseCoachTakePackage(raw: string): Omit<CoachTakePackage, "audioBase64"> & { blob: Blob } {
  if (new TextEncoder().encode(raw).byteLength > TRAINER_COACH_MAX_BYTES) throw new Error("This coach package is larger than 24 MB.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("This file is not a valid Drum Hero coach package."); }
  if (!value || typeof value !== "object") throw new Error("This file is not a valid Drum Hero coach package.");
  const item = value as Partial<CoachTakePackage>;
  if (item.application !== "Drum Hero" || item.format !== TRAINER_COACH_PACKAGE_FORMAT || item.version !== 1 ||
      typeof item.takeId !== "string" || !item.takeId || item.takeId.length > 200 ||
      typeof item.takeName !== "string" || item.takeName.length > 100 || typeof item.patternId !== "string" || item.patternId.length > 200 ||
      typeof item.patternName !== "string" || item.patternName.length > 200 || !Number.isInteger(item.bpm) || item.bpm! < 40 || item.bpm! > 220 ||
      typeof item.createdAt !== "string" || item.createdAt.length > 40 || !Number.isFinite(Date.parse(item.createdAt)) || typeof item.mimeType !== "string" || !item.mimeType.startsWith("audio/") ||
      typeof item.audioBase64 !== "string" || !Array.isArray(item.expectedMarkersMs) || !Array.isArray(item.actualMarkersMs) ||
      !item.expectedMarkersMs.every(value => Number.isFinite(value) && value >= 0 && value <= 3_600_000) || !item.actualMarkersMs.every(value => Number.isFinite(value) && value >= 0 && value <= 3_600_000) ||
      item.expectedMarkersMs.length > 100_000 || item.actualMarkersMs.length > 100_000 ||
      !validDynamicsMarkers(item.expectedDynamics) || !validDynamicsMarkers(item.actualDynamics) ||
      !Number.isInteger(item.beatsPerBar) || item.beatsPerBar! < 1 || item.beatsPerBar! > 16 ||
      (item.pattern !== undefined && !coachPattern(item.pattern, item.patternId))) throw new Error("The coach package has invalid or unsupported take data.");
  const bytes = decodeBase64(item.audioBase64);
  if (bytes.byteLength <= 0 || bytes.byteLength > TRAINER_COACH_MAX_BYTES) throw new Error("The coach package audio is empty or too large.");
  const packageData = item as CoachTakePackage;
  const audioBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(audioBuffer).set(bytes);
  const { audioBase64: _encodedAudio, ...metadata } = packageData;
  void _encodedAudio;
  return { ...metadata, ...(item.pattern ? { pattern: coachPattern(item.pattern, item.patternId)! } : {}), blob: new Blob([audioBuffer], { type: item.mimeType }) };
}

export function parseCoachFeedback(raw: string): CoachFeedback {
  if (new TextEncoder().encode(raw).byteLength > 512_000) throw new Error("This coach feedback file is larger than 500 KB.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("This file is not a valid Drum Hero coach response."); }
  if (!value || typeof value !== "object") throw new Error("This file is not a valid Drum Hero coach response.");
  const item = value as Partial<CoachFeedback>;
  if (item.application !== "Drum Hero" || item.format !== TRAINER_COACH_FEEDBACK_FORMAT || item.version !== 1 ||
      typeof item.takeId !== "string" || !item.takeId || item.takeId.length > 200 || typeof item.patternName !== "string" || item.patternName.length > 200 ||
      !Number.isInteger(item.bpm) || item.bpm! < 40 || item.bpm! > 220 || !Array.isArray(item.comments) || item.comments.length > 100) throw new Error("The coach response has invalid or unsupported data.");
  const commentIds = new Set<string>();
  const comments = item.comments.map(comment => {
    if (!comment || typeof comment.id !== "string" || !comment.id || comment.id.length > 100 || commentIds.has(comment.id) || !Number.isFinite(comment.timeMs) || comment.timeMs < 0 || comment.timeMs > 3_600_000 ||
        typeof comment.note !== "string" || !comment.note.trim() || comment.note.length > 600 || typeof comment.createdAt !== "string" || comment.createdAt.length > 40 || !Number.isFinite(Date.parse(comment.createdAt)) ||
        (comment.location !== undefined && (!comment.location || !Number.isInteger(comment.location.bar) || comment.location.bar < 1 || comment.location.bar > 4096 ||
          !Number.isFinite(comment.location.beat) || comment.location.beat < 1 || comment.location.beat > 16 ||
          (comment.location.step !== undefined && (!Number.isInteger(comment.location.step) || comment.location.step < 0 || comment.location.step > 512)) ||
          (comment.location.voice !== undefined && !["kick", "snare", "hihat", "tom", "crash"].includes(comment.location.voice))))) {
      throw new Error("The coach response contains an invalid time-coded comment.");
    }
    commentIds.add(comment.id);
    return { id: comment.id, timeMs: Math.round(comment.timeMs), note: comment.note.trim(), createdAt: comment.createdAt,
      ...(comment.location ? { location: { bar: comment.location.bar, beat: comment.location.beat, ...(comment.location.step === undefined ? {} : { step: comment.location.step }), ...(comment.location.voice ? { voice: comment.location.voice } : {}) } } : {}) };
  });
  return { ...item, comments } as CoachFeedback;
}

export function coachFeedbackNote(feedback: CoachFeedback) {
  return `Coach review · ${feedback.patternName} · ${feedback.bpm} BPM\n${feedback.comments.map(comment => `${(comment.timeMs / 1000).toFixed(1)} s: ${comment.note}`).join("\n")}`;
}
