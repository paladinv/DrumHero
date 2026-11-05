import type { Instrument, MidiArticulation, PatternHit, SongInstrument } from './types';

export const IMPROVISATION_KEY = 'drum-hero:improvisation:v1';
export const IMPROVISATION_WORKSPACE_KEY = 'drum-hero:improvisation-workspace:v1';
export const IMPROVISATION_TAKES_KEY = 'drum-hero:improvisation-takes:v1';
export const BASIC_PROMPTS = ['free', 'backbeat', 'two-voices', 'space'] as const;
export const IMPROVISATION_PROMPTS = [...BASIC_PROMPTS, 'motif', 'dynamics', 'rhythm', 'resolution'] as const;
export const IMPROVISATION_STYLES = ['rock', 'funk', 'shuffle', 'blues', 'jazz'] as const;
export const IMPROVISATION_METERS = ['3/4', '4/4', '5/4', '6/8', '7/8'] as const;
export const PROMPT_LABELS = { free: 'Free exploration', backbeat: 'Keep a steady snare backbeat', 'two-voices': 'Use only kick and snare', space: 'Leave the final beat empty', motif: 'Repeat a motif, then change its ending', dynamics: 'Build from soft to loud', rhythm: 'Keep one recurring rhythm as the voices change', resolution: 'Finish with a clear resolution' } as const;
export const REFLECTION_QUESTIONS = { free: 'What musical idea would you like to explore next?', backbeat: 'Did the backbeat support your ideas?', 'two-voices': 'How did you create variety with two voices?', space: 'Did the space feel intentional?', motif: 'Could you hear the original motif in your changed ending?', dynamics: 'Did the volume grow smoothly while the pulse stayed steady?', rhythm: 'Was the recurring rhythm recognizable on different drums?', resolution: 'Did your ending sound deliberate and complete?' } as const;
export type ImprovisationPrompt = typeof IMPROVISATION_PROMPTS[number];
export type ImprovisationInput = 'keyboard' | 'touch' | 'midi' | 'unscored';
export type ImprovisationStyle = typeof IMPROVISATION_STYLES[number];
export type ImprovisationSettings = {
  mode: 'trading' | 'guided' | 'duet'; meter: typeof IMPROVISATION_METERS[number]; bpm: number; phrases: 1 | 2 | 4 | 8; prompt: ImprovisationPrompt; cyclePrompts: boolean; bass: boolean; clickLevel: number;
  developmentOffset: number; challenge: 'none' | 'echo' | 'ending' | 'orchestrate' | 'development' | 'cross-3-2' | 'cross-5-4'; answerVoice: Instrument; clickTraining: 'steady' | 'alternate' | 'fade'; progression: 'style' | 'one-chord' | 'blues' | 'pop' | 'jazz'; bassLevel: number; accompaniment: 'bass' | 'chords' | 'bass-and-chords'; key: 'C' | 'D' | 'F' | 'G' | 'Bb'; leaveSpace: boolean; intention: string;
  groove: 'style' | 'straight' | 'half-time' | 'four-on-floor' | 'custom'; subdivision: 'eighth' | 'sixteenth' | 'triplet'; customGroove: { bars: 1 | 2 | 4; kick: number[]; snare: number[]; hihat: number[] }; adaptiveDrummer: boolean; playerOneName: string; playerTwoName: string;
  bars: 2 | 4 | 8; openEnded: boolean; style: ImprovisationStyle; difficulty: 'beginner' | 'intermediate' | 'advanced'; density: 'sparse' | 'balanced' | 'busy'; response: 'copy' | 'vary' | 'contrast'; entry: Instrument | 'none'; audibleCues: boolean; variationSeed: number;
  scoreReveal: 'full' | 'one-bar' | 'live';
};
export const DEFAULT_IMPROVISATION_SETTINGS: ImprovisationSettings = { mode: 'trading', meter: '4/4', bpm: 80, phrases: 4, prompt: 'free', cyclePrompts: false, bass: true, clickLevel: 0.5, bars: 4, openEnded: false, style: 'rock', difficulty: 'beginner', density: 'balanced', response: 'vary', entry: 'kick', audibleCues: false, variationSeed: 0, scoreReveal: 'full', developmentOffset: 0, challenge: 'none', answerVoice: 'tom', clickTraining: 'steady', progression: 'style', bassLevel: 0.7, accompaniment: 'bass', key: 'C', leaveSpace: false, intention: '', groove: 'style', subdivision: 'eighth', customGroove: { bars: 1, kick: [0, 8], snare: [4, 12], hihat: [0, 4, 8, 12] }, adaptiveDrummer: false, playerOneName: 'Player 1', playerTwoName: 'Player 2' };
export type ImprovisationPhase = 'idle' | 'loading' | 'count-in' | 'partner' | 'player' | 'paused' | 'complete' | 'stopped';
export type ImprovisationHit = { instrument: Instrument; atMs: number; velocity?: number; articulation?: MidiArticulation };
export type ImprovisationPosition = { phase: ImprovisationPhase; elapsedMs: number; phrase: number; bar: number; beat: number; prompt: ImprovisationPrompt; warning: boolean; activePlayer: 1 | 2 | null };
export type ImprovisationPhraseSummary = { phrase: number; prompt: ImprovisationPrompt; hitCount: number; timingDistanceMs: number | null; entryOffsetMs: number | null; backbeats: { matched: number; total: number } | null; voiceCompliance: number | null; restViolations: number | null; activePlayer?: 1 | 2; challenge?: { matched: number; total: number }; reflection?: string };
export type ImprovisationSummary = { version: 1; engineVersion?: 2; id: string; playedAt: string; settings: ImprovisationSettings; input: ImprovisationInput; inputContext?: string; phrases: ImprovisationPhraseSummary[]; assignment?: { id: string; stepId: string }; notes?: string; selfRating?: 'comfortable' | 'developing' | 'challenging' };
export type ImprovisationTake = { id: string; name: string; createdAt: string; settings: ImprovisationSettings; phrases: number; hits: ImprovisationHit[]; drummerSettings?: ImprovisationSettings[] };
export type ImprovisationAssignment = { id: string; name: string; steps: Array<{ id: string; name: string; settings: ImprovisationSettings }> };
export type ImprovisationWorkspace = { assignments?: ImprovisationAssignment[]; presets: Array<{ id: string; name: string; settings: ImprovisationSettings }>; completedSteps: string[] };
const VOICES = ['kick', 'snare', 'hihat', 'tom', 'crash'] as const;
const MIDI_ARTICULATIONS: readonly MidiArticulation[] = ['closed-hat', 'open-hat', 'pedal-hat', 'foot-splash', 'ride', 'crash', 'rimshot'];

