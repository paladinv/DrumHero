import { classifyOffset, findClosestExpected, stepDurationMs, summarizeHits } from "./scoring";
import type { Instrument, PracticePattern, RatedHit } from "./types";

export type EarLevel = "pulse" | "rhythm" | "triplet" | "groove";
export type EarMode = "play" | "identify" | "meter" | "grouping" | "feel" | "feel-detail" | "dictation" | "error" | "voice" | "voice-change" | "dropout" | "tempo-ramp" | "tempo-transfer" | "tempo-estimate";
export type EarMeter = "4/4" | "3/4" | "6/8" | "5/4" | "5/8" | "7/8" | "9/8" | "11/8" | "12/8" | "13/8";
export type EarFeel = "straight" | "swing" | "shuffle" | "pushed" | "laid-back";
export type EarFeelDetail = { kind: "swing" | "pocket"; value: number };
export type EarGrooveStyle = "free" | "rock" | "funk" | "clave";
export type EarSkill = "rests" | "offbeats" | "sixteenth-notes" | "triplets" | "syncopation" | "voice-separation" | "meter" | "meter-grouping" | "swing" | "pocket" | "error-detection" | "pulse-stability" | "cross-rhythm" | "quintuplets" | "tempo-control";
export type EarAttempt = { instrument: Instrument; atMs: number; velocity?: number };
export type EarExerciseOptions = { meter?: EarMeter; feel?: EarFeel; bars?: 1 | 2; style?: EarGrooveStyle; focus?: EarSkill; complexity?: 1 | 2 | 3; grouping?: number[] };
export type EarComparison = { pattern: PracticePattern; changed: boolean; instrument?: Instrument; fromStep?: number; toStep?: number; changedVoice?: Instrument };
export type EarExercise = { pattern: PracticePattern; choices: PracticePattern[]; answer: number; meter: EarMeter; feel: EarFeel; bars: 1 | 2; style: EarGrooveStyle; focus?: EarSkill; complexity: 1 | 2 | 3; grouping?: number[]; groupingChoices?: number[][]; comparison?: EarComparison; voice?: Instrument; changedVoice?: Instrument; sourceBpm?: number; feelDetail?: EarFeelDetail; feelDetailChoices?: number[]; lessonId?: string };
export type EarVoiceStats = { instrument: Instrument; expected: number; matched: number; extra: number; meanOffsetMs: number | null };
export type EarTimingCell = { beat: number; subdivision: number; expected: number; matched: number; missed: number; extra: number; meanOffsetMs: number | null };
export type EarAssignment = { id: string; learnerName: string; dueAt: string; assignedAt: string };
export type EarErrorCell = { instrument: Instrument; step: number; rating: "miss" | "extra" | "early" | "late" };
export type EarTeacherReportResult = { score: number; playedAt: string; bpm?: number; meter?: EarMeter; mode: EarMode; dynamicsScore?: number | null; challengeIndex?: number; itemName?: string; errorCells?: EarErrorCell[] };
export type EarTeacherReport = { id: string; assignmentId: string; learnerName: string; packName: string; dueAt: string; submittedAt: string; results: EarTeacherReportResult[] };
export type EarResult = { id: string; playedAt: string; level: EarLevel; mode: EarMode; score: number; replays: number; assisted: boolean; skills?: EarSkill[]; meter?: EarMeter; feel?: EarFeel; grouping?: number[]; bars?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; style?: EarGrooveStyle; focus?: EarSkill; complexity?: 1 | 2 | 3; voice?: Instrument; lessonId?: string; bpm?: number; sourceBpm?: number; subdivision?: 4 | 8 | 12 | 16 | 20; input?: "pads" | "microphone" | "midi"; meanOffsetMs?: number | null; timedHits?: number; voiceStats?: EarVoiceStats[]; timingCells?: EarTimingCell[]; errorCells?: EarErrorCell[]; dynamicsScore?: number | null; challengePackId?: string; challengePackIndex?: number; assignmentId?: string; weeklyChallengeId?: string };
export type EarReviewItem = { skill: EarSkill; dueAt: string; intervalDays: 1 | 2 | 3 | 7 | 14; streak: number; lastScore: number };
export type EarChallengeItem = { id: string; level: EarLevel; meter: EarMeter; feel: EarFeel; grouping?: number[]; bars: 1 | 2; style: EarGrooveStyle; complexity: 1 | 2 | 3; pattern: PracticePattern };
export type EarChallengePack = { id: string; name: string; createdAt: string; items: EarChallengeItem[]; assignment?: EarAssignment };
export type EarChallengePackPayload = { name: string; items: EarChallengeItem[]; assignment?: EarAssignment };
function isEarVoiceStats(value: unknown): value is EarVoiceStats[] {
  const instruments: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
  return Array.isArray(value) && value.length <= instruments.length && value.every((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const stat = entry as Partial<EarVoiceStats>;
    return instruments.includes(stat.instrument as Instrument) && Number.isInteger(stat.expected) && Number(stat.expected) >= 0
      && Number.isInteger(stat.matched) && Number(stat.matched) >= 0 && Number(stat.matched) <= Number(stat.expected)
      && Number.isInteger(stat.extra) && Number(stat.extra) >= 0
      && (stat.meanOffsetMs === null || typeof stat.meanOffsetMs === "number" && Number.isFinite(stat.meanOffsetMs) && Math.abs(stat.meanOffsetMs) <= 200);
  });
}
function isEarTimingCells(value: unknown): value is EarTimingCell[] {
  return Array.isArray(value) && value.length <= 128 && value.every((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const cell = entry as Partial<EarTimingCell>;
    return Number.isInteger(cell.beat) && Number(cell.beat) >= 1 && Number(cell.beat) <= 32
      && Number.isInteger(cell.subdivision) && Number(cell.subdivision) >= 1 && Number(cell.subdivision) <= 8
      && Number.isInteger(cell.expected) && Number(cell.expected) >= 0 && Number(cell.expected) <= 100
      && Number.isInteger(cell.matched) && Number(cell.matched) >= 0 && Number(cell.matched) <= Number(cell.expected)
      && Number.isInteger(cell.missed) && Number(cell.missed) >= 0 && Number(cell.missed) <= Number(cell.expected)
      && Number.isInteger(cell.extra) && Number(cell.extra) >= 0 && Number(cell.extra) <= 100
      && (cell.meanOffsetMs === null || typeof cell.meanOffsetMs === "number" && Number.isFinite(cell.meanOffsetMs) && Math.abs(cell.meanOffsetMs) <= 200);
  });
}
function isEarErrorCells(value: unknown): value is EarErrorCell[] {
  const instruments: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
  return Array.isArray(value) && value.length <= 192 && value.every((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const cell = entry as Partial<EarErrorCell>;
    return instruments.includes(cell.instrument as Instrument) && Number.isInteger(cell.step) && Number(cell.step) >= 0 && Number(cell.step) <= 319
      && ["miss", "extra", "early", "late"].includes(cell.rating as string);
  });
}
export const EAR_HISTORY_KEY = "drum-hero:ear-training:v1";
export const EAR_REVIEW_KEY = "drum-hero:ear-training-review:v1";
export const EAR_TEACHER_REPORTS_KEY = "drum-hero:ear-training-teacher-reports:v1";
export const EAR_CHALLENGE_PACKS_KEY = "drum-hero:ear-training-packs:v1";
export const EAR_LEVELS: Array<{ id: EarLevel; label: string; description: string }> = [
  { id: "pulse", label: "Single drum · eighth notes", description: "Remember a short rhythm of hits and rests." },
  { id: "rhythm", label: "Single drum · sixteenth notes", description: "Hear shorter gaps and offbeat snare rhythms." },
  { id: "triplet", label: "Tuplets and compound feel", description: "Hear triplet, quintuplet, and compound-meter patterns." },
  { id: "groove", label: "Grooves and cross-rhythms", description: "Remember layered grooves, syncopation, and cross-rhythms." },
];
export const EAR_METERS: EarMeter[] = ["4/4", "3/4", "6/8", "5/4", "5/8", "7/8", "9/8", "11/8", "12/8", "13/8"];
export const EAR_FEELS: EarFeel[] = ["straight", "swing", "shuffle", "pushed", "laid-back"];
export const EAR_GROOVE_STYLES: EarGrooveStyle[] = ["free", "rock", "funk", "clave"];

