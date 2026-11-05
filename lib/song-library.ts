import { goalAccepts, normalizeGoals, type PracticeGoal } from './song-library-improvements';
import { normalizeTempoAnchors, type TempoAnchor } from "./song-builder-tools";
import { normalizePresets, normalizeSavedSearches, normalizeSetlistEntries, normalizeSmartCollectionRules, type PracticePreset, type SavedSongSearch, type SetlistEntry, type SmartCollectionRules } from './song-library-next';
import { parseCustomGrooves } from './custom-grooves';
import { DEFAULT_DRUM_MIX, type DrumMixSettings } from './audio';
import { learnerProfileIdFromBrowser } from "./learner-profiles";
import { songLibraryForLearner } from "./song-library-profiles";
import type { SongRecording } from "./song-recording";
import { SONG_INSTRUMENTS, type Groove, type Instrument, type Level, type PatternHit, type PracticePattern, type SongHitArticulation, type SongInstrument, type SongPartHit } from "./types";

export type DrumPart = { playabilityDismissed?: string[]; linkedBaseId?: string; linkOverrides?: SongPartHit[]; linkRemoved?: string[]; id: string; name: string; bpm: number; beats: number; subdivision: 4 | 8 | 12 | 16 | 20; hits: SongPartHit[]; meter?: string; sourceId?: string; sticking?: string; dynamics?: string; notes?: string };
export type SongPlaybackFeel = { swing?: number; humanizeAmount?: number; humanizeVelocityAmount?: number };
export type SongClipOverrides = SongPlaybackFeel & { volume?: number; mutedVoices?: SongInstrument[]; mutedLayers?: string[]; soloLayer?: string };
export type SongClip = { id: string; partId: string; repeats: number; layers?: string[]; overrides?: SongClipOverrides; repeatVariants?: Array<{ repeat: number; partId: string }> };
export type SongRehearsalCue = { id: string; measure: number; text: string; kind?: "band" | "chord" | "lyric" };
export type SongFeel = { kind: "straight" | "swing" | "shuffle"; amount: number };
export type SongSectionAutomation = { volumeFrom?: number; volumeTo?: number; cymbalFrom?: number; cymbalTo?: number; mutedVoices?: SongInstrument[]; voices?: Partial<Record<SongInstrument, { volumeFrom?: number; volumeTo?: number }>> };
export type SongArrangementAutomationPoint = { beat: number; instrument?: SongInstrument; volume?: number; pan?: number; velocity?: number };
export type SongKitSetup = { profileId?: string; kitType?: "acoustic" | "electronic" | "hybrid"; tuning?: string; cymbals?: string; pedal?: string; notes?: string };
export type SongKitProfile = { id: string; name: string; kitType: "acoustic" | "electronic" | "hybrid"; tuning: string; cymbals: string; pedal: string; notes: string; availableVoices: SongInstrument[]; midiNotes: Partial<Record<SongInstrument, number>> };
export type SongCatalogReview = { reviewer: string; reviewedAt: string; arrangementFingerprint: string; notes: string; checklist: { notation: boolean; meter: boolean; sticking: boolean; skillMetadata: boolean } };
export type SongSection = { id: string; name: string; kind: "intro" | "verse" | "chorus" | "bridge" | "fill" | "outro" | "other"; notes: string; parts: DrumPart[]; feel?: SongFeel; playbackFeel?: SongPlaybackFeel; kitMix?: DrumMixSettings; clips?: SongClip[]; rehearsalCues?: SongRehearsalCue[]; repeats?: number; bpm?: number; meter?: string; tempoRamp?: { targetBpm: number; bars: number }; automation?: SongSectionAutomation; marker?: string; pickupBeats?: number; endingGroup?: string; endingPass?: 1 | 2; endingRepeats?: number };
export type DrumSong = { sharedOrigin?: { shareId: string; sourceSongId: string }; catalogReview?: SongCatalogReview; voiceLabels?: Partial<Record<SongInstrument, string>>; arrangementAutomation?: SongArrangementAutomationPoint[]; kitSetup?: SongKitSetup; referenceTempoMap?: TempoAnchor[]; arrangementLocked?: boolean; id: string; title: string; artist: string; difficulty: Level; bpm: number; meter: string; tags: string[]; source?: { url: string; title: string; attribution: string; authorization: string }; notes: string; sections: SongSection[]; createdAt: string; updatedAt: string; archived?: boolean; bundled?: boolean };
export type Collection = { id: string; name: string; songIds: string[]; smartRules?: SmartCollectionRules };
export type AttemptBarTiming = { bar: number; instrument: SongInstrument; targets: number; missed: number; meanOffsetMs: number | null };
export type AttemptEventTiming = { bar: number; beat: number; instrument: SongInstrument; offsetMs: number | null; confidence?: number; sticking?: "R" | "L"; playedSticking?: "R" | "L" };
export type AttemptTiming = { meanOffsetMs: number; missed: number; extra: number; voices: { instrument: SongInstrument; missed: number }[]; bars?: AttemptBarTiming[]; events?: AttemptEventTiming[] };
export type SongAttempt = { id: string; partId: string; bpm: number; inputMode: "keyboard" | "touch" | "midi" | "audio" | "self" | "unknown"; score: number; playedAt: string; engine?: "pad" | "trainer" | "song"; completePart?: boolean; tempoScale?: number; patternFingerprint?: string; timing?: AttemptTiming; stickingCorrect?: number; stickingChecked?: number };
export type SongPracticeContext = Pick<SongAttempt, "partId" | "bpm" | "inputMode"> & Partial<Pick<SongAttempt, "engine" | "completePart" | "tempoScale" | "timing" | "stickingCorrect" | "stickingChecked">>;
export type SongProgress = { learnerId?: string; songId: string; sectionId: string; sessions: number; bestScore: number; mastery: number; confidence: number; dueAt?: string; lastPracticedAt?: string; recentScores?: number[]; attempts?: SongAttempt[] };
export type SongQueue = { learnerId?: string; id: string; name: string; songIds: string[]; sectionIds?: Record<string, string>; targets?: Record<string, { partId?: string; repetitions: number; bpm?: number }> };
export type SetlistTransition = { breakSeconds: number; countInBeats: number; note: string };
export type Setlist = { entries?: SetlistEntry[]; transitions?: Record<string, SetlistTransition>; kitProfileId?: string; id: string; name: string; songIds: string[]; notes: string; sectionIds?: Record<string, string>; targets?: Record<string, { partId?: string; repetitions: number; bpm?: number }> };
export type SongJournal = { learnerId?: string; id: string; songId: string; sectionId?: string; text: string; createdAt: string };
export type SongNote = { learnerId?: string; id: string; songId: string; sectionId?: string; bar?: number; beat?: number; text: string; kind: "annotation" | "bookmark" | "stage-cue" | "reference"; url?: string };
export type SongSchedule = { learnerId?: string; id: string; songId: string; dueAt: string; note: string };
export type SongReferenceTrack = { learnerId?: string; id: string; songId: string; sectionId?: string; name: string; createdAt: string; durationMs: number; mimeType: string; sectionStartMs: number; sectionEndMs?: number; loopSection?: boolean; playbackRate?: number };
export type SongLearningPathStep = { id: string; songId: string; sectionId: string; partId: string; label: string; targetBpm: number; minimumScore: number; passes: number };
export type SongLearningPath = { learnerId?: string; id: string; title: string; summary: string; style?: string; meter?: string; skill?: string; difficulty?: Level; prerequisitePathId?: string; steps: SongLearningPathStep[]; createdAt: string };
export type SectionReview = { learnerId?: string; songId: string; sectionId: string; dueAt: string; result: "again" | "hard" | "good" | "easy"; intervalDays: number };
export type TempoRamp = { learnerId?: string; id: string; songId: string; sectionId: string; startBpm: number; targetBpm: number; currentBpm: number; stepBpm: number; successfulPasses: number };
export type RehearsalChecklist = { id: string; name: string; items: { id: string; text: string; done: boolean }[] };
export type SetlistRunOutcome = "solid" | "wobbly" | "retry" | "skipped";
export type SetlistRunEntry = { id: string; songId: string; sectionId?: string; partId?: string; bpm?: number; repetitions?: number; breakSeconds?: number; countInBeats?: number; transitionNote?: string; outcome?: SetlistRunOutcome; note?: string; completedAt?: string };
export type SetlistRun = { learnerId?: string; id: string; setlistId: string; setlistName: string; startedAt: string; completedAt?: string; entries: SetlistRunEntry[] };
export type RubricScore = 1 | 2 | 3 | 4;
export type DrumRubricCriterion = { id: string; label: string; prompt: string };
export type DrumRubricTemplate = { id: string; label: string; criteria: DrumRubricCriterion[] };
export type RehearsalRubricAssessment = {
  learnerId?: string;
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
export type ArrangementSnapshot = { id: string; songId: string; label: string; bpm?: number; meter?: string; referenceTempoMap?: TempoAnchor[]; arrangementAutomation?: SongArrangementAutomationPoint[]; voiceLabels?: Partial<Record<SongInstrument,string>>; sections: SongSection[]; createdAt: string; automatic?: boolean };
export type RehearsalRole = { id: string; name: string; responsibility: string; claimedBy?: string; assignments?: Record<string, { sectionId: string; partId: string }> };
export type SongLibraryState = { goals?: PracticeGoal[]; practicePresets?: PracticePreset[]; savedSearches?: SavedSongSearch[]; customGrooves?: Groove[]; referenceTracks?: SongReferenceTrack[]; learningPaths?: SongLearningPath[]; kitProfiles?: SongKitProfile[]; rehearsalRuns?: SetlistRun[]; version: 1; songs: DrumSong[]; collections: Collection[]; favorites: string[]; progress: SongProgress[]; queues: SongQueue[]; setlists: Setlist[]; journals: SongJournal[]; notes: SongNote[]; schedules: SongSchedule[]; recordings: SongRecording[]; reviews: SectionReview[]; tempoRamps: TempoRamp[]; checklists: RehearsalChecklist[]; snapshots: ArrangementSnapshot[]; roles: RehearsalRole[]; rubricAssessments: RehearsalRubricAssessment[] };
export const SONG_LIBRARY_KEY = "drum-hero:song-library:v1";
export const emptySongLibrary = (): SongLibraryState => ({ version: 1, songs: [], collections: [], favorites: [], progress: [], queues: [], setlists: [], journals: [], notes: [], schedules: [], recordings: [], referenceTracks: [], learningPaths: [], kitProfiles: [], rehearsalRuns: [], customGrooves: [], reviews: [], tempoRamps: [], checklists: [], snapshots: [], roles: [], rubricAssessments: [] });
const voices: SongInstrument[] = SONG_INSTRUMENTS;
function normalizeSongSectionKitMix(input: unknown): DrumMixSettings | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const raw = input as Partial<DrumMixSettings>;
  const bounded = (value: unknown, fallback: number, minimum: number, maximum: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
  return {
    levels: Object.fromEntries(voices.map(voice => [voice, bounded(raw.levels?.[voice], DEFAULT_DRUM_MIX.levels[voice], 0, 1)])) as DrumMixSettings["levels"],
    pan: Object.fromEntries(voices.map(voice => [voice, bounded(raw.pan?.[voice], DEFAULT_DRUM_MIX.pan[voice], -1, 1)])) as DrumMixSettings["pan"],
    sampleIndex: Object.fromEntries(voices.map(voice => [voice, Math.round(bounded(raw.sampleIndex?.[voice], DEFAULT_DRUM_MIX.sampleIndex[voice], -1, voice === "tom" || voice === "rimshot" ? 2 : 3))])) as DrumMixSettings["sampleIndex"],
    pitch: Object.fromEntries(voices.map(voice => [voice, bounded(raw.pitch?.[voice], 0, -12, 12)])) as DrumMixSettings["pitch"],
    decay: Object.fromEntries(voices.map(voice => [voice, bounded(raw.decay?.[voice], 1, 0.05, 1)])) as DrumMixSettings["decay"],
    muted: Object.fromEntries(voices.map(voice => [voice, raw.muted?.[voice] === true])) as DrumMixSettings["muted"],
    solo: voices.includes(raw.solo as SongInstrument) ? raw.solo as SongInstrument : ""
  };
}
const levels: Level[] = ["Beginner", "Intermediate", "Advanced"];
const sectionKinds = ["intro", "verse", "chorus", "bridge", "fill", "outro", "other"];
const articulations: SongHitArticulation[] = ["normal", "flam", "drag", "buzz", "roll", "choke", "foot-splash"];
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
    learnerId: bounded(value.learnerId, 80) || "default",
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
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.bpm === "number" && p.bpm >= 40 && p.bpm <= 200 && typeof p.beats === "number" && p.beats > 0 && p.beats <= 32 && Number.isInteger(p.beats * 2) && (Number.isInteger(steps) || p.subdivision === 20) && (p.subdivision === 4 || p.subdivision === 8 || p.subdivision === 12 || p.subdivision === 16 || p.subdivision === 20) && (p.meter === undefined || (typeof p.meter === "string" && p.meter.length <= 40)) && Array.isArray(p.hits) && p.hits.length <= 256 && p.hits.every((hit) => hit && Number.isInteger(hit.step) && hit.step >= 0 && hit.step < steps && voices.includes(hit.instrument) && (hit.velocity === undefined || (Number.isInteger(hit.velocity) && hit.velocity >= 1 && hit.velocity <= 127)) && (hit.ghost === undefined || typeof hit.ghost === "boolean") && (hit.articulation === undefined || articulations.includes(hit.articulation)));
}
export function songPartEvidenceFingerprint(part: DrumPart): string {
  const text = JSON.stringify({ beats: part.beats, subdivision: part.subdivision, hits: [...part.hits].sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument)).map((hit) => [hit.step, hit.instrument, !!hit.accent, !!hit.ghost, hit.velocity ?? null, hit.articulation ?? "normal"]) });
  let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b ^ text.charCodeAt(i), 2246822507); }
  return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}
