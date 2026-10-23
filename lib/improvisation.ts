import type { Instrument, PatternHit } from './types';

export const IMPROVISATION_KEY = 'drum-hero:improvisation:v1';
export const IMPROVISATION_WORKSPACE_KEY = 'drum-hero:improvisation-workspace:v1';
export const IMPROVISATION_TAKES_KEY = 'drum-hero:improvisation-takes:v1';
export const BASIC_PROMPTS = ['free', 'backbeat', 'two-voices', 'space'] as const;
export const IMPROVISATION_PROMPTS = [...BASIC_PROMPTS, 'motif', 'dynamics', 'rhythm', 'resolution'] as const;
export const IMPROVISATION_STYLES = ['rock', 'funk', 'shuffle', 'blues', 'jazz'] as const;
export const PROMPT_LABELS = { free: 'Free exploration', backbeat: 'Keep snare on beats 2 and 4', 'two-voices': 'Use only kick and snare', space: 'Leave beat 4 empty', motif: 'Repeat a motif, then change its ending', dynamics: 'Build from soft to loud', rhythm: 'Keep one recurring rhythm as the voices change', resolution: 'Finish with a clear resolution' } as const;
export const REFLECTION_QUESTIONS = { free: 'What musical idea would you like to explore next?', backbeat: 'Did the backbeat support your ideas?', 'two-voices': 'How did you create variety with two voices?', space: 'Did the space feel intentional?', motif: 'Could you hear the original motif in your changed ending?', dynamics: 'Did the volume grow smoothly while the pulse stayed steady?', rhythm: 'Was the recurring rhythm recognizable on different drums?', resolution: 'Did your ending sound deliberate and complete?' } as const;
export type ImprovisationPrompt = typeof IMPROVISATION_PROMPTS[number];
export type ImprovisationInput = 'keyboard' | 'touch' | 'midi' | 'unscored';
export type ImprovisationStyle = typeof IMPROVISATION_STYLES[number];
export type ImprovisationSettings = {
  mode: 'trading' | 'guided'; bpm: number; phrases: 1 | 2 | 4 | 8; prompt: ImprovisationPrompt; cyclePrompts: boolean; bass: boolean; clickLevel: number;
  bars: 2 | 4 | 8; openEnded: boolean; style: ImprovisationStyle; difficulty: 'beginner' | 'intermediate' | 'advanced'; density: 'sparse' | 'balanced' | 'busy'; response: 'copy' | 'vary' | 'contrast'; entry: Instrument | 'none'; audibleCues: boolean; variationSeed: number;
};
export const DEFAULT_IMPROVISATION_SETTINGS: ImprovisationSettings = { mode: 'trading', bpm: 80, phrases: 4, prompt: 'free', cyclePrompts: false, bass: true, clickLevel: 0.5, bars: 4, openEnded: false, style: 'rock', difficulty: 'beginner', density: 'balanced', response: 'vary', entry: 'kick', audibleCues: false, variationSeed: 0 };
export type ImprovisationPhase = 'idle' | 'loading' | 'count-in' | 'partner' | 'player' | 'paused' | 'complete' | 'stopped';
export type ImprovisationHit = { instrument: Instrument; atMs: number; velocity?: number };
export type ImprovisationPosition = { phase: ImprovisationPhase; elapsedMs: number; phrase: number; bar: number; beat: number; prompt: ImprovisationPrompt; warning: boolean };
export type ImprovisationPhraseSummary = { phrase: number; prompt: ImprovisationPrompt; hitCount: number; timingDistanceMs: number | null; entryOffsetMs: number | null; backbeats: { matched: number; total: number } | null; voiceCompliance: number | null; restViolations: number | null; reflection?: string };
export type ImprovisationSummary = { version: 1; engineVersion?: 2; id: string; playedAt: string; settings: ImprovisationSettings; input: ImprovisationInput; inputContext?: string; phrases: ImprovisationPhraseSummary[]; notes?: string; selfRating?: 'comfortable' | 'developing' | 'challenging' };
export type ImprovisationTake = { id: string; name: string; createdAt: string; settings: ImprovisationSettings; phrases: number; hits: ImprovisationHit[] };
export type ImprovisationWorkspace = { presets: Array<{ id: string; name: string; settings: ImprovisationSettings }>; completedSteps: string[] };
const VOICES = ['kick', 'snare', 'hihat', 'tom', 'crash'] as const;