const groovePattern = (id: string, name: string, subdivision: number, hits: Array<[number, Instrument]>): PracticePattern => ({
  id: `ear-lesson-${id}`, name, level: "Beginner", description: "A curated groove lesson.", beats: 4, subdivision: subdivision as 8 | 12 | 16,
  defaultBpm: 84, tempoRange: [40, 140], hits: hits.map(([step, instrument]) => ({ step, instrument })),
});

export const EAR_GROOVE_LESSONS: Array<{ id: string; name: string; concept: string; hint: string; meter: EarMeter; feel: EarFeel; style: EarGrooveStyle; pattern: PracticePattern; level?: EarLevel; focus?: EarSkill }> = [
  { id: "backbeat", name: "1 · The backbeat", concept: "Hear kick on beats 1 and 3, snare on 2 and 4, with steady eighth-note hi-hat.", hint: "Let the hi-hat mark the small even pulses; the snare answers on the backbeat.", meter: "4/4", feel: "straight", style: "rock", pattern: groovePattern("backbeat", "Steady backbeat", 8, [[0,"kick"],[2,"snare"],[4,"kick"],[6,"snare"],...[0,1,2,3,4,5,6,7].map(step => [step,"hihat"] as [number, Instrument])]) },
  { id: "half-time", name: "2 · Half-time pocket", concept: "Keep the same four-beat bar, but move the snare accent to beat 3.", hint: "Count all four beats even though the backbeat lands less often.", meter: "4/4", feel: "straight", style: "rock", pattern: groovePattern("half-time", "Half-time pocket", 8, [[0,"kick"],[4,"snare"],...[0,1,2,3,4,5,6,7].map(step => [step,"hihat"] as [number, Instrument])]) },
  { id: "shuffle", name: "3 · Triplet shuffle", concept: "Use a long-short subdivision: the middle triplet slot stays quiet.", hint: "Feel each beat as three, and place the repeating hi-hat on the first and third parts.", meter: "4/4", feel: "shuffle", style: "rock", pattern: groovePattern("shuffle", "Triplet shuffle", 12, [[0,"kick"],[3,"snare"],[6,"kick"],[9,"snare"],...[0,2,3,5,6,8,9,11].map(step => [step,"hihat"] as [number, Instrument])]) },
  { id: "clave", name: "4 · Clave syncopation", concept: "Notice how the five-note clave phrase creates a repeating 3+2 shape across two bars.", hint: "Listen for the long gap after the third note; do not pull the final pair onto the beat.", meter: "4/4", feel: "straight", style: "clave", pattern: { ...groovePattern("clave", "Clave phrase", 16, [[0,"hihat"],[6,"hihat"],[12,"hihat"],[18,"hihat"],[22,"hihat"],[0,"kick"],[16,"kick"],[8,"snare"],[24,"snare"]]), beats: 8, description: "A two-bar clave-inspired phrase." } },
  { id: "compound-six", name: "5 · Compound six", concept: "Hear six even eighth notes grouped as two broad dotted-quarter pulses.", hint: "Feel the larger pulse on eighth notes 1 and 4 while the hi-hat keeps all six subdivisions audible.", meter: "6/8", feel: "straight", style: "rock", pattern: { ...groovePattern("compound-six", "Compound six groove", 8, [[0,"kick"],[3,"snare"],...[0,1,2,3,4,5].map(step => [step,"hihat"] as [number, Instrument])]), beats: 3, description: "A simple 6/8 groove with two broad pulses." } },
  { id: "seven-eight", name: "6 · Grouped seven", concept: "Keep a steady eighth-note subdivision while the bar groups as 2 + 2 + 3.", hint: "Count 1-2, 1-2, 1-2-3; let the final group feel longer without changing the eighth-note spacing.", meter: "7/8", feel: "straight", style: "funk", pattern: { ...groovePattern("seven-eight", "Grouped 7/8 groove", 8, [[0,"kick"],[2,"snare"],[4,"kick"],[0,"hihat"],[1,"hihat"],[2,"hihat"],[3,"hihat"],[4,"hihat"],[5,"hihat"],[6,"hihat"]]), beats: 3.5, description: "A 7/8 groove grouped 2 + 2 + 3." } },
  { id: "offbeat-rests", name: "7 · Offbeats and rests", concept: "Hear a sixteenth-note phrase where some notes lean between the main beats and other spaces stay silent.", hint: "Keep the quarter-note pulse in your body; count 1-e-&-a and listen for the empty slots.", meter: "4/4", feel: "straight", style: "free", level: "rhythm", focus: "offbeats", pattern: { ...groovePattern("offbeat-rests", "Offbeats and rests", 16, [[0,"snare"],[3,"snare"],[6,"snare"],[10,"snare"],[14,"snare"]]), beats: 4, description: "A syncopated single-drum phrase with rests." } },
  { id: "cross-rhythm-32", name: "8 · Three over two", concept: "Hear three evenly spaced snare notes crossing two steady quarter-note pulses, with the layers meeting again at the start.", hint: "Count the quarter pulse and the triplet layer separately; do not speed up either part to make them line up.", meter: "4/4", feel: "straight", style: "free", level: "groove", focus: "cross-rhythm", pattern: { id: "ear-lesson-cross-rhythm-32", name: "Three over two", level: "Advanced", description: "A two-bar 3:2 cross-rhythm study.", beats: 8, subdivision: 12, defaultBpm: 72, tempoRange: [40, 140], hits: [...[0, 6, 12, 18].map(step => ({ step, instrument: "kick" as Instrument, accent: true })), ...[0, 3, 6, 9, 12, 15, 18, 21].map(step => ({ step, instrument: "hihat" as Instrument })), ...[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map(step => ({ step, instrument: "snare" as Instrument, velocityTarget: step % 6 === 0 ? 112 : 76 }))] } },
  { id: "quintuplets-54", name: "9 · Five over four", concept: "Hear five evenly spaced notes across four quarter-note beats while the hi-hat marks the four-beat pulse.", hint: "Count five equal snare notes across the whole bar, then notice where they cross the four steady beats.", meter: "4/4", feel: "straight", style: "free", level: "triplet", focus: "quintuplets", pattern: { id: "ear-lesson-quintuplets-54", name: "Five over four", level: "Advanced", description: "A five-note tuplet crossing four quarter-note beats.", beats: 4, subdivision: 20, defaultBpm: 68, tempoRange: [40, 140], hits: [...[0, 10].map(step => ({ step, instrument: "kick" as Instrument, accent: true })), ...[0, 5, 10, 15].map(step => ({ step, instrument: "hihat" as Instrument })), ...[0, 4, 8, 12, 16].map(step => ({ step, instrument: "snare" as Instrument }))] } },
  { id: "nine-eight", name: "10 · Compound nine", concept: "Hear nine eighth notes grouped as three broad dotted-quarter pulses.", hint: "Count 1-la-li three times. Keep the eighth notes even as the groups repeat.", meter: "9/8", feel: "straight", style: "rock", pattern: { id: "ear-lesson-nine-eight", name: "Compound 9/8", level: "Intermediate", description: "A 9/8 pattern grouped 3 + 3 + 3.", beats: 4.5, subdivision: 8, defaultBpm: 78, tempoRange: [40, 140], hits: [...[0, 4, 7].map(step => ({ step, instrument: "kick" as Instrument, accent: true })), ...Array.from({ length: 9 }, (_, step) => ({ step, instrument: "hihat" as Instrument })), ...[3, 6].map(step => ({ step, instrument: "snare" as Instrument }))] } },
  { id: "twelve-eight", name: "11 · Compound twelve", concept: "Hear twelve eighth notes grouped as four broad dotted-quarter pulses.", hint: "Count 1-la-li four times. Notice how 12/8 can have the same broad pulse as a slow four-beat groove.", meter: "12/8", feel: "straight", style: "rock", pattern: { id: "ear-lesson-twelve-eight", name: "Compound 12/8", level: "Intermediate", description: "A 12/8 pattern grouped 3 + 3 + 3 + 3.", beats: 6, subdivision: 8, defaultBpm: 78, tempoRange: [40, 140], hits: [...[0, 6].map(step => ({ step, instrument: "kick" as Instrument, accent: true })), ...Array.from({ length: 12 }, (_, step) => ({ step, instrument: "hihat" as Instrument })), ...[3, 9].map(step => ({ step, instrument: "snare" as Instrument }))] } },
  { id: "polyrhythm-43", name: "12 · Four over three", concept: "Hear four evenly spaced snare notes crossing three steady quarter-note beats.", hint: "Keep the kick on the three-beat pulse while the snare divides the same span into four equal parts.", meter: "3/4", feel: "straight", style: "free", level: "groove", focus: "cross-rhythm", pattern: { id: "ear-lesson-polyrhythm-43", name: "Four over three", level: "Advanced", description: "A 4:3 cross-rhythm over one bar of 3/4.", beats: 3, subdivision: 16, defaultBpm: 68, tempoRange: [40, 140], hits: [...[0, 4, 8].map(step => ({ step, instrument: "kick" as Instrument, accent: true })), ...[0, 3, 6, 9].map(step => ({ step, instrument: "snare" as Instrument, velocityTarget: step === 0 ? 112 : 78 }))] } },
  { id: "polyrhythm-53", name: "13 · Five over three", concept: "Hear five evenly spaced snare notes across three steady quarter-note beats.", hint: "Count the quarter pulse separately from the five-note snare cycle; both meet again at the bar line.", meter: "3/4", feel: "straight", style: "free", level: "groove", focus: "cross-rhythm", pattern: { id: "ear-lesson-polyrhythm-53", name: "Five over three", level: "Advanced", description: "A 5:3 cross-rhythm over one bar of 3/4.", beats: 3, subdivision: 20, defaultBpm: 64, tempoRange: [40, 140], hits: [...[0, 5, 10].map(step => ({ step, instrument: "kick" as Instrument, accent: true })), ...[0, 3, 6, 9, 12].map(step => ({ step, instrument: "snare" as Instrument, velocityTarget: step === 0 ? 112 : 78 }))] } },
];

const PACK_INSTRUMENTS: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
const PACK_LEVELS: EarLevel[] = ["pulse", "rhythm", "triplet", "groove"];
const PACK_SUBDIVISIONS = [8, 12, 16, 20] as const;
const MAX_CHALLENGE_PACK_BYTES = 256_000;
const MAX_CHALLENGE_PACK_ITEMS = 12;

function parseChallengeItems(value: unknown): EarChallengeItem[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CHALLENGE_PACK_ITEMS) return null;
  const items: EarChallengeItem[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Partial<EarChallengeItem>;
    const pattern = item.pattern;
    if (!PACK_LEVELS.includes(item.level as EarLevel) || !EAR_METERS.includes(item.meter as EarMeter)
      || !EAR_FEELS.includes(item.feel as EarFeel) || !EAR_GROOVE_STYLES.includes(item.style as EarGrooveStyle)
      || ![1, 2].includes(Number(item.bars)) || ![1, 2, 3].includes(Number(item.complexity))
      || !pattern || !PACK_SUBDIVISIONS.includes(pattern.subdivision as 8 | 12 | 16 | 20)
      || !Number.isFinite(pattern.beats) || pattern.beats <= 0 || pattern.beats > 16
      || !Number.isInteger(pattern.beats * pattern.subdivision / 4)
      || !Number.isFinite(pattern.defaultBpm) || pattern.defaultBpm < 40 || pattern.defaultBpm > 200
      || !Array.isArray(pattern.hits) || pattern.hits.length > 96
      || !pattern.hits.every(hit => !!hit && Number.isInteger(hit.step) && hit.step >= 0 && hit.step < pattern.beats * pattern.subdivision / 4 && PACK_INSTRUMENTS.includes(hit.instrument)
        && (hit.accent === undefined || typeof hit.accent === "boolean")
        && (hit.velocityTarget === undefined || Number.isFinite(hit.velocityTarget) && hit.velocityTarget >= 1 && hit.velocityTarget <= 127))) return null;
    const [meterNumerator, meterDenominator] = item.meter.split("/").map(Number);
    const beatsInBar = meterNumerator! * 4 / meterDenominator!;
    if (Math.abs(pattern.beats - beatsInBar * Number(item.bars)) > 0.01) return null;
    const grouping = Array.isArray(item.grouping) && item.grouping.length <= 7
      && item.grouping.every(value => Number.isInteger(value) && value >= 2 && value <= 3)
      && item.grouping.reduce((sum, value) => sum + value, 0) === meterNumerator
      ? item.grouping as number[] : undefined;
    if (item.grouping !== undefined && (!grouping || meterDenominator !== 8)) return null;
    items.push({
      id: `challenge-${index + 1}`,
      level: item.level as EarLevel,
      meter: item.meter as EarMeter,
      feel: item.feel as EarFeel,
      ...(grouping ? { grouping } : {}),
      bars: item.bars as 1 | 2,
      style: item.style as EarGrooveStyle,
      complexity: item.complexity as 1 | 2 | 3,
      pattern: {
        id: `challenge-pattern-${index + 1}`,
        name: typeof pattern.name === "string" ? pattern.name.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80) || `Rhythm ${index + 1}` : `Rhythm ${index + 1}`,
        level: "Beginner",
        description: "A shared rhythm challenge.",
        beats: pattern.beats,
        subdivision: pattern.subdivision as 8 | 12 | 16 | 20,
        defaultBpm: Math.round(pattern.defaultBpm),
        tempoRange: [40, 200],
        hits: pattern.hits.map(hit => ({ step: hit.step, instrument: hit.instrument, ...(hit.accent ? { accent: true } : {}), ...(Number.isFinite(hit.velocityTarget) ? { velocityTarget: hit.velocityTarget } : {}) })),
      },
    });
  }
  return items;
}

