import type { SongRecording } from "./song-recording";
import type { Instrument, Level, PatternHit, PracticePattern, SongHitArticulation, SongInstrument, SongPartHit } from "./types";

export type DrumPart = { id: string; name: string; bpm: number; beats: number; subdivision: 4 | 8 | 12 | 16; hits: SongPartHit[]; meter?: string; sourceId?: string; sticking?: string; dynamics?: string; notes?: string };
export type SongClip = { id: string; partId: string; repeats: number };
export type SongSection = { id: string; name: string; kind: "intro" | "verse" | "chorus" | "bridge" | "fill" | "outro" | "other"; notes: string; parts: DrumPart[]; clips?: SongClip[]; repeats?: number; bpm?: number; meter?: string; tempoRamp?: { targetBpm: number; bars: number }; marker?: string; pickupBeats?: number; endingGroup?: string; endingPass?: 1 | 2; endingRepeats?: number };
export type DrumSong = { id: string; title: string; artist: string; difficulty: Level; bpm: number; meter: string; tags: string[]; source?: { url: string; title: string; attribution: string; authorization: string }; notes: string; sections: SongSection[]; createdAt: string; updatedAt: string; archived?: boolean; bundled?: boolean };
export type Collection = { id: string; name: string; songIds: string[] };
export type SongProgress = { songId: string; sectionId: string; sessions: number; bestScore: number; mastery: number; confidence: number; dueAt?: string; lastPracticedAt?: string; recentScores?: number[] };
export type SongQueue = { id: string; name: string; songIds: string[]; sectionIds?: Record<string, string> };
export type Setlist = { id: string; name: string; songIds: string[]; notes: string; sectionIds?: Record<string, string> };
export type SongJournal = { id: string; songId: string; sectionId?: string; text: string; createdAt: string };
export type SongNote = { id: string; songId: string; sectionId?: string; text: string; kind: "annotation" | "bookmark" | "stage-cue" | "reference"; url?: string };
export type SongSchedule = { id: string; songId: string; dueAt: string; note: string };
export type SectionReview = { songId: string; sectionId: string; dueAt: string; result: "again" | "hard" | "good" | "easy"; intervalDays: number };
export type TempoRamp = { id: string; songId: string; sectionId: string; startBpm: number; targetBpm: number; currentBpm: number; stepBpm: number; successfulPasses: number };
export type RehearsalChecklist = { id: string; name: string; items: { id: string; text: string; done: boolean }[] };
export type RubricScore = 1 | 2 | 3 | 4;
export type DrumRubricCriterion = { id: string; label: string; prompt: string };
export type DrumRubricTemplate = { id: string; label: string; criteria: DrumRubricCriterion[] };
export type RehearsalRubricAssessment = {
  id: string;
  songId: string;
  sectionId: string;
  templateId: string;
  templateLabel: string;
  createdAt: string;
  criteria: Array<DrumRubricCriterion & { score: RubricScore }>;
  notes: string;
};
export const DRUM_RUBRIC_SCORE_LABELS: Record<RubricScore, string> = {
  1: "Needs work",
  2: "Developing",
  3: "Consistent",
  4: "Performance ready"
};
export const DRUM_REHEARSAL_RUBRICS: DrumRubricTemplate[] = [
  {
    id: "groove-foundations",
    label: "Groove foundations",
    criteria: [
      { id: "pulse", label: "Pulse and timing", prompt: "Do the hits land steadily against the intended pulse?" },
      { id: "pattern", label: "Pattern accuracy", prompt: "Are the intended voices and subdivisions played clearly?" },
      { id: "balance", label: "Voice balance", prompt: "Are accents and softer notes controlled and distinct?" }
    ]
  },
  {
    id: "musical-performance",
    label: "Musical performance",
    criteria: [
      { id: "transitions", label: "Section transitions", prompt: "Do fills and transitions lead into the next section cleanly?" },
      { id: "dynamics", label: "Dynamics and touch", prompt: "Does the groove keep a musical dynamic shape without losing control?" },
      { id: "recovery", label: "Recovery", prompt: "After a missed hit, does the drummer return to the pulse promptly?" }
    ]
  }
];
export type ArrangementSnapshot = { id: string; songId: string; label: string; sections: SongSection[]; createdAt: string };
export type RehearsalRole = { id: string; name: string; responsibility: string; claimedBy?: string };
export type SongLibraryState = { version: 1; songs: DrumSong[]; collections: Collection[]; favorites: string[]; progress: SongProgress[]; queues: SongQueue[]; setlists: Setlist[]; journals: SongJournal[]; notes: SongNote[]; schedules: SongSchedule[]; recordings: SongRecording[]; reviews: SectionReview[]; tempoRamps: TempoRamp[]; checklists: RehearsalChecklist[]; snapshots: ArrangementSnapshot[]; roles: RehearsalRole[]; rubricAssessments: RehearsalRubricAssessment[] };
export const SONG_LIBRARY_KEY = "drum-hero:song-library:v1";
export const emptySongLibrary = (): SongLibraryState => ({ version: 1, songs: [], collections: [], favorites: [], progress: [], queues: [], setlists: [], journals: [], notes: [], schedules: [], recordings: [], reviews: [], tempoRamps: [], checklists: [], snapshots: [], roles: [], rubricAssessments: [] });
const voices: SongInstrument[] = ["kick", "snare", "hihat", "tom", "crash", "openhat", "ride", "rimshot"];
const levels: Level[] = ["Beginner", "Intermediate", "Advanced"];
const sectionKinds = ["intro", "verse", "chorus", "bridge", "fill", "outro", "other"];
const articulations: SongHitArticulation[] = ["normal", "flam", "drag", "buzz", "foot-splash"];
const bounded = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const id = () => crypto.randomUUID();
export function normalizeRehearsalRubricAssessment(input: unknown): RehearsalRubricAssessment | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<RehearsalRubricAssessment>;
  if (
    typeof value.id !== "string" ||
    typeof value.songId !== "string" ||
    typeof value.sectionId !== "string" ||
    typeof value.templateId !== "string" ||
    typeof value.templateLabel !== "string" ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(Date.parse(value.createdAt)) ||
    !Array.isArray(value.criteria)
  ) return null;
  const criteria = value.criteria.slice(0, 12).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const criterion = item as Partial<DrumRubricCriterion & { score: number }>;
    if (
      typeof criterion.id !== "string" ||
      typeof criterion.label !== "string" ||
      typeof criterion.prompt !== "string" ||
      ![1, 2, 3, 4].includes(criterion.score ?? 0)
    ) return [];
    const id = bounded(criterion.id, 80);
    const label = bounded(criterion.label, 100);
    if (!id || !label) return [];
    return [{ id, label, prompt: bounded(criterion.prompt, 240), score: criterion.score as RubricScore }];
  });
  if (!criteria.length) return null;
  const id = bounded(value.id, 100);
  const songId = bounded(value.songId, 100);
  const sectionId = bounded(value.sectionId, 100);
  const templateId = bounded(value.templateId, 80);
  const templateLabel = bounded(value.templateLabel, 100);
  if (!id || !songId || !sectionId || !templateId || !templateLabel) return null;
  return {
    id,
    songId,
    sectionId,
    templateId,
    templateLabel,
    createdAt: value.createdAt,
    criteria,
    notes: bounded(value.notes, 1000)
  };
}
export function validPart(input: unknown): input is DrumPart {
  if (!input || typeof input !== "object") return false;
  const p = input as Partial<DrumPart>;
  const steps = typeof p.beats === "number" && Number.isFinite(p.beats) && typeof p.subdivision === "number" ? p.beats * p.subdivision / 4 : 0;
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.bpm === "number" && p.bpm >= 40 && p.bpm <= 200 && typeof p.beats === "number" && p.beats > 0 && p.beats <= 32 && Number.isInteger(p.beats * 2) && Number.isInteger(steps) && (p.subdivision === 4 || p.subdivision === 8 || p.subdivision === 12 || p.subdivision === 16) && (p.meter === undefined || (typeof p.meter === "string" && p.meter.length <= 40)) && Array.isArray(p.hits) && p.hits.length <= 256 && p.hits.every((hit) => hit && Number.isInteger(hit.step) && hit.step >= 0 && hit.step < steps && voices.includes(hit.instrument) && (hit.velocity === undefined || (Number.isInteger(hit.velocity) && hit.velocity >= 1 && hit.velocity <= 127)) && (hit.ghost === undefined || typeof hit.ghost === "boolean") && (hit.articulation === undefined || articulations.includes(hit.articulation)));
}
export function normalizeSong(input: unknown): DrumSong | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Partial<DrumSong>;
  const title = bounded(s.title, 120), artist = bounded(s.artist, 120);
  if (!title || !artist || !Array.isArray(s.sections) || s.sections.length > 32) return null;
  const sections: SongSection[] = [];
  for (const item of s.sections) {
    if (!item || typeof item !== "object" || !Array.isArray(item.parts) || item.parts.length > 256 || !item.parts.every(validPart)) return null;
    const parts = item.parts.map((p: DrumPart) => ({ ...p, name: bounded(p.name, 80), meter: p.meter ? bounded(p.meter, 40) : undefined, sourceId: p.sourceId ? bounded(p.sourceId, 120) : undefined, sticking: bounded(p.sticking, 200), dynamics: bounded(p.dynamics, 200), notes: bounded(p.notes, 2000), hits: p.hits.map((h) => ({ step: h.step, instrument: h.instrument, accent: h.accent === true, velocity: h.velocity, ghost: h.ghost === true, articulation: h.articulation && articulations.includes(h.articulation) ? h.articulation : undefined })) }));
    const partIds = new Set(parts.map((part) => part.id));
    const clips = Array.isArray(item.clips) && item.clips.length <= 512 && item.clips.every((clip) => clip && typeof clip.id === "string" && partIds.has(clip.partId) && Number.isInteger(clip.repeats) && clip.repeats >= 1 && clip.repeats <= 64)
      ? item.clips.map((clip) => ({ id: bounded(clip.id, 100) || id(), partId: clip.partId, repeats: clip.repeats }))
      : undefined;
    const ramp = item.tempoRamp && typeof item.tempoRamp === "object" && Number.isFinite(item.tempoRamp.targetBpm) && Number.isInteger(item.tempoRamp.bars) ? { targetBpm: Math.max(40, Math.min(200, item.tempoRamp.targetBpm)), bars: Math.max(1, Math.min(128, item.tempoRamp.bars)) } : undefined;
    const endingPass = item.endingPass === 1 || item.endingPass === 2 ? item.endingPass : undefined;
    sections.push({ id: bounded(item.id, 100) || id(), name: bounded(item.name, 80) || "Section", kind: sectionKinds.includes(item.kind) ? item.kind : "other", notes: bounded(item.notes, 2000), parts, clips, repeats: Number.isInteger(item.repeats) ? Math.max(1, Math.min(32, Number(item.repeats))) : undefined, bpm: typeof item.bpm === "number" && Number.isFinite(item.bpm) ? Math.max(40, Math.min(200, Number(item.bpm))) : undefined, meter: item.meter ? bounded(item.meter, 40) : undefined, tempoRamp: ramp, marker: bounded(item.marker, 80) || undefined, pickupBeats: Number.isFinite(item.pickupBeats) ? Math.max(0.5, Math.min(8, Number(item.pickupBeats))) : undefined, endingGroup: bounded(item.endingGroup, 80) || undefined, endingPass, endingRepeats: Number.isInteger(item.endingRepeats) ? Math.max(2, Math.min(8, Number(item.endingRepeats))) : undefined });
  }
  const now = new Date().toISOString();
  const createdAt = typeof s.createdAt === "string" && !Number.isNaN(Date.parse(s.createdAt)) ? s.createdAt : now;
  const updatedAt = typeof s.updatedAt === "string" && !Number.isNaN(Date.parse(s.updatedAt)) ? s.updatedAt : createdAt;
  let source: DrumSong["source"];
  if (s.source && typeof s.source === "object" && /^https?:\/\//i.test(String(s.source.url))) source = { url: bounded(s.source.url, 2000), title: bounded(s.source.title, 100), attribution: bounded(s.source.attribution, 200), authorization: bounded(s.source.authorization, 200) };
  return { id: bounded(s.id, 100) || id(), title, artist, difficulty: levels.includes(s.difficulty as Level) ? s.difficulty as Level : "Beginner", bpm: Math.max(40, Math.min(200, Number(s.bpm) || 80)), meter: bounded(s.meter, 20) || "4/4", tags: Array.isArray(s.tags) ? s.tags.filter((t): t is string => typeof t === "string").slice(0, 12).map((t) => t.slice(0, 40)) : [], source, notes: bounded(s.notes, 4000), sections, createdAt, updatedAt, archived: s.archived === true, bundled: s.bundled === true };
}
export function migrateSongLibrary(input: unknown): SongLibraryState {
  if (!input || typeof input !== "object" || (input as { version?: unknown }).version !== 1) return emptySongLibrary();
  const s = input as Partial<SongLibraryState>;
  const arr = <T>(v: unknown, guard: (x: unknown) => x is T, max: number): T[] => Array.isArray(v) ? v.filter(guard).slice(0, max) : [];
  const identified = (x: unknown): x is { id: string } => !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string";
  return { version: 1, songs: arr(s.songs, (x): x is DrumSong => normalizeSong(x) !== null, 500).map((x) => normalizeSong(x)!), collections: arr(s.collections, identified, 100).map((x) => ({ id: x.id, name: bounded((x as Collection).name, 80), songIds: arr((x as Collection).songIds, (v): v is string => typeof v === "string", 500) })), favorites: arr(s.favorites, (v): v is string => typeof v === "string", 500), progress: arr(s.progress, (x): x is SongProgress => !!x && typeof x === "object" && typeof (x as SongProgress).songId === "string", 2000).map((x) => ({ ...x, sessions: Math.max(0, Number(x.sessions) || 0), bestScore: Math.max(0, Math.min(100, Number(x.bestScore) || 0)), mastery: Math.max(0, Math.min(100, Number(x.mastery) || 0)), confidence: Math.max(0, Math.min(100, Number(x.confidence) || 0)), recentScores: Array.isArray(x.recentScores) ? x.recentScores.filter((score) => Number.isFinite(score)).slice(-20) : [] })), queues: arr(s.queues, identified, 100) as SongQueue[], setlists: arr(s.setlists, identified, 100) as Setlist[], journals: arr(s.journals, identified, 1000) as SongJournal[], notes: arr(s.notes, identified, 2000) as SongNote[], schedules: arr(s.schedules, identified, 500) as SongSchedule[], recordings: arr(s.recordings, identified, 100) as SongRecording[], rubricAssessments: Array.isArray(s.rubricAssessments) ? s.rubricAssessments.map(normalizeRehearsalRubricAssessment).filter((item): item is RehearsalRubricAssessment => item !== null).slice(0, 1000) : [], reviews: arr(s.reviews, (x): x is SectionReview => !!x && typeof x === "object" && typeof (x as SectionReview).songId === "string", 2000), tempoRamps: arr(s.tempoRamps, identified, 500) as TempoRamp[], checklists: arr(s.checklists, identified, 100) as RehearsalChecklist[], snapshots: arr(s.snapshots, identified, 200) as ArrangementSnapshot[], roles: arr(s.roles, identified, 100) as RehearsalRole[] };
}
export function readSongLibrary(): SongLibraryState { if (typeof window === "undefined") return emptySongLibrary(); try { return migrateSongLibrary(JSON.parse(localStorage.getItem(SONG_LIBRARY_KEY) || "null")); } catch { return emptySongLibrary(); } }
export function writeSongLibrary(state: SongLibraryState) { localStorage.setItem(SONG_LIBRARY_KEY, JSON.stringify(state)); window.dispatchEvent(new Event("drum-hero:song-library-change")); }
export function allSongs(state: SongLibraryState) { return [...examples.filter((example) => !state.songs.some((song) => song.id === example.id)), ...state.songs]; }
export function findSongs(songs: DrumSong[], query: string, difficulty = "All") { const q = query.trim().toLowerCase(); return songs.filter((s) => !s.archived && (difficulty === "All" || s.difficulty === difficulty) && (!q || [s.title, s.artist, s.meter, ...s.tags].some((v) => v.toLowerCase().includes(q)))); }
export function songPartPattern(song: DrumSong, section: SongSection, part: DrumPart): PracticePattern { const supported = new Set<Instrument>(["kick", "snare", "hihat", "tom", "crash"]); return { id: `song:${song.id}:${section.id}:${part.id}`, name: `${song.title} · ${section.name} · ${part.name}`, level: song.difficulty, description: [song.artist, section.notes, part.notes].filter(Boolean).join(" · "), subdivision: part.subdivision, beats: part.beats, defaultBpm: part.bpm, tempoRange: [40, 200], hits: part.hits.filter((hit): hit is SongPartHit & { instrument: Instrument } => supported.has(hit.instrument as Instrument)).map((hit) => ({ step: hit.step, instrument: hit.instrument, accent: hit.accent })) }; }
export function recordSongScore(state: SongLibraryState, songId: string, sectionId: string, score: number): SongLibraryState { const previous = state.progress.find((p) => p.songId === songId && p.sectionId === sectionId); const practicedAt = new Date().toISOString(); const next: SongProgress = { songId, sectionId, sessions: (previous?.sessions ?? 0) + 1, bestScore: Math.max(previous?.bestScore ?? 0, score), mastery: Math.round(((previous?.mastery ?? 0) + score) / 2), confidence: previous?.confidence ?? 0, dueAt: new Date(Date.now() + 86400000).toISOString(), lastPracticedAt: practicedAt, recentScores: [...(previous?.recentScores ?? []), Math.max(0, Math.min(100, Math.round(score)))].slice(-20) }; return { ...state, progress: [...state.progress.filter((p) => p !== previous), next] }; }
export function mergeSongLibraries(local: SongLibraryState, remote: SongLibraryState): SongLibraryState { const merge = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...b, ...a].map((x) => [x.id, x])).values()]; return { version: 1, songs: merge(local.songs, remote.songs), collections: merge(local.collections, remote.collections), favorites: [...new Set([...local.favorites, ...remote.favorites])], progress: [...new Map([...remote.progress, ...local.progress].map((x) => [`${x.songId}:${x.sectionId}`, x])).values()], queues: merge(local.queues, remote.queues), setlists: merge(local.setlists, remote.setlists), journals: merge(local.journals, remote.journals), notes: merge(local.notes, remote.notes), schedules: merge(local.schedules, remote.schedules), recordings: merge(local.recordings, remote.recordings), rubricAssessments: merge(local.rubricAssessments ?? [], remote.rubricAssessments ?? []), reviews: [...new Map([...remote.reviews, ...local.reviews].map((x) => [`${x.songId}:${x.sectionId}`, x])).values()], tempoRamps: merge(local.tempoRamps, remote.tempoRamps), checklists: merge(local.checklists, remote.checklists), snapshots: merge(local.snapshots, remote.snapshots), roles: merge(local.roles, remote.roles) }; }
export function newSong(title: string, artist: string): DrumSong { return normalizeSong({ title, artist, difficulty: "Beginner", bpm: 80, meter: "4/4", tags: [], notes: "", sections: [], createdAt: new Date().toISOString() })!; }
const example = (key: string, title: string, bpm: number, hits: PatternHit[]): DrumSong => ({ id: `example-${key}`, title, artist: "Drum Hero Originals", difficulty: "Beginner", bpm, meter: "4/4", tags: ["original", "practice"], notes: "Original practice composition for Drum Hero.", sections: [{ id: "verse", name: "Verse", kind: "verse", notes: "Keep a steady pulse.", parts: [{ id: "main", name: "Main groove", bpm, beats: 4, subdivision: 8, hits }] }], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", bundled: true });
export const examples: DrumSong[] = [example("steady-road", "Steady Road", 82, [...Array.from({ length: 8 }, (_, step) => ({ step, instrument: "hihat" as const })), ...[0, 4].map((step) => ({ step, instrument: "kick" as const })), ...[2, 6].map((step) => ({ step, instrument: "snare" as const }))]), example("open-sky", "Open Sky", 96, [...[0, 2, 4, 6].map((step) => ({ step, instrument: "hihat" as const })), ...[0, 3, 4].map((step) => ({ step, instrument: "kick" as const })), ...[2, 6].map((step) => ({ step, instrument: "snare" as const })), { step: 7, instrument: "tom" }])];

export function reviewSection(state: SongLibraryState, songId: string, sectionId: string, result: SectionReview["result"], at = new Date()): SongLibraryState { const old = state.reviews.find((r) => r.songId === songId && r.sectionId === sectionId); const intervalDays = result === "again" ? 0.25 : result === "hard" ? 1 : result === "good" ? Math.max(2, (old?.intervalDays ?? 1) * 2) : Math.max(4, (old?.intervalDays ?? 1) * 3); const review: SectionReview = { songId, sectionId, result, intervalDays, dueAt: new Date(at.getTime() + intervalDays * 86400000).toISOString() }; return { ...state, reviews: [...state.reviews.filter((r) => r !== old), review] }; }
export function advanceTempoRamp(state: SongLibraryState, rampId: string, success: boolean): SongLibraryState { return { ...state, tempoRamps: state.tempoRamps.map((ramp) => ramp.id === rampId ? { ...ramp, successfulPasses: ramp.successfulPasses + (success ? 1 : 0), currentBpm: success ? Math.min(ramp.targetBpm, ramp.currentBpm + ramp.stepBpm) : Math.max(ramp.startBpm, ramp.currentBpm - ramp.stepBpm) } : ramp) }; }
export function readiness(state: SongLibraryState, song: DrumSong) { const sectionScores = song.sections.map((section) => ({ section, mastery: state.progress.find((p) => p.songId === song.id && p.sectionId === section.id)?.mastery ?? 0 })); const mastery = sectionScores.length ? Math.round(sectionScores.reduce((sum, item) => sum + item.mastery, 0) / sectionScores.length) : 0; const due = state.reviews.some((review) => review.songId === song.id && Date.parse(review.dueAt) <= Date.now()); const unpracticed = sectionScores.filter((item) => !state.progress.some((p) => p.songId === song.id && p.sectionId === item.section.id)).map((item) => item.section.name); const weakSections = sectionScores.filter((item) => item.mastery < 80).sort((a, b) => a.mastery - b.mastery).map((item) => item.section.name); const reasons = [...(unpracticed.length ? [`Practice ${unpracticed.join(", ")}`] : []), ...(weakSections.length ? [`Raise mastery in ${weakSections.join(", ")} to at least 80%`] : []), ...(due ? ["Complete the overdue section review"] : []), ...(!sectionScores.length ? ["Add at least one playable section"] : [])]; return { mastery, ready: sectionScores.length > 0 && reasons.length === 0, due, reasons, targetMastery: 80 }; }