export function songArrangementFingerprint(song: Pick<DrumSong, "title" | "artist" | "difficulty" | "bpm" | "meter" | "tags" | "notes" | "referenceTempoMap" | "voiceLabels" | "sections">): string {
  const text = JSON.stringify({ title: song.title, artist: song.artist, difficulty: song.difficulty, bpm: song.bpm, meter: song.meter, tags: song.tags, notes: song.notes, referenceTempoMap: song.referenceTempoMap ?? [], voiceLabels: song.voiceLabels ?? {}, sections: song.sections.map(section => ({ id: section.id, name: section.name, kind: section.kind, notes: section.notes, feel: section.feel, bpm: section.bpm, meter: section.meter, repeats: section.repeats, tempoRamp: section.tempoRamp, clips: section.clips?.map(clip => ({ partId: clip.partId, repeats: clip.repeats, repeatVariants: clip.repeatVariants })), parts: section.parts.map(part => ({ id: part.id, name: part.name, bpm: part.bpm, beats: part.beats, subdivision: part.subdivision, meter: part.meter, sticking: part.sticking, dynamics: part.dynamics, notes: part.notes, hits: [...part.hits].sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument)).map(hit => [hit.step, hit.instrument, !!hit.accent, !!hit.ghost, hit.velocity ?? null, hit.articulation ?? "normal", hit.sticking ?? null, hit.timingOffsetMs ?? 0]) })) })) });
  let a = 2166136261, b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b ^ text.charCodeAt(i), 2246822507); }
  return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}