/** Accept only small, versioned packs containing bounded rhythm data; imported IDs and metadata are regenerated. */
export function parseEarChallengePack(raw: string): EarChallengePackPayload | null {
  if (raw.length > MAX_CHALLENGE_PACK_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("name" in value) || typeof value.name !== "string" || !("items" in value)) return null;
    const items = parseChallengeItems(value.items);
    if (!items) return null;
    const assignment = "assignment" in value ? parseEarAssignment(value.assignment) : null;
    return { name: value.name.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60) || "Shared rhythm pack", items, ...(assignment ? { assignment } : {}) };
  } catch { return null; }
}

function parseEarAssignment(value: unknown): EarAssignment | null {
  if (!value || typeof value !== "object") return null;
  const assignment = value as Partial<EarAssignment>;
  return typeof assignment.id === "string" && assignment.id.length > 0 && assignment.id.length <= 80
    && typeof assignment.learnerName === "string" && assignment.learnerName.trim().length > 0
    && typeof assignment.dueAt === "string" && Number.isFinite(Date.parse(assignment.dueAt))
    && typeof assignment.assignedAt === "string" && Number.isFinite(Date.parse(assignment.assignedAt))
    ? { id: assignment.id, learnerName: assignment.learnerName.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60), dueAt: assignment.dueAt, assignedAt: assignment.assignedAt }
    : null;
}