export function normalizeImprovisationSettings(value: Partial<ImprovisationSettings>): ImprovisationSettings {
  const safeGrid = (values: unknown, fallback: number[]) => Array.isArray(values) ? [...new Set(values.filter((step): step is number => Number.isInteger(step) && step >= 0 && step <= 223))].sort((a, b) => a - b).slice(0, 224) : fallback;
  const meter = IMPROVISATION_METERS.includes(value.meter as typeof IMPROVISATION_METERS[number]) ? value.meter! : '4/4';
  const customGroove = value.customGroove && typeof value.customGroove === 'object' ? value.customGroove : DEFAULT_IMPROVISATION_SETTINGS.customGroove;
  const name = (v: unknown, fallback: string) => typeof v === 'string' ? v.trim().slice(0, 32) || fallback : fallback;
  return {
    developmentOffset: Number.isInteger(value.developmentOffset) ? Math.max(0, Math.min(3, value.developmentOffset!)) : 0,
    challenge: ['echo', 'ending', 'orchestrate', 'development', 'cross-3-2', 'cross-5-4'].includes(value.challenge ?? '') ? value.challenge! : 'none',
    answerVoice: VOICES.includes(value.answerVoice as Instrument) ? value.answerVoice! : 'tom',
    clickTraining: value.clickTraining === 'alternate' || value.clickTraining === 'fade' ? value.clickTraining : 'steady',
    progression: ['one-chord', 'blues', 'pop', 'jazz'].includes(value.progression ?? '') ? value.progression! : 'style',
    bassLevel: Number.isFinite(value.bassLevel) ? Math.max(0, Math.min(1, value.bassLevel!)) : 0.7,
    accompaniment: value.accompaniment === 'chords' || value.accompaniment === 'bass-and-chords' ? value.accompaniment : 'bass',
    key: ['D', 'F', 'G', 'Bb'].includes(value.key ?? '') ? value.key! : 'C',
    leaveSpace: value.leaveSpace === true,
    intention: typeof value.intention === 'string' ? value.intention.slice(0, 200) : '',
    mode: value.mode === 'guided' || value.mode === 'duet' ? value.mode : 'trading',
    meter,
    bpm: Math.max(40, Math.min(200, Math.round(Number(value.bpm) || 80))),
    phrases: value.phrases === 1 || value.phrases === 2 || value.phrases === 8 ? value.phrases : 4,
    prompt: IMPROVISATION_PROMPTS.includes(value.prompt as ImprovisationPrompt) ? value.prompt! : 'free',
    cyclePrompts: value.cyclePrompts === true,
    bass: value.bass !== false,
    clickLevel: Number.isFinite(value.clickLevel) ? Math.max(0, Math.min(1, value.clickLevel!)) : 0.5,
    groove: ['straight', 'half-time', 'four-on-floor', 'custom'].includes(value.groove ?? '') ? value.groove! : 'style',
    subdivision: value.subdivision === 'sixteenth' || value.subdivision === 'triplet' ? value.subdivision : 'eighth',
    customGroove: { bars: customGroove.bars === 2 || customGroove.bars === 4 ? customGroove.bars : 1, kick: safeGrid(customGroove.kick, [0, 8]), snare: safeGrid(customGroove.snare, [4, 12]), hihat: safeGrid(customGroove.hihat, [0, 4, 8, 12]) },
    adaptiveDrummer: value.adaptiveDrummer === true,
    playerOneName: name(value.playerOneName, 'Player 1'),
    playerTwoName: name(value.playerTwoName, 'Player 2'),
    bars: value.bars === 2 || value.bars === 8 ? value.bars : 4,
    openEnded: value.openEnded === true,
    style: IMPROVISATION_STYLES.includes(value.style as ImprovisationStyle) ? value.style! : 'rock',
    difficulty: value.difficulty === 'intermediate' || value.difficulty === 'advanced' ? value.difficulty : 'beginner',
    density: value.density === 'sparse' || value.density === 'busy' ? value.density : 'balanced',
    response: value.response === 'copy' || value.response === 'contrast' ? value.response : 'vary',
    scoreReveal: value.scoreReveal === 'one-bar' || value.scoreReveal === 'live' ? value.scoreReveal : 'full',
    entry: value.entry === 'none' || VOICES.includes(value.entry as Instrument) ? value.entry! : 'kick',
    audibleCues: value.audibleCues === true,
    variationSeed: Number.isInteger(value.variationSeed) ? Math.max(0, Math.min(1000000, value.variationSeed!)) : 0,
  };
}
export function isSwing(settings: ImprovisationSettings) { const { denominator } = meterParts(settings); if (settings.groove === 'custom') return false; return denominator === 8 ? settings.subdivision === 'triplet' : settings.groove === 'style' ? ['shuffle', 'blues', 'jazz'].includes(settings.style) : settings.subdivision === 'triplet'; }
export function meterParts(settings: ImprovisationSettings) { const [numerator, denominator] = settings.meter.split('/').map(Number); return { numerator, denominator, stepsPerPulse: denominator === 4 ? 4 : 2, stepsPerBar: numerator * (denominator === 4 ? 4 : 2) }; }
export function barCountIn(settings: ImprovisationSettings) { return meterParts(settings).numerator; }
export function stepDuration(settings: ImprovisationSettings) { return 60000 / settings.bpm / 4; }
export function improvisationSoundInstrument(hit: Pick<ImprovisationHit, 'instrument' | 'articulation'>): SongInstrument {
  switch (hit.articulation) {
    case 'closed-hat': case 'pedal-hat': return 'hihat';
    case 'open-hat': case 'foot-splash': return 'openhat';
    case 'ride': return 'ride';
    case 'crash': return 'crash';
    case 'rimshot': return 'rimshot';
    default: return hit.instrument;
  }
}
export function barDuration(settings: ImprovisationSettings) { return meterParts(settings).stepsPerBar * stepDuration(settings); }
export function phraseDuration(settings: ImprovisationSettings) { return settings.bars * meterParts(settings).stepsPerBar * stepDuration(settings); }
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
  const { numerator, stepsPerPulse, stepsPerBar } = meterParts(settings), localSteps = (elapsed % duration) / stepDuration(settings);
  const localBarStep = localSteps % stepsPerBar;
  const phase = elapsedMs < 0 ? 'count-in' : elapsed >= sessionDuration(settings) ? 'complete' : settings.mode === 'trading' && segment % 2 === 0 ? 'partner' : 'player';
  return { phase, elapsedMs: elapsed, phrase, bar: Math.min(settings.bars, Math.floor(localSteps / stepsPerBar) + 1), beat: Math.floor(localBarStep / stepsPerPulse) + 1, prompt: promptForPhrase(settings, phrase), warning: localSteps >= stepsPerBar * (settings.bars - 1) && elapsed < sessionDuration(settings), activePlayer: settings.mode === 'duet' && phase === 'player' ? segment % 2 === 0 ? 1 : 2 : null };
}
export function backbeatPulseIndices(settings: ImprovisationSettings) {
  const { numerator, denominator } = meterParts(settings);
  if (denominator === 8) return numerator === 6 ? [3] : [2, 4, 6].filter(beat => beat < numerator);
  if (numerator === 3) return [2];
  if (numerator === 5) return [2, 4];
  return [1, 3];
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
    this.gate = now + barDuration(this.settings);
    this.epoch = this.gate - this.heldMs;
    this.phase = 'count-in';
  }
  position(now: number): ImprovisationPosition {
    const frozen = ['paused', 'stopped', 'idle', 'loading'].includes(this.phase);
    const value = improvisationPosition(this.settings, frozen ? this.heldMs : now - this.epoch);
    if (frozen) return { ...value, phase: this.phase };
    if (now < this.gate) {
      const { numerator, stepsPerPulse } = meterParts(this.settings), pulseMs = stepDuration(this.settings) * stepsPerPulse;
      return { ...value, phase: 'count-in', elapsedMs: this.heldMs, bar: 1, beat: Math.min(numerator, Math.max(1, Math.floor((now - this.countStart) / pulseMs) + 1)), warning: false, activePlayer: null };
    }
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
  if (settings.challenge !== 'none') return challengeReference(settings);
  const hits: PatternHit[] = [], seed = settings.variationSeed + (settings.response === 'copy' ? 0 : phrase);
  const { numerator, denominator, stepsPerPulse, stepsPerBar } = meterParts(settings);
  const swing = isSwing(settings), busy = settings.density === 'busy' || (settings.response === 'contrast' && seed % 2 === 1);
  const add = (step: number, instrument: Instrument, velocityTarget = 86) => hits.push({ step, instrument, velocityTarget });
  const backbeats = backbeatPulseIndices(settings);
  for (let bar = 0; bar < settings.bars; bar++) {
    const base = bar * stepsPerBar, finalBar = bar === settings.bars - 1;
    if (settings.groove === 'custom') {
      const patternBar = bar % settings.customGroove.bars, patternStart = patternBar * stepsPerBar, patternEnd = patternStart + stepsPerBar;
      for (const step of settings.customGroove.kick.filter(value => value >= patternStart && value < patternEnd)) add(base + step - patternStart, 'kick', step === patternStart ? 100 : 84);
      for (const step of settings.customGroove.snare.filter(value => value >= patternStart && value < patternEnd)) add(base + step - patternStart, 'snare', 102);
      for (const step of settings.customGroove.hihat.filter(value => value >= patternStart && value < patternEnd)) add(base + step - patternStart, 'hihat', (step - patternStart) % stepsPerPulse === 0 ? 88 : 58);
    } else {
      for (let pulse = 0; pulse < numerator; pulse++) {
        const at = base + pulse * stepsPerPulse;
        if (!(finalBar && pulse === numerator - 1)) {
          const accent = pulse === 0;
          add(at, 'hihat', accent ? 92 : 72);
          const subdivisions = swing && denominator === 4 ? [8 / 3] : denominator === 4
            ? settings.subdivision === 'eighth' ? [2] : settings.subdivision === 'sixteenth' ? [1, 2, 3] : [4 / 3, 8 / 3]
            : settings.subdivision === 'eighth' ? [] : settings.subdivision === 'sixteenth' ? [1] : [2 / 3, 4 / 3];
          if (settings.density !== 'sparse' || busy) for (const offset of subdivisions) add(at + offset, 'hihat', 58);
          if (busy && settings.difficulty === 'advanced' && denominator === 4) add(at + 3, 'hihat', 46);
        }
      }
      const defaultKick = numerator >= 4 ? 2 : 1, secondKick = backbeats.includes(defaultKick) ? (defaultKick + 1) % numerator : defaultKick;
      const kickPulses = settings.groove === 'four-on-floor' ? Array.from({ length: numerator }, (_, i) => i) : [0, secondKick];
      for (const pulse of [...new Set(kickPulses)]) if (pulse < numerator) add(base + pulse * stepsPerPulse, 'kick', pulse === 0 ? 100 : 86);
      const snarePulses = settings.groove === 'half-time' ? backbeats.slice(-1) : backbeats;
      for (const pulse of snarePulses) if (!(finalBar && pulse === numerator - 1)) add(base + pulse * stepsPerPulse, 'snare', 108);
      if (settings.style === 'funk' && denominator === 4) add(base + ((seed % 2 ? 7 : 11) % stepsPerBar), 'kick', 82);
      if (settings.difficulty !== 'beginner' && denominator === 4) add(base + (swing ? 32 / 3 : 10), 'snare', 42);
    }
  }
  const tail = stepsPerBar * settings.bars - stepsPerPulse;
  const fill = settings.density === 'sparse' ? [0] : swing && denominator === 4 ? [0, 4 / 3, 8 / 3] : busy ? [0, 1, 2, 3].map(offset => offset * Math.max(0.5, stepsPerPulse / 4)) : [[0, 2, 3], [0, 1, 3], [0, 2, 3], [0, 1, 2]][seed % 4].map(offset => offset * Math.max(0.5, stepsPerPulse / 4));
  for (const offset of fill) add(tail + offset, (Math.round(offset) + seed) % 3 === 0 ? 'snare' : 'tom', 74 + Math.round(offset * 8) + seed % 9);
  if (settings.difficulty === 'advanced' && seed % 3 === 2) add(0, 'crash', 112);
  return hits.sort((a, b) => a.step - b.step);
}