export function normalizeImprovisationSettings(value: Partial<ImprovisationSettings>): ImprovisationSettings {
  return { mode: value.mode === 'guided' ? 'guided' : 'trading', bpm: Math.max(40, Math.min(200, Math.round(Number(value.bpm) || 80))), phrases: value.phrases === 1 || value.phrases === 2 || value.phrases === 8 ? value.phrases : 4, prompt: IMPROVISATION_PROMPTS.includes(value.prompt as ImprovisationPrompt) ? value.prompt! : 'free', cyclePrompts: value.cyclePrompts === true, bass: value.bass !== false, clickLevel: Number.isFinite(value.clickLevel) ? Math.max(0, Math.min(1, value.clickLevel!)) : 0.5,
    bars: value.bars === 2 || value.bars === 8 ? value.bars : 4, openEnded: value.openEnded === true, style: IMPROVISATION_STYLES.includes(value.style as ImprovisationStyle) ? value.style! : 'rock', difficulty: value.difficulty === 'intermediate' || value.difficulty === 'advanced' ? value.difficulty : 'beginner', density: value.density === 'sparse' || value.density === 'busy' ? value.density : 'balanced', response: value.response === 'copy' || value.response === 'contrast' ? value.response : 'vary', entry: value.entry === 'none' || VOICES.includes(value.entry as Instrument) ? value.entry! : 'kick', audibleCues: value.audibleCues === true, variationSeed: Number.isInteger(value.variationSeed) ? Math.max(0, Math.min(1000000, value.variationSeed!)) : 0 };
}
export function isSwing(settings: ImprovisationSettings) { return ['shuffle', 'blues', 'jazz'].includes(settings.style); }
export function phraseDuration(settings: ImprovisationSettings) { return settings.bars * 4 * 60000 / settings.bpm; }
export function sessionDuration(settings: ImprovisationSettings) { return settings.openEnded ? Infinity : phraseDuration(settings) * settings.phrases * (settings.mode === 'trading' ? 2 : 1); }
export function playerPhraseStart(settings: ImprovisationSettings, phrase: number) { return phraseDuration(settings) * (settings.mode === 'trading' ? phrase * 2 + 1 : phrase); }
export function completedPlayerPhrases(settings: ImprovisationSettings, elapsedMs: number) {
  const segments = Math.max(0, Math.floor(elapsedMs / phraseDuration(settings)));
  return Math.min(settings.openEnded ? Infinity : settings.phrases, settings.mode === 'trading' ? Math.floor(segments / 2) : segments);
}
export function promptForPhrase(settings: ImprovisationSettings, phrase: number): ImprovisationPrompt {
  // Preserve the original basic cycle; expressive prompts form a second cycle.
  const cycle: readonly ImprovisationPrompt[] = BASIC_PROMPTS.includes(settings.prompt as typeof BASIC_PROMPTS[number]) ? BASIC_PROMPTS : IMPROVISATION_PROMPTS.slice(4);
  return settings.mode === 'guided' && settings.cyclePrompts ? cycle[(cycle.indexOf(settings.prompt) + phrase) % cycle.length] : settings.prompt;
}
export function improvisationPosition(settings: ImprovisationSettings, elapsedMs: number): ImprovisationPosition {
  const elapsed = Math.max(0, elapsedMs), duration = phraseDuration(settings), segment = Math.floor(elapsed / duration);
  const phrase = Math.min(settings.openEnded ? Infinity : settings.phrases - 1, settings.mode === 'trading' ? Math.floor(segment / 2) : segment);
  const localBeat = (elapsed % duration) / (60000 / settings.bpm);
  return { phase: elapsedMs < 0 ? 'count-in' : elapsed >= sessionDuration(settings) ? 'complete' : settings.mode === 'trading' && segment % 2 === 0 ? 'partner' : 'player', elapsedMs: elapsed, phrase, bar: Math.min(settings.bars, Math.floor(localBeat / 4) + 1), beat: Math.floor(localBeat % 4) + 1, prompt: promptForPhrase(settings, phrase), warning: localBeat >= (settings.bars - 1) * 4 && elapsed < sessionDuration(settings) };
}