export function parseEarChallengePacks(raw: string | null): EarChallengePack[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("packs" in value) || !Array.isArray(value.packs)) return [];
    return value.packs.slice(-20).flatMap((entry): EarChallengePack[] => {
      if (!entry || typeof entry !== "object" || !("id" in entry) || typeof entry.id !== "string" || !("createdAt" in entry) || typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))) return [];
      const parsed = parseEarChallengePack(JSON.stringify({ version: 1, name: "name" in entry ? entry.name : "", items: "items" in entry ? entry.items : null, assignment: "assignment" in entry ? entry.assignment : undefined }));
      return parsed ? [{ id: entry.id.slice(0, 80), createdAt: entry.createdAt, ...parsed }] : [];
    });
  } catch { return []; }
}

export function parseEarTeacherReport(raw: string): EarTeacherReport | null {
  if (raw.length > 128_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("type" in value) || value.type !== "drum-hero-ear-report") return null;
    const assignment = parseEarAssignment("assignment" in value ? value.assignment : null);
    if (!assignment || !("packName" in value) || typeof value.packName !== "string" || !("submittedAt" in value) || typeof value.submittedAt !== "string" || !Number.isFinite(Date.parse(value.submittedAt)) || !("results" in value) || !Array.isArray(value.results) || value.results.length > 100) return null;
    const results: EarTeacherReportResult[] = [];
    for (const entry of value.results) {
      if (!entry || typeof entry !== "object" || !("score" in entry) || !Number.isFinite(entry.score) || entry.score < 0 || entry.score > 100 || !("playedAt" in entry) || typeof entry.playedAt !== "string" || !Number.isFinite(Date.parse(entry.playedAt)) || !("mode" in entry) || typeof entry.mode !== "string" || !["play", "identify", "meter", "grouping", "feel", "feel-detail", "dictation", "error", "voice", "voice-change", "dropout", "tempo-ramp", "tempo-transfer", "tempo-estimate"].includes(entry.mode)) return null;
      if (entry.errorCells !== undefined && !isEarErrorCells(entry.errorCells)) return null;
      results.push({ score: entry.score, playedAt: entry.playedAt, mode: entry.mode as EarMode, ...(typeof entry.bpm === "number" && Number.isFinite(entry.bpm) && entry.bpm >= 40 && entry.bpm <= 200 ? { bpm: entry.bpm } : {}), ...(typeof entry.meter === "string" && EAR_METERS.includes(entry.meter as EarMeter) ? { meter: entry.meter as EarMeter } : {}), ...(typeof entry.dynamicsScore === "number" && Number.isFinite(entry.dynamicsScore) && entry.dynamicsScore >= 0 && entry.dynamicsScore <= 100 ? { dynamicsScore: entry.dynamicsScore } : {}), ...(Number.isInteger(entry.challengeIndex) && Number(entry.challengeIndex) >= 0 && Number(entry.challengeIndex) <= 11 ? { challengeIndex: Number(entry.challengeIndex) } : {}), ...(typeof entry.itemName === "string" ? { itemName: entry.itemName.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80) } : {}), ...(entry.errorCells === undefined ? {} : { errorCells: entry.errorCells }) });
    }
    return { id: `${assignment.id}:${value.submittedAt}`.slice(0, 120), assignmentId: assignment.id, learnerName: assignment.learnerName, packName: value.packName.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60), dueAt: assignment.dueAt, submittedAt: value.submittedAt, results };
  } catch { return null; }
}

export function parseEarTeacherReports(raw: string | null): EarTeacherReport[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("reports" in value) || !Array.isArray(value.reports)) return [];
    return value.reports.slice(-50).flatMap((report): EarTeacherReport[] => {
      if (!report || typeof report !== "object") return [];
      const parsed = parseEarTeacherReport(JSON.stringify({ version: 1, type: "drum-hero-ear-report", assignment: { id: report.assignmentId, learnerName: report.learnerName, dueAt: report.dueAt, assignedAt: report.assignedAt ?? report.submittedAt }, packName: report.packName, submittedAt: report.submittedAt, results: report.results }));
      return parsed ? [{ ...parsed, id: typeof report.id === "string" ? report.id.slice(0, 80) : parsed.id }] : [];
    });
  } catch { return []; }
}

const EAR_SKILLS: EarSkill[] = ["rests", "offbeats", "sixteenth-notes", "triplets", "syncopation", "voice-separation", "meter", "meter-grouping", "swing", "pocket", "error-detection", "pulse-stability", "cross-rhythm", "quintuplets", "tempo-control"];

export function createEarComparison(pattern: PracticePattern, seed: number): EarComparison {
  let state = seed >>> 0;
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  const change = state % 2 === 0;
  if (!change) return { pattern, changed: false };
  const alternative = nearbyChoices(pattern, state ^ 0xa53c9e1)[0];
  if (!alternative) return { pattern, changed: false };
  const original = new Set(pattern.hits.map(hit => `${hit.instrument}:${hit.step}`));
  const changed = new Set(alternative.hits.map(hit => `${hit.instrument}:${hit.step}`));
  const from = pattern.hits.find(hit => !changed.has(`${hit.instrument}:${hit.step}`));
  const to = alternative.hits.find(hit => !original.has(`${hit.instrument}:${hit.step}`));
  return from && to ? { pattern: alternative, changed: true, instrument: from.instrument, fromStep: from.step, toStep: to.step } : { pattern, changed: false };
}

export function createEarVoiceComparison(pattern: PracticePattern, seed: number): EarComparison {
  const instruments = [...new Set(pattern.hits.map(hit => hit.instrument))];
  if (!instruments.length) return { pattern, changed: false };
  let state = seed >>> 0;
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  const instrument = instruments[state % instruments.length]!;
  const sourceHits = pattern.hits.filter(hit => hit.instrument === instrument);
  const source = sourceHits[(state >>> 8) % sourceHits.length]!;
  const total = totalSteps(pattern.beats, pattern.subdivision);
  const available = Array.from({ length: total }, (_, step) => step).filter(step => !pattern.hits.some(hit => hit.instrument === instrument && hit.step === step));
  if (!available.length) return { pattern, changed: false };
  const target = available[(state >>> 16) % available.length]!;
  const moved = pattern.hits.map(hit => hit === source ? { ...hit, step: target } : { ...hit });
  return { pattern: { ...pattern, id: `${pattern.id}-voice-change-${instrument}-${target}`, hits: moved.sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument)) }, changed: true, instrument, fromStep: source.step, toStep: target, changedVoice: instrument };
}

export function scoreEarDictation(pattern: PracticePattern, answer: Array<{ instrument: Instrument; step: number }>) {
  const expectedKeys = new Set(pattern.hits.map(hit => `${hit.instrument}:${hit.step}`));
  const answerKeys = new Set(answer.map(hit => `${hit.instrument}:${hit.step}`));
  const correct = [...expectedKeys].filter(key => answerKeys.has(key)).length;
  const precision = correct / Math.max(1, answerKeys.size);
  const recall = correct / Math.max(1, expectedKeys.size);
  const score = precision + recall === 0 ? 0 : Math.round(200 * precision * recall / (precision + recall));
  const rated = [
    ...pattern.hits.filter(hit => !answerKeys.has(`${hit.instrument}:${hit.step}`)).map(hit => ({ instrument: hit.instrument, rating: "miss" as const, offsetMs: null, atMs: hit.step, step: hit.step })),
    ...answer.filter(hit => !expectedKeys.has(`${hit.instrument}:${hit.step}`)).map(hit => ({ instrument: hit.instrument, rating: "extra" as const, offsetMs: null, atMs: hit.step, step: hit.step })),
    ...answer.filter(hit => expectedKeys.has(`${hit.instrument}:${hit.step}`)).map(hit => ({ instrument: hit.instrument, rating: "great" as const, offsetMs: 0, atMs: hit.step, step: hit.step })),
  ];
  const total = Math.max(1, pattern.hits.length);
  return { score, rated, summary: { score, placementScore: score, timingScore: correct ? 100 : 0, great: correct, good: 0, miss: Math.max(0, expectedKeys.size - correct), extra: Math.max(0, answerKeys.size - correct), combo: correct, total: pattern.hits.length } };
}