export function normalizeSong(input: unknown): DrumSong | null {
  if (!input || typeof input !== "object") return null;
  const s = input as Partial<DrumSong>;
  const title = bounded(s.title, 120), artist = bounded(s.artist, 120);
  if (!title || !artist || !Array.isArray(s.sections) || s.sections.length > 32) return null;
  const sections: SongSection[] = [];
  for (const item of s.sections) {
    if (!item || typeof item !== "object" || !Array.isArray(item.parts) || item.parts.length > 256 || !item.parts.every(validPart)) return null;
    const parts = item.parts.map((p: DrumPart) => ({ ...p, name: bounded(p.name, 80), playabilityDismissed: Array.isArray(p.playabilityDismissed)?p.playabilityDismissed.filter((id):id is string=>typeof id==="string").map(id=>id.slice(0,300)).slice(0,256):undefined, linkedBaseId: typeof p.linkedBaseId === "string" && item.parts.some((base:DrumPart)=>base.id===p.linkedBaseId && !base.linkedBaseId && base.id!==p.id) ? p.linkedBaseId : undefined, linkOverrides: Array.isArray(p.linkOverrides) && validPart({...p,hits:p.linkOverrides}) ? p.linkOverrides : undefined, linkRemoved: Array.isArray(p.linkRemoved) ? p.linkRemoved.filter((key):key is string=>typeof key==="string"&&/^(kick|snare|hihat|openhat|ride|rimshot|tom|crash|cowbell|shaker|tambourine|custom[1-8]):[0-9]+$/.test(key)).slice(0,256) : undefined, meter: p.meter ? bounded(p.meter, 40) : undefined, sourceId: p.sourceId ? bounded(p.sourceId, 120) : undefined, sticking: bounded(p.sticking, 200), dynamics: bounded(p.dynamics, 200), notes: bounded(p.notes, 2000), hits: p.hits.map((h) => ({ step: h.step, instrument: h.instrument, accent: h.accent === true, velocity: h.velocity, ghost: h.ghost === true, articulation: h.articulation && articulations.includes(h.articulation) ? h.articulation : undefined, sticking: h.sticking === "R" || h.sticking === "L" ? h.sticking : undefined, timingOffsetMs: typeof h.timingOffsetMs === "number" && Number.isFinite(h.timingOffsetMs) ? Math.max(-1000, Math.min(1000,h.timingOffsetMs)) : undefined })) }));
    const partIds = new Set(parts.map((part) => part.id));
    const clips = Array.isArray(item.clips) && item.clips.length <= 512 && item.clips.every((clip) => clip && typeof clip.id === "string" && partIds.has(clip.partId) && Number.isInteger(clip.repeats) && clip.repeats >= 1 && clip.repeats <= 64)
      ? item.clips.map((clip) => {
          const raw = clip.overrides && typeof clip.overrides === "object" ? clip.overrides : undefined;
          const overrides: SongClipOverrides | undefined = raw ? {
            volume: typeof raw.volume === "number" && Number.isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : undefined,
            swing: typeof raw.swing === "number" && Number.isFinite(raw.swing) ? Math.max(50, Math.min(75, raw.swing)) : undefined,
            humanizeAmount: typeof raw.humanizeAmount === "number" && Number.isFinite(raw.humanizeAmount) ? Math.max(0, Math.min(100, raw.humanizeAmount)) : undefined,
            humanizeVelocityAmount: typeof raw.humanizeVelocityAmount === "number" && Number.isFinite(raw.humanizeVelocityAmount) ? Math.max(0, Math.min(100, raw.humanizeVelocityAmount)) : undefined,
            mutedVoices: Array.isArray(raw.mutedVoices) ? [...new Set(raw.mutedVoices.filter((voice): voice is SongInstrument => voices.includes(voice)))].slice(0, voices.length) : undefined,
            mutedLayers: Array.isArray(raw.mutedLayers) ? [...new Set(raw.mutedLayers.filter((partId): partId is string => typeof partId === "string" && partIds.has(partId)))].slice(0, 16) : undefined,
            soloLayer: typeof raw.soloLayer === "string" && partIds.has(raw.soloLayer) && (raw.soloLayer === clip.partId || (clip.layers ?? []).includes(raw.soloLayer)) ? raw.soloLayer : undefined
          } : undefined;
          const layers = Array.isArray(clip.layers) ? [...new Set(clip.layers.filter((partId): partId is string => typeof partId === "string" && partIds.has(partId) && partId !== clip.partId))].slice(0, 16) : undefined;
          if (overrides?.soloLayer && overrides.soloLayer !== clip.partId && !layers?.includes(overrides.soloLayer)) overrides.soloLayer = undefined;
          if (overrides?.mutedLayers) overrides.mutedLayers = overrides.mutedLayers.filter(partId => partId === clip.partId || layers?.includes(partId));
          const hasOverrides = !!overrides && (overrides.volume !== undefined || overrides.swing !== undefined || overrides.humanizeAmount !== undefined || overrides.humanizeVelocityAmount !== undefined || !!overrides.mutedVoices?.length || !!overrides.mutedLayers?.length || overrides.soloLayer !== undefined);
          const repeatVariants = Array.isArray(clip.repeatVariants) ? clip.repeatVariants.flatMap((variant) => variant && Number.isInteger(variant.repeat) && variant.repeat >= 2 && variant.repeat <= clip.repeats && partIds.has(variant.partId) ? [{ repeat: variant.repeat, partId: variant.partId }] : []).slice(0, 64) : undefined;
          return { id: bounded(clip.id, 100) || id(), partId: clip.partId, repeats: clip.repeats, layers: layers?.length ? layers : undefined, overrides: hasOverrides ? overrides : undefined, repeatVariants: repeatVariants?.length ? repeatVariants : undefined };
        })
      : undefined;
    const rehearsalCues = Array.isArray(item.rehearsalCues) && item.rehearsalCues.length <= 256
      ? [...new Map(item.rehearsalCues.flatMap((cue) => cue && typeof cue === "object" && Number.isInteger(cue.measure) && cue.measure >= 1 && cue.measure <= 4096 && typeof cue.text === "string" && cue.text.trim().length
        ? [{ id: bounded(cue.id, 100) || id(), measure: cue.measure, text: bounded(cue.text, 240), kind: cue.kind === "chord" || cue.kind === "lyric" ? cue.kind : "band" as const }]
          : []).map(cue=>[`${cue.measure}:${cue.kind}`,cue] as const)).values()].sort((a,b)=>a.measure-b.measure)
      : undefined;
    const ramp = item.tempoRamp && typeof item.tempoRamp === "object" && Number.isFinite(item.tempoRamp.targetBpm) && Number.isInteger(item.tempoRamp.bars) ? { targetBpm: Math.max(40, Math.min(200, item.tempoRamp.targetBpm)), bars: Math.max(1, Math.min(128, item.tempoRamp.bars)) } : undefined;
    const endingPass = item.endingPass === 1 || item.endingPass === 2 ? item.endingPass : undefined;
    const feel = item.feel && typeof item.feel === "object" && ["straight", "swing", "shuffle"].includes(String(item.feel.kind)) ? { kind: item.feel.kind as SongFeel["kind"], amount: typeof item.feel.amount === "number" && Number.isFinite(item.feel.amount) ? Math.max(50, Math.min(75, item.feel.amount)) : 66.7 } : undefined;
    const rawPlaybackFeel = item.playbackFeel && typeof item.playbackFeel === "object" ? item.playbackFeel as SongPlaybackFeel : undefined;
    const playbackFeel: SongPlaybackFeel | undefined = rawPlaybackFeel ? {
      swing: typeof rawPlaybackFeel.swing === "number" && Number.isFinite(rawPlaybackFeel.swing) ? Math.max(50, Math.min(75, rawPlaybackFeel.swing)) : undefined,
      humanizeAmount: typeof rawPlaybackFeel.humanizeAmount === "number" && Number.isFinite(rawPlaybackFeel.humanizeAmount) ? Math.max(0, Math.min(100, rawPlaybackFeel.humanizeAmount)) : undefined,
      humanizeVelocityAmount: typeof rawPlaybackFeel.humanizeVelocityAmount === "number" && Number.isFinite(rawPlaybackFeel.humanizeVelocityAmount) ? Math.max(0, Math.min(100, rawPlaybackFeel.humanizeVelocityAmount)) : undefined
    } : undefined;
    const rawAutomation = item.automation && typeof item.automation === "object" ? item.automation as SongSectionAutomation : undefined;
    const automation: SongSectionAutomation | undefined = rawAutomation ? {
      volumeFrom: typeof rawAutomation.volumeFrom === "number" && Number.isFinite(rawAutomation.volumeFrom) ? Math.max(0, Math.min(1, rawAutomation.volumeFrom)) : undefined,
      volumeTo: typeof rawAutomation.volumeTo === "number" && Number.isFinite(rawAutomation.volumeTo) ? Math.max(0, Math.min(1, rawAutomation.volumeTo)) : undefined,
      cymbalFrom: typeof rawAutomation.cymbalFrom === "number" && Number.isFinite(rawAutomation.cymbalFrom) ? Math.max(0, Math.min(1, rawAutomation.cymbalFrom)) : undefined,
      cymbalTo: typeof rawAutomation.cymbalTo === "number" && Number.isFinite(rawAutomation.cymbalTo) ? Math.max(0, Math.min(1, rawAutomation.cymbalTo)) : undefined,
      mutedVoices: Array.isArray(rawAutomation.mutedVoices) ? [...new Set(rawAutomation.mutedVoices.filter((voice): voice is SongInstrument => voices.includes(voice)))].slice(0, voices.length) : undefined,
      voices: rawAutomation.voices && typeof rawAutomation.voices === "object" ? Object.fromEntries(Object.entries(rawAutomation.voices).filter(([voice, curve]) => voices.includes(voice as SongInstrument) && curve && typeof curve === "object").map(([voice, curve]) => { const value = curve as { volumeFrom?: unknown; volumeTo?: unknown }; return [voice, { volumeFrom: typeof value.volumeFrom === "number" && Number.isFinite(value.volumeFrom) ? Math.max(0, Math.min(1, value.volumeFrom)) : undefined, volumeTo: typeof value.volumeTo === "number" && Number.isFinite(value.volumeTo) ? Math.max(0, Math.min(1, value.volumeTo)) : undefined }]; })) as SongSectionAutomation["voices"] : undefined
    } : undefined;
    sections.push({ id: bounded(item.id, 100) || id(), name: bounded(item.name, 80) || "Section", kind: sectionKinds.includes(item.kind) ? item.kind : "other", notes: bounded(item.notes, 2000), parts, feel, playbackFeel, kitMix: normalizeSongSectionKitMix(item.kitMix), clips, rehearsalCues, repeats: Number.isInteger(item.repeats) ? Math.max(1, Math.min(32, Number(item.repeats))) : undefined, bpm: typeof item.bpm === "number" && Number.isFinite(item.bpm) ? Math.max(40, Math.min(200, Number(item.bpm))) : undefined, meter: item.meter ? bounded(item.meter, 40) : undefined, tempoRamp: ramp, automation, marker: bounded(item.marker, 80) || undefined, pickupBeats: Number.isFinite(item.pickupBeats) ? Math.max(0.5, Math.min(8, Number(item.pickupBeats))) : undefined, endingGroup: bounded(item.endingGroup, 80) || undefined, endingPass, endingRepeats: Number.isInteger(item.endingRepeats) ? Math.max(2, Math.min(8, Number(item.endingRepeats))) : undefined });
  }
  const now = new Date().toISOString();
  const createdAt = typeof s.createdAt === "string" && !Number.isNaN(Date.parse(s.createdAt)) ? s.createdAt : now;
  const updatedAt = typeof s.updatedAt === "string" && !Number.isNaN(Date.parse(s.updatedAt)) ? s.updatedAt : createdAt;
  let source: DrumSong["source"];
  if (s.source && typeof s.source === "object" && /^https?:\/\//i.test(String(s.source.url))) source = { url: bounded(s.source.url, 2000), title: bounded(s.source.title, 100), attribution: bounded(s.source.attribution, 200), authorization: bounded(s.source.authorization, 200) };
  const rawKit = s.kitSetup && typeof s.kitSetup === "object" ? s.kitSetup : undefined;
  const kitSetup: SongKitSetup | undefined = rawKit ? { profileId: bounded(rawKit.profileId, 100) || undefined, kitType: ["acoustic", "electronic", "hybrid"].includes(String(rawKit.kitType)) ? rawKit.kitType as SongKitSetup["kitType"] : undefined, tuning: bounded(rawKit.tuning, 200), cymbals: bounded(rawKit.cymbals, 300), pedal: bounded(rawKit.pedal, 200), notes: bounded(rawKit.notes, 1000) } : undefined;
  const rawSharedOrigin = s.sharedOrigin && typeof s.sharedOrigin === "object" ? s.sharedOrigin as Record<string, unknown> : undefined;
  const sharedOrigin = rawSharedOrigin && bounded(rawSharedOrigin.shareId, 100) && bounded(rawSharedOrigin.sourceSongId, 100) ? { shareId: bounded(rawSharedOrigin.shareId, 100), sourceSongId: bounded(rawSharedOrigin.sourceSongId, 100) } : undefined;
  const normalizedVoiceLabels: NonNullable<DrumSong["voiceLabels"]> = {};
  if (s.voiceLabels && typeof s.voiceLabels === "object" && !Array.isArray(s.voiceLabels)) {
    for (const [voice, label] of Object.entries(s.voiceLabels)) {
      if (!voices.includes(voice as SongInstrument) || typeof label !== "string") continue;
      const cleanLabel = bounded(label, 40);
      if (cleanLabel) normalizedVoiceLabels[voice as SongInstrument] = cleanLabel;
    }
  }
  const voiceLabels = Object.keys(normalizedVoiceLabels).length ? normalizedVoiceLabels : undefined;
  const rawReview = s.catalogReview && typeof s.catalogReview === "object" ? s.catalogReview : undefined;
  const reviewChecklist = rawReview?.checklist && typeof rawReview.checklist === "object" ? rawReview.checklist : undefined;
  const catalogReview: SongCatalogReview | undefined = rawReview && reviewChecklist && bounded(rawReview.reviewer, 80) && typeof rawReview.reviewedAt === "string" && Number.isFinite(Date.parse(rawReview.reviewedAt)) && bounded(rawReview.arrangementFingerprint, 120) ? {
    reviewer: bounded(rawReview.reviewer, 80), reviewedAt: rawReview.reviewedAt,
    arrangementFingerprint: bounded(rawReview.arrangementFingerprint, 120), notes: bounded(rawReview.notes, 1000),
    checklist: { notation: reviewChecklist.notation === true, meter: reviewChecklist.meter === true, sticking: reviewChecklist.sticking === true, skillMetadata: reviewChecklist.skillMetadata === true },
  } : undefined;
  const arrangementAutomation = Array.isArray(s.arrangementAutomation) ? s.arrangementAutomation.flatMap((point) => point && Number.isFinite(point.beat) && point.beat >= 0 && point.beat <= 100_000 && (point.instrument === undefined || voices.includes(point.instrument)) ? [{ beat: Math.round(point.beat * 1000) / 1000, instrument: point.instrument, volume: typeof point.volume === "number" && Number.isFinite(point.volume) ? Math.max(0, Math.min(1, point.volume)) : undefined, pan: typeof point.pan === "number" && Number.isFinite(point.pan) ? Math.max(-1, Math.min(1, point.pan)) : undefined, velocity: typeof point.velocity === "number" && Number.isFinite(point.velocity) ? Math.max(0, Math.min(2, point.velocity)) : undefined }] : []).slice(0, 512) : undefined;
  return { id: bounded(s.id, 100) || id(), sharedOrigin, catalogReview, voiceLabels, arrangementAutomation: arrangementAutomation?.length ? arrangementAutomation : undefined, kitSetup, referenceTempoMap: normalizeTempoAnchors(s.referenceTempoMap), title, artist, difficulty: levels.includes(s.difficulty as Level) ? s.difficulty as Level : "Beginner", bpm: Math.max(40, Math.min(200, Number(s.bpm) || 80)), meter: bounded(s.meter, 20) || "4/4", tags: Array.isArray(s.tags) ? s.tags.filter((t): t is string => typeof t === "string").slice(0, 12).map((t) => t.slice(0, 40)) : [], source, notes: bounded(s.notes, 4000), sections, createdAt, updatedAt, archived: s.archived === true, bundled: s.bundled === true, arrangementLocked: s.arrangementLocked === true };
}
export function migrateSongLibrary(input: unknown): SongLibraryState {
  if (!input || typeof input !== "object" || (input as { version?: unknown }).version !== 1) return emptySongLibrary();
  const state = input as Record<string, unknown>;
  const list = (value: unknown, max: number): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item)).slice(0, max) : [];
  const ids = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 100))].slice(0, 500) : [];
  const number = (value: unknown, fallback = 0, min = 0, max = 100) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const timestamp = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
  const stringMap = (value: unknown): Record<string, string> => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([key, child]) => key.length <= 100 && typeof child === "string").slice(0, 500).map(([key, child]) => [key, bounded(child, 100)])) : {};
  const plans = (value: unknown) => list(value, 100).filter((item) => bounded(item.id, 100) && bounded(item.name, 80)).map((item) => ({ id: bounded(item.id, 100), name: bounded(item.name, 80), songIds: ids(item.songIds), sectionIds: stringMap(item.sectionIds), targets: item.targets && typeof item.targets === "object" && !Array.isArray(item.targets) ? Object.fromEntries(Object.entries(item.targets).slice(0, 500).flatMap(([key, raw]) => { if (!raw || typeof raw !== "object") return []; const target = raw as Record<string, unknown>; return [[key, { partId: bounded(target.partId, 100) || undefined, repetitions: Math.round(number(target.repetitions, 1, 1, 20)), bpm: typeof target.bpm === "number" ? number(target.bpm, 80, 40, 200) : undefined }]]; })) : {} }));
  const songs = list(state.songs, 500).map(normalizeSong).filter((song): song is DrumSong => song !== null);
  const progress: SongProgress[] = list(state.progress, 2000).filter((item) => typeof item.songId === "string" && typeof item.sectionId === "string").map((item) => ({ learnerId: bounded(item.learnerId, 80) || "default", songId: bounded(item.songId, 100), sectionId: bounded(item.sectionId, 100), sessions: Math.round(number(item.sessions, 0, 0, 1000000)), bestScore: number(item.bestScore), mastery: number(item.mastery), confidence: number(item.confidence), dueAt: timestamp(item.dueAt), lastPracticedAt: timestamp(item.lastPracticedAt), recentScores: Array.isArray(item.recentScores) ? item.recentScores.filter((score): score is number => typeof score === "number" && Number.isFinite(score)).slice(-20).map((score) => number(score)) : [], attempts: list(item.attempts, 500).filter((attempt) => bounded(attempt.id, 100) && bounded(attempt.partId, 100) && timestamp(attempt.playedAt) && typeof attempt.score === "number" && typeof attempt.bpm === "number" && ["keyboard", "touch", "midi", "audio", "self", "unknown"].includes(String(attempt.inputMode))).slice(-50).map((attempt) => ({ id: bounded(attempt.id, 100), partId: bounded(attempt.partId, 100), bpm: number(attempt.bpm, 80, 40, 200), score: number(attempt.score), playedAt: timestamp(attempt.playedAt)!, inputMode: attempt.inputMode as SongAttempt["inputMode"], completePart: attempt.completePart !== false, timing: normalizeAttemptTiming(attempt.timing), stickingChecked: typeof attempt.stickingChecked === "number" ? Math.round(number(attempt.stickingChecked, 0, 0, 1000000)) : undefined, stickingCorrect: typeof attempt.stickingCorrect === "number" ? Math.min(Math.round(number(attempt.stickingCorrect, 0, 0, 1000000)), Math.round(number(attempt.stickingChecked, 0, 0, 1000000))) : undefined, tempoScale: typeof attempt.tempoScale === "number" ? number(attempt.tempoScale, 1, 0.2, 5) : undefined, patternFingerprint: bounded(attempt.patternFingerprint, 100) || undefined, engine: ["pad", "trainer", "song"].includes(String(attempt.engine)) ? attempt.engine as SongAttempt["engine"] : undefined })) }));
    const recordings: SongRecording[] = list(state.recordings, 100).filter((item) => bounded(item.id, 100) && bounded(item.songId, 100) && timestamp(item.createdAt)).map((item) => ({ learnerId: bounded(item.learnerId, 80) || "default", id: bounded(item.id, 100), name: bounded(item.name,120)||undefined, songId: bounded(item.songId, 100), sectionId: bounded(item.sectionId, 100) || undefined, createdAt: timestamp(item.createdAt)!, durationMs: number(item.durationMs, 0, 0, 86400000), clockAligned: item.clockAligned===true, trimmedFrom: bounded(item.trimmedFrom,100)||undefined, alignmentOffsetMs: number(item.alignmentOffsetMs, 0, -5000, 5000), mimeType: bounded(item.mimeType, 100) || "audio/webm", hitCount: Math.round(number(item.hitCount, 0, 0, 1000000)), timingConsistency: typeof item.timingConsistency === "number" ? number(item.timingConsistency) : null, matchedHits: number(item.matchedHits, 0, 0, 1000000), missedTargets: number(item.missedTargets, 0, 0, 1000000), extraHits: number(item.extraHits, 0, 0, 1000000), meanOffsetMs: typeof item.meanOffsetMs === "number" ? number(item.meanOffsetMs, 0, 0, 100000) : null, targetBpm: typeof item.targetBpm === "number" ? number(item.targetBpm, 80, 40, 200) : undefined, patternFingerprint: bounded(item.patternFingerprint, 20000) || undefined, confidence: ["low", "medium", "high","reviewed"].includes(String(item.confidence)) ? item.confidence as SongRecording["confidence"] : "low", onsetTimes: Array.isArray(item.onsetTimes) ? item.onsetTimes.filter((time): time is number => typeof time === "number" && Number.isFinite(time) && time >= 0).slice(0, 500) : [], expectedTimes: Array.isArray(item.expectedTimes) ? item.expectedTimes.filter((time): time is number => typeof time === "number" && Number.isFinite(time) && time >= 0).slice(0, 500) : [], reviewedMatches:Array.isArray(item.reviewedMatches)?item.reviewedMatches.slice(0,500).flatMap(raw=>{if(!raw||typeof raw!=="object")return [];const match=raw as {onsetIndex?:unknown;expectedIndex?:unknown;instrument?:unknown};if(!Number.isInteger(match.onsetIndex)||Number(match.onsetIndex)<0||Number(match.onsetIndex)>=500||match.expectedIndex!==null&&(!Number.isInteger(match.expectedIndex)||Number(match.expectedIndex)<0||Number(match.expectedIndex)>=500))return [];const allowed=SONG_INSTRUMENTS.includes(match.instrument as SongInstrument);return [{onsetIndex:Number(match.onsetIndex),expectedIndex:match.expectedIndex===null?null:Number(match.expectedIndex),instrument:allowed?match.instrument as SongInstrument:undefined}];}):undefined }));
  return {
    version: 1, songs, customGrooves: parseCustomGrooves(JSON.stringify(state.customGrooves ?? [])), goals: normalizeGoals(state.goals), practicePresets: normalizePresets(state.practicePresets), savedSearches: normalizeSavedSearches(state.savedSearches),
    collections: list(state.collections, 100).filter((item) => bounded(item.id, 100)).map((item) => ({ id: bounded(item.id, 100), name: bounded(item.name, 80) || "Collection", songIds: ids(item.songIds), smartRules: normalizeSmartCollectionRules(item.smartRules) })),
    favorites: ids(state.favorites), progress, queues: plans(state.queues).map((queue) => ({ ...queue, learnerId: bounded(list(state.queues, 100).find((item) => item.id === queue.id)?.learnerId, 80) || "default" })), setlists: plans(state.setlists).map((plan) => { const raw = list(state.setlists, 100).find((item) => item.id === plan.id); const entries = normalizeSetlistEntries(raw?.entries); return { ...plan, notes: bounded(raw?.notes, 2000), kitProfileId: bounded(raw?.kitProfileId, 100) || undefined, transitions: normalizeSetlistTransitions(raw?.transitions), entries, ...(entries ? { songIds: entries.map(entry => entry.songId) } : {}) }; }),
    kitProfiles: list(state.kitProfiles, 100).flatMap((item) => {
      const profileId = bounded(item.id, 100), name = bounded(item.name, 80);
      if (!profileId || !name) return [];
      const availableVoices = Array.isArray(item.availableVoices) ? [...new Set(item.availableVoices.filter((voice): voice is SongInstrument => voices.includes(voice as SongInstrument)))].slice(0, voices.length) : [];
      const rawNotes = item.midiNotes && typeof item.midiNotes === "object" && !Array.isArray(item.midiNotes) ? item.midiNotes as Record<string, unknown> : {};
      const midiNotes: Partial<Record<SongInstrument, number>> = {};
      for (const voice of voices) if (Number.isInteger(rawNotes[voice]) && Number(rawNotes[voice]) >= 0 && Number(rawNotes[voice]) <= 127) midiNotes[voice] = Number(rawNotes[voice]);
      return [{ id: profileId, name, kitType: ["acoustic", "electronic", "hybrid"].includes(String(item.kitType)) ? item.kitType as SongKitProfile["kitType"] : "acoustic", tuning: bounded(item.tuning, 200), cymbals: bounded(item.cymbals, 300), pedal: bounded(item.pedal, 200), notes: bounded(item.notes, 1000), availableVoices, midiNotes }];
    }),
    rehearsalRuns: list(state.rehearsalRuns, 500).flatMap((item) => {
      const runId = bounded(item.id, 100), setlistId = bounded(item.setlistId, 100), startedAt = timestamp(item.startedAt);
      if (!runId || !setlistId || !startedAt) return [];
      const entries = list(item.entries, 500).filter(entry => bounded(entry.id, 100) && bounded(entry.songId, 100)).map(entry => ({ id: bounded(entry.id, 100), songId: bounded(entry.songId, 100), sectionId: bounded(entry.sectionId, 100) || undefined, partId: bounded(entry.partId, 100) || undefined, bpm: typeof entry.bpm === "number" ? number(entry.bpm, 80, 40, 200) : undefined, repetitions: typeof entry.repetitions === "number" ? Math.round(number(entry.repetitions, 1, 1, 20)) : undefined, breakSeconds: typeof entry.breakSeconds === "number" ? number(entry.breakSeconds, 0, 0, 3600) : undefined, countInBeats: typeof entry.countInBeats === "number" ? Math.round(number(entry.countInBeats, 4, 0, 16)) : undefined, transitionNote: bounded(entry.transitionNote, 500) || undefined, outcome: ["solid", "wobbly", "retry", "skipped"].includes(String(entry.outcome)) ? entry.outcome as SetlistRunOutcome : undefined, note: bounded(entry.note, 500) || undefined, completedAt: timestamp(entry.completedAt) }));
      return [{ learnerId: bounded(item.learnerId, 80) || "default", id: runId, setlistId, setlistName: bounded(item.setlistName, 100) || "Setlist", startedAt, completedAt: timestamp(item.completedAt), entries }];
    }),
    journals: list(state.journals, 1000).filter((item) => bounded(item.id, 100) && bounded(item.songId, 100) && typeof item.text === "string").map((item) => ({ learnerId: bounded(item.learnerId, 80) || "default", id: bounded(item.id, 100), songId: bounded(item.songId, 100), sectionId: bounded(item.sectionId, 100) || undefined, text: bounded(item.text, 2000), createdAt: timestamp(item.createdAt) ?? new Date(0).toISOString() })),
    notes: list(state.notes, 2000).filter((item) => bounded(item.id, 100) && bounded(item.songId, 100) && typeof item.text === "string" && ["annotation", "bookmark", "stage-cue", "reference"].includes(String(item.kind))).map((item) => ({ learnerId: bounded(item.learnerId, 80) || "default", id: bounded(item.id, 100), songId: bounded(item.songId, 100), sectionId: bounded(item.sectionId, 100) || undefined, bar: Number.isInteger(item.bar) ? Math.max(1, Math.min(20000, Number(item.bar))) : undefined, beat: typeof item.beat === "number" && Number.isFinite(item.beat) ? Math.max(1, Math.min(32, item.beat)) : undefined, text: bounded(item.text, 2000), kind: item.kind as SongNote["kind"], url: typeof item.url === "string" && /^https?:\/\//i.test(item.url) ? item.url.slice(0, 2000) : undefined })),
    schedules: list(state.schedules, 500).filter((item) => bounded(item.id, 100) && bounded(item.songId, 100) && timestamp(item.dueAt)).map((item) => ({ learnerId: bounded(item.learnerId, 80) || "default", id: bounded(item.id, 100), songId: bounded(item.songId, 100), dueAt: timestamp(item.dueAt)!, note: bounded(item.note, 200) })),
    recordings,
    referenceTracks: list(state.referenceTracks, 100).filter(item => bounded(item.id, 100) && bounded(item.songId, 100) && timestamp(item.createdAt)).map(item => ({ learnerId: bounded(item.learnerId, 80) || "default", id: bounded(item.id, 100), songId: bounded(item.songId, 100), sectionId: bounded(item.sectionId, 100) || undefined, name: bounded(item.name, 120) || "Reference audio", createdAt: timestamp(item.createdAt)!, durationMs: number(item.durationMs, 0, 0, 1800000), mimeType: /^audio\//i.test(String(item.mimeType)) ? bounded(item.mimeType, 100) : "audio/webm", sectionStartMs: number(item.sectionStartMs, 0, 0, 1800000), sectionEndMs: typeof item.sectionEndMs === "number" ? number(item.sectionEndMs, 0, 0, 1800000) : undefined, loopSection: item.loopSection === true, playbackRate: number(item.playbackRate, 1, 0.5, 1.25) })),
    learningPaths: list(state.learningPaths, 100).filter(item => bounded(item.id, 100) && bounded(item.title, 100)).map(item => ({ learnerId: bounded(item.learnerId, 80) || "default", id: bounded(item.id, 100), title: bounded(item.title, 100), summary: bounded(item.summary, 500), style: bounded(item.style, 60) || undefined, meter: bounded(item.meter, 30) || undefined, skill: bounded(item.skill, 80) || undefined, difficulty: levels.includes(item.difficulty as Level) ? item.difficulty as Level : undefined, prerequisitePathId: bounded(item.prerequisitePathId, 100) || undefined, createdAt: timestamp(item.createdAt) ?? new Date(0).toISOString(), steps: list(item.steps, 100).filter(step => bounded(step.id, 100) && bounded(step.songId, 100) && bounded(step.sectionId, 100) && bounded(step.partId, 100)).map(step => ({ id: bounded(step.id, 100), songId: bounded(step.songId, 100), sectionId: bounded(step.sectionId, 100), partId: bounded(step.partId, 100), label: bounded(step.label, 120) || "Practice step", targetBpm: Math.round(number(step.targetBpm, 80, 40, 200)), minimumScore: Math.round(number(step.minimumScore, 80, 1, 100)), passes: Math.round(number(step.passes, 3, 1, 20)) })) })),
    reviews: list(state.reviews, 2000).filter((item) => bounded(item.songId, 100) && bounded(item.sectionId, 100) && timestamp(item.dueAt) && ["again", "hard", "good", "easy"].includes(String(item.result))).map((item) => ({ learnerId: bounded(item.learnerId, 80) || "default", songId: bounded(item.songId, 100), sectionId: bounded(item.sectionId, 100), dueAt: timestamp(item.dueAt)!, result: item.result as SectionReview["result"], intervalDays: number(item.intervalDays, 1, 0.01, 3650) })),
    tempoRamps: list(state.tempoRamps, 500).filter((item) => bounded(item.id, 100) && bounded(item.songId, 100) && bounded(item.sectionId, 100)).map((item) => ({ learnerId: bounded(item.learnerId, 80) || "default", id: bounded(item.id, 100), songId: bounded(item.songId, 100), sectionId: bounded(item.sectionId, 100), startBpm: number(item.startBpm, 80, 40, 200), targetBpm: number(item.targetBpm, 100, 40, 200), currentBpm: number(item.currentBpm, 80, 40, 200), stepBpm: number(item.stepBpm, 5, 1, 20), successfulPasses: Math.round(number(item.successfulPasses, 0, 0, 1000000)) })),
    checklists: list(state.checklists, 100).filter((item) => bounded(item.id, 100)).map((item) => ({ id: bounded(item.id, 100), name: bounded(item.name, 80) || "Checklist", items: list(item.items, 100).filter((entry) => bounded(entry.id, 100) && typeof entry.text === "string").map((entry) => ({ id: bounded(entry.id, 100), text: bounded(entry.text, 200), done: entry.done === true })) })),
    snapshots: list(state.snapshots, 200).flatMap((item) => { if (!bounded(item.id, 100) || !bounded(item.songId, 100)) return []; const valid = normalizeSong({ title: "Snapshot", artist: "Drum Hero", sections: item.sections, arrangementAutomation:item.arrangementAutomation, voiceLabels:item.voiceLabels }); return valid ? [{ id: bounded(item.id, 100), songId: bounded(item.songId, 100), label: bounded(item.label, 80) || "Snapshot", bpm: typeof item.bpm === "number" ? number(item.bpm, 80, 40, 200) : undefined, meter: bounded(item.meter, 20) || undefined, referenceTempoMap: normalizeTempoAnchors(item.referenceTempoMap), arrangementAutomation:valid.arrangementAutomation, voiceLabels:valid.voiceLabels, sections: valid.sections, createdAt: timestamp(item.createdAt) ?? new Date(0).toISOString(), automatic:item.automatic===true }] : []; }),
    roles: list(state.roles, 100).filter((item) => bounded(item.id, 100)).map((item) => ({ id: bounded(item.id, 100), name: bounded(item.name, 80), responsibility: bounded(item.responsibility, 200), claimedBy: bounded(item.claimedBy, 80) || undefined, assignments: item.assignments && typeof item.assignments === "object" && !Array.isArray(item.assignments) ? Object.fromEntries(Object.entries(item.assignments).slice(0, 100).flatMap(([key, raw]) => raw && typeof raw === "object" && bounded((raw as { sectionId?: unknown }).sectionId, 100) && bounded((raw as { partId?: unknown }).partId, 100) ? [[key.slice(0, 200), { sectionId: bounded((raw as { sectionId?: unknown }).sectionId, 100), partId: bounded((raw as { partId?: unknown }).partId, 100) }]] : [])) : undefined })),
    rubricAssessments: list(state.rubricAssessments, 1000).map(normalizeRehearsalRubricAssessment).filter((item): item is RehearsalRubricAssessment => item !== null)
  };
}
export function readSongLibrary(): SongLibraryState { if (typeof window === "undefined") return emptySongLibrary(); try { const state = migrateSongLibrary(JSON.parse(localStorage.getItem(SONG_LIBRARY_KEY) || "null")); const localGrooves = parseCustomGrooves(localStorage.getItem("drum-hero:custom-grooves:v1")); const merged = [...new Map([...localGrooves, ...(state.customGrooves ?? [])].map(item => [item.id, item])).values()].slice(-100); return { ...state, customGrooves: merged }; } catch { return emptySongLibrary(); } }
export function readActiveSongLibrary(): SongLibraryState { return songLibraryForLearner(readSongLibrary(), learnerProfileIdFromBrowser()); }
/** Local editing protection; this is not an account permission boundary. */
export type ArrangementSaveOptions = { unlockSongId?: string; unlockSongIds?: string[] };
export function assertArrangementChangesAllowed(previous: SongLibraryState, next: SongLibraryState, options: ArrangementSaveOptions = {}) {
  const signature = (song: DrumSong) => { const clean = normalizeSong(song)!; return JSON.stringify({ bpm: clean.bpm, meter: clean.meter, sections: clean.sections }); };
  const unlocked = new Set([options.unlockSongId, ...(options.unlockSongIds ?? [])].filter((value): value is string => typeof value === "string"));
  for (const song of previous.songs.filter(song => song.arrangementLocked)) {
    const replacement = next.songs.find(item => item.id === song.id);
    if ((!replacement || signature(song) !== signature(replacement) || !replacement.arrangementLocked) && !unlocked.has(song.id)) throw new Error(`“${song.title}” is approved and locked. Unlock its arrangement in Song Library before editing or replacing it.`);
  }
}
export function writeSongLibrary(state: SongLibraryState, options: ArrangementSaveOptions = {}) { assertArrangementChangesAllowed(readSongLibrary(), state, options); localStorage.setItem(SONG_LIBRARY_KEY, JSON.stringify(state)); if (Array.isArray(state.customGrooves)) { localStorage.setItem("drum-hero:custom-grooves:v1", JSON.stringify(state.customGrooves.slice(-100))); window.dispatchEvent(new CustomEvent("drum-hero:custom-grooves-change")); } window.dispatchEvent(new Event("drum-hero:song-library-change")); }
export function allSongs(state: SongLibraryState) { return [...examples.filter((example) => !state.songs.some((song) => song.id === example.id)), ...state.songs]; }
export function findSongs(songs: DrumSong[], query: string, difficulty = "All") { const q = query.trim().toLowerCase(); return songs.filter((s) => !s.archived && (difficulty === "All" || s.difficulty === difficulty) && (!q || [s.title, s.artist, s.meter, ...s.tags].some((v) => v.toLowerCase().includes(q)))); }
export function songPartPattern(song: DrumSong, section: SongSection, part: DrumPart): PracticePattern { const supported = new Set<Instrument>(["kick", "snare", "hihat", "tom", "crash"]); return { id: `song:${song.id}:${section.id}:${part.id}`, name: `${song.title} · ${section.name} · ${part.name}`, level: song.difficulty, description: [song.artist, section.notes, part.notes].filter(Boolean).join(" · "), subdivision: part.subdivision, beats: part.beats, defaultBpm: part.bpm, tempoRange: [40, 200], hits: part.hits.filter((hit): hit is SongPartHit & { instrument: Instrument } => supported.has(hit.instrument as Instrument)).map((hit) => ({ step: hit.step, instrument: hit.instrument, accent: hit.accent })) }; }
export function recordSongScore(state: SongLibraryState, songId: string, sectionId: string, rawScore: number, context?: SongPracticeContext): SongLibraryState {
  const learnerId = learnerProfileIdFromBrowser();
  const learnerState = songLibraryForLearner(state, learnerId);
  const score = Math.max(0, Math.min(100, Math.round(Number.isFinite(rawScore) ? rawScore : 0)));
  const previous = learnerState.progress.find((p) => p.songId === songId && p.sectionId === sectionId);
  const practicedAt = new Date().toISOString();
  const originalPart = context && allSongs(state).find((song) => song.id === songId)?.sections.find((section) => section.id === sectionId)?.parts.find((part) => part.id === context.partId);
  const completePart = context?.completePart !== false && (!(context?.engine === "pad" || context?.engine === "trainer") || !originalPart?.hits.some((hit) => !["kick", "snare", "hihat", "tom", "crash"].includes(hit.instrument)));
  const attempt: SongAttempt | undefined = context ? { ...context, completePart, patternFingerprint: originalPart ? songPartEvidenceFingerprint(originalPart) : undefined, id: crypto.randomUUID(), score, playedAt: practicedAt } : undefined;
  const reviewResult: SectionReview["result"] = score >= 90 ? "easy" : score >= 80 ? "good" : score >= 60 ? "hard" : "again";
  const reviewIntervalDays = reviewResult === "again" ? 0.25 : reviewResult === "hard" ? 1 : reviewResult === "good" ? 2 : 4;
  const next: SongProgress = { learnerId, songId, sectionId, sessions: (previous?.sessions ?? 0) + 1, bestScore: Math.max(previous?.bestScore ?? 0, score), mastery: previous ? Math.round((previous.mastery + score) / 2) : score, confidence: previous?.confidence ?? 0, dueAt: completePart ? new Date(Date.parse(practicedAt) + reviewIntervalDays * 86400000).toISOString() : previous?.dueAt, lastPracticedAt: practicedAt, recentScores: [...(previous?.recentScores ?? []), score].slice(-20), attempts: [...(previous?.attempts ?? []), ...(attempt ? [attempt] : [])].slice(-50) };
  const goals = learnerState.goals?.map(goal=>attempt&&goalAccepts(goal,attempt,songId,sectionId)?{...goal,creditedAttemptIds:[...new Set([...(goal.creditedAttemptIds??[]),attempt.id])].slice(0,goal.passes)}:goal) ?? [];
  const progressed: SongLibraryState = { ...state, goals: [...(state.goals ?? []).filter((goal) => (goal.learnerId ?? "default") !== learnerId), ...goals], progress: [...state.progress.filter((item) => (item.learnerId ?? "default") !== learnerId || item.songId !== songId || item.sectionId !== sectionId), next] };
  return completePart && learnerState.reviews.some((review) => review.songId === songId && review.sectionId === sectionId)
    ? reviewSection(progressed, songId, sectionId, reviewResult, new Date(practicedAt))
    : progressed;
}
function mergeSongProgress(local: SongProgress[], remote: SongProgress[]): SongProgress[] {
  const result = new Map<string, SongProgress>();
  for (const item of [...remote, ...local]) {
    const key = JSON.stringify([item.learnerId ?? "default", item.songId, item.sectionId]), previous = result.get(key);
    if (!previous) { result.set(key, item); continue; }
    const attempts = [...new Map([...(previous.attempts ?? []), ...(item.attempts ?? [])].map((attempt) => [attempt.id, attempt])).values()].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id)).slice(-50);
    const latest = (item.lastPracticedAt ?? "") >= (previous.lastPracticedAt ?? "") ? item : previous;
    result.set(key, { ...latest, attempts, sessions: Math.max(item.sessions, previous.sessions, attempts.length), bestScore: Math.max(item.bestScore, previous.bestScore), recentScores: attempts.length ? attempts.slice(-20).map((attempt) => attempt.score) : latest.recentScores });
  }
  return [...result.values()];
}
export function mergeSongLibraries(local: SongLibraryState, remote: SongLibraryState): SongLibraryState { const merge = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...b, ...a].map((x) => [x.id, x])).values()]; return { version: 1, goals: merge(local.goals??[],remote.goals??[]).map(goal=>({...goal,creditedAttemptIds:[...new Set([...(local.goals?.find(g=>g.id===goal.id)?.creditedAttemptIds??[]),...(remote.goals?.find(g=>g.id===goal.id)?.creditedAttemptIds??[])])].slice(0,goal.passes)})), songs: merge(local.songs, remote.songs), customGrooves: merge(local.customGrooves??[],remote.customGrooves??[]).slice(-100), kitProfiles: merge(local.kitProfiles??[],remote.kitProfiles??[]), rehearsalRuns: merge(local.rehearsalRuns??[],remote.rehearsalRuns??[]).slice(-500), collections: merge(local.collections, remote.collections), favorites: [...new Set([...local.favorites, ...remote.favorites])], progress: mergeSongProgress(local.progress, remote.progress), queues: merge(local.queues, remote.queues), setlists: merge(local.setlists, remote.setlists), practicePresets: merge(local.practicePresets??[],remote.practicePresets??[]), savedSearches: merge(local.savedSearches??[],remote.savedSearches??[]), journals: merge(local.journals, remote.journals), notes: merge(local.notes, remote.notes), schedules: merge(local.schedules, remote.schedules), recordings: merge(local.recordings, remote.recordings), referenceTracks: merge(local.referenceTracks??[], remote.referenceTracks??[]), learningPaths: merge(local.learningPaths??[],remote.learningPaths??[]), rubricAssessments: merge(local.rubricAssessments ?? [], remote.rubricAssessments ?? []), reviews: [...new Map([...remote.reviews, ...local.reviews].map((x) => [`${x.learnerId ?? "default"}:${x.songId}:${x.sectionId}`, x])).values()], tempoRamps: merge(local.tempoRamps, remote.tempoRamps), checklists: merge(local.checklists, remote.checklists), snapshots: merge(local.snapshots, remote.snapshots), roles: merge(local.roles, remote.roles) }; }
export function newSong(title: string, artist: string): DrumSong { return normalizeSong({ title, artist, difficulty: "Beginner", bpm: 80, meter: "4/4", tags: [], notes: "", sections: [], createdAt: new Date().toISOString() })!; }
const example = (key: string, title: string, bpm: number, hits: SongPartHit[], options: { meter?: string; beats?: number; subdivision?: 4 | 8 | 12 | 16; difficulty?: Level; tags?: string[]; feel?: SongFeel; notes?: string; sections?: SongSection[] } = {}): DrumSong => {
  const { meter = "4/4", beats = 4, subdivision = 8, difficulty = "Beginner", tags = [], feel, notes = "Original practice composition for Drum Hero." } = options;
  const sections = options.sections ?? [{ id: "verse", name: "Verse", kind: "verse" as const, feel, notes: "Learn the groove, then keep it steady through the full phrase.", parts: [{ id: "main", name: "Main groove", bpm, beats, subdivision, meter, hits }] }];
  return { id: `example-${key}`, title, artist: "Drum Hero Originals", difficulty, bpm, meter, tags: ["original", "practice", ...tags], notes, sections, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", bundled: true };
};
const hats = (steps: number[], instrument: SongInstrument = "hihat"): SongPartHit[] => steps.map(step => ({ step, instrument }));
const hits = (instrument: SongInstrument, steps: number[], extra: Partial<SongPartHit> = {}): SongPartHit[] => steps.map(step => ({ step, instrument, ...extra }));
export const examples: DrumSong[] = [
  example("steady-road", "Steady Road", 82, [...hats(Array.from({ length: 8 }, (_, step) => step)), ...hits("kick", [0, 4]), ...hits("snare", [2, 6])], { tags: ["rock", "skill-backbeat", "straight"] }),
  example("open-sky", "Open Sky", 96, [...hats([0, 2, 4, 6]), ...hits("kick", [0, 3, 4]), ...hits("snare", [2, 6]), ...hits("tom", [7])], { tags: ["pop", "skill-eighth-notes", "straight"] }),
  example("paper-lantern-parade", "Paper Lantern Parade", 92, [...hats([0, 1, 2, 3, 4, 5, 6, 7]), ...hits("kick", [0, 4]), ...hits("snare", [2, 6]), ...hits("crash", [0])], { tags: ["pop", "skill-backbeat", "skill-crash-cue", "straight"], notes: "A bright original groove for keeping an even eighth-note pulse while landing the backbeat." }),
  example("pocket-garden", "Pocket Garden", 104, [...hats([0, 1, 2, 3, 4, 5, 6, 7]), ...hits("kick", [0, 3, 5]), ...hits("snare", [2, 6]), ...hits("snare", [5], { ghost: true, velocity: 38 })], { difficulty: "Intermediate", tags: ["funk", "skill-syncopation", "skill-ghost-notes", "straight"], notes: "Keep the snare backbeat clear while the kick moves around it. The quiet snare on step six is a ghost note." }),
  example("three-steps-home", "Three Steps Home", 78, [...hats([0, 1, 2, 3, 4, 5]), ...hits("kick", [0]), ...hits("snare", [2])], { meter: "3/4", beats: 3, difficulty: "Beginner", tags: ["waltz", "skill-three-four", "straight"], notes: "Count one, two, three. Let the first beat feel grounded and keep the remaining two beats light." }),
  example("window-rain-shuffle", "Window Rain Shuffle", 86, [...hats([0, 2, 3, 5, 6, 8, 9, 11]), ...hits("kick", [0, 6]), ...hits("snare", [3, 9])], { subdivision: 12, difficulty: "Intermediate", feel: { kind: "shuffle", amount: 66.7 }, tags: ["blues", "shuffle", "skill-triplets"], notes: "Use a relaxed triplet subdivision. Keep the skipped middle triplet space consistent." }),
  example("night-shift-signals", "Night Shift Signals", 118, [...hats([0, 1, 2, 3, 4, 5, 6], "ride"), ...hits("kick", [0, 3, 4]), ...hits("snare", [2, 6]), ...hits("crash", [0]), ...hits("openhat", [7])], { difficulty: "Intermediate", tags: ["rock", "skill-cymbals", "skill-eighth-notes", "straight"], notes: "Move the steady pulse to the ride cymbal. Open the hi-hat on the final offbeat and return to closed hats on the next phrase." }),
  example("copper-clock", "Copper Clock", 105, [...hats([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], "ride"), ...hits("kick", [0, 6]), ...hits("snare", [4, 8]), ...hits("crash", [0]), ...hits("rimshot", [8])], { meter: "5/4", beats: 5, difficulty: "Advanced", tags: ["odd-meter", "skill-five-four", "skill-rimshot", "straight"], notes: "Count five even beats. Place the backbeat on beats three and five, then loop until the longer bar feels settled." }),
  example("quiet-machines", "Quiet Machines", 72, [...hats([0, 1, 2, 3, 4, 5, 6, 7]), ...hits("kick", [0, 5]), ...hits("snare", [4]), ...hits("snare", [3], { ghost: true, velocity: 36 })], { difficulty: "Beginner", tags: ["rock", "half-time", "skill-dynamics", "straight"], notes: "Keep the backbeat wide and relaxed. Let the quiet snare note sit below the main backbeat without changing the pulse." }),
  example("porchlight-bossa", "Porchlight Bossa", 112, [...hats([0, 2, 4, 6, 8, 10, 12, 14]), ...hits("kick", [0, 3, 8, 11]), ...hits("snare", [4, 12]), ...hits("snare", [6, 14], { ghost: true, velocity: 34 })], { subdivision: 16, difficulty: "Intermediate", tags: ["bossa", "latin", "syncopation", "straight"], notes: "Keep the eighth-note ride steady while the kick answers between the main beats. Touch the quiet snare notes lightly." }),
  example("seven-lanterns", "Seven Lanterns", 98, [...hats(Array.from({ length: 14 }, (_, step) => step)), ...hits("kick", [0, 6, 8]), ...hits("snare", [4, 10]), ...hits("tom", [12, 13])], { meter: "7/8", beats: 7, difficulty: "Advanced", tags: ["odd-meter", "seven-eight", "skill-counting", "straight"], notes: "Group the seven eighth notes as 2 + 2 + 3. Let the two-tom pickup lead into the next bar without adding an eighth note." }),
  example("bright-exit", "Bright Exit", 144, [...hats([0, 1, 2, 3, 4, 5, 6, 7]), ...hits("kick", [0, 1, 4, 5]), ...hits("snare", [2, 6]), ...hits("crash", [0])], { difficulty: "Intermediate", tags: ["punk", "rock", "skill-eighth-notes", "straight"], notes: "Drive the eighth-note pulse evenly. Keep the kick pattern even under the snare backbeats and save the crash for the bar entrance." }),
  example("paper-bridges", "Paper Bridges", 90, [], { difficulty: "Beginner", tags: ["rock", "backbeat", "skill-dynamics"], notes: "A two-section original for building a steady backbeat, then adding a confident chorus entrance.", sections: [
    { id: "verse", name: "Verse", kind: "verse", notes: "Keep the eighth-note hats even and let the kick and snare sit comfortably in the pocket.", parts: [{ id: "verse-groove", name: "Steady backbeat", bpm: 90, beats: 4, subdivision: 8, meter: "4/4", hits: [...hats([0, 1, 2, 3, 4, 5, 6, 7]), ...hits("kick", [0, 4]), ...hits("snare", [2, 6])] }] },
    { id: "chorus", name: "Chorus", kind: "chorus", notes: "Add a crash at the entrance without changing the backbeat.", parts: [{ id: "chorus-groove", name: "Open chorus", bpm: 90, beats: 4, subdivision: 8, meter: "4/4", hits: [...hats([0, 1, 2, 3, 4, 5, 6, 7]), ...hits("kick", [0, 3, 4]), ...hits("snare", [2, 6]), ...hits("crash", [0])] }] },
  ] }),
  example("tideglass-shuffle", "Tideglass Shuffle", 84, [], { difficulty: "Intermediate", tags: ["blues", "shuffle", "skill-triplets", "skill-dynamics"], feel: { kind: "shuffle", amount: 66.7 }, notes: "A two-section shuffle study. Keep the skipped middle triplet space relaxed, then use the tom pickup to return to the groove.", sections: [
    { id: "verse", name: "Verse", kind: "verse", feel: { kind: "shuffle", amount: 66.7 }, notes: "Play the triplet ride softly and keep the snare backbeat unhurried.", parts: [{ id: "shuffle-groove", name: "Triplet shuffle", bpm: 84, beats: 4, subdivision: 12, meter: "4/4", hits: [...hats([0, 3, 6, 9], "ride"), ...hits("kick", [0, 6]), ...hits("snare", [3, 9])] }] },
    { id: "turnaround", name: "Turnaround", kind: "fill", feel: { kind: "shuffle", amount: 66.7 }, notes: "Keep the pulse going while the final tom pickup leads back to beat one.", parts: [{ id: "turnaround-fill", name: "Tom turnaround", bpm: 84, beats: 4, subdivision: 12, meter: "4/4", hits: [...hats([0, 3, 6, 9], "ride"), ...hits("kick", [0, 6]), ...hits("snare", [3]), ...hits("tom", [8, 10, 11])] }] },
  ] }),
  example("northbound-switch", "Northbound Switch", 112, [], { difficulty: "Advanced", tags: ["rock", "sixteenth-notes", "skill-syncopation", "skill-fills"], notes: "A two-section original for keeping a steady cymbal pulse beneath syncopated sixteenth-note kicks and a short tom fill.", sections: [
    { id: "verse", name: "Verse", kind: "verse", notes: "Keep the ride even. Say the sixteenth-note kick placements before bringing them up to tempo.", parts: [{ id: "switch-groove", name: "Syncopated groove", bpm: 112, beats: 4, subdivision: 16, meter: "4/4", hits: [...hats([0, 2, 4, 6, 8, 10, 12, 14], "ride"), ...hits("kick", [0, 3, 8, 11]), ...hits("snare", [4, 12]), ...hits("crash", [0])] }] },
    { id: "fill", name: "Fill", kind: "fill", notes: "Move the last beat to the toms and land the next downbeat with a crash.", parts: [{ id: "switch-fill", name: "Four-beat tom fill", bpm: 112, beats: 4, subdivision: 16, meter: "4/4", hits: [...hats([0, 2, 4, 6, 8, 10], "ride"), ...hits("kick", [0, 8]), ...hits("snare", [4]), ...hits("tom", [12, 13, 14]), ...hits("crash", [0])] }] },
  ] })
];

export function reviewSection(state: SongLibraryState, songId: string, sectionId: string, result: SectionReview["result"], at = new Date()): SongLibraryState { const learnerId = learnerProfileIdFromBrowser(), old = state.reviews.find((r) => (r.learnerId ?? "default") === learnerId && r.songId === songId && r.sectionId === sectionId); const intervalDays = result === "again" ? 0.25 : result === "hard" ? 1 : result === "good" ? Math.max(2, (old?.intervalDays ?? 1) * 2) : Math.max(4, (old?.intervalDays ?? 1) * 3); const review: SectionReview = { learnerId, songId, sectionId, result, intervalDays, dueAt: new Date(at.getTime() + intervalDays * 86400000).toISOString() }; return { ...state, reviews: [...state.reviews.filter((r) => r !== old), review] }; }
export function advanceTempoRamp(state: SongLibraryState, rampId: string, success: boolean): SongLibraryState { return { ...state, tempoRamps: state.tempoRamps.map((ramp) => ramp.id === rampId ? { ...ramp, successfulPasses: ramp.successfulPasses + (success ? 1 : 0), currentBpm: success ? Math.min(ramp.targetBpm, ramp.currentBpm + ramp.stepBpm) : Math.max(ramp.startBpm, ramp.currentBpm - ramp.stepBpm) } : ramp) }; }
export function readiness(state: SongLibraryState, song: DrumSong) {
  const parts = song.sections.flatMap((section) => section.parts.filter((part) => part.hits.length && (!section.clips || section.clips.some(clip=>clip.partId===part.id))).map((part) => {
    const progress = state.progress.find((p) => p.songId === song.id && p.sectionId === section.id);
    const targetBpm = section.bpm ?? song.bpm;
    const qualified = (progress?.attempts ?? []).filter((attempt) => attempt.partId === part.id && attempt.patternFingerprint === songPartEvidenceFingerprint(part) && (attempt.engine === "song" && attempt.tempoScale !== undefined ? attempt.tempoScale >= 0.98 && attempt.tempoScale <= 1.05 : attempt.bpm >= targetBpm * 0.98 && attempt.bpm <= targetBpm * 1.05) && attempt.completePart !== false && !["self", "unknown"].includes(attempt.inputMode)).slice(-3);
    const mastery = qualified.length ? Math.round(qualified.reduce((sum, attempt) => sum + attempt.score, 0) / qualified.length) : 0;
    return { section, part, mastery, targetBpm, attemptCount: qualified.length };
  }));
  const mastery = parts.length ? Math.round(parts.reduce((sum, item) => sum + item.mastery, 0) / parts.length) : 0;
  const due = state.reviews.some((review) => review.songId === song.id && Date.parse(review.dueAt) <= Date.now());
  const reasons = parts.filter((item) => item.mastery < 80 || item.attemptCount < 3).map((item) => item.attemptCount < 3 ? `Record ${3 - item.attemptCount} more scored ${3 - item.attemptCount === 1 ? "pass" : "passes"} for ${item.section.name} / ${item.part.name} at ${item.targetBpm} BPM` : `Raise ${item.section.name} / ${item.part.name} to 80% at ${item.targetBpm} BPM`);
  if (due) reasons.push("Complete the overdue section review");
  if (!parts.length) reasons.push("Add at least one playable drum part");
  return { parts, mastery, ready: parts.length > 0 && reasons.length === 0, due, reasons, targetMastery: 80 };
}

function normalizeAttemptTiming(value: unknown): AttemptTiming | undefined {
  if(!value||typeof value!=="object")return undefined;
  const timing=value as AttemptTiming;
  if(!Number.isFinite(timing.meanOffsetMs)||!Number.isFinite(timing.missed)||!Number.isFinite(timing.extra))return undefined;
  const allowedVoices = SONG_INSTRUMENTS;
  return {meanOffsetMs:Math.max(-1000,Math.min(1000,timing.meanOffsetMs)),missed:Math.max(0,Math.min(100000,Math.round(timing.missed))),extra:Math.max(0,Math.min(100000,Math.round(timing.extra))),voices:Array.isArray(timing.voices)?timing.voices.filter(voice=>voice&&allowedVoices.includes(voice.instrument)&&Number.isFinite(voice.missed)).slice(0,allowedVoices.length).map(voice=>({instrument:voice.instrument,missed:Math.max(0,Math.min(100000,Math.round(voice.missed)))})):[],bars:Array.isArray(timing.bars)?timing.bars.slice(0,1000).flatMap(item=>item&&Number.isInteger(item.bar)&&Number.isFinite(item.targets)&&Number.isFinite(item.missed)&&(item.meanOffsetMs===null||Number.isFinite(item.meanOffsetMs))&&allowedVoices.includes(item.instrument)?[{bar:Math.max(1,Math.min(20000,item.bar)),instrument:item.instrument,targets:Math.max(0,Math.min(100000,Math.round(item.targets))),missed:Math.max(0,Math.min(100000,Math.round(item.missed))),meanOffsetMs:item.meanOffsetMs===null?null:Math.max(-1000,Math.min(1000,item.meanOffsetMs))}]:[]):undefined,events:Array.isArray(timing.events)?timing.events.slice(0,1000).flatMap(item=>item&&Number.isInteger(item.bar)&&Number.isFinite(item.beat)&&item.beat>=0&&allowedVoices.includes(item.instrument)&&(item.offsetMs===null||Number.isFinite(item.offsetMs))?[{bar:Math.max(1,Math.min(20000,item.bar)),beat:Math.max(0,Math.min(64,item.beat)),instrument:item.instrument,offsetMs:item.offsetMs===null?null:Math.max(-1000,Math.min(1000,item.offsetMs)),confidence:typeof item.confidence==="number"&&Number.isFinite(item.confidence)?Math.max(0,Math.min(1,item.confidence)):undefined,sticking:item.sticking==="R"||item.sticking==="L"?item.sticking:undefined,playedSticking:item.playedSticking==="R"||item.playedSticking==="L"?item.playedSticking:undefined}]:[]):undefined};
}
function normalizeSetlistTransitions(value: unknown): Record<string,SetlistTransition> {
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).slice(0,500).flatMap(([key,raw])=>{if(!raw||typeof raw!=="object"||key.length>100)return [];const item=raw as SetlistTransition;return [[key,{breakSeconds:Number.isFinite(item.breakSeconds)?Math.max(0,Math.min(3600,Math.round(item.breakSeconds))):0,countInBeats:Number.isFinite(item.countInBeats)?Math.max(0,Math.min(16,Math.round(item.countInBeats))):4,note:typeof item.note==="string"?item.note.slice(0,500):""}]];}));
}
