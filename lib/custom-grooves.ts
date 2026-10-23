import type { Groove, Instrument, SongPartHit } from "./types";

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
      const trainerFillStepRanges = candidate.trainerFillStepRanges;
      const validFillRanges = trainerFillStepRanges === undefined || (Array.isArray(trainerFillStepRanges) && trainerFillStepRanges.length <= 16 && trainerFillStepRanges.every((range) => Array.isArray(range) && range.length === 2 && Number.isInteger(range[0]) && Number.isInteger(range[1]) && range[0] >= 0 && range[1] > range[0] && range[1] <= cells));
      if (typeof candidate.id !== "string" || !candidate.id.startsWith("custom-") || seen.has(candidate.id) ||
          typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 60 ||
          typeof candidate.description !== "string" || typeof candidate.style !== "string" ||
          typeof candidate.focus !== "string" || ![4, 8, 12, 16].includes(candidate.subdivision ?? 0) ||
          !Number.isFinite(candidate.beats) || candidate.beats! <= 0 || !Number.isInteger(cells) || cells > 512 ||
          !["Beginner", "Intermediate", "Advanced"].includes(candidate.level ?? "") ||
          !Number.isFinite(candidate.defaultBpm) || candidate.defaultBpm! < 40 || candidate.defaultBpm! > 200 ||
          !Array.isArray(candidate.hits) || candidate.hits.length > 256 || !validFillRanges) return [];
      const hits = candidate.hits.filter((hit) => Boolean(hit && Number.isInteger(hit.step) && hit.step >= 0 && hit.step < cells && voices.includes(hit.instrument) && (hit.articulation === undefined || ["flam", "drag", "buzz"].includes(hit.articulation)) && (hit.velocityTarget === undefined || Number.isFinite(hit.velocityTarget) && hit.velocityTarget >= 1 && hit.velocityTarget <= 127)))
        .map((hit) => ({ step: hit.step, instrument: hit.instrument, accent: Boolean(hit.accent), ...(hit.articulation ? { articulation: hit.articulation } : {}), ...(typeof hit.velocityTarget === "number" ? { velocityTarget: Math.round(hit.velocityTarget) } : {}) }));
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
        tags: Array.isArray(candidate.tags) ? candidate.tags.filter((tag): tag is string => typeof tag === "string").slice(0,12).map(tag=>tag.slice(0,40)) : [],
        ...(Array.isArray(trainerFillStepRanges) ? { trainerFillStepRanges: trainerFillStepRanges.map(range => [range[0], range[1]] as [number, number]) } : {}),
        songPattern: candidate.songPattern && Array.isArray(candidate.songPattern.hits) && candidate.songPattern.hits.length <= 256 && candidate.songPattern.hits.every(hit => hit && Number.isInteger(hit.step) && hit.step >= 0 && hit.step < cells && ["kick","snare","hihat","openhat","ride","rimshot","tom","crash","cowbell","shaker","tambourine"].includes(hit.instrument)) ? { hits: candidate.songPattern.hits.map((hit): SongPartHit => ({ step:hit.step,instrument:hit.instrument,accent:hit.accent===true, velocity: typeof hit.velocity === "number" && Number.isFinite(hit.velocity) ? Math.max(1,Math.min(127,Math.round(hit.velocity))) : undefined,ghost:hit.ghost===true,sticking:hit.sticking==="R"||hit.sticking==="L"?hit.sticking:undefined,articulation:["normal","flam","drag","buzz","roll","choke","foot-splash"].includes(hit.articulation??"")?hit.articulation:undefined,timingOffsetMs:typeof hit.timingOffsetMs==="number"&&Number.isFinite(hit.timingOffsetMs)?Math.max(-1000,Math.min(1000,hit.timingOffsetMs)):undefined })) } : undefined,
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
    const saved = JSON.stringify(grooves.slice(0, 100));
    window.localStorage.setItem(CUSTOM_GROOVES_KEY, saved);
    try {
      const library = JSON.parse(window.localStorage.getItem("drum-hero:song-library:v1") || "null") as { version?: number; [key: string]: unknown } | null;
      if (library?.version === 1) {
        window.localStorage.setItem("drum-hero:song-library:v1", JSON.stringify({ ...library, customGrooves: JSON.parse(saved) }));
        window.dispatchEvent(new Event("drum-hero:song-library-change"));
      }
    } catch { /* The custom pattern library remains available locally if the full library is out of space. */ }
    window.dispatchEvent(new CustomEvent(CUSTOM_GROOVES_EVENT));
    return true;
  } catch {
    return false;
  }
}