export function parseEarReviewSchedule(raw: string | null): EarReviewItem[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is EarReviewItem => !!item && typeof item === "object"
      && EAR_SKILLS.includes(item.skill) && typeof item.dueAt === "string" && Number.isFinite(Date.parse(item.dueAt))
      && [1, 2, 3, 7, 14].includes(item.intervalDays) && Number.isInteger(item.streak) && item.streak >= 0
      && Number.isFinite(item.lastScore) && item.lastScore >= 0 && item.lastScore <= 100).slice(-EAR_SKILLS.length);
  } catch { return []; }
}

export function updateEarReviewSchedule(schedule: EarReviewItem[], skills: EarSkill[], score: number, now = Date.now()): EarReviewItem[] {
  const next = new Map(schedule.map(item => [item.skill, item]));
  for (const skill of new Set(skills)) {
    const previous = next.get(skill);
    const streak = score >= 85 ? (previous?.streak ?? 0) + 1 : 0;
    const intervalDays: EarReviewItem["intervalDays"] = score >= 85
      ? streak <= 1 ? 3 : streak === 2 ? 7 : 14
      : score < 60 ? 1 : 2;
    const dueAt = new Date(now + intervalDays * 24 * 60 * 60 * 1000).toISOString();
    next.set(skill, { skill, dueAt, intervalDays, streak, lastScore: Math.round(score) });
  }
  return [...next.values()].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
}

function randomRows(seed: number, steps: number, minimum: number, maximum: number, count: number, available: number[] = Array.from({ length: steps }, (_, index) => index)) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const rows: number[][] = [];
  const used = new Set<string>();
  let attempts = 0;
  while (rows.length < count && attempts < count * 80) {
    attempts += 1;
    const number = minimum + Math.floor(random() * (maximum - minimum + 1));
    const pool = [...available];
    const picked: number[] = [];
    for (let i = 0; i < number; i++) {
      if (!pool.length) break;
      picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
    }
    picked.sort((a, b) => a - b);
    if (picked.length !== number) continue;
    const key = picked.join(",");
    if (used.has(key)) continue;
    used.add(key); rows.push(picked);
  }
  return rows;
}

function meterBeats(meter: EarMeter) {
  const [numerator, denominator] = meter.split("/").map(Number);
  return numerator! * 4 / denominator!;
}
function rotatedGroupings(values: number[]) {
  return values.map((_, index) => [...values.slice(index), ...values.slice(0, index)]);
}
/** Denominator-note groupings offered in the odd-meter listening lab. */
export function earMeterGroupings(meter: EarMeter): number[][] {
  const numerator = Number(meter.split("/")[0]);
  const curated: number[][] = meter === "5/8" ? [[2, 3], [3, 2]]
    : meter === "7/8" ? rotatedGroupings([2, 2, 3])
    : meter === "9/8" ? [[3, 3, 3], ...rotatedGroupings([2, 2, 2, 3])]
    : meter === "11/8" ? [...rotatedGroupings([3, 3, 3, 2]), ...rotatedGroupings([2, 2, 2, 2, 3])]
    : meter === "13/8" ? [...rotatedGroupings([3, 3, 3, 2, 2]), ...rotatedGroupings([2, 2, 2, 2, 2, 3]), ...rotatedGroupings([3, 2, 3, 2, 3])]
    : [];
  const unique = new Map<string, number[]>();
  for (const grouping of curated) if (grouping.reduce((sum, value) => sum + value, 0) === numerator) unique.set(grouping.join("+"), grouping);
  return [...unique.values()].slice(0, 8);
}
/** Quarter-note durations of the audible pulse groups in one bar. */
export function earMeterGroups(meter: EarMeter, grouping?: number[]): number[] {
  const [numerator, denominator] = meter.split("/").map(Number);
  if (denominator === 8) {
    const values = grouping?.reduce((sum, value) => sum + value, 0) === numerator ? grouping : meter === "6/8" || meter === "12/8" || meter === "9/8" ? Array.from({ length: numerator! / 3 }, () => 3) : earMeterGroupings(meter)[0] ?? [numerator!];
    return values.map(value => value / 2);
  }
  return Array.from({ length: numerator! }, () => 1);
}
function subdivisionFor(level: EarLevel, meter: EarMeter, feel: EarFeel, focus?: EarSkill): 8 | 12 | 16 | 20 {
  if (focus === "quintuplets") return 20;
  if (["5/8", "6/8", "7/8", "9/8", "11/8", "12/8", "13/8"].includes(meter)) return level === "pulse" ? 8 : 16;
  if (feel === "shuffle") return 12;
  if (level === "pulse") return 8;
  if (level === "triplet") return 12;
  return 16;
}
function totalSteps(beats: number, subdivision: number) { return beats * subdivision / 4; }

