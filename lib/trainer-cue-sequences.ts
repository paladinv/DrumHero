import type { Instrument } from "./types";

export type TrainerCueAction = "crash" | "loud" | "soft" | "dropout" | "accent-shift";
export type TrainerCueInstruction = { beat: number; action: TrainerCueAction; voice?: Instrument };
export type TrainerCueSequence = { name: string; cues: TrainerCueInstruction[] };
export type SavedTrainerCueSequence = TrainerCueSequence & { id: string };

const actions: TrainerCueAction[] = ["crash", "loud", "soft", "dropout", "accent-shift"];
const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];

export function normalizeTrainerCueSequence(value: unknown, beatsPerBar = 16): TrainerCueSequence | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TrainerCueSequence>;
  if (typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 60 || !Array.isArray(candidate.cues) || candidate.cues.length < 1 || candidate.cues.length > 16) return null;
  const cues = candidate.cues.flatMap((cue): TrainerCueInstruction[] => {
    if (!cue || typeof cue !== "object") return [];
    const item = cue as Partial<TrainerCueInstruction>;
    if (!Number.isInteger(item.beat) || item.beat! < 1 || item.beat! > Math.max(1, Math.min(16, beatsPerBar)) || !actions.includes(item.action as TrainerCueAction)) return [];
    const voice = item.action === "dropout" ? item.voice : undefined;
    if (item.action === "dropout" && !voices.includes(voice as Instrument)) return [];
    return [{ beat: item.beat!, action: item.action as TrainerCueAction, ...(voice ? { voice } : {}) }];
  });
  if (cues.length !== candidate.cues.length) return null;
  return { name: candidate.name.trim(), cues };
}

export function parseSavedTrainerCueSequences(raw: string | null): SavedTrainerCueSequence[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.slice(0, 30).flatMap((entry): SavedTrainerCueSequence[] => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.id !== "string" || !candidate.id || candidate.id.length > 100 || seen.has(candidate.id)) return [];
      const sequence = normalizeTrainerCueSequence(candidate);
      if (!sequence) return [];
      seen.add(candidate.id);
      return [{ id: candidate.id, ...sequence }];
    });
  } catch {
    return [];
  }
}