/** The drummer answers the previous player phrase while keeping the response deterministic for replay. */
export function virtualDrummerResponse(phrase: number, settings: ImprovisationSettings, previousHits: ImprovisationHit[] = []): PatternHit[] {
  if (phrase <= 0 || previousHits.length === 0) return virtualDrummerPhrase(phrase, settings);
  const { stepsPerBar } = meterParts(settings), stepMs = stepDuration(settings), totalSteps = stepsPerBar * settings.bars;
  const motif = previousHits.filter(hit => Number.isFinite(hit.atMs) && hit.atMs >= 0 && hit.atMs < phraseDuration(settings))
    .slice(0, 128).map(hit => ({ step: Math.max(0, Math.min(totalSteps - 0.001, hit.atMs / stepMs)), instrument: hit.instrument, velocityTarget: Math.max(36, Math.min(118, hit.velocity ?? 82)) }));
  if (settings.response === 'copy') return motif.sort((a, b) => a.step - b.step);

  const base = virtualDrummerPhrase(phrase, settings);
  if (settings.response === 'contrast') {
    const hitsPerBar = motif.length / Math.max(1, settings.bars);
    const density = hitsPerBar > 8 ? 'sparse' : hitsPerBar < 3 ? 'busy' : 'balanced';
    const dominant = motif.reduce<Record<string, number>>((counts, hit) => ({ ...counts, [hit.instrument]: (counts[hit.instrument] ?? 0) + 1 }), {});
    const dominantVoice = Object.entries(dominant).sort((a, b) => b[1] - a[1])[0]?.[0];
    const transformed = virtualDrummerPhrase(phrase, { ...settings, density, variationSeed: settings.variationSeed + phrase + 1 });
    return transformed.map(hit => dominantVoice && hit.instrument === dominantVoice ? { ...hit, instrument: hit.instrument === 'snare' ? 'tom' : 'snare' } : hit);
  }

  // Keep the drummer's groove, then answer the opening motif with a light, shifted echo.
  const opening = motif.slice(0, Math.min(4, motif.length));
  const echo = opening.map((hit, index) => {
    const step = hit.step + (index % 2 === 0 ? 2 : 1);
    const instrument: Instrument = hit.instrument === 'kick' ? 'snare' : hit.instrument === 'snare' ? 'tom' : hit.instrument;
    return { step: step % totalSteps, instrument, velocityTarget: Math.max(42, Math.round(hit.velocityTarget * 0.72)) };
  });
  const occupied = new Set(base.map(hit => `${Math.round(hit.step * 100)}:${hit.instrument}`));
  return [...base, ...echo.filter(hit => !occupied.has(`${Math.round(hit.step * 100)}:${hit.instrument}`))].sort((a, b) => a.step - b.step);
}

