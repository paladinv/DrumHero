import { classifyOffset, findClosestExpected, stepDurationMs, summarizeHits } from "./scoring";
import type { Instrument, PracticePattern, RatedHit } from "./types";

export type EarLevel = "pulse" | "rhythm" | "triplet" | "groove";
export type EarMode = "play" | "identify" | "meter" | "feel";
export type EarMeter = "4/4" | "3/4" | "6/8";
export type EarFeel = "straight" | "swing" | "shuffle";
export type EarSkill = "rests" | "offbeats" | "sixteenth-notes" | "triplets" | "syncopation" | "voice-separation" | "meter" | "swing";
export type EarAttempt = { instrument: Instrument; atMs: number };
export type EarExerciseOptions = { meter?: EarMeter; feel?: EarFeel; bars?: 1 | 2 };
export type EarExercise = { pattern: PracticePattern; choices: PracticePattern[]; answer: number; meter: EarMeter; feel: EarFeel; bars: 1 | 2 };
export type EarResult = { id: string; playedAt: string; level: EarLevel; mode: EarMode; score: number; replays: number; assisted: boolean; skills?: EarSkill[]; meter?: EarMeter; feel?: EarFeel; bars?: 1 | 2 };
export const EAR_HISTORY_KEY = "drum-hero:ear-training:v1";
export const EAR_LEVELS: Array<{ id: EarLevel; label: string; description: string }> = [
  { id: "pulse", label: "Single drum · eighth notes", description: "Remember a short rhythm of hits and rests." },
  { id: "rhythm", label: "Single drum · sixteenth notes", description: "Hear shorter gaps and offbeat snare rhythms." },
  { id: "triplet", label: "Triplets and compound feel", description: "Hear triplet spacing and compound-meter patterns." },
  { id: "groove", label: "Three-voice grooves", description: "Remember changing kick, snare, and hi-hat parts." },
];
export const EAR_METERS: EarMeter[] = ["4/4", "3/4", "6/8"];
export const EAR_FEELS: EarFeel[] = ["straight", "swing", "shuffle"];