export function earPatternBank(level: EarLevel, options: EarExerciseOptions = {}): PracticePattern[] {
  const meter = options.meter ?? "4/4";
  const feel = options.feel ?? "straight";
  const bars = options.bars ?? 1;
  const beats = meterBeats(meter) * bars;
  const subdivision = options.focus === "cross-rhythm" ? 12 : subdivisionFor(level, meter, feel, options.focus);
  const steps = totalSteps(beats, subdivision);
  if (options.focus === "quintuplets" && meter === "4/4") {
    return Array.from({ length: 8 }, (_, index) => {
      const hits = Array.from({ length: bars }, (_, bar) => {
        const offset = bar * 20;
        const phase = index % 5;
        return [
          ...[0, 10].map(step => ({ step: offset + step, instrument: "kick" as const, accent: true })),
          ...[0, 5, 10, 15].map(step => ({ step: offset + step, instrument: "hihat" as const })),
          ...Array.from({ length: 5 }, (_, pulse) => ({ step: offset + (pulse * 4 + phase) % 20, instrument: "snare" as const })),
        ];
      }).flat().sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument));
      return { id: `ear-quintuplets-${bars}-${index}`, name: "Five over four", level: "Advanced", description: "Five equal snare notes cross four steady quarter-note beats.", beats, subdivision: 20, defaultBpm: 68, tempoRange: [40, 140], hits };
    });
  }
  if (options.focus === "cross-rhythm" && meter === "4/4" && level === "groove") {
    return Array.from({ length: 8 }, (_, index) => {
      const cycle = bars * 12;
      const rotation = (index * 2) % cycle;
      const baseHits = [
        ...Array.from({ length: bars * 2 }, (_, group) => ({ step: Math.floor(group / 2) * 12 + (group % 2) * 6, instrument: "kick" as const, accent: true })),
        ...Array.from({ length: bars * 4 }, (_, beat) => ({ step: beat * 3, instrument: "hihat" as const })),
        ...Array.from({ length: bars * 6 }, (_, pulse) => ({ step: pulse * 2, instrument: "snare" as const, velocityTarget: pulse % 3 === 0 ? 112 : 76 })),
      ];
      const hits = baseHits.map(hit => ({ ...hit, step: (hit.step + rotation) % cycle }))
        .sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument));
      return { id: `ear-cross-rhythm-${bars}-${index}`, name: "Three over two", level: "Advanced", description: "A 3:2 cross-rhythm study. Keep the quarter pulse steady while the triplet layer crosses it.", beats, subdivision: 12, defaultBpm: 72, tempoRange: [40, 140], hits };
    });
  }
  const complexity = options.complexity ?? 2;
  const density = complexity === 1 ? [0.16, 0.34] : complexity === 3 ? [0.38, 0.66] : [0.28, 0.5];
  const quarterStep = subdivision / 4;
  const eighthStep = subdivision / 8;
  const quarterPositions = Array.from({ length: steps }, (_, index) => index).filter(step => Math.abs(step / quarterStep - Math.round(step / quarterStep)) < 0.001);
  const eighthPositions = Array.from({ length: steps }, (_, index) => index).filter(step => Math.abs(step / eighthStep - Math.round(step / eighthStep)) < 0.001);
  const allPositions = Array.from({ length: steps }, (_, index) => index);
  const style = options.style ?? "free";
  const kickPositions = style === "rock" ? quarterPositions : style === "clave" ? eighthPositions.filter((_, index) => [0, 3, 4, 6, 7].includes(index % 8)) : allPositions;
  const snarePositions = style === "rock" ? quarterPositions : allPositions;
  const seedBase = (level === "pulse" ? 0x12a43 : level === "rhythm" ? 0x29bc5 : level === "triplet" ? 0x3fa17 : 0x4cc21)
    ^ (meter === "3/4" ? 0x1531 : meter === "6/8" ? 0x26a7 : meter === "9/8" ? 0x39b9 : meter === "12/8" ? 0x4ac3 : 0)
    ^ (feel === "swing" ? 0x7291 : feel === "shuffle" ? 0x9d83 : 0)
    ^ (style === "rock" ? 0x441a : style === "funk" ? 0x772d : style === "clave" ? 0x99b3 : 0)
    ^ complexity * 0x121;
  const shuffledEighths = feel === "shuffle" && subdivision === 12
    ? Array.from({ length: steps / 3 }, (_, beat) => beat * 3).flatMap(step => [step, step + 2])
    : undefined;
  const hats = level === "groove"
    ? randomRows(seedBase ^ 0x7f4a, steps, Math.max(2, Math.floor(steps * density[0])), Math.max(3, Math.floor(steps * density[1])), 24,
      shuffledEighths ?? (style === "funk" ? allPositions : eighthPositions).filter(step => style === "funk" ? true : subdivision === 12 ? step % 3 !== 1 : step % 2 === 0))
    : [];
  const minimum = Math.max(2, Math.floor(steps * (level === "groove" ? density[0] * 0.7 : density[0])));
  const maximum = Math.max(minimum + 1, Math.floor(steps * density[1]));
  const kicks = randomRows(seedBase, steps, minimum, maximum, 24, shuffledEighths ?? kickPositions);
  const snares = level === "groove" ? randomRows(seedBase ^ 0x9912, steps, Math.max(2, Math.floor(steps * density[0] * 0.55)), Math.max(3, Math.floor(steps * density[1] * 0.55)), 24, shuffledEighths ?? snarePositions) : [];
  const rowsPerPattern = level === "groove" ? Math.min(kicks.length, hats.length, snares.length) : kicks.length;
  const patterns = kicks.slice(0, rowsPerPattern).map((hitSteps, index) => {
    const hits = level === "groove"
      ? [
        ...hats[index]!.map(step => ({ step, instrument: "hihat" as const })),
        ...snares[index]!.map(step => ({ step, instrument: "snare" as const })),
        ...hitSteps.map(step => ({ step, instrument: "kick" as const })),
      ].sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument))
      : hitSteps.map(step => ({ step, instrument: "snare" as const }));
    return {
      id: `ear-${level}-${meter.replace("/", "-")}-${feel}-${style}-${complexity}-${bars}-${index}`, name: "Ear training rhythm", level: level === "pulse" ? "Beginner" : "Intermediate",
      description: "Listen, remember, and answer.", beats, subdivision, defaultBpm: 80, tempoRange: [40, 140], hits,
    };
  });
  if (options.focus !== "meter-grouping" || !meter.endsWith("/8")) return patterns;
  const numerator = Number(meter.split("/")[0]);
  const grouping = options.grouping?.reduce((sum, value) => sum + value, 0) === numerator ? options.grouping : earMeterGroupings(meter)[0];
  if (!grouping) return patterns;
  return patterns.map(pattern => {
    const stepsPerBar = numerator * pattern.subdivision / 8;
    const boundaries: number[] = [];
    for (let bar = 0; bar < bars; bar += 1) {
      let cursor = bar * stepsPerBar;
      for (const group of grouping) {
        boundaries.push(Math.round(cursor));
        cursor += group * pattern.subdivision / 8;
      }
    }
    const hits = pattern.hits.map(hit => ({ ...hit }));
    for (const step of boundaries) {
      const existing = hits.find(hit => hit.instrument === "kick" && hit.step === step);
      if (existing) { existing.accent = true; existing.velocityTarget = 112; }
      else hits.push({ step, instrument: "kick", accent: true, velocityTarget: 112 });
    }
    return { ...pattern, name: `${meter} · ${grouping.join("+")}`, description: `Listen for the accented ${grouping.join(" + ")} eighth-note groups.`, hits: hits.sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument)) };
  });
}

/** Distractors change a single hit's position while preserving the drum voice and note count. */
function nearbyChoices(pattern: PracticePattern, seed: number) {
  const candidates: PracticePattern[] = [];
  const stableHits = pattern.hits.map(hit => ({ ...hit }));
  const steps = totalSteps(pattern.beats, pattern.subdivision);
  for (let index = 0; index < stableHits.length; index++) {
    const source = stableHits[index]!;
    for (let step = 0; step < steps; step++) {
      if (stableHits.some((hit, hitIndex) => hitIndex !== index && hit.instrument === source.instrument && hit.step === step)) continue;
      if (step === source.step) continue;
      const hits = stableHits.map((hit, hitIndex) => hitIndex === index ? { ...hit, step } : { ...hit });
      const id = `ear-choice-${hits.map(hit => `${hit.instrument[0]}${hit.step}`).join("-")}`;
      candidates.push({ ...pattern, id, hits: hits.sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument)) });
    }
  }
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!]; }
  const used = new Set<string>([JSON.stringify(stableHits)]);
  const choices = candidates.filter(candidate => {
    const key = JSON.stringify(candidate.hits);
    if (used.has(key)) return false;
    used.add(key); return true;
  }).slice(0, 3);
  return choices.length === 3 ? choices : [];
}

function supportsFocus(pattern: PracticePattern, level: EarLevel, focus: EarSkill | undefined, meter: EarMeter, feel: EarFeel) {
  if (!focus) return true;
  if (focus === "rests") return pattern.hits.length <= totalSteps(pattern.beats, pattern.subdivision) * 0.4;
  if (focus === "offbeats") return pattern.hits.some(hit => hit.step % Math.max(1, pattern.subdivision / 4) !== 0);
  if (focus === "sixteenth-notes") return pattern.subdivision === 16 && pattern.hits.some(hit => hit.step % 2 !== 0);
  if (focus === "triplets") return pattern.subdivision === 12 || meter === "6/8" || meter === "7/8" || meter === "9/8" || meter === "12/8";
  if (focus === "syncopation") return level === "groove" && pattern.hits.some(hit => hit.instrument !== "hihat" && hit.step % Math.max(1, pattern.subdivision / 4) !== 0);
  if (focus === "voice-separation") return level === "groove";
  if (focus === "cross-rhythm") return level === "groove" && pattern.subdivision === 12 && meter === "4/4";
  if (focus === "quintuplets") return pattern.subdivision === 20 && meter === "4/4";
  if (focus === "meter-grouping") return meter.endsWith("/8") && earMeterGroupings(meter).length > 1;
  if (focus === "pocket") return feel === "pushed" || feel === "laid-back";
  if (focus === "meter") return meter !== "4/4";
  return feel !== "straight";
}