export function demonstrationPhrase(settings: ImprovisationSettings): PatternHit[] {
  let hits = virtualDrummerPhrase(0, settings);
  const { numerator, denominator, stepsPerPulse, stepsPerBar } = meterParts(settings);
  if (settings.prompt === 'backbeat') for (let bar = 0; bar < settings.bars; bar++) for (const beat of backbeatPulseIndices(settings)) { const step = bar * stepsPerBar + beat * stepsPerPulse; if (!hits.some(h => h.step === step && h.instrument === 'snare')) hits.push({ step, instrument: 'snare', velocityTarget: 110 }); }
  if (settings.prompt === 'space') hits = hits.filter(h => Math.floor(h.step / stepsPerPulse) % numerator !== numerator - 1);
  if (settings.prompt === 'two-voices') hits = hits.filter(h => h.instrument === 'kick' || h.instrument === 'snare');
  if (settings.prompt === 'motif' || settings.prompt === 'rhythm') {
    hits = Array.from({ length: settings.bars }, (_, bar) => [0, 4, 6, 10].map((step, i) => ({ step: bar * stepsPerBar + step * stepsPerBar / 16, instrument: (settings.prompt === 'rhythm' && bar % 2 ? 'tom' : i % 2 ? 'snare' : 'kick') as Instrument, velocityTarget: 86 }))).flat();
    if (settings.prompt === 'motif') hits.push({ step: settings.bars * stepsPerBar - stepsPerPulse / 2, instrument: 'tom', velocityTarget: 100 });
    if (isSwing(settings) && denominator === 4) hits = hits.map(hit => ({ ...hit, step: Math.floor(hit.step / 4) * 4 + (hit.step % 4 === 2 ? 8 / 3 : hit.step % 4) }));
  }
  if (settings.prompt === 'dynamics') hits = hits.map(h => ({ ...h, velocityTarget: Math.round(40 + 75 * h.step / (settings.bars * stepsPerBar)) }));
  if (settings.prompt === 'resolution') hits = [...hits.filter(h => h.step < settings.bars * stepsPerBar - stepsPerPulse), { step: settings.bars * stepsPerBar - stepsPerPulse, instrument: 'crash', velocityTarget: 112 }];
  if (settings.entry !== 'none' && !hits.some(h => h.step === 0 && h.instrument === settings.entry)) hits.push({ step: 0, instrument: settings.entry, velocityTarget: 100 });
  return hits.sort((a, b) => a.step - b.step);
}

