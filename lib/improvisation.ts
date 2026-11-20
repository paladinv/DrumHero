import type { Instrument, MidiArticulation, PatternHit, SongInstrument } from './types';
import { DEFAULT_DRUM_MIX, type DrumMixSettings } from './audio';
import { normalizeDrumMix } from './song-builder-settings';

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
  mode: 'trading' | 'guided' | 'duet' | 'ensemble'; meter: typeof IMPROVISATION_METERS[number]; bpm: number; phrases: 1 | 2 | 4 | 8; prompt: ImprovisationPrompt; cyclePrompts: boolean; bass: boolean; clickLevel: number;
  developmentOffset: number; challenge: 'none' | 'echo' | 'ending' | 'orchestrate' | 'development' | 'cross-3-2' | 'cross-5-4' | 'custom'; customChallenge: { hits: Array<{ step: number; instrument: Instrument }>; rests: number[]; allowed: Instrument[] }; answerVoice: Instrument; clickTraining: 'steady' | 'alternate' | 'fade'; progression: 'style' | 'one-chord' | 'blues' | 'pop' | 'jazz'; bassLevel: number; accompaniment: 'bass' | 'chords' | 'bass-and-chords'; key: 'C' | 'D' | 'F' | 'G' | 'Bb'; leaveSpace: boolean; intention: string;
  groove: 'style' | 'straight' | 'half-time' | 'four-on-floor' | 'custom'; subdivision: 'eighth' | 'sixteenth' | 'triplet'; customGroove: { bars: 1 | 2 | 4; kick: number[]; snare: number[]; hihat: number[] }; adaptiveDrummer: boolean; playerOneName: string; playerTwoName: string;
  bars: 2 | 4 | 8; openEnded: boolean; style: ImprovisationStyle; difficulty: 'beginner' | 'intermediate' | 'advanced'; density: 'sparse' | 'balanced' | 'busy'; response: 'copy' | 'vary' | 'contrast'; entry: Instrument | 'none'; audibleCues: boolean; fills: boolean; variationSeed: number; adaptiveTempo: boolean; pocketMs: number; swingRatio: number;
  scoreReveal: 'full' | 'one-bar' | 'live';
  exchangePlan: Array<{ prompt?: ImprovisationPrompt; groove?: ImprovisationSettings['groove']; bpm?: number; meter?: typeof IMPROVISATION_METERS[number]; bars?: 2 | 4 | 8 }>;
  sectionLoop: { section: number; repeats: number } | null;
  kitMix: DrumMixSettings;
  ensemblePlayers: Array<{ name: string; role: Instrument | 'open' | 'listen' }>;
};
export const DEFAULT_IMPROVISATION_SETTINGS: ImprovisationSettings = { mode: 'trading', meter: '4/4', bpm: 80, phrases: 4, prompt: 'free', cyclePrompts: false, bass: true, clickLevel: 0.5, bars: 4, openEnded: false, style: 'rock', difficulty: 'beginner', density: 'balanced', response: 'vary', entry: 'kick', audibleCues: false, fills: true, variationSeed: 0, adaptiveTempo: false, pocketMs: 0, swingRatio: 67, scoreReveal: 'full', exchangePlan: [], sectionLoop: null, kitMix: DEFAULT_DRUM_MIX, ensemblePlayers: [{ name: 'Player 1', role: 'open' }, { name: 'Player 2', role: 'open' }, { name: 'Player 3', role: 'open' }], developmentOffset: 0, challenge: 'none', customChallenge: { hits: [], rests: [], allowed: ['kick', 'snare'] }, answerVoice: 'tom', clickTraining: 'steady', progression: 'style', bassLevel: 0.7, accompaniment: 'bass', key: 'C', leaveSpace: false, intention: '', groove: 'style', subdivision: 'eighth', customGroove: { bars: 1, kick: [0, 8], snare: [4, 12], hihat: [0, 4, 8, 12] }, adaptiveDrummer: false, playerOneName: 'Player 1', playerTwoName: 'Player 2' };
export type ImprovisationPhase = 'idle' | 'loading' | 'count-in' | 'partner' | 'player' | 'paused' | 'complete' | 'stopped';
export type ImprovisationHit = { instrument: Instrument; atMs: number; velocity?: number; articulation?: MidiArticulation };
export type ImprovisationPosition = { phase: ImprovisationPhase; elapsedMs: number; phrase: number; bar: number; beat: number; prompt: ImprovisationPrompt; warning: boolean; activePlayer: number | null };
export type ImprovisationPhraseSummary = { phrase: number; prompt: ImprovisationPrompt; hitCount: number; timingDistanceMs: number | null; entryOffsetMs: number | null; backbeats: { matched: number; total: number } | null; voiceCompliance: number | null; restViolations: number | null; activePlayer?: number; challenge?: { matched: number; total: number }; reflection?: string };
export type ImprovisationSummary = { version: 1; engineVersion?: 2; id: string; playedAt: string; settings: ImprovisationSettings; input: ImprovisationInput; inputContext?: string; phrases: ImprovisationPhraseSummary[]; assignment?: { id: string; stepId: string }; notes?: string; selfRating?: 'comfortable' | 'developing' | 'challenging' };
export type ImprovisationTake = { id: string; name: string; createdAt: string; settings: ImprovisationSettings; phrases: number; hits: ImprovisationHit[]; drummerSettings?: ImprovisationSettings[] };
export type ImprovisationAssignment = { id: string; name: string; steps: Array<{ id: string; name: string; settings: ImprovisationSettings }> };
export type ImprovisationWorkspace = { assignments?: ImprovisationAssignment[]; presets: Array<{ id: string; name: string; settings: ImprovisationSettings }>; completedSteps: string[] };
const VOICES = ['kick', 'snare', 'hihat', 'tom', 'crash'] as const;
const MIDI_ARTICULATIONS: readonly MidiArticulation[] = ['closed-hat', 'open-hat', 'pedal-hat', 'foot-splash', 'ride', 'crash', 'rimshot'];

