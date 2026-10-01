import type { Groove, Instrument } from "./types";

export const CUSTOM_GROOVES_KEY = "drum-hero:custom-grooves:v1";
export const CUSTOM_GROOVES_EVENT = "drum-hero:custom-grooves-change";
const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];

export function createCustomGrooveId() {
  const token = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `custom-${token}`;
}

export function parseCustomGrooves(raw: string | null): Groove[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.flatMap((item): Groove[] => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Partial<Groove>;
      const cells = candidate.beats && candidate.subdivision ? candidate.beats * candidate.subdivision / 4 : 0;
      if (typeof candidate.id !== "string" || !candidate.id.startsWith("custom-") || seen.has(candidate.id) ||
          typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 60 ||
          typeof candidate.description !== "string" || typeof candidate.style !== "string" ||
          typeof candidate.focus !== "string" || ![4, 8, 12, 16].includes(candidate.subdivision ?? 0) ||
          !Number.isFinite(candidate.beats) || candidate.beats! <= 0 || !Number.isInteger(cells) || cells > 80 ||
          !["Beginner", "Intermediate", "Advanced"].includes(candidate.level ?? "") ||
          !Number.isFinite(candidate.defaultBpm) || candidate.defaultBpm! < 40 || candidate.defaultBpm! > 200 ||
          !Array.isArray(candidate.hits) || candidate.hits.length > 128) return [];
      const hits = candidate.hits.filter((hit) => Boolean(hit && Number.isInteger(hit.step) && hit.step >= 0 && hit.step < cells && voices.includes(hit.instrument)))
        .map((hit) => ({ step: hit.step, instrument: hit.instrument, accent: Boolean(hit.accent) }));
      if (hits.length !== candidate.hits.length) return [];
      seen.add(candidate.id);
      const low = Math.max(40, Math.min(200, candidate.tempoRange?.[0] ?? candidate.defaultBpm! - 25));
      const high = Math.max(low, Math.min(200, candidate.tempoRange?.[1] ?? candidate.defaultBpm! + 35));
      return [{
        id: candidate.id,
        name: candidate.name.trim(),
        level: candidate.level!,
        description: candidate.description.slice(0, 240),
        subdivision: candidate.subdivision!,
        beats: candidate.beats!,
        defaultBpm: candidate.defaultBpm!,
        tempoRange: [low, high],
        style: candidate.style.slice(0, 40),
        focus: candidate.focus.slice(0, 120),
        meter: candidate.meter?.slice(0, 20) ?? "4/4",
        feel: candidate.feel === "triplet" ? "triplet" : "straight",
        hits
      }];
    }).slice(0, 100);
  } catch {
    return [];
  }
}

export function readCustomGrooves(): Groove[] {
  if (typeof window === "undefined") return [];
  try { return parseCustomGrooves(window.localStorage.getItem(CUSTOM_GROOVES_KEY)); }
  catch { return []; }
}

export function writeCustomGrooves(grooves: Groove[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(CUSTOM_GROOVES_KEY, JSON.stringify(grooves.slice(0, 100)));
    window.dispatchEvent(new CustomEvent(CUSTOM_GROOVES_EVENT));
    return true;
  } catch {
    return false;
  }
}
