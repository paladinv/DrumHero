import { cleanMeterLabel, grooveToPart, makeBlankPart, meterBeats } from "./song-builder";
import type { Groove } from "./types";
import type { DrumSong, SongSection } from "./song-library";
import { normalizeSong } from "./song-library";

export const SAVED_ARRANGEMENT_TEMPLATES_KEY = "drum-hero:song-builder-templates:v1";
export type SavedArrangementTemplate = { id: string; name: string; meter: string; bpm: number; sections: SongSection[]; createdAt: string };

export function normalizeSavedArrangementTemplates(input: unknown): SavedArrangementTemplate[] {
  if (!Array.isArray(input)) return [];
  return input.slice(-40).flatMap((raw): SavedArrangementTemplate[] => {
    if (!raw || typeof raw !== "object") return [];
    const value = raw as Partial<SavedArrangementTemplate>;
    if (typeof value.id !== "string" || typeof value.name !== "string" || !Array.isArray(value.sections)) return [];
    const normalized = normalizeSong({ title: "Template", artist: "Drum Hero", bpm: value.bpm, meter: value.meter, sections: value.sections });
    if (!normalized || !normalized.sections.length) return [];
    return [{ id: value.id.slice(0, 100), name: value.name.trim().slice(0, 40), meter: cleanMeterLabel(value.meter || normalized.meter), bpm: Math.max(40, Math.min(200, Math.round(Number(value.bpm) || 80))), sections: normalized.sections, createdAt: typeof value.createdAt === "string" && !Number.isNaN(Date.parse(value.createdAt)) ? value.createdAt : new Date(0).toISOString() }].filter(template => !!template.name);
  });
}

export function readSavedArrangementTemplates(): SavedArrangementTemplate[] {
  if (typeof window === "undefined") return [];
  try { return normalizeSavedArrangementTemplates(JSON.parse(window.localStorage.getItem(SAVED_ARRANGEMENT_TEMPLATES_KEY) || "[]")); } catch { return []; }
}

export function writeSavedArrangementTemplates(templates: SavedArrangementTemplate[]) {
  if (typeof window === "undefined") return false;
  try { window.localStorage.setItem(SAVED_ARRANGEMENT_TEMPLATES_KEY, JSON.stringify(normalizeSavedArrangementTemplates(templates))); return true; } catch { return false; }
}

export function instantiateSavedArrangementTemplate(template: SavedArrangementTemplate): SongSection[] {
  const sectionIds = new Map(template.sections.map(section => [section.id, crypto.randomUUID()]));
  return template.sections.map(section => {
    const partIds = new Map(section.parts.map(part => [part.id, crypto.randomUUID()]));
    return {
      ...structuredClone(section), id: sectionIds.get(section.id)!,
      parts: section.parts.map(part => ({ ...structuredClone(part), id: partIds.get(part.id)!, sourceId: undefined, linkedBaseId: part.linkedBaseId ? partIds.get(part.linkedBaseId) : undefined })),
      clips: section.clips?.map(clip => ({ ...structuredClone(clip), id: crypto.randomUUID(), partId: partIds.get(clip.partId)!, repeatVariants: clip.repeatVariants?.flatMap(variant => partIds.has(variant.partId) ? [{ ...variant, partId: partIds.get(variant.partId)! }] : []) })),
      rehearsalCues: section.rehearsalCues?.map(cue => ({ ...cue, id: crypto.randomUUID() }))
    };
  });
}

export type ArrangementTemplateId = "pop-form" | "verse-chorus" | "12-bar-blues" | "aaba-32" | "rock-anthem" | "funk-pocket" | "shuffle-blues";
export const ARRANGEMENT_TEMPLATES: Array<{ id: ArrangementTemplateId; label: string; description: string }> = [
  { id: "pop-form", label: "Pop song", description: "Intro · verse · chorus · verse · chorus · outro" },
  { id: "verse-chorus", label: "Short verse + chorus", description: "Two verses and two choruses" },
  { id: "rock-anthem", label: "Rock anthem", description: "Build · steady verses · open choruses · bridge · final lift" },
  { id: "funk-pocket", label: "Funk pocket", description: "Pocket-led form with a breakdown and return" },
  { id: "shuffle-blues", label: "Shuffle blues", description: "12-bar shuffle form with a turnaround" },
  { id: "12-bar-blues", label: "12-bar blues", description: "I · IV · I · V · IV · turnaround" },
  { id: "aaba-32", label: "AABA · 32-bar standard", description: "A1 · A2 · bridge · A3, eight measures each" }
];

