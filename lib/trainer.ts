import { classifyOffset, findClosestExpected, stepDurationMs, summarizeHits } from "./scoring";
import type { Instrument, MidiArticulation, PatternHit, PracticePattern, RatedHit, SessionResult } from "./types";
import { learnerProfileIdFromBrowser, learnerStorageKey } from "./learner-profiles";
import { normalizeTrainerCueSequence } from "./trainer-cue-sequences";

export type TrainerMode = "self" | "scored";
export type TrainerRating = "clean" | "needsWork" | "missed";
export type TrainerSource = "keyboard" | "touch" | "midi" | "audio-timing" | "audio-voices";
export type TrainerFeel = "straight" | "shuffle" | "laid-back" | "shuffle-laid-back";
export type TrainerLimbFocus = "all" | "hands" | "feet";
export type TrainerRound = {
  durationSeconds?: number;
  id: string; patternId: string; patternName: string; bpm: number; playedAt: string;
  mode: TrainerMode; source: TrainerSource | "self"; ratings: TrainerRating[]; repetitions?: number;
  result: SessionResult | null; hits?: RatedHit[]; focusedDrill?: { instrument: Instrument; beat: number; sourceRoundId?: string; sourcePatternId?: string };
  feel?: TrainerFeel; limbFocus?: TrainerLimbFocus; adaptation?: "standard" | "seated" | "single-voice"; swingRatio?: number; pocketMs?: number; learningMode?: string; inputProfile?: string; targetVoice?: Instrument; uncertainDetections?: number; inputClipped?: boolean;
  timingCorrectionMs?: number; timingCalibrated?: boolean;
  variationId?: string;
  backingChallenge?: "rock" | "funk" | "shuffle";
  notes?: string;
  tags?: Array<"warm-up" | "focused" | "teacher" | "recording-review" | "rough-session">;
  voicePractice?: "all" | "single" | "layers";
  voiceFocus?: Instrument;
  voiceLayerCount?: number;
  rudimentHandCheck?: boolean;
  transferFromPatternId?: string;
  /** Compact hit summaries retained when detailed timing ages out of history. */
  compactAnalysis?: TrainerCompactAnalysis;
  /** This imported result has score and accuracy only, without per-hit timing. */
  summaryOnly?: true;
};
export type TrainerCompactMetric = { total: number; onTime: number; missed: number; offsetSumMs: number; offsetCount: number };
export type TrainerCompactAnalysis = { version: 1; byVoice: Partial<Record<Instrument, TrainerCompactMetric>>; byBeatVoice: Array<TrainerCompactMetric & { instrument: Instrument; beat: number }> };
export type TrainerPortableRoutine = { name: string; steps: Array<{ patternId: string; bpm: number; repetitions: 4 | 8 | 10 | 16; fillPatternId: string; fillAfterBars: 1 | 2 | 4 }>; gated: boolean; accuracyTarget: 70 | 80 | 85 | 90 | 95; timingTarget: 25 | 35 | 50 | 75 };
export type TrainerPortableCueSequence = { id: string; name: string; cues: Array<{ beat: number; action: "crash" | "loud" | "soft" | "dropout" | "accent-shift"; voice?: Instrument }> };
export type TrainerPortableCoachFeedback = { id: string; takeId: string; patternName: string; bpm: number; receivedAt: string; comments: Array<{ id: string; timeMs: number; note: string; createdAt: string; location?: { bar: number; beat: number; step?: number; voice?: Instrument } }> };
export type TrainerPortableRound = Pick<TrainerRound, "id" | "patternId" | "patternName" | "bpm" | "playedAt" | "mode" | "source" | "ratings" | "repetitions" | "durationSeconds" | "result" | "focusedDrill" | "feel" | "limbFocus" | "adaptation" | "variationId" | "backingChallenge" | "notes" | "tags" | "voicePractice" | "voiceFocus" | "voiceLayerCount" | "rudimentHandCheck" | "transferFromPatternId" | "compactAnalysis"> & { summaryOnly: true; hits?: RatedHit[] };
export type TrainerPortableData = { rounds: TrainerPortableRound[]; routine?: TrainerPortableRoutine; cueSequences?: TrainerPortableCueSequence[]; coachFeedback?: TrainerPortableCoachFeedback[] };
export type AudioDynamicsCalibration = { noiseRms?: number; ghostRms?: number; accentRms?: number };
export type TrainerDeviceProfile = { latencyMs: number; latencyCalibrated?: boolean; latencySpreadMs?: number | null; latencyCalibratedAt?: string | null; midiMap: Record<number, Instrument | null>; midiArticulations: Record<number, MidiArticulation | null>; midiVelocityRanges?: Record<number, { soft: number; hard: number }>; audioTemplates: Partial<Record<Instrument, number[]>>; audioDynamics?: Partial<Record<Instrument, AudioDynamicsCalibration>> };
export type TrainerState = { version: 2; rounds: TrainerRound[]; latencyMs: number; midiMap: Record<number, Instrument | null>; deviceProfiles: Record<string, TrainerDeviceProfile>; routine?: TrainerPortableRoutine; cueSequences?: TrainerPortableCueSequence[]; coachFeedback?: TrainerPortableCoachFeedback[] };
export const TRAINER_ROUND_HISTORY_LIMIT = 1000;
export const TRAINER_DETAILED_ROUND_LIMIT = 50;
type PersistedTrainerState = Omit<Partial<TrainerState>, "version"> & { version?: number };
export const TRAINER_KEY = "drum-hero:trainer:v1";
export const TRAINER_PREFERENCES_KEY = "drum-hero:trainer-preferences:v1";
export function trainerStorageKey(profileId = learnerProfileIdFromBrowser()): string { return learnerStorageKey(TRAINER_KEY, profileId); }
export function updateTrainerPreferredBpm(bpm: number) {
  if (typeof window === "undefined" || !Number.isFinite(bpm)) return;
  try {
    const raw = window.localStorage.getItem(TRAINER_PREFERENCES_KEY);
    const value: unknown = raw ? JSON.parse(raw) : {};
    if (value && typeof value === "object" && !Array.isArray(value)) {
      window.localStorage.setItem(TRAINER_PREFERENCES_KEY, JSON.stringify({ ...value, bpm: Math.min(200, Math.max(40, Math.round(bpm))) }));
    }
  } catch { /* Keep the existing Trainer preferences if storage is unavailable or malformed. */ }
}
export const DEFAULT_MIDI_MAP: Record<number, Instrument> = {
  35: "kick", 36: "kick", 37: "snare", 38: "snare", 40: "snare", 42: "hihat", 44: "hihat", 46: "hihat",
  41: "tom", 43: "tom", 45: "tom", 47: "tom", 48: "tom", 49: "crash", 51: "hihat", 53: "hihat", 55: "crash", 57: "crash", 59: "hihat"
};
export const DEFAULT_MIDI_ARTICULATIONS: Record<number, MidiArticulation> = {
  37: "side-stick", 40: "rimshot", 42: "closed-hat", 44: "pedal-hat", 46: "open-hat", 49: "crash", 51: "ride", 53: "ride", 57: "crash", 59: "ride"
};
export const defaultTrainerState: TrainerState = { version: 2, rounds: [], latencyMs: 0, midiMap: DEFAULT_MIDI_MAP, deviceProfiles: {} };
const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
function compactMetric(): TrainerCompactMetric { return { total: 0, onTime: 0, missed: 0, offsetSumMs: 0, offsetCount: 0 }; }
export function summarizeTrainerHits(pattern: Pick<PracticePattern, "subdivision"> | undefined, hits: RatedHit[]): TrainerCompactAnalysis {
  const byVoice: Partial<Record<Instrument, TrainerCompactMetric>> = {};
  const spots = new Map<string, TrainerCompactMetric & { instrument: Instrument; beat: number }>();
  const stepsPerBeat = pattern ? pattern.subdivision / 4 : 0;
  for (const hit of hits) {
    if (!voices.includes(hit.instrument) || hit.rating === "extra" || hit.transition === "landing") continue;
    const voiceMetric = byVoice[hit.instrument] ?? compactMetric();
    voiceMetric.total += 1;
    if (hit.rating === "great" || hit.rating === "good") voiceMetric.onTime += 1;
    if (hit.rating === "miss") voiceMetric.missed += 1;
    if (typeof hit.offsetMs === "number") { voiceMetric.offsetSumMs += hit.offsetMs; voiceMetric.offsetCount += 1; }
    byVoice[hit.instrument] = voiceMetric;
    if (Number.isInteger(hit.step) && Number.isFinite(stepsPerBeat) && stepsPerBeat > 0) {
      const beat = Math.floor(hit.step! / stepsPerBeat) + 1;
      const key = `${hit.instrument}:${beat}`;
      const metric = spots.get(key) ?? { instrument: hit.instrument, beat, ...compactMetric() };
      metric.total += 1;
      if (hit.rating === "great" || hit.rating === "good") metric.onTime += 1;
      if (hit.rating === "miss") metric.missed += 1;
      if (typeof hit.offsetMs === "number") { metric.offsetSumMs += hit.offsetMs; metric.offsetCount += 1; }
      spots.set(key, metric);
    }
  }
  return { version: 1, byVoice, byBeatVoice: [...spots.values()].slice(0, 320) };
}
function validateCompactAnalysis(value: unknown): value is TrainerCompactAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<TrainerCompactAnalysis>;
  const validMetric = (metric: unknown) => Boolean(metric && typeof metric === "object" && Number.isInteger((metric as TrainerCompactMetric).total) && (metric as TrainerCompactMetric).total >= 0 && (metric as TrainerCompactMetric).total <= 100_000 && Number.isInteger((metric as TrainerCompactMetric).onTime) && (metric as TrainerCompactMetric).onTime >= 0 && (metric as TrainerCompactMetric).onTime <= (metric as TrainerCompactMetric).total && Number.isInteger((metric as TrainerCompactMetric).missed) && (metric as TrainerCompactMetric).missed >= 0 && (metric as TrainerCompactMetric).missed <= (metric as TrainerCompactMetric).total && Number.isFinite((metric as TrainerCompactMetric).offsetSumMs) && Math.abs((metric as TrainerCompactMetric).offsetSumMs) <= 100_000_000 && Number.isInteger((metric as TrainerCompactMetric).offsetCount) && (metric as TrainerCompactMetric).offsetCount >= 0 && (metric as TrainerCompactMetric).offsetCount <= (metric as TrainerCompactMetric).total);
  if (item.version !== 1 || !item.byVoice || typeof item.byVoice !== "object" || Array.isArray(item.byVoice) || Object.entries(item.byVoice).some(([voice, metric]) => !voices.includes(voice as Instrument) || !validMetric(metric)) || !Array.isArray(item.byBeatVoice) || item.byBeatVoice.length > 320) return false;
  return item.byBeatVoice.every(spot => spot && voices.includes(spot.instrument) && Number.isInteger(spot.beat) && spot.beat >= 1 && spot.beat <= 64 && validMetric(spot));
}
export function retainTrainerRoundHistory(rounds: TrainerRound[]): TrainerRound[] {
  return [...rounds].sort((left, right) => right.playedAt.localeCompare(left.playedAt))
    .slice(0, TRAINER_ROUND_HISTORY_LIMIT)
    .map((round, index) => {
      const compactAnalysis = round.compactAnalysis ?? (round.hits?.length ? summarizeTrainerHits(undefined, round.hits) : undefined);
      return index < TRAINER_DETAILED_ROUND_LIMIT ? { ...round, ...(compactAnalysis ? { compactAnalysis } : {}) } : { ...round, compactAnalysis, hits: undefined, summaryOnly: true };
    });
}
}
export function defaultTrainerDeviceProfile(state: TrainerState): TrainerDeviceProfile { return { latencyMs: state.latencyMs, latencyCalibrated: false, midiMap: { ...state.midiMap }, midiArticulations: { ...DEFAULT_MIDI_ARTICULATIONS }, midiVelocityRanges: {}, audioTemplates: {} }; }
export function getTrainerDeviceProfile(state: TrainerState, key: string): TrainerDeviceProfile { return state.deviceProfiles[key] ?? defaultTrainerDeviceProfile(state); }
const PORTABLE_ROUND_KEYS = new Set(["id", "patternId", "patternName", "bpm", "playedAt", "mode", "source", "ratings", "repetitions", "durationSeconds", "result", "focusedDrill", "feel", "limbFocus", "adaptation", "variationId", "backingChallenge", "notes", "tags", "voicePractice", "voiceFocus", "voiceLayerCount", "rudimentHandCheck", "transferFromPatternId", "compactAnalysis", "summaryOnly", "hits"]);
export function portableTrainerRound(round: TrainerRound, includeTiming = false): TrainerPortableRound {
  const { id, patternId, patternName, bpm, playedAt, mode, source, ratings, repetitions, durationSeconds, result, focusedDrill, feel, limbFocus, adaptation, variationId, backingChallenge, notes, tags, voicePractice, voiceFocus, voiceLayerCount, rudimentHandCheck, transferFromPatternId, compactAnalysis } = round;
  return { id, patternId, patternName, bpm, playedAt, mode, source, ratings, ...(repetitions === undefined ? {} : { repetitions }), ...(durationSeconds === undefined ? {} : { durationSeconds }), result, ...(focusedDrill ? { focusedDrill } : {}), ...(feel ? { feel } : {}), ...(limbFocus ? { limbFocus } : {}), ...(adaptation ? { adaptation } : {}), ...(variationId ? { variationId } : {}), ...(backingChallenge ? { backingChallenge } : {}), ...(notes ? { notes } : {}), ...(tags ? { tags } : {}), ...(voicePractice ? { voicePractice } : {}), ...(voiceFocus ? { voiceFocus } : {}), ...(voiceLayerCount ? { voiceLayerCount } : {}), ...(rudimentHandCheck === undefined ? {} : { rudimentHandCheck }), ...(transferFromPatternId ? { transferFromPatternId } : {}), ...(compactAnalysis ? { compactAnalysis } : {}), ...(includeTiming && round.hits?.length ? { hits: round.hits.slice(0, 600) } : {}), summaryOnly: true };
}
export function trainerStateForCloud(state: TrainerState): TrainerState {
  return {
    version: 2,
    rounds: retainTrainerRoundHistory(state.rounds).map(round => portableTrainerRound(round)),
    latencyMs: 0,
    midiMap: { ...DEFAULT_MIDI_MAP },
    deviceProfiles: {},
    ...(state.routine ? { routine: state.routine } : {}),
    ...(state.cueSequences ? { cueSequences: state.cueSequences } : {}),
    ...(state.coachFeedback ? { coachFeedback: state.coachFeedback.slice(-100) } : {}),
  };
}
export function parseTrainerPortableRounds(value: unknown): TrainerPortableRound[] | null {
  if (!Array.isArray(value) || value.length > TRAINER_ROUND_HISTORY_LIMIT) return null;
  const ids = new Set<string>();
  for (const round of value) {
    if (!round || typeof round !== "object" || Array.isArray(round)) return null;
    const item = round as Record<string, unknown>;
    if (Object.keys(item).some(key => !PORTABLE_ROUND_KEYS.has(key)) || item.summaryOnly !== true || typeof item.id !== "string" || !item.id || item.id.length > 120 || ids.has(item.id) || (item.hits !== undefined && (!Array.isArray(item.hits) || item.hits.length > 600))) return null;
    ids.add(item.id);
  }
  const parsed = parseTrainerState(JSON.stringify({ version: 2, rounds: value, latencyMs: 0, midiMap: DEFAULT_MIDI_MAP, deviceProfiles: {} }));
  return parsed.rounds.length === value.length ? parsed.rounds.map((round, index) => portableTrainerRound(round, Array.isArray((value[index] as Record<string, unknown>).hits))) : null;
}
export function parseTrainerPortableRoutine(value: unknown): TrainerPortableRoutine | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<TrainerPortableRoutine>;
  if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 50 || !Array.isArray(item.steps) || item.steps.length > 20 ||
      typeof item.gated !== "boolean" || ![70, 80, 85, 90, 95].includes(Number(item.accuracyTarget)) || ![25, 35, 50, 75].includes(Number(item.timingTarget))) return null;
  const steps = item.steps.filter(step => step && typeof step.patternId === "string" && step.patternId.length > 0 && step.patternId.length <= 200 &&
    Number.isInteger(step.bpm) && step.bpm >= 40 && step.bpm <= 220 && [4, 8, 10, 16].includes(step.repetitions) &&
    typeof step.fillPatternId === "string" && step.fillPatternId.length <= 200 && [1, 2, 4].includes(step.fillAfterBars));
  if (steps.length !== item.steps.length) return null;
  return { name: item.name.trim(), steps, gated: item.gated, accuracyTarget: item.accuracyTarget!, timingTarget: item.timingTarget! };
}
export function parseTrainerPortableCueSequences(value: unknown): TrainerPortableCueSequence[] | null {
  if (!Array.isArray(value) || value.length > 30) return null;
  const seen = new Set<string>();
  const result = value.flatMap((entry): TrainerPortableCueSequence[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const sequence = normalizeTrainerCueSequence(item);
    if (typeof item.id !== "string" || !item.id || item.id.length > 100 || seen.has(item.id) || !sequence) return [];
    seen.add(item.id);
    return [{ id: item.id, ...sequence }];
  });
  return result.length === value.length ? result : null;
}
export function parseTrainerPortableCoachFeedback(value: unknown): TrainerPortableCoachFeedback[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const seen = new Set<string>();
  const result = value.flatMap((entry): TrainerPortableCoachFeedback[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Partial<TrainerPortableCoachFeedback>;
    if (typeof item.id !== "string" || !item.id || item.id.length > 200 || seen.has(item.id) || typeof item.takeId !== "string" || !item.takeId || item.takeId.length > 200 ||
        typeof item.patternName !== "string" || !item.patternName || item.patternName.length > 200 || !Number.isInteger(item.bpm) || item.bpm! < 40 || item.bpm! > 220 ||
        typeof item.receivedAt !== "string" || !Number.isFinite(Date.parse(item.receivedAt)) || !Array.isArray(item.comments) || item.comments.length > 100) return [];
    const comments = item.comments.filter(comment => comment && typeof comment.id === "string" && !!comment.id && comment.id.length <= 100 && Number.isFinite(comment.timeMs) && comment.timeMs >= 0 && comment.timeMs <= 3_600_000 && typeof comment.note === "string" && !!comment.note.trim() && comment.note.length <= 600 && typeof comment.createdAt === "string" && Number.isFinite(Date.parse(comment.createdAt)) &&
      (comment.location === undefined || Boolean(comment.location && Number.isInteger(comment.location.bar) && comment.location.bar >= 1 && comment.location.bar <= 4096 && Number.isFinite(comment.location.beat) && comment.location.beat >= 1 && comment.location.beat <= 16 && (comment.location.step === undefined || Number.isInteger(comment.location.step) && comment.location.step >= 0 && comment.location.step <= 512) && (comment.location.voice === undefined || voices.includes(comment.location.voice)))));
    if (comments.length !== item.comments.length) return [];
    seen.add(item.id);
    return [{ id: item.id, takeId: item.takeId, patternName: item.patternName, bpm: item.bpm!, receivedAt: item.receivedAt, comments: comments.map(comment => ({ ...comment, ...(comment.location ? { location: { ...comment.location } } : {}) })) }];
  });
  return result.length === value.length ? result : null;
}
export function normalizeMidiPadVelocity(raw: number, range?: { soft: number; hard: number }) {
  const velocity = Math.max(1, Math.min(127, Math.round(raw)));
  if (!range || range.hard < range.soft + 4) return velocity;
  // Keep a calibrated soft stroke above the ghost-note threshold while preserving headroom.
  return Math.max(1, Math.min(127, Math.round(48 + (velocity - range.soft) * 64 / (range.hard - range.soft))));
}
export function parseTrainerState(raw: string | null): TrainerState {
  if (!raw) return { ...defaultTrainerState, midiMap: { ...DEFAULT_MIDI_MAP } };
  try {
    const value = JSON.parse(raw) as PersistedTrainerState;
    if ((value.version !== 1 && value.version !== 2) || !Array.isArray(value.rounds)) throw new Error("Invalid trainer state");
    const midiMap: Record<number, Instrument | null> = { ...DEFAULT_MIDI_MAP };
    if (value.midiMap && typeof value.midiMap === "object") for (const [note, voice] of Object.entries(value.midiMap)) {
      if (/^\d+$/.test(note) && Number(note) <= 127 && (voice === null || voices.includes(voice))) midiMap[Number(note)] = voice;
    }
    const deviceProfiles: Record<string, TrainerDeviceProfile> = {};
    if (value.version === 2 && value.deviceProfiles && typeof value.deviceProfiles === "object") {
      for (const [key, profile] of Object.entries(value.deviceProfiles).slice(0, 32)) {
        if (!key || key.length > 200 || !profile || typeof profile !== "object") continue;
        const mapped: Record<number, Instrument | null> = { ...DEFAULT_MIDI_MAP };
        for (const [note, voice] of Object.entries(profile.midiMap ?? {})) if (/^\d+$/.test(note) && Number(note) <= 127 && (voice === null || voices.includes(voice))) mapped[Number(note)] = voice;
        const articulations: Record<number, MidiArticulation | null> = { ...DEFAULT_MIDI_ARTICULATIONS };
        const validArticulations: MidiArticulation[] = ["closed-hat", "open-hat", "pedal-hat", "foot-splash", "ride", "crash", "rimshot", "side-stick"];
        for (const [note, articulation] of Object.entries(profile.midiArticulations ?? {})) if (/^\d+$/.test(note) && Number(note) <= 127 && (articulation === null || validArticulations.includes(articulation))) articulations[Number(note)] = articulation;
        const midiVelocityRanges: NonNullable<TrainerDeviceProfile["midiVelocityRanges"]> = {};
        for (const [note, range] of Object.entries(profile.midiVelocityRanges ?? {})) if (/^\d+$/.test(note) && Number(note) <= 127 && range && Number.isInteger(range.soft) && range.soft >= 1 && range.soft <= 127 && Number.isInteger(range.hard) && range.hard <= 127 && range.hard >= range.soft + 4) midiVelocityRanges[Number(note)] = { soft: range.soft, hard: range.hard };
        const audioTemplates: Partial<Record<Instrument, number[]>> = {};
        for (const voice of voices) { const template = profile.audioTemplates?.[voice]; if (Array.isArray(template) && template.length === 5 && template.every((v: unknown) => typeof v === "number" && Number.isFinite(v))) audioTemplates[voice] = template.map((v: number) => Math.max(0, Math.min(1, v))); }
        const audioDynamics: Partial<Record<Instrument, AudioDynamicsCalibration>> = {};
        for (const voice of voices) {
          const levels = profile.audioDynamics?.[voice];
          if (!levels || typeof levels !== "object") continue;
          const parsed = Object.fromEntries(["noiseRms", "ghostRms", "accentRms"].flatMap((key) => {
            const value = levels[key as keyof AudioDynamicsCalibration];
            return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 2 ? [[key, value]] : [];
          })) as AudioDynamicsCalibration;
          if (Object.keys(parsed).length) audioDynamics[voice] = parsed;
        }
        const latencySpreadMs = typeof profile.latencySpreadMs === "number" && Number.isFinite(profile.latencySpreadMs) && profile.latencySpreadMs >= 0 && profile.latencySpreadMs <= 240 ? profile.latencySpreadMs : null;
        deviceProfiles[key] = { latencyMs: Number.isFinite(profile.latencyMs) ? Math.max(-200, Math.min(200, Number(profile.latencyMs))) : 0, latencyCalibrated: profile.latencyCalibrated === true, latencySpreadMs, latencyCalibratedAt: typeof profile.latencyCalibratedAt === "string" && Number.isFinite(Date.parse(profile.latencyCalibratedAt)) ? profile.latencyCalibratedAt : null, midiMap: mapped, midiArticulations: articulations, midiVelocityRanges, audioTemplates, audioDynamics };
      }
    }
    return { version: 2, rounds: retainTrainerRoundHistory(value.rounds.filter((round): round is TrainerRound => {
      if (!round || typeof round.id !== "string" || typeof round.patternId !== "string" ||
          typeof round.patternName !== "string" || typeof round.playedAt !== "string" || Number.isNaN(Date.parse(round.playedAt)) ||
          !Number.isFinite(round.bpm) || round.bpm < 40 || round.bpm > 200 ||
          (round.mode !== "self" && round.mode !== "scored") || !Array.isArray(round.ratings) || round.ratings.length > 16 ||
          (round.summaryOnly !== undefined && round.summaryOnly !== true) ||
          (round.compactAnalysis !== undefined && !validateCompactAnalysis(round.compactAnalysis)) ||
          (round.durationSeconds !== undefined && ![30, 60, 120].includes(round.durationSeconds)) ||
          (round.repetitions !== undefined && (round.durationSeconds ? !Number.isInteger(round.repetitions) || round.repetitions < 1 || round.repetitions > 2000 : round.summaryOnly ? !Number.isInteger(round.repetitions) || round.repetitions < 1 || round.repetitions > 2000 : ![4, 8, 10, 16].includes(round.repetitions))) ||
          (round.focusedDrill !== undefined && (!round.focusedDrill || !voices.includes(round.focusedDrill.instrument) || !Number.isInteger(round.focusedDrill.beat) || round.focusedDrill.beat < 1 || round.focusedDrill.beat > 64 || (round.focusedDrill.sourceRoundId !== undefined && (typeof round.focusedDrill.sourceRoundId !== "string" || round.focusedDrill.sourceRoundId.length > 100)) || (round.focusedDrill.sourcePatternId !== undefined && (typeof round.focusedDrill.sourcePatternId !== "string" || round.focusedDrill.sourcePatternId.length > 200)))) ||
          (round.uncertainDetections !== undefined && (!Number.isInteger(round.uncertainDetections) || round.uncertainDetections < 0 || round.uncertainDetections > 100000)) ||
          (round.inputClipped !== undefined && typeof round.inputClipped !== "boolean") ||
          (round.inputProfile !== undefined && (typeof round.inputProfile !== "string" || round.inputProfile.length > 200)) ||
          (round.timingCorrectionMs !== undefined && (!Number.isFinite(round.timingCorrectionMs) || Math.abs(round.timingCorrectionMs) > 250)) ||
          (round.timingCalibrated !== undefined && typeof round.timingCalibrated !== "boolean") ||
          (round.targetVoice !== undefined && !voices.includes(round.targetVoice)) ||
          (round.swingRatio !== undefined && (!Number.isFinite(round.swingRatio) || round.swingRatio < 0.5 || round.swingRatio > 0.75)) ||
          (round.pocketMs !== undefined && (!Number.isFinite(round.pocketMs) || round.pocketMs < 0 || round.pocketMs > 80)) ||
          (round.learningMode !== undefined && !['listen-copy-solo', 'build-limbs'].includes(round.learningMode)) ||
          (round.feel !== undefined && !["straight", "shuffle", "laid-back", "shuffle-laid-back"].includes(round.feel)) ||
          (round.limbFocus !== undefined && !["all", "hands", "feet"].includes(round.limbFocus)) ||
          (round.adaptation !== undefined && !["standard", "seated", "single-voice"].includes(round.adaptation)) ||
          (round.variationId !== undefined && (typeof round.variationId !== "string" || round.variationId.length > 80)) ||
          (round.backingChallenge !== undefined && !["rock", "funk", "shuffle"].includes(round.backingChallenge)) ||
          (round.notes !== undefined && (typeof round.notes !== "string" || round.notes.length > 500)) ||
          (round.tags !== undefined && (!Array.isArray(round.tags) || round.tags.length > 5 || !round.tags.every((tag) => ["warm-up", "focused", "teacher", "recording-review", "rough-session"].includes(tag)))) ||
          (round.voicePractice !== undefined && !["all", "single", "layers"].includes(round.voicePractice)) ||
          (round.voiceFocus !== undefined && !voices.includes(round.voiceFocus)) ||
          (round.voiceLayerCount !== undefined && (!Number.isInteger(round.voiceLayerCount) || round.voiceLayerCount < 1 || round.voiceLayerCount > 5)) ||
          (round.transferFromPatternId !== undefined && (typeof round.transferFromPatternId !== "string" || round.transferFromPatternId.length > 200 || round.transferFromPatternId === round.patternId)) ||
          (round.rudimentHandCheck !== undefined && typeof round.rudimentHandCheck !== "boolean") ||
          !round.ratings.every((rating: TrainerRating) => ["clean", "needsWork", "missed"].includes(rating)) ||
          (round.result !== null && (!round.result || !Number.isFinite(round.result.score) || !Number.isFinite(round.result.accuracy)))) return false;
      if (round.hits === undefined) return true;
      return Array.isArray(round.hits) && round.hits.length <= 32768 && round.hits.every((hit) =>
        Boolean(hit && voices.includes(hit.instrument) && ["great", "good", "miss", "extra"].includes(hit.rating) &&
          (hit.offsetMs === null || Number.isFinite(hit.offsetMs)) && (hit.velocity === undefined || (Number.isFinite(hit.velocity) && hit.velocity >= 0 && hit.velocity <= 127)) &&
          (hit.velocityTarget === undefined || (Number.isFinite(hit.velocityTarget) && hit.velocityTarget >= 0 && hit.velocityTarget <= 127)) &&
          (hit.accentTarget === undefined || typeof hit.accentTarget === "boolean") &&
          (hit.articulation === undefined || ["flam", "drag", "buzz"].includes(hit.articulation)) &&
          (hit.grace === undefined || hit.grace === true) &&
          (hit.tuplet === undefined || Boolean(hit.tuplet && Number.isInteger(hit.tuplet.actualNotes) && hit.tuplet.actualNotes >= 2 && hit.tuplet.actualNotes <= 32 && Number.isInteger(hit.tuplet.normalNotes) && hit.tuplet.normalNotes >= 1 && hit.tuplet.normalNotes <= 32 && hit.tuplet.actualNotes !== hit.tuplet.normalNotes)) &&
          (hit.articulationSpacingMs === undefined || (Number.isFinite(hit.articulationSpacingMs) && hit.articulationSpacingMs >= 5 && hit.articulationSpacingMs <= 100)) &&
          (hit.transition === undefined || hit.transition === "landing") &&
          (hit.feelZone === undefined || ["straight", "offbeat", "backbeat", "fill"].includes(hit.feelZone)) &&
          (hit.midiArticulation === undefined || ["closed-hat", "open-hat", "pedal-hat", "foot-splash", "ride", "crash", "rimshot", "side-stick"].includes(hit.midiArticulation)) &&
          (hit.midiArticulationTarget === undefined || ["closed-hat", "open-hat", "pedal-hat", "foot-splash", "ride", "crash", "rimshot", "side-stick"].includes(hit.midiArticulationTarget)) &&
          (hit.sustainMs === undefined || (Number.isFinite(hit.sustainMs) && hit.sustainMs >= 0 && hit.sustainMs <= 180)) &&
          (hit.handTarget === undefined || hit.handTarget === "R" || hit.handTarget === "L") &&
          (hit.handPlayed === undefined || hit.handPlayed === "R" || hit.handPlayed === "L") &&
          (hit.atMs === undefined || (Number.isFinite(hit.atMs) && hit.atMs >= -1000 && hit.atMs <= 3600000)) &&
          (hit.step === undefined || (Number.isInteger(hit.step) && hit.step >= 0 && hit.step <= 4096)) &&
          (hit.repetition === undefined || (Number.isInteger(hit.repetition) && hit.repetition >= 0 && hit.repetition < 16))));
    })),
      latencyMs: Number.isFinite(value.latencyMs) ? Math.max(-200, Math.min(200, Number(value.latencyMs))) : 0, midiMap, deviceProfiles,
      ...(parseTrainerPortableRoutine(value.routine) ? { routine: parseTrainerPortableRoutine(value.routine)! } : {}),
      ...(parseTrainerPortableCueSequences(value.cueSequences) ? { cueSequences: parseTrainerPortableCueSequences(value.cueSequences)! } : {}),
      ...(parseTrainerPortableCoachFeedback(value.coachFeedback) ? { coachFeedback: parseTrainerPortableCoachFeedback(value.coachFeedback)! } : {}) };
  } catch { return { ...defaultTrainerState, midiMap: { ...DEFAULT_MIDI_MAP }, deviceProfiles: {} }; }
}
export function roundDurationMs(pattern: PracticePattern, bpm: number) { return pattern.beats * (pattern.subdivision / 4) * stepDurationMs(bpm, pattern.subdivision); }
export function articulationGraceSpacingMs(articulation: PatternHit["articulation"], bpm: number) {
  const quarterMs = 60000 / Math.max(40, bpm);
  if (articulation === "flam") return Math.round(Math.max(18, Math.min(55, quarterMs * 0.14)));
  if (articulation === "drag") return Math.round(Math.max(14, Math.min(42, quarterMs * 0.1)));
  return 0;
}
export function expectedRoundHits(pattern: PracticePattern, bpm: number, startAt: number, repetitions = 10, feel: TrainerFeel = "straight", options: { swingRatio?: number; pocketMs?: number } = {}) {
  const stepMs = stepDurationMs(bpm, pattern.subdivision), duration = roundDurationMs(pattern, bpm);
  const stepsPerBeat = pattern.subdivision / 4;
  const events = pattern.hits.flatMap((hit) => {
    const beatPosition = hit.step % stepsPerBeat;
    const swingOffset = (feel === "shuffle" || feel === "shuffle-laid-back")
      ? pattern.subdivision === 8 && beatPosition === 1 ? stepMs * 2 * ((options.swingRatio ?? 2 / 3) - 0.5)
        : pattern.subdivision === 16 && beatPosition === 2 ? stepMs * 4 * ((options.swingRatio ?? 2 / 3) - 0.5) : 0
      : 0;
    const pocketOffset = (feel === "laid-back" || feel === "shuffle-laid-back") && hit.instrument === "snare"
      ? Math.max(0, Math.min(80, options.pocketMs ?? 35)) : 0;
    const baseAt = hit.step * stepMs + swingOffset + pocketOffset;
    const graceSpacing = articulationGraceSpacingMs(hit.articulation ?? (hit.grace ? "flam" : undefined), bpm);
    const offsets = hit.grace ? [-graceSpacing]
      : hit.articulation === "flam" ? [-graceSpacing, 0]
      : hit.articulation === "drag" ? [-2 * graceSpacing, -graceSpacing, 0]
        : [0];
    return offsets.map((offset) => ({ atOffset: baseAt + offset, hit, graceSpacing }));
  });
  return Array.from({ length: repetitions }, (_, repetition) => events.map(({ atOffset, hit }) =>
    ({ at: startAt + repetition * duration + atOffset, instrument: hit.instrument, accent: Boolean(hit.accent), sticking: hit.sticking, velocityTarget: hit.velocityTarget, articulation: hit.articulation, midiArticulationTarget: hit.midiArticulationTarget, articulationSpacingMs: hit.articulation || hit.grace ? articulationGraceSpacingMs(hit.articulation ?? "flam", bpm) : undefined, matched: false, step: hit.step, repetition }))).flat();
}
export function scoreTrainerHit(now: number, expected: Array<{ at: number; instrument: Instrument; accent?: boolean; sticking?: PatternHit["sticking"]; velocityTarget?: number; articulation?: PatternHit["articulation"]; midiArticulationTarget?: PatternHit["midiArticulationTarget"]; articulationSpacingMs?: number; transition?: RatedHit["transition"]; feelZone?: RatedHit["feelZone"]; matched: boolean; step?: number; repetition?: number }>, instrument: Instrument, latencyMs = 0, midiArticulation?: MidiArticulation, enforceMidiArticulation = false): RatedHit {
  const closest = findClosestExpected(now - latencyMs, expected, instrument, hit => {
    const target = hit.midiArticulationTarget;
    return !enforceMidiArticulation || !target || target === midiArticulation;
  });
  if (closest.index < 0 || Math.abs(closest.offset) > 100) return { instrument, rating: "extra", offsetMs: null };
  expected[closest.index].matched = true;
  return { instrument, rating: classifyOffset(closest.offset), offsetMs: Math.round(closest.offset), accentTarget: Boolean(expected[closest.index].accent), handTarget: expected[closest.index].sticking, velocityTarget: expected[closest.index].velocityTarget, articulation: expected[closest.index].articulation, midiArticulationTarget: expected[closest.index].midiArticulationTarget, articulationSpacingMs: expected[closest.index].articulationSpacingMs, transition: expected[closest.index].transition, feelZone: expected[closest.index].feelZone, step: expected[closest.index].step, repetition: expected[closest.index].repetition };
}
export function summarizeTrainerRound(pattern: PracticePattern, bpm: number, mode: TrainerMode, source: TrainerRound["source"], ratings: TrainerRating[], hits: RatedHit[], repetitions = 10): TrainerRound {
  const playedAt = new Date().toISOString();
  return { id: `${pattern.id}-${playedAt}`, patternId: pattern.id, patternName: pattern.name, bpm, playedAt, mode, source, repetitions,
    ratings: ratings.slice(0, repetitions), result: mode === "scored" ? summarizeHits(hits, pattern.id, pattern.name, bpm, playedAt) : null,
    hits: mode === "scored" ? hits.slice() : undefined,
    ...(mode === "scored" ? { compactAnalysis: summarizeTrainerHits(pattern, hits) } : {}) };
}

export function midiNoteFromMessage(data: Uint8Array | number[]): number | null {
  const [status, note, velocity] = data;
  return status !== undefined && (status & 0xf0) === 0x90 && velocity > 0 && note >= 0 && note <= 127 ? note : null;
}
export function midiVelocityFromMessage(data: Uint8Array | number[]): number | null { return midiNoteFromMessage(data) === null ? null : data[2] ?? null; }
