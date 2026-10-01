import { classifyOffset, findClosestExpected, stepDurationMs, summarizeHits } from "./scoring";
import type { Instrument, PracticePattern, RatedHit, SessionResult } from "./types";

export type TrainerMode = "self" | "scored";
export type TrainerRating = "clean" | "needsWork" | "missed";
export type TrainerSource = "keyboard" | "touch" | "midi" | "audio-timing" | "audio-voices";
export type TrainerRound = {
  id: string; patternId: string; patternName: string; bpm: number; playedAt: string;
  mode: TrainerMode; source: TrainerSource | "self"; ratings: TrainerRating[]; repetitions?: number;
  result: SessionResult | null; hits?: RatedHit[]; focusedDrill?: { instrument: Instrument; beat: number };
};
export type AudioDynamicsCalibration = { noiseRms?: number; ghostRms?: number; accentRms?: number };
export type TrainerDeviceProfile = { latencyMs: number; midiMap: Record<number, Instrument | null>; audioTemplates: Partial<Record<Instrument, number[]>>; audioDynamics?: Partial<Record<Instrument, AudioDynamicsCalibration>> };
export type TrainerState = { version: 2; rounds: TrainerRound[]; latencyMs: number; midiMap: Record<number, Instrument | null>; deviceProfiles: Record<string, TrainerDeviceProfile> };
type PersistedTrainerState = Omit<Partial<TrainerState>, "version"> & { version?: number };
export const TRAINER_KEY = "drum-hero:trainer:v1";
export const DEFAULT_MIDI_MAP: Record<number, Instrument> = {
  35: "kick", 36: "kick", 38: "snare", 40: "snare", 42: "hihat", 44: "hihat", 46: "hihat",
  41: "tom", 43: "tom", 45: "tom", 47: "tom", 48: "tom", 49: "crash", 55: "crash", 57: "crash"
};
export const defaultTrainerState: TrainerState = { version: 2, rounds: [], latencyMs: 0, midiMap: DEFAULT_MIDI_MAP, deviceProfiles: {} };
const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
export function defaultTrainerDeviceProfile(state: TrainerState): TrainerDeviceProfile { return { latencyMs: state.latencyMs, midiMap: { ...state.midiMap }, audioTemplates: {} }; }
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
        deviceProfiles[key] = { latencyMs: Number.isFinite(profile.latencyMs) ? Math.max(-200, Math.min(200, Number(profile.latencyMs))) : 0, midiMap: mapped, audioTemplates, audioDynamics };
      }
    }
    return { version: 2, rounds: value.rounds.filter((round): round is TrainerRound => {
      if (!round || typeof round.id !== "string" || typeof round.patternId !== "string" ||
          typeof round.patternName !== "string" || typeof round.playedAt !== "string" || Number.isNaN(Date.parse(round.playedAt)) ||
          !Number.isFinite(round.bpm) || round.bpm < 40 || round.bpm > 200 ||
          (round.mode !== "self" && round.mode !== "scored") || !Array.isArray(round.ratings) || round.ratings.length > 16 ||
          (round.repetitions !== undefined && ![4, 8, 10, 16].includes(round.repetitions)) ||
          (round.focusedDrill !== undefined && (!round.focusedDrill || !voices.includes(round.focusedDrill.instrument) || !Number.isInteger(round.focusedDrill.beat) || round.focusedDrill.beat < 1 || round.focusedDrill.beat > 64)) ||
          !round.ratings.every((rating: TrainerRating) => ["clean", "needsWork", "missed"].includes(rating)) ||
          (round.result !== null && (!round.result || !Number.isFinite(round.result.score) || !Number.isFinite(round.result.accuracy)))) return false;
      if (round.hits === undefined) return true;
      return Array.isArray(round.hits) && round.hits.length <= 2048 && round.hits.every((hit) =>
        Boolean(hit && voices.includes(hit.instrument) && ["great", "good", "miss", "extra"].includes(hit.rating) &&
          (hit.offsetMs === null || Number.isFinite(hit.offsetMs)) && (hit.velocity === undefined || (Number.isFinite(hit.velocity) && hit.velocity >= 0 && hit.velocity <= 127)) &&
          (hit.accentTarget === undefined || typeof hit.accentTarget === "boolean") &&
          (hit.step === undefined || (Number.isInteger(hit.step) && hit.step >= 0 && hit.step <= 320)) &&
          (hit.repetition === undefined || (Number.isInteger(hit.repetition) && hit.repetition >= 0 && hit.repetition < 16))));
    }).slice(0, 50),
      latencyMs: Number.isFinite(value.latencyMs) ? Math.max(-200, Math.min(200, Number(value.latencyMs))) : 0, midiMap, deviceProfiles };
  } catch { return { ...defaultTrainerState, midiMap: { ...DEFAULT_MIDI_MAP }, deviceProfiles: {} }; }
}
export function roundDurationMs(pattern: PracticePattern, bpm: number) { return pattern.beats * (pattern.subdivision / 4) * stepDurationMs(bpm, pattern.subdivision); }
export function expectedRoundHits(pattern: PracticePattern, bpm: number, startAt: number, repetitions = 10) {
  const stepMs = stepDurationMs(bpm, pattern.subdivision), duration = roundDurationMs(pattern, bpm);
  return Array.from({ length: repetitions }, (_, repetition) => pattern.hits.map((hit) =>
    ({ at: startAt + repetition * duration + hit.step * stepMs, instrument: hit.instrument, accent: Boolean(hit.accent), matched: false, step: hit.step, repetition }))).flat();
}
export function scoreTrainerHit(now: number, expected: Array<{ at: number; instrument: Instrument; accent?: boolean; matched: boolean; step?: number; repetition?: number }>, instrument: Instrument, latencyMs = 0): RatedHit {
  const closest = findClosestExpected(now - latencyMs, expected, instrument);
  if (closest.index < 0 || Math.abs(closest.offset) > 100) return { instrument, rating: "extra", offsetMs: null };
  expected[closest.index].matched = true;
  return { instrument, rating: classifyOffset(closest.offset), offsetMs: Math.round(closest.offset), accentTarget: Boolean(expected[closest.index].accent), step: expected[closest.index].step, repetition: expected[closest.index].repetition };
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