type TemplateSection = { name: string; kind: SongSection["kind"]; bars: number; role: string; match: string[] };
const forms: Record<ArrangementTemplateId, TemplateSection[]> = {
  "pop-form": [
    { name: "Intro", kind: "intro", bars: 2, role: "light opening groove", match: ["intro", "pop", "light"] },
    { name: "Verse 1", kind: "verse", bars: 4, role: "steady verse pocket", match: ["verse", "pop", "rock"] },
    { name: "Chorus 1", kind: "chorus", bars: 4, role: "full chorus groove", match: ["chorus", "pop", "rock"] },
    { name: "Verse 2", kind: "verse", bars: 4, role: "restrained second verse", match: ["verse", "pop", "rock"] },
    { name: "Chorus 2", kind: "chorus", bars: 4, role: "full chorus groove", match: ["chorus", "pop", "rock"] },
    { name: "Outro", kind: "outro", bars: 2, role: "resolved ending", match: ["outro", "ending", "fill"] }
  ],
  "verse-chorus": [
    { name: "Verse 1", kind: "verse", bars: 4, role: "steady verse pocket", match: ["verse", "pop", "rock"] },
    { name: "Chorus 1", kind: "chorus", bars: 4, role: "lifted chorus groove", match: ["chorus", "pop", "rock"] },
    { name: "Verse 2", kind: "verse", bars: 4, role: "second verse variation", match: ["verse", "pop", "rock"] },
    { name: "Chorus 2", kind: "chorus", bars: 4, role: "return to chorus groove", match: ["chorus", "pop", "rock"] }
  ],
  "rock-anthem": [
    { name: "Intro", kind: "intro", bars: 2, role: "build into the band", match: ["rock", "intro", "build"] },
    { name: "Verse 1", kind: "verse", bars: 8, role: "solid backbeat with controlled cymbals", match: ["rock", "verse", "backbeat"] },
    { name: "Pre-chorus", kind: "bridge", bars: 4, role: "increase energy toward the chorus", match: ["build", "rock", "fill"] },
    { name: "Chorus 1", kind: "chorus", bars: 8, role: "open hats or ride with a strong backbeat", match: ["rock", "chorus", "open"] },
    { name: "Verse 2", kind: "verse", bars: 8, role: "return to the verse pocket", match: ["rock", "verse", "backbeat"] },
    { name: "Bridge", kind: "bridge", bars: 4, role: "contrast with a half-time or tom-led groove", match: ["half-time", "bridge", "tom"] },
    { name: "Final chorus", kind: "chorus", bars: 8, role: "largest chorus and final lift", match: ["rock", "chorus", "crash"] },
    { name: "Outro", kind: "outro", bars: 2, role: "ending fill and final accent", match: ["outro", "ending", "fill"] }
  ],
  "funk-pocket": [
    { name: "Intro", kind: "intro", bars: 2, role: "establish the syncopated pocket", match: ["funk", "syncopated", "pocket"] },
    { name: "Verse 1", kind: "verse", bars: 8, role: "tight kick and ghost-note snare pocket", match: ["funk", "ghost", "pocket"] },
    { name: "Chorus 1", kind: "chorus", bars: 8, role: "wider cymbal color while keeping the pocket", match: ["funk", "chorus", "open"] },
    { name: "Breakdown", kind: "bridge", bars: 4, role: "thin the groove and leave room", match: ["break", "sparse", "funk"] },
    { name: "Verse 2", kind: "verse", bars: 8, role: "return with a small variation", match: ["funk", "ghost", "pocket"] },
    { name: "Final chorus", kind: "chorus", bars: 8, role: "full pocket with a transition fill", match: ["funk", "chorus", "fill"] },
    { name: "Outro", kind: "outro", bars: 2, role: "short pocket tag and ending", match: ["funk", "outro", "ending"] }
  ],
  "shuffle-blues": [
    { name: "I · bars 1–4", kind: "verse", bars: 4, role: "medium shuffle on the I chord", match: ["shuffle", "blues", "swing"] },
    { name: "IV · bars 5–6", kind: "bridge", bars: 2, role: "move the shuffle to IV", match: ["shuffle", "blues", "swing"] },
    { name: "I · bars 7–8", kind: "verse", bars: 2, role: "return to I", match: ["shuffle", "blues", "swing"] },
    { name: "V · bar 9", kind: "other", bars: 1, role: "turn to V", match: ["shuffle", "blues", "swing"] },
    { name: "IV · bar 10", kind: "bridge", bars: 1, role: "answer on IV", match: ["shuffle", "blues", "swing"] },
    { name: "Turnaround · bars 11–12", kind: "fill", bars: 2, role: "shuffle turnaround into the next chorus", match: ["turnaround", "shuffle", "fill"] }
  ],
  "12-bar-blues": [
    { name: "I · bars 1–4", kind: "verse", bars: 4, role: "12-bar blues on I", match: ["blues", "shuffle", "swing"] },
    { name: "IV · bars 5–6", kind: "bridge", bars: 2, role: "move to IV", match: ["blues", "shuffle", "swing"] },
    { name: "I · bars 7–8", kind: "verse", bars: 2, role: "return to I", match: ["blues", "shuffle", "swing"] },
    { name: "V · bar 9", kind: "other", bars: 1, role: "turn to V", match: ["blues", "shuffle", "swing"] },
    { name: "IV · bar 10", kind: "bridge", bars: 1, role: "answer on IV", match: ["blues", "shuffle", "swing"] },
    { name: "Turnaround · bars 11–12", kind: "fill", bars: 2, role: "turnaround into the next chorus", match: ["turnaround", "blues", "fill"] }
  ],
  "aaba-32": [
    { name: "A1", kind: "verse", bars: 8, role: "main theme groove", match: ["jazz", "swing", "standard"] },
    { name: "A2", kind: "verse", bars: 8, role: "repeat the theme with a small variation", match: ["jazz", "swing", "standard"] },
    { name: "Bridge · B", kind: "bridge", bars: 8, role: "contrasting bridge groove", match: ["jazz", "bridge", "swing"] },
    { name: "A3", kind: "verse", bars: 8, role: "return to the theme and finish", match: ["jazz", "swing", "standard"] }
  ]
};