export function createEarExercise(level: EarLevel, seed: number, previousId?: string, options: EarExerciseOptions = {}): EarExercise {
  const meter = options.meter ?? "4/4";
  const feel = options.feel ?? "straight";
  const bars = options.bars ?? 1;
  const style = options.style ?? "free";
  const complexity = options.complexity ?? 2;
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const bank = earPatternBank(level, { meter, feel, bars, style, complexity, ...(options.grouping ? { grouping: options.grouping } : {}), ...(options.focus ? { focus: options.focus } : {}) });
  const focused = options.focus ? bank.filter(pattern => supportsFocus(pattern, level, options.focus, meter, feel)) : bank;
  const available = (focused.length ? focused : bank).filter(pattern => pattern.id !== previousId);
  const pattern = available[Math.floor(random() * available.length)]!;
  const choices = nearbyChoices(pattern, seed ^ 0x6d2b79f5);
  const answer = Math.floor(random() * 4);
  choices.splice(answer, 0, pattern);
  return { pattern, choices, answer, meter, feel, bars, style, ...(options.grouping ? { grouping: options.grouping } : {}), ...(options.focus ? { focus: options.focus } : {}), complexity };
}

export function earBarDurationMs(pattern: PracticePattern, bpm: number) {
  return pattern.beats * 60_000 / Math.max(1, bpm);
}

/** Swing moves the second eighth-note subdivision later; shuffle fixes the ratio at a broad triplet feel. */
export function earHitOffsetMs(step: number, bpm: number, subdivision: number, feel: EarFeel, instrument?: Instrument, feelDetail?: EarFeelDetail) {
  if ((feel === "pushed" || feel === "laid-back") && instrument === "snare") {
    const pocketOffset = feelDetail?.kind === "pocket" ? Math.max(12, Math.min(72, feelDetail.value)) : Math.max(24, Math.min(48, 60_000 / Math.max(1, bpm) * 0.06));
    return feel === "pushed" ? -pocketOffset : pocketOffset;
  }
  if (feel === "pushed" || feel === "laid-back") return 0;
  if (feel === "straight") return 0;
  const ratio = feelDetail?.kind === "swing" ? Math.max(0.52, Math.min(0.74, feelDetail.value / 100)) : feel === "shuffle" ? 2 / 3 : 0.6;
  const unitMs = stepDurationMs(bpm, subdivision);
  if (subdivision === 8 && step % 2 === 1) return unitMs * 2 * (ratio - 0.5);
  if (subdivision === 16 && step % 4 === 2) return unitMs * 4 * (ratio - 0.5);
  return 0;
}

export function skillsForEarPattern(pattern: PracticePattern, level: EarLevel, options: EarExerciseOptions = {}): EarSkill[] {
  const skills: EarSkill[] = [];
  const meter = options.meter ?? "4/4";
  const feel = options.feel ?? "straight";
  if (pattern.hits.length < totalSteps(pattern.beats, pattern.subdivision)) skills.push("rests");
  if (meter !== "4/4") skills.push("meter");
  if (feel === "pushed" || feel === "laid-back") skills.push("pocket");
  else if (feel !== "straight") skills.push("swing");
  if (options.focus === "meter-grouping") skills.push("meter-grouping");
  if (level === "groove") {
    skills.push("voice-separation");
    if (options.focus === "cross-rhythm") skills.push("cross-rhythm");
    if (pattern.hits.some(hit => (hit.instrument === "kick" || hit.instrument === "snare") && hit.step % Math.max(1, pattern.subdivision / 4) !== 0)) skills.push("syncopation");
    if (pattern.hits.some(hit => hit.instrument === "hihat" && hit.step % 2 !== 0)) skills.push("offbeats");
  } else if ((level === "triplet" && options.focus !== "quintuplets") || ["6/8", "9/8", "12/8"].includes(meter) || feel === "shuffle") skills.push("triplets");
  else if (level === "rhythm") {
    skills.push("sixteenth-notes");
    if (pattern.hits.some(hit => hit.step % 2 !== 0)) skills.push("offbeats");
  } else if (pattern.hits.some(hit => hit.step % 2 !== 0)) skills.push("offbeats");
  if (options.focus === "quintuplets") skills.push("quintuplets");
  return [...new Set(skills)];
}

export function recommendedEarLevel(results: EarResult[]): { level: EarLevel; skill: EarSkill; average: number; attempts: number } | null {
  const grouped = new Map<EarSkill, EarResult[]>();
  for (const result of results.filter(item => !item.assisted && item.skills?.length)) {
    for (const skill of result.skills!) grouped.set(skill, [...(grouped.get(skill) ?? []), result]);
  }
  const candidates = [...grouped.entries()].filter(([, attempts]) => attempts.length >= 3)
    .map(([skill, attempts]) => ({ skill, attempts: attempts.slice(-10), average: attempts.slice(-10).reduce((sum, item) => sum + item.score, 0) / Math.min(10, attempts.length) }))
    .sort((a, b) => a.average - b.average);
  const weakest = candidates[0];
  if (!weakest || weakest.average >= 80) return null;
  const level: EarLevel = weakest.skill === "triplets" || weakest.skill === "swing" || weakest.skill === "quintuplets" ? "triplet" : weakest.skill === "voice-separation" || weakest.skill === "syncopation" || weakest.skill === "cross-rhythm" || weakest.skill === "meter-grouping" || weakest.skill === "pocket" ? "groove" : weakest.skill === "sixteenth-notes" ? "rhythm" : "pulse";
  return { level, skill: weakest.skill, average: Math.round(weakest.average), attempts: weakest.attempts.length };
}

export function adaptiveEarLevel(results: EarResult[], current: EarLevel, mode: EarMode): EarLevel {
  const focus = recommendedEarLevel(results);
  if (focus) return focus.level;
  const order: EarLevel[] = ["pulse", "rhythm", "triplet", "groove"];
  const recent = results.filter(item => !item.assisted && item.mode === mode && item.level === current).slice(-3);
  if (recent.length < 3) return current;
  const average = recent.reduce((sum, item) => sum + item.score, 0) / recent.length;
  const index = order.indexOf(current);
  if (average >= 85) return order[Math.min(order.length - 1, index + 1)]!;
  if (average < 55) return order[Math.max(0, index - 1)]!;
  return current;
}