/** A monotonic transport; pausing freezes musical time and resuming inserts a new count-in. */
export class ImprovisationTransport {
  phase: ImprovisationPhase = 'idle';
  epoch = 0;
  gate = 0;
  countStart = 0;
  private heldMs = 0;
  constructor(readonly settings: ImprovisationSettings) {}
  start(now: number) { this.heldMs = 0; this.begin(now); }
  private begin(now: number) {
    this.countStart = now;
    this.gate = now + 4 * 60000 / this.settings.bpm;
    this.epoch = this.gate - this.heldMs;
    this.phase = 'count-in';
  }
  position(now: number): ImprovisationPosition {
    const frozen = ['paused', 'stopped', 'idle', 'loading'].includes(this.phase);
    const value = improvisationPosition(this.settings, frozen ? this.heldMs : now - this.epoch);
    if (frozen) return { ...value, phase: this.phase };
    if (now < this.gate) return { ...value, phase: 'count-in', elapsedMs: this.heldMs, bar: 1, beat: Math.min(4, Math.max(1, Math.floor((now - this.countStart) / (60000 / this.settings.bpm)) + 1)), warning: false };
    return value;
  }
  pause(now: number) {
    if (!['count-in', 'partner', 'player'].includes(this.position(now).phase)) return;
    this.heldMs = now < this.gate ? this.heldMs : Math.max(0, now - this.epoch);
    this.phase = 'paused';
  }
  resume(now: number) { if (this.phase === 'paused') this.begin(now); }
  stop(now: number) { this.heldMs = this.position(now).elapsedMs; this.phase = 'stopped'; }
  /** Correct input timestamps before assigning them to a turn. Count-in hits are never captured. */
  capture(instrument: Instrument, now: number, latencyMs: number, velocity?: number): ImprovisationHit | null {
    if (this.position(now).phase !== 'player') return null;
    const atMs = now - this.epoch - Math.max(-200, Math.min(200, latencyMs));
    return improvisationPosition(this.settings, atMs).phase === 'player' ? { instrument, atMs, ...(velocity === undefined ? {} : { velocity: Math.max(1, Math.min(127, velocity)) }) } : null;
  }
}

/** Deterministic original vocabulary, including playable dynamics and style-specific subdivisions. */
export function virtualDrummerPhrase(phrase: number, settings = DEFAULT_IMPROVISATION_SETTINGS): PatternHit[] {
  const hits: PatternHit[] = [], seed = settings.variationSeed + (settings.response === 'copy' ? 0 : phrase);
  const swing = isSwing(settings), offbeat = swing ? 8 / 3 : 2;
  const busy = settings.density === 'busy' || (settings.response === 'contrast' && seed % 2 === 1);
  const add = (step: number, instrument: Instrument, velocityTarget = 86) => hits.push({ step, instrument, velocityTarget });
  for (let bar = 0; bar < settings.bars; bar++) {
    for (let beat = 0; beat < 4; beat++) {
      if (!(bar === settings.bars - 1 && beat === 3)) {
        add(bar * 16 + beat * 4, 'hihat', beat % 2 ? 72 : 94);
        if ((settings.density !== 'sparse' || busy) && (settings.style !== 'jazz' || beat % 2 === 1)) add(bar * 16 + beat * 4 + offbeat, 'hihat', 60);
        if (busy && !swing && settings.difficulty === 'advanced') add(bar * 16 + beat * 4 + 3, 'hihat', 48);
      }
    }
    for (const step of [0, 8]) add(bar * 16 + step, 'kick', 100);
    for (const step of [4, 12]) if (!(bar === settings.bars - 1 && step === 12)) add(bar * 16 + step, 'snare', 110);
    if (settings.style === 'funk') add(bar * 16 + (seed % 2 ? 7 : 11), 'kick', 82);
    if (settings.difficulty !== 'beginner') add(bar * 16 + (swing ? 32 / 3 : 10), 'snare', 42);
  }
  const tail = settings.bars * 16 - 4;
  const fill = settings.density === 'sparse' ? [0] : swing ? [0, 4 / 3, 8 / 3] : busy ? [0, 1, 2, 3] : [[0, 2, 3], [0, 1, 3], [0, 2, 3], [0, 1, 2]][seed % 4];
  for (const offset of fill) add(tail + offset, (Math.round(offset) + seed) % 3 === 0 ? 'snare' : 'tom', 74 + Math.round(offset * 8) + seed % 9);
  if (settings.difficulty === 'advanced' && seed % 3 === 2) add(0, 'crash', 112);
  return hits.sort((a, b) => a.step - b.step);
}