export function normalizeImprovisationSettings(value: Partial<ImprovisationSettings>): ImprovisationSettings {
  const safeGrid = (values: unknown, fallback: number[]) => Array.isArray(values) ? [...new Set(values.filter((step): step is number => Number.isInteger(step) && step >= 0 && step <= 223))].sort((a, b) => a - b).slice(0, 224) : fallback;
  const meter = IMPROVISATION_METERS.includes(value.meter as typeof IMPROVISATION_METERS[number]) ? value.meter! : '4/4';
  const bars = value.bars === 2 || value.bars === 8 ? value.bars : 4;
  const phrases = value.phrases === 1 || value.phrases === 2 || value.phrases === 8 ? value.phrases : 4;
  const [meterNumerator, meterDenominator] = meter.split('/').map(Number);
  const scoreSteps = bars * meterNumerator * (meterDenominator === 4 ? 4 : 2);
  const customGroove = value.customGroove && typeof value.customGroove === 'object' ? value.customGroove : DEFAULT_IMPROVISATION_SETTINGS.customGroove;
  const customChallenge = value.customChallenge && typeof value.customChallenge === 'object' ? value.customChallenge : DEFAULT_IMPROVISATION_SETTINGS.customChallenge;
  const customHits = Array.isArray(customChallenge.hits) ? customChallenge.hits.flatMap(hit => hit && Number.isFinite(hit.step) && hit.step >= 0 && hit.step < scoreSteps && VOICES.includes(hit.instrument) ? [{ step: Math.round(hit.step * 1000) / 1000, instrument: hit.instrument }] : []).slice(0, 128) : [];
  const customHitMap = new Map(customHits.map(hit => [`${hit.step}:${hit.instrument}`, hit]));
  const customAllowedValues = Array.isArray(customChallenge.allowed) ? new Set(customChallenge.allowed.filter((voice): voice is Instrument => VOICES.includes(voice))) : new Set<Instrument>(DEFAULT_IMPROVISATION_SETTINGS.customChallenge.allowed);
  const customAllowed = VOICES.filter(voice => customAllowedValues.has(voice));
  const exchangePlan = Array.isArray(value.exchangePlan) ? value.exchangePlan.slice(0, phrases).map(entry => {
    const plan: ImprovisationSettings['exchangePlan'][number] = {};
    if (entry && IMPROVISATION_PROMPTS.includes(entry.prompt as ImprovisationPrompt)) plan.prompt = entry.prompt;
    if (entry && ['style', 'straight', 'half-time', 'four-on-floor', 'custom'].includes(entry.groove ?? '')) plan.groove = entry.groove;
    if (entry && Number.isFinite(entry.bpm)) plan.bpm = Math.max(40, Math.min(200, Math.round(entry.bpm!)));
    if (entry && IMPROVISATION_METERS.includes(entry.meter as typeof IMPROVISATION_METERS[number])) plan.meter = entry.meter;
    if (entry && (entry.bars === 2 || entry.bars === 4 || entry.bars === 8)) plan.bars = entry.bars;
    return plan;
  }) : [];
  const name = (v: unknown, fallback: string) => typeof v === 'string' ? v.trim().slice(0, 32) || fallback : fallback;
  const ensemblePlayers = Array.isArray(value.ensemblePlayers) ? value.ensemblePlayers.slice(0, 4).map((player, index) => {
    const role = player?.role;
    return { name: name(player?.name, `Player ${index + 1}`), role: role === 'open' || role === 'listen' || VOICES.includes(role as Instrument) ? role as Instrument | 'open' | 'listen' : 'open' as const };
  }) : DEFAULT_IMPROVISATION_SETTINGS.ensemblePlayers.map(player => ({ ...player }));
  while (ensemblePlayers.length < 2) ensemblePlayers.push({ name: `Player ${ensemblePlayers.length + 1}`, role: 'open' });
  const requestedLoop = value.sectionLoop;
  const sectionLoop = !value.openEnded && requestedLoop && Number.isInteger(requestedLoop.section) && requestedLoop.section >= 0 && requestedLoop.section < phrases && Number.isInteger(requestedLoop.repeats) && requestedLoop.repeats > 0 && phrases + requestedLoop.repeats <= 8 ? { section: requestedLoop.section, repeats: requestedLoop.repeats } : null;
  return {
    developmentOffset: Number.isInteger(value.developmentOffset) ? Math.max(0, Math.min(3, value.developmentOffset!)) : 0,
    challenge: ['echo', 'ending', 'orchestrate', 'development', 'cross-3-2', 'cross-5-4', 'custom'].includes(value.challenge ?? '') ? value.challenge! : 'none',
    customChallenge: { hits: [...customHitMap.values()].sort((a, b) => a.step - b.step || VOICES.indexOf(a.instrument) - VOICES.indexOf(b.instrument)), rests: Array.isArray(customChallenge.rests) ? [...new Set(customChallenge.rests.filter((beat): beat is number => Number.isInteger(beat) && beat >= 0 && beat < bars * meterNumerator))].sort((a, b) => a - b).slice(0, 64) : [], allowed: customAllowed.length ? customAllowed : [...VOICES] },
    answerVoice: VOICES.includes(value.answerVoice as Instrument) ? value.answerVoice! : 'tom',
    clickTraining: value.clickTraining === 'alternate' || value.clickTraining === 'fade' ? value.clickTraining : 'steady',
    progression: ['one-chord', 'blues', 'pop', 'jazz'].includes(value.progression ?? '') ? value.progression! : 'style',
    bassLevel: Number.isFinite(value.bassLevel) ? Math.max(0, Math.min(1, value.bassLevel!)) : 0.7,
    accompaniment: value.accompaniment === 'chords' || value.accompaniment === 'bass-and-chords' ? value.accompaniment : 'bass',
    key: ['D', 'F', 'G', 'Bb'].includes(value.key ?? '') ? value.key! : 'C',
    leaveSpace: value.leaveSpace === true,
    intention: typeof value.intention === 'string' ? value.intention.slice(0, 200) : '',
    mode: value.mode === 'guided' || value.mode === 'duet' || value.mode === 'ensemble' ? value.mode : 'trading',
    meter,
    bpm: Math.max(40, Math.min(200, Math.round(Number(value.bpm) || 80))),
    phrases,
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
    bars,
    openEnded: value.openEnded === true,
    style: IMPROVISATION_STYLES.includes(value.style as ImprovisationStyle) ? value.style! : 'rock',
    difficulty: value.difficulty === 'intermediate' || value.difficulty === 'advanced' ? value.difficulty : 'beginner',
    density: value.density === 'sparse' || value.density === 'busy' ? value.density : 'balanced',
    response: value.response === 'copy' || value.response === 'contrast' ? value.response : 'vary',
    scoreReveal: value.scoreReveal === 'one-bar' || value.scoreReveal === 'live' ? value.scoreReveal : 'full',
    exchangePlan,
    sectionLoop,
    kitMix: normalizeDrumMix(value.kitMix ?? DEFAULT_DRUM_MIX),
    ensemblePlayers,
    entry: value.entry === 'none' || VOICES.includes(value.entry as Instrument) ? value.entry! : 'kick',
    audibleCues: value.audibleCues === true,
    fills: value.fills !== false,
    variationSeed: Number.isInteger(value.variationSeed) ? Math.max(0, Math.min(1000000, value.variationSeed!)) : 0,
    adaptiveTempo: value.adaptiveTempo === true,
    pocketMs: Number.isFinite(value.pocketMs) ? Math.max(-40, Math.min(40, Math.round(value.pocketMs! / 5) * 5)) : 0,
    swingRatio: Number.isFinite(value.swingRatio) ? Math.max(50, Math.min(75, Math.round(value.swingRatio!))) : 67,
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
function plannedPrompt(settings: ImprovisationSettings, phrase: number): ImprovisationPrompt {
  const section = phraseSourceIndex(settings, phrase);
  const selected = settings.exchangePlan[section]?.prompt;
  if (selected) return selected;
  const cycle: readonly ImprovisationPrompt[] = BASIC_PROMPTS.includes(settings.prompt as typeof BASIC_PROMPTS[number]) ? BASIC_PROMPTS : IMPROVISATION_PROMPTS.slice(4);
  return (settings.mode === 'guided' || settings.mode === 'ensemble') && settings.cyclePrompts ? cycle[(cycle.indexOf(settings.prompt) + section) % cycle.length] : settings.prompt;
}
export function phraseSourceIndex(settings: ImprovisationSettings, phrase: number) {
  const loop = settings.sectionLoop;
  if (!loop) return phrase;
  let occurrence = 0;
  for (let section = 0; section < settings.phrases; section++) {
    if (occurrence === phrase) return section;
    occurrence++;
    if (section === loop.section) {
      if (phrase < occurrence + loop.repeats) return section;
      occurrence += loop.repeats;
    }
  }
  return phrase;
}
export function sessionPhraseCount(settings: ImprovisationSettings) { return settings.phrases + (settings.sectionLoop?.repeats ?? 0); }
export function improvisationPhraseSettings(settings: ImprovisationSettings, phrase: number): ImprovisationSettings {
  const plan = settings.exchangePlan[phraseSourceIndex(settings, phrase)];
  return { ...settings, meter: plan?.meter ?? settings.meter, bars: plan?.bars ?? settings.bars, bpm: plan?.bpm ?? settings.bpm, groove: plan?.groove ?? settings.groove, prompt: plannedPrompt(settings, phrase) };
}
export function exchangeStart(settings: ImprovisationSettings, phrase: number) {
  const factor = settings.mode === 'trading' ? 2 : 1;
  let start = 0;
  for (let index = 0; index < phrase; index++) start += phraseDuration(improvisationPhraseSettings(settings, index)) * factor;
  return start;
}
export function sessionDuration(settings: ImprovisationSettings) { return settings.openEnded ? Infinity : Array.from({ length: sessionPhraseCount(settings) }, (_, phrase) => phraseDuration(improvisationPhraseSettings(settings, phrase)) * (settings.mode === 'trading' ? 2 : 1)).reduce((sum, value) => sum + value, 0); }
export function playerPhraseStart(settings: ImprovisationSettings, phrase: number) { const phraseSettings = improvisationPhraseSettings(settings, phrase); return exchangeStart(settings, phrase) + (settings.mode === 'trading' ? phraseDuration(phraseSettings) : 0); }
export function sessionSegmentStart(settings: ImprovisationSettings, segment: number) {
  if (settings.mode !== 'trading') return exchangeStart(settings, segment);
  const phrase = Math.floor(segment / 2), phraseSettings = improvisationPhraseSettings(settings, phrase);
  return exchangeStart(settings, phrase) + (segment % 2) * phraseDuration(phraseSettings);
}
export function completedPlayerPhrases(settings: ImprovisationSettings, elapsedMs: number) {
  let count = 0;
  const limit = settings.openEnded ? 1000 : sessionPhraseCount(settings);
  while (count < limit && elapsedMs >= playerPhraseStart(settings, count) + phraseDuration(improvisationPhraseSettings(settings, count))) count++;
  return count;
}
export function promptForPhrase(settings: ImprovisationSettings, phrase: number): ImprovisationPrompt {
  return plannedPrompt(settings, phrase);
}
export function improvisationPosition(settings: ImprovisationSettings, elapsedMs: number): ImprovisationPosition {
  const totalDuration = sessionDuration(settings), complete = !settings.openEnded && elapsedMs >= totalDuration;
  const elapsed = Math.max(0, elapsedMs);
  let phrase = 0, start = 0, segmentElapsed = 0, phraseSettings = improvisationPhraseSettings(settings, 0);
  const limit = settings.openEnded ? 1000 : sessionPhraseCount(settings);
  for (; phrase < limit; phrase++) {
    phraseSettings = improvisationPhraseSettings(settings, phrase);
    const duration = phraseDuration(phraseSettings), exchangeDuration = duration * (settings.mode === 'trading' ? 2 : 1);
    if (elapsed < start + exchangeDuration || phrase === limit - 1) { segmentElapsed = elapsed - start; break; }
    start += exchangeDuration;
  }
  if (complete) { phrase = Math.max(0, sessionPhraseCount(settings) - 1); phraseSettings = improvisationPhraseSettings(settings, phrase); start = exchangeStart(settings, phrase); segmentElapsed = phraseDuration(phraseSettings) * (settings.mode === 'trading' ? 2 : 1); }
  const duration = phraseDuration(phraseSettings), partnerTurn = settings.mode === 'trading' && segmentElapsed < duration;
  const turnElapsed = settings.mode === 'trading' && !partnerTurn ? segmentElapsed - duration : segmentElapsed;
  const { numerator, stepsPerPulse, stepsPerBar } = meterParts(phraseSettings), localSteps = turnElapsed / stepDuration(phraseSettings);
  const localBarStep = localSteps % stepsPerBar;
  const phase = complete ? 'complete' : settings.mode === 'trading' && partnerTurn ? 'partner' : 'player';
  const segment = settings.mode === 'trading' ? phrase * 2 + (partnerTurn ? 0 : 1) : phrase;
  const activePlayer = settings.mode === 'duet' && phase === 'player' ? segment % 2 === 0 ? 1 : 2 : settings.mode === 'ensemble' && phase === 'player' ? phrase % settings.ensemblePlayers.length + 1 : null;
  return { phase, elapsedMs: elapsed, phrase, bar: Math.min(phraseSettings.bars, Math.floor(localSteps / stepsPerBar) + 1), beat: Math.floor(localBarStep / stepsPerPulse) + 1, prompt: phraseSettings.prompt, warning: localSteps >= stepsPerBar * (phraseSettings.bars - 1) && elapsed < totalDuration, activePlayer };
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
  private countInPhrase = 0;
  private countInSettings: ImprovisationSettings;
  constructor(readonly settings: ImprovisationSettings) { this.countInSettings = improvisationPhraseSettings(settings, 0); }
  start(now: number) { this.heldMs = 0; this.begin(now); }
  private begin(now: number) {
    this.countStart = now;
    const heldPosition = improvisationPosition(this.settings, this.heldMs);
    this.countInPhrase = heldPosition.phrase;
    this.countInSettings = improvisationPhraseSettings(this.settings, heldPosition.phrase);
    this.gate = now + barDuration(this.countInSettings);
    this.epoch = this.gate - this.heldMs;
    this.phase = 'count-in';
  }
  position(now: number): ImprovisationPosition {
    const frozen = ['paused', 'stopped', 'idle', 'loading'].includes(this.phase);
    const value = improvisationPosition(this.settings, frozen ? this.heldMs : now - this.epoch);
    if (frozen) return { ...value, phase: this.phase };
    if (now < this.gate) {
      const { numerator, stepsPerPulse } = meterParts(this.countInSettings), pulseMs = stepDuration(this.countInSettings) * stepsPerPulse;
      return { ...value, phase: 'count-in', elapsedMs: this.heldMs, phrase: this.countInPhrase, prompt: this.countInSettings.prompt, bar: 1, beat: Math.min(numerator, Math.max(1, Math.floor((now - this.countStart) / pulseMs) + 1)), warning: false, activePlayer: null };
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
          const subdivisions = swing && denominator === 4 ? [stepsPerPulse * settings.swingRatio / 100] : denominator === 4
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
  if (settings.fills) {
    const tail = stepsPerBar * settings.bars - stepsPerPulse;
    const fill = settings.density === 'sparse' ? [0] : swing && denominator === 4 ? [0, 4 / 3, 8 / 3] : busy ? [0, 1, 2, 3].map(offset => offset * Math.max(0.5, stepsPerPulse / 4)) : [[0, 2, 3], [0, 1, 3], [0, 2, 3], [0, 1, 2]][seed % 4].map(offset => offset * Math.max(0.5, stepsPerPulse / 4));
    for (const offset of fill) add(tail + offset, (Math.round(offset) + seed) % 3 === 0 ? 'snare' : 'tom', 74 + Math.round(offset * 8) + seed % 9);
    if (settings.difficulty === 'advanced' && seed % 3 === 2) add(0, 'crash', 112);
  }
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
export function improvisationAudioEvents(settings: ImprovisationSettings, firstPhrase = 0, count: number = sessionPhraseCount(settings), drummerSettingsForPhrase?: (phrase: number) => ImprovisationSettings, drummerPhraseForPhrase?: (phrase: number, phraseSettings: ImprovisationSettings) => PatternHit[]): ImprovisationAudioEvent[] {
  const events: ImprovisationAudioEvent[] = [], factor = settings.mode === 'trading' ? 2 : 1;
  const endPhrase = settings.openEnded ? firstPhrase + count : Math.min(sessionPhraseCount(settings), firstPhrase + count);
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
  let absoluteBar = 0;
  for (let phrase = 0; phrase < firstPhrase; phrase++) absoluteBar += improvisationPhraseSettings(settings, phrase).bars * factor;
  for (let phrase = firstPhrase; phrase < endPhrase; phrase++) {
    const phraseSettings = drummerSettingsForPhrase?.(phrase) ?? improvisationPhraseSettings(settings, phrase);
    const { numerator, denominator, stepsPerPulse } = meterParts(phraseSettings), pulseMs = stepDuration(phraseSettings) * stepsPerPulse;
    const duration = phraseDuration(phraseSettings), phraseStart = exchangeStart(settings, phrase);
    for (let turn = 0; turn < factor; turn++) {
      const turnStart = phraseStart + turn * duration, playerTurn = settings.mode !== 'trading' || turn === 1;
      for (let bar = 0; bar < phraseSettings.bars; bar++) for (let pulseInBar = 0; pulseInBar < numerator; pulseInBar++) {
        const atMs = turnStart + (bar * numerator + pulseInBar) * pulseMs;
        const sectionBar = absoluteBar + turn * phraseSettings.bars + bar;
        if (phraseSettings.clickTraining === 'steady' || (phraseSettings.clickTraining === 'alternate' ? sectionBar % 2 === 0 : sectionBar % 4 < 2)) events.push({ atMs, kind: 'click', accent: pulseInBar === 0, level: phraseSettings.clickTraining === 'fade' && sectionBar % 4 === 1 ? 0.35 : 1 });
        if (phraseSettings.bass && !(phraseSettings.leaveSpace && playerTurn && pulseInBar !== 0)) {
          const chord = barChord(sectionBar);
          const interval = denominator === 8 ? 3 : numerator >= 4 ? 2 : Math.max(1, Math.floor(numerator / 2));
          if (pulseInBar === 0 || pulseInBar % interval === 0 || phraseSettings.style === 'jazz' || phraseSettings.style === 'shuffle') {
            if (phraseSettings.accompaniment !== 'chords') events.push({ atMs, kind: 'bass', bassPart: pulseInBar === 0 ? 'root' : 'fifth', frequency: pulseInBar === 0 ? chord.root : chord.fifth });
            const chordPulse = denominator === 8 ? pulseInBar % 3 === 0 : pulseInBar % 2 === 0;
            if (phraseSettings.accompaniment !== 'bass' && (pulseInBar === 0 || (progression === 'jazz' && chordPulse))) events.push({ atMs, kind: 'chord', frequencies: chord.notes });
          }
          if (phraseSettings.style === 'funk' && denominator === 4 && phraseSettings.accompaniment !== 'chords' && pulseInBar % 2 === 0 && pulseInBar < numerator - 1 && !(phraseSettings.leaveSpace && playerTurn)) {
            events.push({ atMs: atMs + pulseMs / 2, kind: 'bass', bassPart: 'fifth', frequency: chord.fifth });
          }
        }
      }
    }
    if (settings.mode === 'trading') {
      for (const hit of (drummerPhraseForPhrase?.(phrase, phraseSettings) ?? virtualDrummerPhrase(phrase, phraseSettings))) {
        const pocket = phraseSettings.challenge === 'none' ? phraseSettings.pocketMs : 0;
        const atMs = phraseStart + Math.max(0, Math.min(duration - 1, hit.step * stepDuration(phraseSettings) + pocket));
      events.push({ atMs, kind: 'drum', instrument: hit.instrument, velocity: hit.velocityTarget });
      }
    }
    absoluteBar += phraseSettings.bars * factor;
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
    if (triplet) {
      const swung = step + stepsPerPulse * settings.swingRatio / 100;
      if (swung < totalSteps && !grid.some(mark => Math.abs(mark.step - swung) < 0.015)) grid.push({ step: swung, label: '&' });
    }
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
  return Math.abs(localMs - nearestTimingPosition(settings, localMs));
}
export function nearestTimingPosition(settings: ImprovisationSettings, localMs: number) {
  const grid = timingGridDuration(settings), regular = Math.round(localMs / grid) * grid;
  if (!isSwing(settings)) return regular;
  const { denominator } = meterParts(settings), pulseMs = 60000 / settings.bpm * (denominator === 4 ? 1 : 0.5);
  const pulse = Math.round(localMs / pulseMs), swing = (pulse + settings.swingRatio / 100) * pulseMs;
  return Math.abs(localMs - swing) < Math.abs(localMs - regular) ? swing : regular;
}
export function summarizeImprovisation(settings: ImprovisationSettings, hits: ImprovisationHit[], input: ImprovisationInput, count: number = sessionPhraseCount(settings)): ImprovisationPhraseSummary[] {
  const orderedHits = hits.filter(hit => Number.isFinite(hit.atMs)).slice().sort((a, b) => a.atMs - b.atMs);
  let hitIndex = 0;
  return Array.from({ length: Math.min(1000, count) }, (_, phrase) => {
    const phraseSettings = improvisationPhraseSettings(settings, phrase), beatMs = 60000 / phraseSettings.bpm, windowMs = Math.min(125, beatMs / 4);
    const { numerator, stepsPerPulse } = meterParts(phraseSettings), pulseMs = beatMs * (stepsPerPulse / 4), start = playerPhraseStart(settings, phrase), prompt = phraseSettings.prompt;
    const end = start + phraseDuration(phraseSettings), local: ImprovisationHit[] = [];
    while (hitIndex < orderedHits.length && orderedHits[hitIndex].atMs < start) hitIndex++;
    while (hitIndex < orderedHits.length && orderedHits[hitIndex].atMs < end) {
      const hit = orderedHits[hitIndex++];
      local.push({ ...hit, atMs: hit.atMs - start });
    }
    const result: ImprovisationPhraseSummary = { phrase, prompt, hitCount: input === 'unscored' ? 0 : local.length, timingDistanceMs: null, entryOffsetMs: null, backbeats: null, voiceCompliance: null, restViolations: null, ...(settings.mode === 'duet' ? { activePlayer: phrase % 2 === 0 ? 1 : 2 } : settings.mode === 'ensemble' ? { activePlayer: phrase % settings.ensemblePlayers.length + 1 } : {}) };
    if (input === 'unscored') return result;
    if (phraseSettings.challenge !== 'none' && settings.mode === 'trading') result.challenge = matchChallenge(phraseSettings, phrase, local);
    result.timingDistanceMs = local.length ? Math.round(local.reduce((sum, hit) => sum + timingDistance(phraseSettings, hit.atMs), 0) / local.length) : null;
    const entry = phraseSettings.entry === 'none' ? undefined : local.find(hit => hit.instrument === phraseSettings.entry && hit.atMs <= windowMs);
    result.entryOffsetMs = entry ? Math.round(entry.atMs) : null;
    if (prompt === 'backbeat') {
      const used = new Set<number>(); let matched = 0;
      for (let bar = 0; bar < phraseSettings.bars; bar++) for (const beat of backbeatPulseIndices(phraseSettings)) {
        let closest = -1, distance = Infinity;
        const targetMs = (bar * numerator + beat) * pulseMs;
        local.forEach((hit, index) => { const delta = Math.abs(hit.atMs - targetMs); if (hit.instrument === 'snare' && !used.has(index) && delta <= windowMs && delta < distance) { closest = index; distance = delta; } });
        if (closest >= 0) { used.add(closest); matched++; }
      }
      result.backbeats = { matched, total: phraseSettings.bars * backbeatPulseIndices(phraseSettings).length };
    }
    if (prompt === 'two-voices') result.voiceCompliance = local.length ? Math.round(100 * local.filter(hit => hit.instrument === 'kick' || hit.instrument === 'snare').length / local.length) : null;
    if (prompt === 'space') result.restViolations = local.filter(hit => Math.floor(hit.atMs / pulseMs) % numerator === numerator - 1).length;
    if (phraseSettings.challenge === 'custom') {
      const restBeats = new Set(phraseSettings.customChallenge.rests);
      result.restViolations = local.filter(hit => restBeats.has(Math.floor(hit.atMs / pulseMs))).length;
      const allowed = new Set(phraseSettings.customChallenge.allowed);
      result.voiceCompliance = local.length ? Math.round(100 * local.filter(hit => allowed.has(hit.instrument)).length / local.length) : null;
    }
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
  const phraseSettings = improvisationPhraseSettings(settings, phrase.phrase);
  if (!phrase.hitCount) return 'Start with a short idea and leave space. Try this phrase again slowly.';
  if (phrase.challenge && phrase.challenge.matched < phrase.challenge.total) return phraseSettings.challenge === 'cross-3-2' || phraseSettings.challenge === 'cross-5-4' ? 'Keep the metronome pulse steady and simplify the cross-rhythm until each accent feels even.' : 'Listen to the reference rhythm again. Echo its required notes before developing the rest of your answer.';
  if (phrase.backbeats && phrase.backbeats.matched < phrase.backbeats.total) return 'Keep the snare on the backbeat; simplify the other notes while that settles.';
  if (phrase.restViolations) return 'Leave the final beat silent. Try answering with fewer notes and a clear rest.';
  if (phrase.voiceCompliance !== null && phrase.voiceCompliance < 100) return 'Create variety with kick and snare only; change the rhythm before adding another voice.';
  if (phraseSettings.entry !== 'none' && phrase.entryOffsetMs === null) return 'Count the final bar aloud and prepare your chosen entry on beat 1.';
  if (phrase.timingDistanceMs !== null && phrase.timingDistanceMs > Math.min(50, 60000 / phraseSettings.bpm / 12)) return 'Slow the tempo and keep a simple pulse while developing your idea.';
  if (['motif', 'dynamics', 'rhythm', 'resolution'].includes(phrase.prompt)) return 'Your pulse has timing evidence. Use the reflection question to review the musical idea.';
  return 'The captured notes aligned with the grid and selected constraints. Try changing one musical idea next time.';
}
export function repeatPhraseSettings(settings: ImprovisationSettings, phrase: number, slower: boolean): ImprovisationSettings {
  const selected = improvisationPhraseSettings(settings, phrase);
  const ensembleOffset = settings.mode === 'ensemble' ? phrase % settings.ensemblePlayers.length : 0;
  const ensemblePlayers = ensembleOffset ? [...settings.ensemblePlayers.slice(ensembleOffset), ...settings.ensemblePlayers.slice(0, ensembleOffset)] : settings.ensemblePlayers;
  return { ...selected, phrases: 1, openEnded: false, exchangePlan: [], sectionLoop: null, cyclePrompts: false, prompt: selected.prompt, groove: selected.groove, developmentOffset: (settings.developmentOffset + phrase) % 4, variationSeed: settings.variationSeed + (settings.response === 'copy' ? 0 : phrase), bpm: slower ? Math.max(40, Math.round(selected.bpm * 0.8)) : selected.bpm, playerOneName: settings.mode === 'duet' && phrase % 2 ? settings.playerTwoName : settings.playerOneName, playerTwoName: settings.mode === 'duet' && phrase % 2 ? settings.playerOneName : settings.playerTwoName, ensemblePlayers };
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
export function createImprovisationPresetFile(name: string, settings: ImprovisationSettings) {
  return JSON.stringify({ version: 1, kind: 'drum-hero-improvisation-preset', name: name.trim().slice(0, 80), settings: normalizeImprovisationSettings(settings) }, null, 2);
}
export function parseImprovisationPresetFile(raw: string) {
  const value = JSON.parse(raw);
  const settings = validSettings(value?.settings);
  if (value?.version !== 1 || value?.kind !== 'drum-hero-improvisation-preset' || typeof value?.name !== 'string' || !value.name.trim() || value.name.length > 80 || !settings) throw new Error('This file is not a valid Drum Hero practice preset.');
  return { name: value.name.trim(), settings };
}
export function parseImprovisationHistory(raw: string | null): ImprovisationSummary[] {
  try {
    const data = JSON.parse(raw ?? 'null');
    if (data?.version !== 1 || !Array.isArray(data.sessions)) return [];
    const summaries: ImprovisationSummary[] = [];
    for (const item of data.sessions.slice(-50)) {
      const settings = validSettings(item?.settings);
      if (!settings || item.version !== 1 || typeof item.id !== 'string' || !item.id || item.id.length > 100 || typeof item.playedAt !== 'string' || !Number.isFinite(Date.parse(item.playedAt)) || !['keyboard', 'touch', 'midi', 'unscored'].includes(item.input) || !Array.isArray(item.phrases) || (!settings.openEnded && item.phrases.length !== sessionPhraseCount(settings)) || item.phrases.length < 1 || item.phrases.length > 1000) continue;
      const phrases: ImprovisationPhraseSummary[] = [];
      for (let index = 0; index < item.phrases.length; index++) {
        const p = item.phrases[index];
        const phraseSettings = improvisationPhraseSettings(settings, index), expectedBackbeats = phraseSettings.bars * backbeatPulseIndices(phraseSettings).length;
        if (!p || p.phrase !== index || p.prompt !== promptForPhrase(settings, index) || !Number.isInteger(p.hitCount) || !finite(p.hitCount, 100000) || (p.timingDistanceMs !== null && !finite(p.timingDistanceMs, 250)) || (p.entryOffsetMs !== null && !finite(p.entryOffsetMs, 125)) || (p.voiceCompliance !== null && !finite(p.voiceCompliance, 100)) || (p.restViolations !== null && (!Number.isInteger(p.restViolations) || !finite(p.restViolations, p.hitCount))) || (p.backbeats !== null && (!p.backbeats || p.backbeats.total !== expectedBackbeats || !Number.isInteger(p.backbeats.matched) || !finite(p.backbeats.matched, p.backbeats.total))) || (p.activePlayer !== undefined && (!Number.isInteger(p.activePlayer) || p.activePlayer < 1 || p.activePlayer > (settings.mode === 'ensemble' ? settings.ensemblePlayers.length : 2)))) break;
        phrases.push({ phrase: index, prompt: p.prompt, hitCount: p.hitCount, timingDistanceMs: p.timingDistanceMs, entryOffsetMs: p.entryOffsetMs, backbeats: p.backbeats === null ? null : { matched: p.backbeats.matched, total: p.backbeats.total }, voiceCompliance: p.voiceCompliance, restViolations: p.restViolations, ...(Number.isInteger(p.activePlayer) && p.activePlayer >= 1 && p.activePlayer <= 4 ? { activePlayer: p.activePlayer } : {}), ...(p.challenge && Number.isInteger(p.challenge.total) && finite(p.challenge.total, 128) && Number.isInteger(p.challenge.matched) && finite(p.challenge.matched, p.challenge.total) ? { challenge: { matched: p.challenge.matched, total: p.challenge.total } } : {}), ...(typeof p.reflection === 'string' ? { reflection: p.reflection.slice(0, 500) } : {}) });
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
      const maxMs = playerPhraseStart(settings, take.phrases - 1) + phraseDuration(improvisationPhraseSettings(settings, take.phrases - 1));
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
  { id: 'motif', title: 'Repeat a motif', description: 'Keep one short rhythm recognizable as you play it back.', prompt: 'motif', response: 'vary' },
  { id: 'ending', title: 'Change the ending', description: 'Echo the opening bars, then make a different ending of your own.', prompt: 'free', response: 'vary', challenge: 'ending' },
  { id: 'accents', title: 'Shift the accents', description: 'Play three even accents across a two-beat pulse while keeping the quarter-note pulse steady.', prompt: 'free', response: 'vary', challenge: 'cross-3-2' },
  { id: 'freely', title: 'Trade freely', description: 'Contrast the drummer’s phrase, shape the dynamics, and finish deliberately.', prompt: 'resolution', response: 'contrast' }
] as const;
export function learningStepSettings(step: number): ImprovisationSettings {
  const index = Math.max(0, Math.min(IMPROVISATION_PATH.length - 1, step)), lesson = IMPROVISATION_PATH[index];
  return { ...DEFAULT_IMPROVISATION_SETTINGS, mode: 'trading', bars: 2, phrases: 2, bpm: 60 + index * 5, difficulty: index > 2 ? 'intermediate' : 'beginner', density: 'sparse', prompt: lesson.prompt, response: lesson.response, challenge: 'challenge' in lesson ? lesson.challenge : 'none', entry: 'challenge' in lesson ? 'none' : 'kick', fills: false };
}
export function comparableImprovisationSessions(history: ImprovisationSummary[], reference: ImprovisationSummary) {
  if (reference.engineVersion !== 2 || reference.input === 'unscored' || !reference.inputContext) return [];
  const keys = ['mode', 'meter', 'bars', 'sectionLoop', 'exchangePlan', 'kitMix', 'ensemblePlayers', 'style', 'entry', 'prompt', 'cyclePrompts', 'difficulty', 'density', 'fills', 'variationSeed', 'response', 'developmentOffset', 'challenge', 'customChallenge', 'answerVoice', 'clickTraining', 'progression', 'bassLevel', 'accompaniment', 'key', 'leaveSpace', 'bass', 'clickLevel', 'groove', 'subdivision', 'customGroove', 'adaptiveDrummer', 'adaptiveTempo', 'pocketMs', 'swingRatio', 'playerOneName', 'playerTwoName'] as const;
  return history.filter(item => item.engineVersion === 2 && item.input === reference.input && item.inputContext === reference.inputContext && Math.abs(item.settings.bpm - reference.settings.bpm) <= 5 && keys.every(key => JSON.stringify(item.settings[key]) === JSON.stringify(reference.settings[key]))).map(item => {
    const distances = item.phrases.flatMap(p => p.timingDistanceMs === null ? [] : [p.timingDistanceMs]);
    return { id: item.id, playedAt: item.playedAt, bpm: item.settings.bpm, timingDistanceMs: distances.length ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length) : null, backbeats: item.phrases.reduce((sum, p) => sum + (p.backbeats?.matched ?? 0), 0), backbeatTargets: item.phrases.reduce((sum, p) => sum + (p.backbeats?.total ?? 0), 0), restViolations: item.phrases.reduce((sum, p) => sum + (p.restViolations ?? 0), 0) };
  });
}


export const CHALLENGE_LABELS = { none: 'Open improvisation', echo: 'Echo the rhythm', ending: 'Keep the opening, change the ending', orchestrate: 'Move the rhythm to another drum', development: 'Develop one motif over four exchanges', 'cross-3-2': 'Cross rhythm · three over two', 'cross-5-4': 'Cross rhythm · five over four', custom: 'Build a custom challenge' } as const;
export function challengeReference(settings: ImprovisationSettings): PatternHit[] {
  const { numerator, stepsPerPulse, stepsPerBar } = meterParts(settings);
  if (settings.challenge === 'custom') return settings.customChallenge.hits.map(hit => ({ ...hit, velocityTarget: 90 }));
  if (settings.challenge === 'cross-3-2') return Array.from({ length: settings.bars }, (_, bar) => {
    const cycle = 2 * stepsPerPulse, cycles = Math.ceil(stepsPerBar / cycle);
    return Array.from({ length: cycles }, (_, c) => Array.from({ length: 3 }, (_, i) => ({ step: bar * stepsPerBar + c * cycle + i * cycle / 3, instrument: settings.answerVoice, velocityTarget: i === 0 ? 104 : 82 }))).flat().filter(hit => hit.step < (bar + 1) * stepsPerBar);
  }).flat();
  if (settings.challenge === 'cross-5-4') return Array.from({ length: settings.bars }, (_, bar) => Array.from({ length: 5 }, (_, i) => ({ step: bar * stepsPerBar + i * stepsPerBar / 5, instrument: settings.answerVoice, velocityTarget: i === 0 ? 104 : 82 }))).flat();
  const snarePulses = backbeatPulseIndices(settings), candidateKick = numerator >= 4 ? 2 : 1, kickPulse = snarePulses.includes(candidateKick) ? (candidateKick + 1) % numerator : candidateKick;
  return Array.from({ length: settings.bars }, (_, bar) => [0, kickPulse * stepsPerPulse, ...snarePulses.map(pulse => pulse * stepsPerPulse)].map((step, index) => ({ step: bar * stepsPerBar + step, instrument: index < 2 ? 'kick' : 'snare', velocityTarget: index < 2 ? 100 : 90 } as PatternHit))).flat();
}
export function challengeInstruction(settings: ImprovisationSettings, phrase: number) {
  if (settings.challenge === 'custom') return 'Play the outlined notes, use only the allowed drums, and leave the marked beats empty.';
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
  const targets = challengeTargets(settings, phrase), used = new Set<number>(), windowMs = Math.min(125, 60000 / settings.bpm / 4);
  let matched = 0;
  for (const target of targets) {
    const at = target.step * stepDuration(settings); let best = -1, distance = Infinity;
    local.forEach((hit, i) => { const d = Math.abs(hit.atMs - at); if (!used.has(i) && hit.instrument === target.instrument && d <= windowMs && d < distance) { best = i; distance = d; } });
    if (best >= 0) { matched++; used.add(best); }
  }
  return { matched, total: targets.length };
}
export function timingReview(settings: ImprovisationSettings, local: ImprovisationHit[]) {
  return local.map(hit => { const nearestMs = nearestTimingPosition(settings, hit.atMs); return { ...hit, nearestMs, offsetMs: Math.round(hit.atMs - nearestMs) }; });
}
export function adaptiveTempoBpm(settings: ImprovisationSettings, phrases: ImprovisationPhraseSummary[]) {
  const evidence = phrases.filter(phrase => phrase.hitCount > 0 && phrase.timingDistanceMs !== null).slice(-8);
  if (!settings.adaptiveTempo || evidence.length < 3) return null;
  const mean = evidence.reduce((sum, phrase) => sum + (phrase.timingDistanceMs ?? 0), 0) / evidence.length;
  const increaseAt = Math.min(25, 60000 / settings.bpm / 12), decreaseAt = Math.min(75, 60000 / settings.bpm / 4);
  if (mean <= increaseAt && settings.bpm < 200) return Math.min(200, settings.bpm + 3);
  if (mean >= decreaseAt && settings.bpm > 40) return Math.max(40, settings.bpm - 3);
  return null;
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