export function scoreEarAttempt(pattern: PracticePattern, bpm: number, attempts: EarAttempt[], feel: EarFeel = "straight", timingCorrectionMs = 0, feelDetail?: EarFeelDetail) {
  const stepMs = stepDurationMs(bpm, pattern.subdivision);
  const expected = pattern.hits.map(hit => ({ instrument: hit.instrument, step: hit.step, at: hit.step * stepMs + earHitOffsetMs(hit.step, bpm, pattern.subdivision, feel, hit.instrument, feelDetail), velocityTarget: hit.velocityTarget ?? (hit.accent ? 112 : undefined), accentTarget: hit.accent ?? false, matched: false }));
  const rated: RatedHit[] = [];
  for (const hit of [...attempts].sort((a, b) => a.atMs - b.atMs)) {
    const correctedAtMs = hit.atMs - timingCorrectionMs;
    const closest = findClosestExpected(correctedAtMs, expected, hit.instrument);
    if (closest.index >= 0 && Math.abs(closest.offset) <= 100) {
      const target = expected[closest.index]!;
      target.matched = true;
      rated.push({ instrument: hit.instrument, rating: classifyOffset(closest.offset), offsetMs: Math.round(closest.offset), atMs: hit.atMs, step: target.step, ...(hit.velocity === undefined ? {} : { velocity: hit.velocity }), ...(target.velocityTarget === undefined ? {} : { velocityTarget: target.velocityTarget }), ...(target.accentTarget ? { accentTarget: true } : {}) });
    } else {
      const nearestStep = Math.max(0, Math.min(totalSteps(pattern.beats, pattern.subdivision) - 1, Math.round(correctedAtMs / stepMs)));
      rated.push({ instrument: hit.instrument, rating: "extra", offsetMs: null, atMs: hit.atMs, step: nearestStep, ...(hit.velocity === undefined ? {} : { velocity: hit.velocity }) });
    }
  }
  for (const hit of expected) if (!hit.matched) rated.push({ instrument: hit.instrument, rating: "miss", offsetMs: null, atMs: hit.at, step: hit.step, ...(hit.velocityTarget === undefined ? {} : { velocityTarget: hit.velocityTarget }), ...(hit.accentTarget ? { accentTarget: true } : {}) });
  const baseSummary = summarizeHits(rated, pattern.id, pattern.name, bpm);
  const matched = rated.filter(hit => hit.rating === "great" || hit.rating === "good");
  const extras = rated.filter(hit => hit.rating === "extra").length;
  const expectedCount = Math.max(1, pattern.hits.length);
  const placementScore = Math.round(Math.max(0, matched.length - extras) / expectedCount * 100);
  const timingScore = matched.length ? Math.round(matched.reduce((sum, hit) => sum + (hit.rating === "great" ? 100 : 70), 0) / matched.length) : 0;
  const dynamicTargets = expected.filter(hit => hit.velocityTarget !== undefined);
  const hasVelocityInput = attempts.some(hit => typeof hit.velocity === "number" && Number.isFinite(hit.velocity));
  const dynamicsScore = dynamicTargets.length && hasVelocityInput ? Math.round(dynamicTargets.reduce((sum, target) => {
    const played = rated.find(hit => hit.instrument === target.instrument && hit.step === target.step && (hit.rating === "great" || hit.rating === "good") && typeof hit.velocity === "number");
    if (!played) return sum;
    const difference = Math.abs((played.velocity ?? 0) - (target.velocityTarget ?? 86));
    return sum + (difference <= 10 ? 100 : difference <= 20 ? 80 : difference <= 35 ? 55 : 0);
  }, 0) / dynamicTargets.length) : null;
  const score = dynamicsScore === null ? baseSummary.score : Math.round(baseSummary.score * 0.8 + dynamicsScore * 0.2);
  return { rated, summary: { ...baseSummary, score, placementScore, timingScore, dynamicsScore } };
}

export function explainEarAnswer(pattern: PracticePattern, response: Array<RatedHit>, chosen?: PracticePattern) {
  if (chosen) {
    const targetKeys = new Set(pattern.hits.map(hit => `${hit.instrument}:${hit.step}`));
    const chosenKeys = new Set(chosen.hits.map(hit => `${hit.instrument}:${hit.step}`));
    const movedFrom = pattern.hits.find(hit => !chosenKeys.has(`${hit.instrument}:${hit.step}`));
    const movedTo = chosen.hits.find(hit => !targetKeys.has(`${hit.instrument}:${hit.step}`));
    if (movedFrom && movedTo) return `The choice moved the ${movedFrom.instrument} from grid step ${movedFrom.step + 1} to step ${movedTo.step + 1}.`;
    return "Compare the two grids and notice which drum changed position.";
  }
  const miss = response.find(hit => hit.rating === "miss");
  if (miss) return `You missed the ${miss.instrument} on grid step ${(miss.step ?? 0) + 1}. Listen for that hit and the rest around it.`;
  const extra = response.find(hit => hit.rating === "extra");
  if (extra) return `There was an extra ${extra.instrument} on grid step ${(extra.step ?? 0) + 1}. Leave that space quiet next time.`;
  const offsets = response.flatMap(hit => hit.offsetMs === null ? [] : [hit.offsetMs]);
  const mean = offsets.length ? offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length : 0;
  if (mean < -18) return "Your hits tended to arrive early. Let the pulse settle before you play.";
  if (mean > 18) return "Your hits tended to arrive late. Stay closer to the count-in pulse.";
  return "Your spacing matched the rhythm. Keep listening for the feel and the spaces between hits.";
}

export function parseEarHistory(raw: string | null): EarResult[] {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 || !("results" in value) || !Array.isArray(value.results)) return [];
    return value.results.filter((item): item is EarResult => !!item && typeof item === "object"
      && typeof item.id === "string" && typeof item.playedAt === "string" && Number.isFinite(Date.parse(item.playedAt))
      && EAR_LEVELS.some(level => level.id === item.level) && ["play", "identify", "meter", "grouping", "feel", "feel-detail", "dictation", "error", "voice", "voice-change", "dropout", "tempo-ramp", "tempo-transfer", "tempo-estimate"].includes(item.mode)
      && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100
      && Number.isInteger(item.replays) && item.replays >= 0 && typeof item.assisted === "boolean"
      && (item.meter === undefined || EAR_METERS.includes(item.meter)) && (item.feel === undefined || EAR_FEELS.includes(item.feel))
      && (item.grouping === undefined || Array.isArray(item.grouping) && item.grouping.length <= 7 && item.grouping.every(value => Number.isInteger(value) && value >= 2 && value <= 3) && item.meter?.endsWith("/8") && item.grouping.reduce((sum, value) => sum + value, 0) === Number(item.meter.split("/")[0]))
      && (item.bars === undefined || item.bars === 1 || item.bars === 2 || item.mode === "dropout" && [3, 4, 5].includes(item.bars) || item.mode === "tempo-ramp" && item.bars === 8)
      && (item.style === undefined || EAR_GROOVE_STYLES.includes(item.style))
      && (item.focus === undefined || EAR_SKILLS.includes(item.focus))
      && (item.complexity === undefined || item.complexity === 1 || item.complexity === 2 || item.complexity === 3)
      && (item.bpm === undefined || Number.isFinite(item.bpm) && item.bpm >= 40 && item.bpm <= 200)
      && (item.sourceBpm === undefined || Number.isFinite(item.sourceBpm) && item.sourceBpm >= 40 && item.sourceBpm <= 200)
      && (item.subdivision === undefined || [4, 8, 12, 16, 20].includes(item.subdivision))
      && (item.input === undefined || ["pads", "microphone", "midi"].includes(item.input))
      && (item.meanOffsetMs === undefined || item.meanOffsetMs === null || Number.isFinite(item.meanOffsetMs) && Math.abs(item.meanOffsetMs) <= 200)
      && (item.timedHits === undefined || Number.isInteger(item.timedHits) && item.timedHits >= 0 && item.timedHits <= 10000)
      && (item.voiceStats === undefined || isEarVoiceStats(item.voiceStats))
      && (item.timingCells === undefined || isEarTimingCells(item.timingCells))
      && (item.errorCells === undefined || isEarErrorCells(item.errorCells))
      && (item.dynamicsScore === undefined || item.dynamicsScore === null || Number.isFinite(item.dynamicsScore) && item.dynamicsScore >= 0 && item.dynamicsScore <= 100)
      && (item.challengePackId === undefined || typeof item.challengePackId === "string" && item.challengePackId.length <= 80)
      && (item.challengePackIndex === undefined || Number.isInteger(item.challengePackIndex) && item.challengePackIndex >= 0 && item.challengePackIndex <= 11)
      && (item.assignmentId === undefined || typeof item.assignmentId === "string" && item.assignmentId.length <= 80)
      && (item.weeklyChallengeId === undefined || typeof item.weeklyChallengeId === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.weeklyChallengeId))
      && (item.skills === undefined || Array.isArray(item.skills) && item.skills.every((skill: unknown) => typeof skill === "string" && EAR_SKILLS.includes(skill as EarSkill)))
      && (item.voice === undefined || ["kick", "snare", "hihat", "tom", "crash"].includes(item.voice))
      && (item.lessonId === undefined || EAR_GROOVE_LESSONS.some(lesson => lesson.id === item.lessonId))).slice(-100);
  } catch { return []; }
}

/** Strict parser for the small, portable slice of ear-training history used in learning archives. */
export function parsePortableEarHistory(value: unknown): EarResult[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const parsed = parseEarHistory(JSON.stringify({ version: 1, results: value }));
  return parsed.length === value.length && new Set(parsed.map((item) => item.id)).size === parsed.length ? parsed : null;
}