export type ImprovisationAudioEvent = { atMs: number; kind: 'click' | 'bass' | 'chord' | 'drum'; instrument?: Instrument; accent?: boolean; velocity?: number; bassPart?: 'root' | 'fifth'; frequency?: number; frequencies?: number[]; level?: number };
/** A finite chunk even for open-ended sessions; callers request the current and next exchange. */
export function improvisationAudioEvents(settings: ImprovisationSettings, firstPhrase = 0, count: number = settings.phrases, drummerSettingsForPhrase?: (phrase: number) => ImprovisationSettings, drummerPhraseForPhrase?: (phrase: number, phraseSettings: ImprovisationSettings) => PatternHit[]): ImprovisationAudioEvent[] {
  const events: ImprovisationAudioEvent[] = [], { numerator, denominator, stepsPerPulse } = meterParts(settings), pulseMs = stepDuration(settings) * stepsPerPulse;
  const factor = settings.mode === 'trading' ? 2 : 1, startPulse = firstPhrase * settings.bars * numerator * factor;
  const endPulse = (settings.openEnded ? firstPhrase + count : Math.min(settings.phrases, firstPhrase + count)) * settings.bars * numerator * factor;
  const progression = settings.progression === 'style' ? settings.style === 'blues' ? 'blues' : settings.style === 'jazz' ? 'jazz' : 'one-chord' : settings.progression;
  const keyOffset = { C: 0, D: 2, F: 5, G: 7, Bb: 10 }[settings.key];
  const barChord = (bar: number) => {
    const bluesDegrees = [0, 0, 0, 0, 5, 5, 0, 0, 7, 5, 0, 7], popDegrees = [0, 7, 9, 5], jazzDegrees = [2, 7, 0, 9];
    const degree = progression === 'blues' ? bluesDegrees[bar % 12] : progression === 'pop' ? popDegrees[bar % 4] : progression === 'jazz' ? jazzDegrees[bar % 4] : 0;
    const minor = progression === 'pop' ? bar % 4 === 2 : progression === 'jazz' ? bar % 4 === 0 || bar % 4 === 3 : false;
    const ratio = (semitones: number) => 2 ** (semitones / 12);
    const root = 65.406 * ratio(degree + keyOffset);
    const third = root * ratio(minor ? 3 : 4);
    const fifth = root * ratio(7);
    const seventh = root * ratio(10);
    return { root, fifth, notes: progression === 'jazz' ? [root, third, seventh].map(f => f * 2) : progression === 'blues' ? [root, third, fifth, seventh].map(f => f * 2) : [root, third, fifth].map(f => f * 2) };
  };
  for (let pulse = startPulse; pulse < endPulse; pulse++) {
    const bar = Math.floor(pulse / numerator), pulseInBar = pulse % numerator, atMs = pulse * pulseMs;
    if (settings.clickTraining === 'steady' || (settings.clickTraining === 'alternate' ? bar % 2 === 0 : bar % 4 < 2)) events.push({ atMs, kind: 'click', accent: pulseInBar === 0, level: settings.clickTraining === 'fade' && bar % 4 === 1 ? 0.35 : 1 });
    const isPlayerTurn = improvisationPosition(settings, atMs).phase === 'player';
    if (settings.bass && !(settings.leaveSpace && isPlayerTurn && pulseInBar !== 0)) {
      const chord = barChord(bar);
      const interval = denominator === 8 ? 3 : numerator >= 4 ? 2 : Math.max(1, Math.floor(numerator / 2));
      if (pulseInBar === 0 || pulseInBar % interval === 0 || settings.style === 'jazz' || settings.style === 'shuffle') {
        if (settings.accompaniment !== 'chords') events.push({ atMs, kind: 'bass', bassPart: pulseInBar === 0 ? 'root' : 'fifth', frequency: pulseInBar === 0 ? chord.root : chord.fifth });
        const chordPulse = denominator === 8 ? pulseInBar % 3 === 0 : pulseInBar % 2 === 0;
        if (settings.accompaniment !== 'bass' && (pulseInBar === 0 || (progression === 'jazz' && chordPulse))) events.push({ atMs, kind: 'chord', frequencies: chord.notes });
      }
      if (settings.style === 'funk' && denominator === 4 && settings.accompaniment !== 'chords' && pulseInBar % 2 === 0 && pulseInBar < numerator - 1 && !(settings.leaveSpace && isPlayerTurn)) {
        events.push({ atMs: atMs + pulseMs / 2, kind: 'bass', bassPart: 'fifth', frequency: chord.fifth });
      }
    }
  }
  if (settings.mode === 'trading') for (let phrase = firstPhrase; phrase < firstPhrase + count && (settings.openEnded || phrase < settings.phrases); phrase++) {
    const drummerSettings = drummerSettingsForPhrase?.(phrase) ?? settings;
    for (const hit of (drummerPhraseForPhrase?.(phrase, drummerSettings) ?? virtualDrummerPhrase(phrase, drummerSettings))) events.push({ atMs: phrase * 2 * phraseDuration(settings) + hit.step * stepDuration(settings), kind: 'drum', instrument: hit.instrument, velocity: hit.velocityTarget });
  }
  return events.sort((a, b) => a.atMs - b.atMs);
}
export function timingGridDuration(settings: ImprovisationSettings) {
  const { denominator } = meterParts(settings);
  if (!isSwing(settings)) return 60000 / settings.bpm / 4;
  return 60000 / settings.bpm / (denominator === 8 ? 6 : 3);
}
/** Sixteenth-based notation positions, with explicit triplet subdivisions where the feel is swung. */
export function improvisationScoreGrid(settings: ImprovisationSettings) {
  const { numerator, stepsPerBar, stepsPerPulse } = meterParts(settings), totalSteps = settings.bars * stepsPerBar;
  const gridStep = timingGridDuration(settings) / stepDuration(settings), triplet = isSwing(settings);
  const grid: Array<{ step: number; label?: string; beat?: boolean }> = [];
  for (let step = 0; step < totalSteps - 0.001; step += gridStep) {
    const pulse = step / stepsPerPulse, onBeat = Math.abs(pulse - Math.round(pulse)) < 0.015;
    if (onBeat) grid.push({ step, label: String(Math.round(pulse) % numerator + 1), beat: true });
    else {
      const part = Math.round((step % stepsPerPulse) / gridStep);
      grid.push({ step, ...(triplet && part > 0 ? { label: part === 1 ? 'trip' : 'let' } : {}) });
    }
  }
  for (let beat = 0; beat < settings.bars * numerator; beat++) {
    const step = beat * stepsPerPulse;
    if (!grid.some(mark => Math.abs(mark.step - step) < 0.015)) grid.push({ step, label: String(beat % numerator + 1), beat: true });
  }
  return grid.sort((a, b) => a.step - b.step);
}
/** Map a sixteenth-based score position to an eighth, sixteenth, or unflagged quarter note. */
export function notationFlagCount(settings: ImprovisationSettings, step: number) {
  const { denominator, stepsPerPulse } = meterParts(settings);
  const fraction = Math.abs(step - Math.round(step));
  if (fraction > 0.015) return 1; // Swing or triplet placement.
  const withinPulse = ((Math.round(step) % stepsPerPulse) + stepsPerPulse) % stepsPerPulse;
  if (denominator === 8) return withinPulse === 0 ? 1 : 2;
  if (withinPulse === 0) return 0;
  return withinPulse % 2 === 0 ? 1 : 2;
}
export function timingDistance(settings: ImprovisationSettings, localMs: number) {
  const grid = timingGridDuration(settings);
  return Math.abs(localMs - Math.round(localMs / grid) * grid);
}
export function summarizeImprovisation(settings: ImprovisationSettings, hits: ImprovisationHit[], input: ImprovisationInput, count: number = settings.phrases): ImprovisationPhraseSummary[] {
  const beatMs = 60000 / settings.bpm, windowMs = Math.min(125, beatMs / 4), { numerator, stepsPerPulse } = meterParts(settings), pulseMs = beatMs * (stepsPerPulse / 4);
  return Array.from({ length: Math.min(1000, count) }, (_, phrase) => {
    const start = playerPhraseStart(settings, phrase), prompt = promptForPhrase(settings, phrase);
    const local = hits.filter(hit => Number.isFinite(hit.atMs) && hit.atMs >= start && hit.atMs < start + phraseDuration(settings)).map(hit => ({ ...hit, atMs: hit.atMs - start })).sort((a, b) => a.atMs - b.atMs);
    const result: ImprovisationPhraseSummary = { phrase, prompt, hitCount: input === 'unscored' ? 0 : local.length, timingDistanceMs: null, entryOffsetMs: null, backbeats: null, voiceCompliance: null, restViolations: null, ...(settings.mode === 'duet' ? { activePlayer: phrase % 2 === 0 ? 1 : 2 } : {}) };
    if (input === 'unscored') return result;
    if (settings.challenge !== 'none' && settings.mode === 'trading') result.challenge = matchChallenge(settings, phrase, local);
    result.timingDistanceMs = local.length ? Math.round(local.reduce((sum, hit) => sum + timingDistance(settings, hit.atMs), 0) / local.length) : null;
    const entry = settings.entry === 'none' ? undefined : local.find(hit => hit.instrument === settings.entry && hit.atMs <= windowMs);
    result.entryOffsetMs = entry ? Math.round(entry.atMs) : null;
    if (prompt === 'backbeat') {
      const used = new Set<number>(); let matched = 0;
      for (let bar = 0; bar < settings.bars; bar++) for (const beat of backbeatPulseIndices(settings)) {
        let closest = -1, distance = Infinity;
        const targetMs = (bar * numerator + beat) * pulseMs;
        local.forEach((hit, index) => { const delta = Math.abs(hit.atMs - targetMs); if (hit.instrument === 'snare' && !used.has(index) && delta <= windowMs && delta < distance) { closest = index; distance = delta; } });
        if (closest >= 0) { used.add(closest); matched++; }
      }
      result.backbeats = { matched, total: settings.bars * backbeatPulseIndices(settings).length };
    }
    if (prompt === 'two-voices') result.voiceCompliance = local.length ? Math.round(100 * local.filter(hit => hit.instrument === 'kick' || hit.instrument === 'snare').length / local.length) : null;
    if (prompt === 'space') result.restViolations = local.filter(hit => Math.floor(hit.atMs / pulseMs) % numerator === numerator - 1).length;
    return result;
  });
}