export function demonstrationPhrase(settings: ImprovisationSettings): PatternHit[] {
  let hits = virtualDrummerPhrase(0, settings);
  if (settings.prompt === 'backbeat') for (let beat = 1; beat < settings.bars * 4; beat += 2) if (!hits.some(h => h.step === beat * 4 && h.instrument === 'snare')) hits.push({ step: beat * 4, instrument: 'snare', velocityTarget: 110 });
  if (settings.prompt === 'space') hits = hits.filter(h => Math.floor(h.step / 4) % 4 !== 3);
  if (settings.prompt === 'two-voices') hits = hits.filter(h => h.instrument === 'kick' || h.instrument === 'snare');
  if (settings.prompt === 'motif' || settings.prompt === 'rhythm') {
    hits = Array.from({ length: settings.bars }, (_, bar) => [0, 4, 6, 10].map((step, i) => ({ step: bar * 16 + step, instrument: (settings.prompt === 'rhythm' && bar % 2 ? 'tom' : i % 2 ? 'snare' : 'kick') as Instrument, velocityTarget: 86 }))).flat();
    if (settings.prompt === 'motif') hits.push({ step: settings.bars * 16 - 2, instrument: 'tom', velocityTarget: 100 });
    if (isSwing(settings)) hits = hits.map(hit => ({ ...hit, step: Math.floor(hit.step / 4) * 4 + (hit.step % 4 === 2 ? 8 / 3 : hit.step % 4) }));
  }
  if (settings.prompt === 'dynamics') hits = hits.map(h => ({ ...h, velocityTarget: Math.round(40 + 75 * h.step / (settings.bars * 16)) }));
  if (settings.prompt === 'resolution') hits = [...hits.filter(h => h.step < settings.bars * 16 - 4), { step: settings.bars * 16 - 4, instrument: 'crash', velocityTarget: 112 }];
  if (settings.entry !== 'none' && !hits.some(h => h.step === 0 && h.instrument === settings.entry)) hits.push({ step: 0, instrument: settings.entry, velocityTarget: 100 });
  return hits.sort((a, b) => a.step - b.step);
}