function meterSignature(meter: string) {
  const clean = cleanMeterLabel(meter);
  return clean.match(/(\d+)\s*\/\s*(\d+)/)?.slice(1).join("/") ?? clean.toLowerCase();
}

function chooseGroove(sources: Groove[], terms: string[], meter: string, beatsPerMeasure: number): Groove | undefined {
  const signature = meterSignature(meter);
  const candidates = sources.filter(source =>
    meterSignature(source.meter ?? `${source.beats}/4`) === signature &&
    Math.abs(source.beats - beatsPerMeasure) < 0.001
  );
  const scored = candidates.map(source => {
    const text = `${source.name} ${source.style} ${source.focus} ${source.description} ${(source.tags ?? []).join(" ")}`.toLowerCase();
    return { source, score: terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0) };
  }).sort((a, b) => b.score - a.score || a.source.name.localeCompare(b.source.name));
  return scored[0]?.source;
}

export function createArrangementTemplate(song: DrumSong, templateId: ArrangementTemplateId, sources: Groove[] = []): SongSection[] {
  const meter = cleanMeterLabel(song.meter || "4/4");
  const beatsPerMeasure = meterBeats(meter);
  return forms[templateId].map(({ name, kind, bars, role, match }) => {
    const source = chooseGroove(sources, match, meter, beatsPerMeasure);
    const part = source ? grooveToPart(source, song.bpm) : makeBlankPart(`${name} groove`, meter, song.bpm);
    const sectionId = crypto.randomUUID();
    return {
      id: sectionId,
      name,
      kind,
      notes: `Starter role: ${role}.${source ? ` Suggested groove: ${source.name}.` : " Choose or create a groove for this role."}`,
      parts: [part],
      clips: [{ id: crypto.randomUUID(), partId: part.id, repeats: bars }],
      repeats: 1,
      bpm: song.bpm,
      meter
    };
  });
}