function randomRows(seed: number, steps: number, minimum: number, maximum: number, count: number, available: number[] = Array.from({ length: steps }, (_, index) => index)) {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const rows: number[][] = [];
  const used = new Set<string>();
  while (rows.length < count) {
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

function meterBeats(meter: EarMeter) { return meter === "4/4" ? 4 : 3; }
function subdivisionFor(level: EarLevel, meter: EarMeter, feel: EarFeel): 8 | 12 | 16 {
  if (meter === "6/8") return level === "pulse" ? 8 : 16;
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
  const subdivision = subdivisionFor(level, meter, feel);
  const steps = totalSteps(beats, subdivision);
  const seedBase = (level === "pulse" ? 0x12a43 : level === "rhythm" ? 0x29bc5 : level === "triplet" ? 0x3fa17 : 0x4cc21)
    ^ (meter === "3/4" ? 0x1531 : meter === "6/8" ? 0x26a7 : 0)
    ^ (feel === "swing" ? 0x7291 : feel === "shuffle" ? 0x9d83 : 0);
  const shuffledEighths = feel === "shuffle" && subdivision === 12
    ? Array.from({ length: steps / 3 }, (_, beat) => beat * 3).flatMap(step => [step, step + 2])
    : undefined;
  const hats = level === "groove"
    ? randomRows(seedBase ^ 0x7f4a, steps, Math.max(3, Math.floor(steps * 0.28)), Math.max(4, Math.floor(steps * 0.5)), 24,
      shuffledEighths ?? Array.from({ length: steps }, (_, index) => index).filter(step => subdivision === 8 ? step % 2 === 0 : subdivision === 16 ? step % 2 === 0 : step % 3 !== 1))
    : [];
  const minimum = Math.max(2, Math.floor(steps * (level === "groove" ? 0.12 : 0.28)));
  const maximum = Math.max(minimum + 1, Math.floor(steps * (level === "groove" ? 0.3 : 0.5)));
  const kicks = randomRows(seedBase, steps, minimum, maximum, 24, shuffledEighths);
  const snares = level === "groove" ? randomRows(seedBase ^ 0x9912, steps, Math.max(2, Math.floor(steps * 0.12)), Math.max(3, Math.floor(steps * 0.28)), 24, shuffledEighths) : [];
  return kicks.map((hitSteps, index) => {
    const hits = level === "groove"
      ? [
        ...hats[index]!.map(step => ({ step, instrument: "hihat" as const })),
        ...snares[index]!.map(step => ({ step, instrument: "snare" as const })),
        ...hitSteps.map(step => ({ step, instrument: "kick" as const })),
      ].sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument))
      : hitSteps.map(step => ({ step, instrument: "snare" as const }));
    return {
      id: `ear-${level}-${meter.replace("/", "-")}-${feel}-${bars}-${index}`, name: "Ear training rhythm", level: level === "pulse" ? "Beginner" : "Intermediate",
      description: "Listen, remember, and answer.", beats, subdivision, defaultBpm: 80, tempoRange: [40, 140], hits,
    };
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

export function createEarExercise(level: EarLevel, seed: number, previousId?: string, options: EarExerciseOptions = {}): EarExercise {
  const meter = options.meter ?? "4/4";
  const feel = options.feel ?? "straight";
  const bars = options.bars ?? 1;
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const bank = earPatternBank(level, { meter, feel, bars });
  const available = bank.filter(pattern => pattern.id !== previousId);
  const pattern = available[Math.floor(random() * available.length)]!;
  const choices = nearbyChoices(pattern, seed ^ 0x6d2b79f5);
  const answer = Math.floor(random() * 4);
  choices.splice(answer, 0, pattern);
  return { pattern, choices, answer, meter, feel, bars };
}

export function earBarDurationMs(pattern: PracticePattern, bpm: number) {
  return pattern.beats * 60_000 / Math.max(1, bpm);
}

/** Swing moves the second eighth-note subdivision later; shuffle fixes the ratio at a broad triplet feel. */
export function earHitOffsetMs(step: number, bpm: number, subdivision: number, feel: EarFeel) {
  if (feel === "straight") return 0;
  const ratio = feel === "shuffle" ? 2 / 3 : 0.6;
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
  if (feel !== "straight") skills.push("swing");
  if (level === "groove") {
    skills.push("voice-separation");
    if (pattern.hits.some(hit => (hit.instrument === "kick" || hit.instrument === "snare") && hit.step % Math.max(1, pattern.subdivision / 4) !== 0)) skills.push("syncopation");
    if (pattern.hits.some(hit => hit.instrument === "hihat" && hit.step % 2 !== 0)) skills.push("offbeats");
  } else if (level === "triplet" || meter === "6/8" || feel === "shuffle") skills.push("triplets");
  else if (level === "rhythm") {
    skills.push("sixteenth-notes");
    if (pattern.hits.some(hit => hit.step % 2 !== 0)) skills.push("offbeats");
  } else if (pattern.hits.some(hit => hit.step % 2 !== 0)) skills.push("offbeats");
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
  const level: EarLevel = weakest.skill === "triplets" || weakest.skill === "swing" ? "triplet" : weakest.skill === "voice-separation" || weakest.skill === "syncopation" ? "groove" : weakest.skill === "sixteenth-notes" ? "rhythm" : "pulse";
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

export function scoreEarAttempt(pattern: PracticePattern, bpm: number, attempts: EarAttempt[], feel: EarFeel = "straight") {
  const stepMs = stepDurationMs(bpm, pattern.subdivision);
  const expected = pattern.hits.map(hit => ({ instrument: hit.instrument, step: hit.step, at: hit.step * stepMs + earHitOffsetMs(hit.step, bpm, pattern.subdivision, feel), matched: false }));
  const rated: RatedHit[] = [];
  for (const hit of [...attempts].sort((a, b) => a.atMs - b.atMs)) {
    const closest = findClosestExpected(hit.atMs, expected, hit.instrument);
    if (closest.index >= 0 && Math.abs(closest.offset) <= 100) {
      const target = expected[closest.index]!;
      target.matched = true;
      rated.push({ instrument: hit.instrument, rating: classifyOffset(closest.offset), offsetMs: Math.round(closest.offset), atMs: hit.atMs, step: target.step });
    } else {
      const nearestStep = Math.max(0, Math.min(totalSteps(pattern.beats, pattern.subdivision) - 1, Math.round(hit.atMs / stepMs)));
      rated.push({ instrument: hit.instrument, rating: "extra", offsetMs: null, atMs: hit.atMs, step: nearestStep });
    }
  }
  for (const hit of expected) if (!hit.matched) rated.push({ instrument: hit.instrument, rating: "miss", offsetMs: null, atMs: hit.at, step: hit.step });
  const baseSummary = summarizeHits(rated, pattern.id, pattern.name, bpm);
  const matched = rated.filter(hit => hit.rating === "great" || hit.rating === "good");
  const extras = rated.filter(hit => hit.rating === "extra").length;
  const expectedCount = Math.max(1, pattern.hits.length);
  const placementScore = Math.round(Math.max(0, matched.length - extras) / expectedCount * 100);
  const timingScore = matched.length ? Math.round(matched.reduce((sum, hit) => sum + (hit.rating === "great" ? 100 : 70), 0) / matched.length) : 0;
  return { rated, summary: { ...baseSummary, placementScore, timingScore } };
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
      && EAR_LEVELS.some(level => level.id === item.level) && ["play", "identify", "meter", "feel"].includes(item.mode)
      && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100
      && Number.isInteger(item.replays) && item.replays >= 0 && typeof item.assisted === "boolean"
      && (item.meter === undefined || EAR_METERS.includes(item.meter)) && (item.feel === undefined || EAR_FEELS.includes(item.feel))
      && (item.bars === undefined || item.bars === 1 || item.bars === 2)
      && (item.skills === undefined || Array.isArray(item.skills) && item.skills.every((skill: unknown) => typeof skill === "string" && ["rests", "offbeats", "sixteenth-notes", "triplets", "syncopation", "voice-separation", "meter", "swing"].includes(skill)))).slice(-100);
  } catch { return []; }
}