export type ImprovisationAudioEvent = { atMs: number; kind: 'click' | 'bass' | 'drum'; instrument?: Instrument; accent?: boolean; velocity?: number; bassPart?: 'root' | 'fifth'; frequency?: number };
/** A finite chunk even for open-ended sessions; callers request the current and next exchange. */
export function improvisationAudioEvents(settings: ImprovisationSettings, firstPhrase = 0, count: number = settings.phrases): ImprovisationAudioEvent[] {
  const events: ImprovisationAudioEvent[] = [], beatMs = 60000 / settings.bpm;
  const factor = settings.mode === 'trading' ? 2 : 1, startBeat = firstPhrase * settings.bars * 4 * factor;
  const endBeat = (settings.openEnded ? firstPhrase + count : Math.min(settings.phrases, firstPhrase + count)) * settings.bars * 4 * factor;
  for (let beat = startBeat; beat < endBeat; beat++) {
    events.push({ atMs: beat * beatMs, kind: 'click', accent: beat % 4 === 0 });
    if (settings.bass) {
      const bar = Math.floor(beat / 4), bluesRoot = [65.41, 65.41, 87.31, 65.41, 98, 87.31][Math.floor(bar / 2) % 6];
      const root = settings.style === 'blues' ? bluesRoot : settings.style === 'jazz' ? [65.41, 87.31, 73.42, 98][bar % 4] : 65.41;
      if (beat % 2 === 0 || settings.style === 'jazz' || settings.style === 'shuffle') events.push({ atMs: beat * beatMs, kind: 'bass', bassPart: beat % 4 === 0 ? 'root' : 'fifth', frequency: settings.style === 'jazz' ? root * [1, 1.25, 1.5, 1.75][beat % 4] : beat % 4 === 2 ? root * 1.5 : root });
      if (settings.style === 'funk' && beat % 4 === 1) events.push({ atMs: (beat + 0.75) * beatMs, kind: 'bass', bassPart: 'root', frequency: root });
    }
  }
  if (settings.mode === 'trading') for (let phrase = firstPhrase; phrase < firstPhrase + count && (settings.openEnded || phrase < settings.phrases); phrase++) {
    for (const hit of virtualDrummerPhrase(phrase, settings)) events.push({ atMs: phrase * 2 * phraseDuration(settings) + hit.step * beatMs / 4, kind: 'drum', instrument: hit.instrument, velocity: hit.velocityTarget });
  }
  return events.sort((a, b) => a.atMs - b.atMs);
}
export function timingDistance(settings: ImprovisationSettings, localMs: number) {
  const grid = 60000 / settings.bpm / (isSwing(settings) ? 3 : 4);
  return Math.abs(localMs - Math.round(localMs / grid) * grid);
}
export function summarizeImprovisation(settings: ImprovisationSettings, hits: ImprovisationHit[], input: ImprovisationInput, count: number = settings.phrases): ImprovisationPhraseSummary[] {
  const beatMs = 60000 / settings.bpm, windowMs = Math.min(125, beatMs / 4);
  return Array.from({ length: Math.min(1000, count) }, (_, phrase) => {
    const start = playerPhraseStart(settings, phrase), prompt = promptForPhrase(settings, phrase);
    const local = hits.filter(hit => Number.isFinite(hit.atMs) && hit.atMs >= start && hit.atMs < start + phraseDuration(settings)).map(hit => ({ ...hit, atMs: hit.atMs - start })).sort((a, b) => a.atMs - b.atMs);
    const result: ImprovisationPhraseSummary = { phrase, prompt, hitCount: input === 'unscored' ? 0 : local.length, timingDistanceMs: null, entryOffsetMs: null, backbeats: null, voiceCompliance: null, restViolations: null };
    if (input === 'unscored') return result;
    result.timingDistanceMs = local.length ? Math.round(local.reduce((sum, hit) => sum + timingDistance(settings, hit.atMs), 0) / local.length) : null;
    const entry = settings.entry === 'none' ? undefined : local.find(hit => hit.instrument === settings.entry && hit.atMs <= windowMs);
    result.entryOffsetMs = entry ? Math.round(entry.atMs) : null;
    if (prompt === 'backbeat') {
      const used = new Set<number>(); let matched = 0;
      for (let beat = 1; beat < settings.bars * 4; beat += 2) {
        let closest = -1, distance = Infinity;
        local.forEach((hit, index) => { const delta = Math.abs(hit.atMs - beat * beatMs); if (hit.instrument === 'snare' && !used.has(index) && delta <= windowMs && delta < distance) { closest = index; distance = delta; } });
        if (closest >= 0) { used.add(closest); matched++; }
      }
      result.backbeats = { matched, total: settings.bars * 2 };
    }
    if (prompt === 'two-voices') result.voiceCompliance = local.length ? Math.round(100 * local.filter(hit => hit.instrument === 'kick' || hit.instrument === 'snare').length / local.length) : null;
    if (prompt === 'space') result.restViolations = local.filter(hit => Math.floor(hit.atMs / beatMs) % 4 === 3).length;
    return result;
  });
}

export function phraseAdvice(settings: ImprovisationSettings, phrase: ImprovisationPhraseSummary, input: ImprovisationInput): string {
  if (input === 'unscored') return 'Listen for a clear phrase ending, then describe what you would change.';
  if (!phrase.hitCount) return 'Start with a short idea and leave space. Try this phrase again slowly.';
  if (phrase.backbeats && phrase.backbeats.matched < phrase.backbeats.total) return 'Keep the snare on beats 2 and 4; simplify the other notes while that settles.';
  if (phrase.restViolations) return 'Leave beat 4 silent. Try answering with fewer notes and a clear rest.';
  if (phrase.voiceCompliance !== null && phrase.voiceCompliance < 100) return 'Create variety with kick and snare only; change the rhythm before adding another voice.';
  if (settings.entry !== 'none' && phrase.entryOffsetMs === null) return 'Count the final bar aloud and prepare your chosen entry on beat 1.';
  if (phrase.timingDistanceMs !== null && phrase.timingDistanceMs > Math.min(50, 60000 / settings.bpm / 12)) return 'Slow the tempo and keep a simple pulse while developing your idea.';
  if (['motif', 'dynamics', 'rhythm', 'resolution'].includes(phrase.prompt)) return 'Your pulse has timing evidence. Use the reflection question to review the musical idea.';
  return 'The captured notes aligned with the grid and selected constraints. Try changing one musical idea next time.';
}
export function repeatPhraseSettings(settings: ImprovisationSettings, phrase: number, slower: boolean): ImprovisationSettings {
  return { ...settings, phrases: 1, openEnded: false, cyclePrompts: false, prompt: promptForPhrase(settings, phrase), variationSeed: settings.variationSeed + (settings.response === 'copy' ? 0 : phrase), bpm: slower ? Math.max(40, Math.round(settings.bpm * 0.8)) : settings.bpm };
}