export function adaptDrummerSettings(settings: ImprovisationSettings, recent: ImprovisationPhraseSummary[]) {
  if (!settings.adaptiveDrummer || settings.challenge !== 'none') return { settings, direction: 'steady' as const };
  const evidence = recent.slice(-2);
  if (evidence.length < 2 || evidence.some(phrase => phrase.hitCount === 0 || phrase.timingDistanceMs === null)) return { settings, direction: 'steady' as const };
  const threshold = Math.min(50, 60000 / settings.bpm / 12);
  const missedConstraint = (phrase: ImprovisationPhraseSummary) =>
    (phrase.timingDistanceMs !== null && phrase.timingDistanceMs > threshold) ||
    (settings.entry !== 'none' && phrase.entryOffsetMs === null) ||
    Boolean(phrase.backbeats && phrase.backbeats.matched < phrase.backbeats.total) ||
    Boolean(phrase.restViolations) ||
    (phrase.voiceCompliance !== null && phrase.voiceCompliance < 100);
  const struggling = evidence.some(missedConstraint);
  const succeeding = evidence.every(phrase => !missedConstraint(phrase));
  if (!struggling && !succeeding) return { settings, direction: 'steady' as const };
  const difficulty = ['beginner', 'intermediate', 'advanced'] as const;
  let nextDensity = settings.density, nextDifficulty = settings.difficulty;
  if (struggling) {
    if (settings.density === 'busy') nextDensity = 'balanced';
    else if (settings.density === 'balanced') nextDensity = 'sparse';
    else if (settings.difficulty !== 'beginner') nextDifficulty = difficulty[Math.max(0, difficulty.indexOf(settings.difficulty) - 1)];
  } else {
    if (settings.density === 'sparse') nextDensity = 'balanced';
    else if (settings.density === 'balanced') nextDensity = 'busy';
    else if (settings.difficulty !== 'advanced') nextDifficulty = difficulty[Math.min(difficulty.length - 1, difficulty.indexOf(settings.difficulty) + 1)];
  }
  if (nextDensity === settings.density && nextDifficulty === settings.difficulty) return { settings, direction: 'steady' as const };
  return { settings: { ...settings, density: nextDensity, difficulty: nextDifficulty }, direction: struggling ? 'simpler' as const : 'more-challenging' as const };
}

export function phraseAdvice(settings: ImprovisationSettings, phrase: ImprovisationPhraseSummary, input: ImprovisationInput): string {
  if (input === 'unscored') return 'Listen for a clear phrase ending, then describe what you would change.';
  if (!phrase.hitCount) return 'Start with a short idea and leave space. Try this phrase again slowly.';
  if (phrase.challenge && phrase.challenge.matched < phrase.challenge.total) return settings.challenge === 'cross-3-2' || settings.challenge === 'cross-5-4' ? 'Keep the metronome pulse steady and simplify the cross-rhythm until each accent feels even.' : 'Listen to the reference rhythm again. Echo its required notes before developing the rest of your answer.';
  if (phrase.backbeats && phrase.backbeats.matched < phrase.backbeats.total) return 'Keep the snare on the backbeat; simplify the other notes while that settles.';
  if (phrase.restViolations) return 'Leave the final beat silent. Try answering with fewer notes and a clear rest.';
  if (phrase.voiceCompliance !== null && phrase.voiceCompliance < 100) return 'Create variety with kick and snare only; change the rhythm before adding another voice.';
  if (settings.entry !== 'none' && phrase.entryOffsetMs === null) return 'Count the final bar aloud and prepare your chosen entry on beat 1.';
  if (phrase.timingDistanceMs !== null && phrase.timingDistanceMs > Math.min(50, 60000 / settings.bpm / 12)) return 'Slow the tempo and keep a simple pulse while developing your idea.';
  if (['motif', 'dynamics', 'rhythm', 'resolution'].includes(phrase.prompt)) return 'Your pulse has timing evidence. Use the reflection question to review the musical idea.';
  return 'The captured notes aligned with the grid and selected constraints. Try changing one musical idea next time.';
}
export function repeatPhraseSettings(settings: ImprovisationSettings, phrase: number, slower: boolean): ImprovisationSettings {
  return { ...settings, phrases: 1, openEnded: false, cyclePrompts: false, prompt: promptForPhrase(settings, phrase), developmentOffset: (settings.developmentOffset + phrase) % 4, variationSeed: settings.variationSeed + (settings.response === 'copy' ? 0 : phrase), bpm: slower ? Math.max(40, Math.round(settings.bpm * 0.8)) : settings.bpm };
}

