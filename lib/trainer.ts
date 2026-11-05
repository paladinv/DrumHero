import { classifyOffset, findClosestExpected, stepDurationMs, summarizeHits } from "./scoring";
import type { Instrument, MidiArticulation, PatternHit, PracticePattern, RatedHit, SessionResult } from "./types";
import { learnerProfileIdFromBrowser, learnerStorageKey } from "./learner-profiles";

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
};
export type AudioDynamicsCalibration = { noiseRms?: number; ghostRms?: number; accentRms?: number };
export type TrainerDeviceProfile = { latencyMs: number; latencyCalibrated?: boolean; latencySpreadMs?: number | null; latencyCalibratedAt?: string | null; midiMap: Record<number, Instrument | null>; midiArticulations: Record<number, MidiArticulation | null>; audioTemplates: Partial<Record<Instrument, number[]>>; audioDynamics?: Partial<Record<Instrument, AudioDynamicsCalibration>> };
export type TrainerState = { version: 2; rounds: TrainerRound[]; latencyMs: number; midiMap: Record<number, Instrument | null>; deviceProfiles: Record<string, TrainerDeviceProfile> };
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
  35: "kick", 36: "kick", 38: "snare", 40: "snare", 42: "hihat", 44: "hihat", 46: "hihat",
  41: "tom", 43: "tom", 45: "tom", 47: "tom", 48: "tom", 49: "crash", 55: "crash", 57: "crash"
};
export const defaultTrainerState: TrainerState = { version: 2, rounds: [], latencyMs: 0, midiMap: DEFAULT_MIDI_MAP, deviceProfiles: {} };
const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
export function defaultTrainerDeviceProfile(state: TrainerState): TrainerDeviceProfile { return { latencyMs: state.latencyMs, latencyCalibrated: false, midiMap: { ...state.midiMap }, midiArticulations: {}, audioTemplates: {} }; }
export function getTrainerDeviceProfile(state: TrainerState, key: string): TrainerDeviceProfile { return state.deviceProfiles[key] ?? defaultTrainerDeviceProfile(state); }
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
        const articulations: Record<number, MidiArticulation | null> = {};
        const validArticulations: MidiArticulation[] = ["closed-hat", "open-hat", "pedal-hat", "foot-splash", "ride", "crash", "rimshot"];
        for (const [note, articulation] of Object.entries(profile.midiArticulations ?? {})) if (/^\d+$/.test(note) && Number(note) <= 127 && (articulation === null || validArticulations.includes(articulation))) articulations[Number(note)] = articulation;
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
        deviceProfiles[key] = { latencyMs: Number.isFinite(profile.latencyMs) ? Math.max(-200, Math.min(200, Number(profile.latencyMs))) : 0, latencyCalibrated: profile.latencyCalibrated === true, latencySpreadMs, latencyCalibratedAt: typeof profile.latencyCalibratedAt === "string" && Number.isFinite(Date.parse(profile.latencyCalibratedAt)) ? profile.latencyCalibratedAt : null, midiMap: mapped, midiArticulations: articulations, audioTemplates, audioDynamics };
      }
    }
    return { version: 2, rounds: value.rounds.filter((round): round is TrainerRound => {
      if (!round || typeof round.id !== "string" || typeof round.patternId !== "string" ||
          typeof round.patternName !== "string" || typeof round.playedAt !== "string" || Number.isNaN(Date.parse(round.playedAt)) ||
          !Number.isFinite(round.bpm) || round.bpm < 40 || round.bpm > 200 ||
          (round.mode !== "self" && round.mode !== "scored") || !Array.isArray(round.ratings) || round.ratings.length > 16 ||
          (round.durationSeconds !== undefined && ![30, 60, 120].includes(round.durationSeconds)) ||
          (round.repetitions !== undefined && (round.durationSeconds ? !Number.isInteger(round.repetitions) || round.repetitions < 1 || round.repetitions > 2000 : ![4, 8, 10, 16].includes(round.repetitions))) ||
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
          (hit.articulationSpacingMs === undefined || (Number.isFinite(hit.articulationSpacingMs) && hit.articulationSpacingMs >= 5 && hit.articulationSpacingMs <= 100)) &&
          (hit.transition === undefined || hit.transition === "landing") &&
          (hit.feelZone === undefined || ["straight", "offbeat", "backbeat", "fill"].includes(hit.feelZone)) &&
          (hit.midiArticulation === undefined || ["closed-hat", "open-hat", "pedal-hat", "foot-splash", "ride", "crash", "rimshot"].includes(hit.midiArticulation)) &&
          (hit.sustainMs === undefined || (Number.isFinite(hit.sustainMs) && hit.sustainMs >= 0 && hit.sustainMs <= 180)) &&
          (hit.handTarget === undefined || hit.handTarget === "R" || hit.handTarget === "L") &&
          (hit.handPlayed === undefined || hit.handPlayed === "R" || hit.handPlayed === "L") &&
          (hit.atMs === undefined || (Number.isFinite(hit.atMs) && hit.atMs >= -1000 && hit.atMs <= 3600000)) &&
          (hit.step === undefined || (Number.isInteger(hit.step) && hit.step >= 0 && hit.step <= 4096)) &&
          (hit.repetition === undefined || (Number.isInteger(hit.repetition) && hit.repetition >= 0 && hit.repetition < 16))));
    }).slice(0, 50),
      latencyMs: Number.isFinite(value.latencyMs) ? Math.max(-200, Math.min(200, Number(value.latencyMs))) : 0, midiMap, deviceProfiles };
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
    const graceSpacing = articulationGraceSpacingMs(hit.articulation, bpm);
    const offsets = hit.articulation === "flam" ? [-graceSpacing, 0]
      : hit.articulation === "drag" ? [-2 * graceSpacing, -graceSpacing, 0]
        : [0];
    return offsets.map((offset) => ({ atOffset: baseAt + offset, hit, graceSpacing }));
  });
  return Array.from({ length: repetitions }, (_, repetition) => events.map(({ atOffset, hit }) =>
    ({ at: startAt + repetition * duration + atOffset, instrument: hit.instrument, accent: Boolean(hit.accent), sticking: hit.sticking, velocityTarget: hit.velocityTarget, articulation: hit.articulation, articulationSpacingMs: hit.articulation ? articulationGraceSpacingMs(hit.articulation, bpm) : undefined, matched: false, step: hit.step, repetition }))).flat();
}
export function scoreTrainerHit(now: number, expected: Array<{ at: number; instrument: Instrument; accent?: boolean; sticking?: PatternHit["sticking"]; velocityTarget?: number; articulation?: PatternHit["articulation"]; articulationSpacingMs?: number; transition?: RatedHit["transition"]; feelZone?: RatedHit["feelZone"]; matched: boolean; step?: number; repetition?: number }>, instrument: Instrument, latencyMs = 0): RatedHit {
  const closest = findClosestExpected(now - latencyMs, expected, instrument);
  if (closest.index < 0 || Math.abs(closest.offset) > 100) return { instrument, rating: "extra", offsetMs: null };
  expected[closest.index].matched = true;
  return { instrument, rating: classifyOffset(closest.offset), offsetMs: Math.round(closest.offset), accentTarget: Boolean(expected[closest.index].accent), handTarget: expected[closest.index].sticking, velocityTarget: expected[closest.index].velocityTarget, articulation: expected[closest.index].articulation, articulationSpacingMs: expected[closest.index].articulationSpacingMs, transition: expected[closest.index].transition, feelZone: expected[closest.index].feelZone, step: expected[closest.index].step, repetition: expected[closest.index].repetition };
}
export function summarizeTrainerRound(pattern: PracticePattern, bpm: number, mode: TrainerMode, source: TrainerRound["source"], ratings: TrainerRating[], hits: RatedHit[], repetitions = 10): TrainerRound {
  const playedAt = new Date().toISOString();
  return { id: `${pattern.id}-${playedAt}`, patternId: pattern.id, patternName: pattern.name, bpm, playedAt, mode, source, repetitions,
    ratings: ratings.slice(0, repetitions), result: mode === "scored" ? summarizeHits(hits, pattern.id, pattern.name, bpm, playedAt) : null,
    hits: mode === "scored" ? hits.slice() : undefined };
}

export function midiNoteFromMessage(data: Uint8Array | number[]): number | null {
  const [status, note, velocity] = data;
  return status !== undefined && (status & 0xf0) === 0x90 && velocity > 0 && note >= 0 && note <= 127 ? note : null;
}
export function midiVelocityFromMessage(data: Uint8Array | number[]): number | null { return midiNoteFromMessage(data) === null ? null : data[2] ?? null; }