const finite = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
function validSettings(value: unknown): ImprovisationSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['mode', 'bpm', 'phrases', 'prompt', 'cyclePrompts', 'bass', 'clickLevel'].every(key => key in value)) return null;
  const settings = normalizeImprovisationSettings(value);
  // Missing additions migrate from v1 defaults; supplied known fields must be valid.
  if (!Object.entries(settings).every(([key, normalized]) => !(key in value) || (value as Record<string, unknown>)[key] === normalized)) return null;
  return settings;
}
export function parseImprovisationHistory(raw: string | null): ImprovisationSummary[] {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (data?.version !== 1 || !Array.isArray(data.sessions)) return [];
    const summaries: ImprovisationSummary[] = [];
    for (const item of data.sessions.slice(-50)) {
      const settings = validSettings(item?.settings);
      if (!settings || item.version !== 1 || typeof item.id !== 'string' || !item.id || item.id.length > 100 || typeof item.playedAt !== 'string' || !Number.isFinite(Date.parse(item.playedAt)) || !['keyboard', 'touch', 'midi', 'unscored'].includes(item.input) || !Array.isArray(item.phrases) || (!settings.openEnded && item.phrases.length !== settings.phrases) || item.phrases.length < 1 || item.phrases.length > 1000) continue;
      const phrases: ImprovisationPhraseSummary[] = [];
      for (let index = 0; index < item.phrases.length; index++) {
        const p = item.phrases[index];
        if (!p || p.phrase !== index || p.prompt !== promptForPhrase(settings, index) || !Number.isInteger(p.hitCount) || !finite(p.hitCount, 100000) || (p.timingDistanceMs !== null && !finite(p.timingDistanceMs, 250)) || (p.entryOffsetMs !== null && !finite(p.entryOffsetMs, 125)) || (p.voiceCompliance !== null && !finite(p.voiceCompliance, 100)) || (p.restViolations !== null && (!Number.isInteger(p.restViolations) || !finite(p.restViolations, p.hitCount))) || (p.backbeats !== null && (!p.backbeats || p.backbeats.total !== settings.bars * 2 || !Number.isInteger(p.backbeats.matched) || !finite(p.backbeats.matched, p.backbeats.total)))) break;
        phrases.push({ phrase: index, prompt: p.prompt, hitCount: p.hitCount, timingDistanceMs: p.timingDistanceMs, entryOffsetMs: p.entryOffsetMs, backbeats: p.backbeats === null ? null : { matched: p.backbeats.matched, total: p.backbeats.total }, voiceCompliance: p.voiceCompliance, restViolations: p.restViolations, ...(typeof p.reflection === 'string' ? { reflection: p.reflection.slice(0, 500) } : {}) });
      }
      if (phrases.length === item.phrases.length) summaries.push({ version: 1, ...(item.engineVersion === 2 ? { engineVersion: 2 as const } : {}), id: item.id, playedAt: item.playedAt, settings, input: item.input, phrases, ...(typeof item.inputContext === 'string' ? { inputContext: item.inputContext.slice(0, 500) } : {}), ...(typeof item.notes === 'string' ? { notes: item.notes.slice(0, 1000) } : {}), ...(['comfortable', 'developing', 'challenging'].includes(item.selfRating) ? { selfRating: item.selfRating } : {}) });
    }
    return summaries;
  } catch { return []; }
}