const finite = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
function validSettings(value: unknown): ImprovisationSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['mode', 'bpm', 'phrases', 'prompt', 'cyclePrompts', 'bass', 'clickLevel'].every(key => key in value)) return null;
  const settings = normalizeImprovisationSettings(value);
  // Missing additions migrate from v1 defaults; supplied known fields must be valid.
  if (!Object.entries(settings).every(([key, normalized]) => {
    if (!(key in value)) return true;
    const supplied = (value as Record<string, unknown>)[key];
    if (key === 'customGroove' && supplied && typeof supplied === 'object' && !('bars' in supplied)) {
      const oldGroove = supplied as { kick?: unknown; snare?: unknown; hihat?: unknown };
      return JSON.stringify(oldGroove.kick) === JSON.stringify(settings.customGroove.kick) && JSON.stringify(oldGroove.snare) === JSON.stringify(settings.customGroove.snare) && JSON.stringify(oldGroove.hihat) === JSON.stringify(settings.customGroove.hihat);
    }
    return supplied === normalized || (supplied !== null && typeof supplied === 'object' && JSON.stringify(supplied) === JSON.stringify(normalized));
  })) return null;
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
        const expectedBackbeats = settings.bars * backbeatPulseIndices(settings).length;
        if (!p || p.phrase !== index || p.prompt !== promptForPhrase(settings, index) || !Number.isInteger(p.hitCount) || !finite(p.hitCount, 100000) || (p.timingDistanceMs !== null && !finite(p.timingDistanceMs, 250)) || (p.entryOffsetMs !== null && !finite(p.entryOffsetMs, 125)) || (p.voiceCompliance !== null && !finite(p.voiceCompliance, 100)) || (p.restViolations !== null && (!Number.isInteger(p.restViolations) || !finite(p.restViolations, p.hitCount))) || (p.backbeats !== null && (!p.backbeats || p.backbeats.total !== expectedBackbeats || !Number.isInteger(p.backbeats.matched) || !finite(p.backbeats.matched, p.backbeats.total))) || (p.activePlayer !== undefined && p.activePlayer !== 1 && p.activePlayer !== 2)) break;
        phrases.push({ phrase: index, prompt: p.prompt, hitCount: p.hitCount, timingDistanceMs: p.timingDistanceMs, entryOffsetMs: p.entryOffsetMs, backbeats: p.backbeats === null ? null : { matched: p.backbeats.matched, total: p.backbeats.total }, voiceCompliance: p.voiceCompliance, restViolations: p.restViolations, ...(p.activePlayer === 1 || p.activePlayer === 2 ? { activePlayer: p.activePlayer } : {}), ...(p.challenge && Number.isInteger(p.challenge.total) && finite(p.challenge.total, 128) && Number.isInteger(p.challenge.matched) && finite(p.challenge.matched, p.challenge.total) ? { challenge: { matched: p.challenge.matched, total: p.challenge.total } } : {}), ...(typeof p.reflection === 'string' ? { reflection: p.reflection.slice(0, 500) } : {}) });
      }
      if (phrases.length === item.phrases.length) summaries.push({ version: 1, ...(item.engineVersion === 2 ? { engineVersion: 2 as const } : {}), id: item.id, playedAt: item.playedAt, settings, input: item.input, phrases,
        ...(typeof item.inputContext === 'string' && item.inputContext.length <= 500 ? { inputContext: item.inputContext } : {}),
        ...(typeof item.assignment?.id === 'string' && item.assignment.id.length <= 100 && typeof item.assignment.stepId === 'string' && item.assignment.stepId.length <= 100 ? { assignment: { id: item.assignment.id, stepId: item.assignment.stepId } } : {}),
        ...(typeof item.notes === 'string' ? { notes: item.notes.slice(0, 1000) } : {}), ...(['comfortable', 'developing', 'challenging'].includes(item.selfRating) ? { selfRating: item.selfRating } : {}) });
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
      const drummerSettings: Array<ImprovisationSettings | null> | null | undefined = take.drummerSettings === undefined ? undefined : Array.isArray(take.drummerSettings) && take.drummerSettings.length === take.phrases ? take.drummerSettings.map(validSettings) : null;
      if (drummerSettings === null || drummerSettings?.some(value => !value || value.mode !== 'trading')) continue;
      const maxMs = playerPhraseStart(settings, take.phrases - 1) + phraseDuration(settings);
      const hits: ImprovisationHit[] = [];
      for (const hit of take.hits) {
        if (!hit || !VOICES.includes(hit.instrument) || !finite(hit.atMs, maxMs) || hit.atMs >= maxMs || improvisationPosition({ ...settings, openEnded: true }, hit.atMs).phase !== 'player' || (hit.velocity !== undefined && (!Number.isInteger(hit.velocity) || !finite(hit.velocity, 127) || hit.velocity < 1)) || (hit.articulation !== undefined && !MIDI_ARTICULATIONS.includes(hit.articulation))) break;
        hits.push({ instrument: hit.instrument, atMs: hit.atMs, ...(hit.velocity === undefined ? {} : { velocity: hit.velocity }), ...(hit.articulation ? { articulation: hit.articulation } : {}) });
      }
      if (hits.length !== take.hits.length || totalHits + hits.length > 50000) continue;
      totalHits += hits.length; takes.push({ id: take.id, name: take.name, createdAt: take.createdAt, settings, phrases: take.phrases, hits: hits.sort((a, b) => a.atMs - b.atMs), ...(drummerSettings ? { drummerSettings: drummerSettings as ImprovisationSettings[] } : {}) });
    }
    return takes;
  } catch { return []; }
}
export function parseImprovisationWorkspace(raw: string | null): ImprovisationWorkspace {
  const empty = { presets: [], completedSteps: [] };
  try {
    const data = JSON.parse(raw ?? 'null'); if (data?.version !== 1) return empty;
    return { assignments: (Array.isArray(data.assignments) ? data.assignments : []).slice(-12).flatMap((item: ImprovisationAssignment) => {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 || !Array.isArray(item.steps) || !item.steps.length || item.steps.length > 8) return [];
      const steps = item.steps.flatMap(step => { const settings = validSettings(step?.settings); return settings && !settings.openEnded && typeof step.id === 'string' && step.id.length <= 100 && typeof step.name === 'string' && step.name.trim() && step.name.length <= 80 ? [{ id: step.id, name: step.name, settings }] : []; });
      return steps.length === item.steps.length && new Set(steps.map(step => step.id)).size === steps.length ? [{ id: item.id, name: item.name, steps }] : [];
    }), presets: (Array.isArray(data.presets) ? data.presets : []).slice(-12).flatMap((preset: { id: string; name: string; settings: unknown }) => {
      const settings = validSettings(preset?.settings);
      return settings && typeof preset.id === 'string' && preset.id.length <= 100 && typeof preset.name === 'string' && preset.name.trim() && preset.name.length <= 80 ? [{ id: preset.id, name: preset.name, settings }] : [];
    }), completedSteps: (Array.isArray(data.completedSteps) ? data.completedSteps : []).filter((id: unknown): id is string => typeof id === 'string' && id.length <= 100).slice(-30) };
  } catch { return empty; }
}

export const IMPROVISATION_PATH = [
  { id: 'pulse', title: 'Keep the pulse', description: 'Answer a short, simple phrase and enter confidently on beat 1.', prompt: 'free', response: 'copy' },
  { id: 'space', title: 'Leave space', description: 'Use fewer notes and leave the final beat empty in each bar.', prompt: 'space', response: 'vary' },
  { id: 'motif', title: 'Develop a motif', description: 'Repeat a small idea, then change its ending. Listen for what stays recognizable.', prompt: 'motif', response: 'vary' },
  { id: 'freely', title: 'Trade freely', description: 'Contrast the drummer’s phrase while keeping the pulse and a deliberate ending.', prompt: 'resolution', response: 'contrast' }
] as const;
export function learningStepSettings(step: number): ImprovisationSettings {
  const lesson = IMPROVISATION_PATH[Math.max(0, Math.min(3, step))];
  return { ...DEFAULT_IMPROVISATION_SETTINGS, bars: 2, phrases: 2, bpm: 60 + step * 5, difficulty: step > 1 ? 'intermediate' : 'beginner', density: 'sparse', prompt: lesson.prompt, response: lesson.response };
}
export function comparableImprovisationSessions(history: ImprovisationSummary[], reference: ImprovisationSummary) {
  if (reference.engineVersion !== 2 || reference.input === 'unscored' || !reference.inputContext) return [];
  const keys = ['mode', 'meter', 'bars', 'style', 'entry', 'prompt', 'cyclePrompts', 'difficulty', 'density', 'response', 'developmentOffset', 'challenge', 'answerVoice', 'clickTraining', 'progression', 'bassLevel', 'accompaniment', 'key', 'leaveSpace', 'bass', 'clickLevel', 'groove', 'subdivision', 'customGroove', 'adaptiveDrummer', 'playerOneName', 'playerTwoName'] as const;
  return history.filter(item => item.engineVersion === 2 && item.input === reference.input && item.inputContext === reference.inputContext && Math.abs(item.settings.bpm - reference.settings.bpm) <= 5 && keys.every(key => JSON.stringify(item.settings[key]) === JSON.stringify(reference.settings[key]))).map(item => {
    const distances = item.phrases.flatMap(p => p.timingDistanceMs === null ? [] : [p.timingDistanceMs]);
    return { id: item.id, playedAt: item.playedAt, bpm: item.settings.bpm, timingDistanceMs: distances.length ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : null, backbeats: item.phrases.reduce((sum, p) => sum + (p.backbeats?.matched ?? 0), 0), backbeatTargets: item.phrases.reduce((sum, p) => sum + (p.backbeats?.total ?? 0), 0), restViolations: item.phrases.reduce((sum, p) => sum + (p.restViolations ?? 0), 0) };
  });
}


export const CHALLENGE_LABELS = { none: 'Open improvisation', echo: 'Echo the rhythm', ending: 'Keep the opening, change the ending', orchestrate: 'Move the rhythm to another drum', development: 'Develop one motif over four exchanges', 'cross-3-2': 'Cross rhythm · three over two', 'cross-5-4': 'Cross rhythm · five over four' } as const;
export function challengeReference(settings: ImprovisationSettings): PatternHit[] {
  const { numerator, stepsPerPulse, stepsPerBar } = meterParts(settings);
  if (settings.challenge === 'cross-3-2') return Array.from({ length: settings.bars }, (_, bar) => {
    const cycle = 2 * stepsPerPulse, cycles = Math.ceil(stepsPerBar / cycle);
    return Array.from({ length: cycles }, (_, c) => Array.from({ length: 3 }, (_, i) => ({ step: bar * stepsPerBar + c * cycle + i * cycle / 3, instrument: settings.answerVoice, velocityTarget: i === 0 ? 104 : 82 }))).flat().filter(hit => hit.step < (bar + 1) * stepsPerBar);
  }).flat();
  if (settings.challenge === 'cross-5-4') return Array.from({ length: settings.bars }, (_, bar) => Array.from({ length: 5 }, (_, i) => ({ step: bar * stepsPerBar + i * stepsPerBar / 5, instrument: settings.answerVoice, velocityTarget: i === 0 ? 104 : 82 }))).flat();
  const snarePulses = backbeatPulseIndices(settings), candidateKick = numerator >= 4 ? 2 : 1, kickPulse = snarePulses.includes(candidateKick) ? (candidateKick + 1) % numerator : candidateKick;
  return Array.from({ length: settings.bars }, (_, bar) => [0, kickPulse * stepsPerPulse, ...snarePulses.map(pulse => pulse * stepsPerPulse)].map((step, index) => ({ step: bar * stepsPerBar + step, instrument: index < 2 ? 'kick' : 'snare', velocityTarget: index < 2 ? 100 : 90 } as PatternHit))).flat();
}
export function challengeInstruction(settings: ImprovisationSettings, phrase: number) {
  if (settings.challenge === 'development') return ['Repeat the reference motif.', 'Keep its rhythm and move it to your answer drum.', 'Repeat its opening; change the final bar.', 'Choose your own closing phrase. Reflect on how the motif developed.'][(phrase + settings.developmentOffset) % 4];
  if (settings.challenge === 'cross-3-2') return 'Feel three even notes across a two-beat pulse. Let the click mark the two underneath.';
  if (settings.challenge === 'cross-5-4') return 'Fit five even accents across the bar while the metronome keeps four underneath.';
  return settings.challenge === 'echo' ? 'Echo the reference rhythm and drums. Extra creative notes are allowed.' : settings.challenge === 'ending' ? 'Echo the opening bars. Create your own final bar.' : settings.challenge === 'orchestrate' ? 'Play the reference rhythm entirely on your answer drum.' : '';
}
export function challengeTargets(settings: ImprovisationSettings, phrase: number): PatternHit[] {
  const challenge = settings.challenge === 'development' ? ['echo', 'orchestrate', 'ending', 'none'][(phrase + settings.developmentOffset) % 4] : settings.challenge;
  if (challenge === 'none') return [];
  return challengeReference(settings).filter(hit => challenge !== 'ending' || hit.step < (settings.bars - 1) * meterParts(settings).stepsPerBar).map(hit => ({ ...hit, instrument: challenge === 'orchestrate' ? settings.answerVoice : hit.instrument }));
}
export function matchChallenge(settings: ImprovisationSettings, phrase: number, local: ImprovisationHit[]) {
  const targets = challengeTargets(settings, phrase), used = new Set<number>(), windowMs = Math.min(125, stepDuration(settings));
  let matched = 0;
  for (const target of targets) {
    const at = target.step * stepDuration(settings); let best = -1, distance = Infinity;
    local.forEach((hit, i) => { const d = Math.abs(hit.atMs - at); if (!used.has(i) && hit.instrument === target.instrument && d <= windowMs && d < distance) { best = i; distance = d; } });
    if (best >= 0) { matched++; used.add(best); }
  }
  return { matched, total: targets.length };
}
export function timingReview(settings: ImprovisationSettings, local: ImprovisationHit[]) {
  const gridMs = timingGridDuration(settings);
  return local.map(hit => { const nearestMs = Math.round(hit.atMs / gridMs) * gridMs; return { ...hit, nearestMs, offsetMs: Math.round(hit.atMs - nearestMs) }; });
}
export function suggestImprovisationPractice(history: ImprovisationSummary[]) {
  const latest = history.at(-1); if (!latest) return null;
  const comparableIds = new Set(comparableImprovisationSessions(history, latest).map(item => item.id));
  const evidence = history.filter(item => comparableIds.has(item.id)).slice(-3);
  if (evidence.length < 2) return null;
  const phrases = evidence.flatMap(item => item.phrases);
  if (phrases.filter(p => p.timingDistanceMs !== null && p.timingDistanceMs > Math.min(50, 60000 / latest.settings.bpm / 12)).length >= 2) return { reason: 'Recent comparable phrases drifted from the grid. Try 80% tempo with two-bar turns.', settings: { ...latest.settings, bpm: Math.max(40, Math.round(latest.settings.bpm * 0.8)), bars: 2 as const, openEnded: false } };
  if (phrases.filter(p => p.restViolations !== null && p.restViolations > 0).length >= 2) return { reason: 'Recent phrases filled the requested rests. Try a sparse two-bar exercise with the final beat empty.', settings: { ...latest.settings, prompt: 'space' as const, density: 'sparse' as const, bars: 2 as const, cyclePrompts: false, openEnded: false } };
  if (phrases.filter(p => p.backbeats && p.backbeats.matched < p.backbeats.total).length >= 2) return { reason: 'Recent phrases missed some requested backbeats. Keep the backbeat and simplify the other notes.', settings: { ...latest.settings, prompt: 'backbeat' as const, density: 'sparse' as const, cyclePrompts: false, openEnded: false } };
  return null;
}