export function parseImprovisationTakes(raw: string | null): ImprovisationTake[] {
  try {
    const data = JSON.parse(raw ?? 'null'); if (data?.version !== 1 || !Array.isArray(data.takes)) return [];
    const takes: ImprovisationTake[] = []; let totalHits = 0;
    for (const take of data.takes.slice(-12)) {
      const settings = validSettings(take?.settings);
      if (!settings || typeof take.id !== 'string' || take.id.length > 100 || typeof take.name !== 'string' || !take.name.trim() || take.name.length > 80 || typeof take.createdAt !== 'string' || !Number.isFinite(Date.parse(take.createdAt)) || !Number.isInteger(take.phrases) || !finite(take.phrases, 1000) || take.phrases < 1 || !Array.isArray(take.hits) || take.hits.length > 10000) continue;
      const maxMs = playerPhraseStart(settings, take.phrases - 1) + phraseDuration(settings);
      const hits: ImprovisationHit[] = [];
      for (const hit of take.hits) {
        if (!hit || !VOICES.includes(hit.instrument) || !finite(hit.atMs, maxMs) || hit.atMs >= maxMs || improvisationPosition({ ...settings, openEnded: true }, hit.atMs).phase !== 'player' || (hit.velocity !== undefined && (!Number.isInteger(hit.velocity) || !finite(hit.velocity, 127) || hit.velocity < 1))) break;
        hits.push({ instrument: hit.instrument, atMs: hit.atMs, ...(hit.velocity === undefined ? {} : { velocity: hit.velocity }) });
      }
      if (hits.length !== take.hits.length || totalHits + hits.length > 50000) continue;
      totalHits += hits.length; takes.push({ id: take.id, name: take.name, createdAt: take.createdAt, settings, phrases: take.phrases, hits: hits.sort((a, b) => a.atMs - b.atMs) });
    }
    return takes;
  } catch { return []; }
}
export function parseImprovisationWorkspace(raw: string | null): ImprovisationWorkspace {
  const empty = { presets: [], completedSteps: [] };
  try {
    const data = JSON.parse(raw ?? 'null'); if (data?.version !== 1) return empty;
    return { presets: (Array.isArray(data.presets) ? data.presets : []).slice(-12).flatMap((preset: { id: string; name: string; settings: unknown }) => {
      const settings = validSettings(preset?.settings);
      return settings && typeof preset.id === 'string' && preset.id.length <= 100 && typeof preset.name === 'string' && preset.name.trim() && preset.name.length <= 80 ? [{ id: preset.id, name: preset.name, settings }] : [];
    }), completedSteps: (Array.isArray(data.completedSteps) ? data.completedSteps : []).filter((id: unknown): id is string => typeof id === 'string' && id.length <= 100).slice(-30) };
  } catch { return empty; }
}

export const IMPROVISATION_PATH = [
  { id: 'pulse', title: 'Keep the pulse', description: 'Answer a short, simple phrase and enter confidently on beat 1.', prompt: 'free', response: 'copy' },
  { id: 'space', title: 'Leave space', description: 'Use fewer notes and leave beat 4 empty in each bar.', prompt: 'space', response: 'vary' },
  { id: 'motif', title: 'Develop a motif', description: 'Repeat a small idea, then change its ending. Listen for what stays recognizable.', prompt: 'motif', response: 'vary' },
  { id: 'freely', title: 'Trade freely', description: 'Contrast the drummer’s phrase while keeping the pulse and a deliberate ending.', prompt: 'resolution', response: 'contrast' }
] as const;
export function learningStepSettings(step: number): ImprovisationSettings {
  const lesson = IMPROVISATION_PATH[Math.max(0, Math.min(3, step))];
  return { ...DEFAULT_IMPROVISATION_SETTINGS, bars: 2, phrases: 2, bpm: 60 + step * 5, difficulty: step > 1 ? 'intermediate' : 'beginner', density: 'sparse', prompt: lesson.prompt, response: lesson.response };
}
export function comparableImprovisationSessions(history: ImprovisationSummary[], reference: ImprovisationSummary) {
  if (reference.engineVersion !== 2 || reference.input === 'unscored' || !reference.inputContext) return [];
  const keys = ['mode', 'bars', 'style', 'entry', 'prompt', 'cyclePrompts', 'difficulty', 'density', 'response'] as const;
  return history.filter(item => item.engineVersion === 2 && item.input === reference.input && item.inputContext === reference.inputContext && Math.abs(item.settings.bpm - reference.settings.bpm) <= 5 && keys.every(key => item.settings[key] === reference.settings[key])).map(item => {
    const distances = item.phrases.flatMap(p => p.timingDistanceMs === null ? [] : [p.timingDistanceMs]);
    return { id: item.id, playedAt: item.playedAt, bpm: item.settings.bpm, timingDistanceMs: distances.length ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : null, backbeats: item.phrases.reduce((sum, p) => sum + (p.backbeats?.matched ?? 0), 0), backbeatTargets: item.phrases.reduce((sum, p) => sum + (p.backbeats?.total ?? 0), 0), restViolations: item.phrases.reduce((sum, p) => sum + (p.restViolations ?? 0), 0) };
  });
}
