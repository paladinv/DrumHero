'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDrumAudio, type DrumAudio, type TrainerClickSound } from '@/lib/audio';
import { compactNotation, type CompactMeasure } from '@/lib/song-compact-notation';
import { allSongs, readActiveSongLibrary, songPartPattern, type AttemptEventTiming, type AttemptExtraTiming, type DrumSong } from '@/lib/song-library';
import { defaultTrainerDeviceProfile, getTrainerDeviceProfile, normalizeMidiPadVelocity, parseTrainerState, trainerStorageKey } from '@/lib/trainer';
import { classifyDrumAudio, classifyDrumFeatures, createDrumOnsetState, drumSpectrumFeatures, isFreshDrumOnset } from '@/lib/trainer-audio';
import { learnerStorageKey } from '@/lib/learner-profiles';
import { adaptiveSightPreviewSeconds, adaptiveSightSettings, assignSightSticking, buildSightGoalPath, createSightBarDrill, createSightErrorDrill, createSightExerciseFromPattern, createSightExerciseFromTemplate, createSightRangeDrill, DEFAULT_SIGHT_SETTINGS, leastPracticedSightSettings, SIGHT_GOAL_KEY, SIGHT_HISTORY_CHANGED_EVENT, SIGHT_HISTORY_KEY, SIGHT_LEARNING_PATH, SIGHT_SEEN_KEY, SIGHT_TEMPLATES_KEY, SIGHT_VOICES, describeSightExercise, generateFreshSightExercise, generateSightExercise, matchingSightGoalAttempts, nextSightLearningPathStep, normalizeSightSettings, parseSightFingerprints, parseSightGoal, parseSightHistory, parseSightTemplates, recentSightFingerprints, recommendSightSettings, scoreSightAttempt, sightArticulationVoice, sightBarBeatStarts, sightBarStarts, sightBarSteps, sightBarsForDuration, sightBeatBar, sightClassification, sightDuration, sightExerciseMeters, sightFingerprint, sightMeterBeats, sightMeterGroupStarts, sightMeters, sightNotationBars, sightStepBar, sightStepLocal, sightTotalBeats, sightTotalSteps, sightVarietySummary, sightVoiceScores, weakestSightBar, type SightAttempt, type SightCountSubdivision, type SightCustomTemplate, type SightExercise, type SightGoal, type SightHit, type SightInput, type SightPhase, type SightRhythmFocus, type SightSettings, type SightSourcePattern, type SightStyle } from '@/lib/sight-reading';
import { useProgress } from './ProgressProvider';
import styles from './SightReading.module.css';
const keys = ['Space', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'];
const labels = ['Kick', 'Snare', 'Hi-hat', 'Tom', 'Crash'];
const notationSong: DrumSong = { id: 'sight', title: 'Sight-reading exercise', artist: 'Drum Hero', difficulty: 'Beginner', bpm: 80, meter: '4/4', tags: [], notes: '', sections: [], createdAt: '', updatedAt: '' };
type SightRepertoireOption = SightSourcePattern;
type SightAudioPreferences = { drumLevel: number; targetLevel: number; clickLevel: number; clickSound: TrainerClickSound; groupedAccents: boolean };
const DEFAULT_SIGHT_AUDIO: SightAudioPreferences = { drumLevel: 0.9, targetLevel: 0.55, clickLevel: 0.65, clickSound: 'woodblock', groupedAccents: true };
function readSightRepertoire(): SightRepertoireOption[] {
  try {
    return allSongs(readActiveSongLibrary()).filter(song => !song.archived).flatMap(song => song.sections.flatMap(section => section.parts.map(part => {
      const pattern = songPartPattern(song, section, part);
      const meter = part.meter ?? section.meter ?? song.meter;
      return { id: pattern.id, label: `${song.title} · ${section.name} · ${part.name}`, level: song.difficulty, meter, subdivision: part.subdivision, beats: part.beats, bpm: part.bpm, hits: pattern.hits };
    }))).filter(pattern => !!pattern.meter.match(/^(4\/4|3\/4|5\/4|7\/8)/) && [4,8,12,16].includes(pattern.subdivision) && !(pattern.meter.startsWith('7/8') && pattern.subdivision % 8 !== 0) && pattern.hits.some(hit => SIGHT_VOICES.includes(hit.instrument)));
  } catch { return []; }
}
const countSyllables: Record<SightCountSubdivision, string[]> = { quarter: [''], eighth: ['', '&'], sixteenth: ['', 'e', '&', 'a'] };
const countDivisions: Record<SightCountSubdivision, number> = { quarter: 1, eighth: 2, sixteenth: 4 };
function savedInputState(profileId: string) {
  try { return parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))); }
  catch { return parseTrainerState(null); }
}
type ReadingAssignment = { seed: number; settings: SightSettings; title?: string; dueDate?: string; minimumAccuracy?: number };
function validAssignmentDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value); }
function encodeAssignmentCode(exercise: SightExercise, metadata: Omit<ReadingAssignment, 'seed' | 'settings'> = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify({ version: 1, seed: exercise.seed, settings: exercise.settings, ...metadata }));
  const payload = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return `DH-SA1:${payload}`;
}
function decodeAssignmentCode(code: string): ReadingAssignment | null {
  try {
    const value = code.trim();
    if (value.startsWith('DH-SA1:')) {
      const payload = value.slice(7).replaceAll('-', '+').replaceAll('_', '/');
      const padded = payload.padEnd(payload.length + ((4 - payload.length % 4) % 4), '=');
      const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0)))) as Partial<ReadingAssignment> & { version?: number };
      const seed = parsed.seed;
      if (parsed.version !== 1 || !Number.isInteger(seed) || (seed as number) < 0 || (seed as number) > 0xffffffff || !parsed.settings) return null;
      const minimumAccuracy = parsed.minimumAccuracy;
      if (minimumAccuracy !== undefined && (!Number.isInteger(minimumAccuracy) || minimumAccuracy < 50 || minimumAccuracy > 100)) return null;
      const dueDate = parsed.dueDate;
      if (dueDate !== undefined && (typeof dueDate !== 'string' || !validAssignmentDate(dueDate))) return null;
      return { seed: seed as number, settings: normalizeSightSettings(parsed.settings), title: typeof parsed.title === 'string' ? parsed.title.slice(0, 80) : undefined, dueDate, minimumAccuracy };
    }
    const [seedText, payload, ...extra] = value.replace(/^DH-SR1:/, '').split('.');
    const seed = Number(seedText);
    if (extra.length || !payload || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    const raw = payload.replaceAll('-', '+').replaceAll('_', '/');
    const padded = raw.padEnd(raw.length + ((4 - raw.length % 4) % 4), '=');
    const settings = JSON.parse(atob(padded)) as SightSettings;
    return { seed, settings: normalizeSightSettings(settings) };
  } catch { return null; }
}
function encodeJSONCode(prefix: string, value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return `${prefix}${btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}
function decodeJSONCode<T>(code: string, prefix: string): T | null {
  try {
    const payload = code.trim().slice(prefix.length).replaceAll('-', '+').replaceAll('_', '/');
    const padded = payload.padEnd(payload.length + ((4 - payload.length % 4) % 4), '=');
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), c => c.charCodeAt(0)))) as T;
  } catch { return null; }
}
function scheduleMidiTimingClicks(player: DrumAudio, bpm: number) {
  const beatMs = 60000 / bpm, first = performance.now() + 2000;
  const expected = Array.from({ length: 8 }, (_, index) => first + index * beatMs);
  player.setClickSound('woodblock');
  for (let click = 0; click < 12; click++) player.scheduleClick(first - 4 * beatMs + click * beatMs, click % 4 === 0);
  return { expected, timeoutMs: expected[expected.length - 1] - performance.now() + 900 };
}
type ScoreReveal = 'full' | 'current' | 'ahead-1' | 'ahead-2';
function Notation({ exercise, cursor, review, showSticking = false, cursorVisible = true, revealMode = 'full' }: { exercise: SightExercise; cursor?: { barIndex: number; fraction: number }; review?: { events: AttemptEventTiming[]; extras: AttemptExtraTiming[] }; showSticking?: boolean; cursorVisible?: boolean; revealMode?: ScoreReveal }) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const manualScrollAt = useRef(0);
  const [layout, setLayout] = useState<{ measures: CompactMeasure[]; height: number }>({ measures: [], height: 1 });
  const [zoom, setZoom] = useState(100);
  const bars = useMemo(() => sightNotationBars(exercise, showSticking), [exercise, showSticking]);
  const activeBar = cursor?.barIndex;
  useEffect(() => {
    if (!host.current) return;
    const options = { barsPerPage: 8 as const, barsPerLine: 2 as const, cymbalNoteheads: 'cross' as const, showSticking, beamGrouping: 'auto' as const };
    const pages = Array.from({ length: Math.ceil(bars.length / 8) }, (_, page) => compactNotation({ ...notationSong, bpm: exercise.settings.bpm, meter: bars[0].meter }, bars, 'staff', page, undefined, options, review));
    const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = pages.reduce((sum, page) => sum + page.canvas.height, 0);
    const context = canvas.getContext('2d');
    if (!context) return;
    const measures: CompactMeasure[] = []; let top = 0;
    for (const page of pages) { context.drawImage(page.canvas, 0, top); measures.push(...page.measures.map(measure => ({ ...measure, y: measure.y + top }))); top += page.canvas.height; }
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${exercise.settings.meter} drum notation for ${exercise.settings.bars} bars; detailed beat-by-beat description follows`);
    host.current.replaceChildren(canvas); setLayout({ measures, height: canvas.height });
  }, [bars, exercise, review, showSticking]);
  useEffect(() => {
    const canvas = host.current?.querySelector('canvas');
    const frame = scroller.current;
    if (!canvas || !frame || activeBar === undefined || Date.now() - manualScrollAt.current < 3000) return;
    const target = layout.measures.find(m => m.barIndex === activeBar);
    if (!target) return;
    const scale = canvas.getBoundingClientRect().width / canvas.width;
    if (target.x * scale < frame.scrollLeft || (target.x + target.width) * scale > frame.scrollLeft + frame.clientWidth) frame.scrollTo({ left: Math.max(0, target.x * scale - 20), behavior: 'auto' });
    const top = canvas.getBoundingClientRect().top + target.y * scale;
    const bottom = top + target.height * scale;
    if (top < 60 || bottom > innerHeight - 60) window.scrollTo({ top: window.scrollY + top - 80, behavior: 'instant' });
  }, [activeBar, exercise, layout]);
  const current = layout.measures.find(m => m.barIndex === cursor?.barIndex);
  const playheadX = current ? current.x + 18 + Math.max(0, Math.min(1, cursor?.fraction ?? 0)) * (current.width - 38) : 0;
  const lookahead = revealMode === 'ahead-2' ? 2 : revealMode === 'ahead-1' ? 1 : 0;
  const hiddenMeasures = revealMode === 'full' || cursor?.barIndex === undefined ? [] : layout.measures.filter(measure => measure.barIndex < cursor.barIndex! || measure.barIndex > cursor.barIndex! + lookahead);
  return <section><label>Notation zoom <select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[75,100,125,150,200].map(n => <option key={n} value={n}>{n}%</option>)}</select></label><div ref={scroller} className={styles.scroll} onWheel={() => { manualScrollAt.current = Date.now(); }} onTouchStart={() => { manualScrollAt.current = Date.now(); }}><div className={styles.notationFrame} style={{ width: `${zoom}%` }}><div ref={host} className={styles.notation} />{layout.measures.length > 0 && <svg className={styles.playhead} viewBox={`0 0 1100 ${layout.height}`} preserveAspectRatio="none" aria-hidden="true">{hiddenMeasures.map(measure => <rect key={`hidden-${measure.barIndex}`} x={measure.x} y={measure.y} width={measure.width} height={measure.height} fill="var(--paper, #fffdf8)" />)}{current && <><rect x={current.x} y={current.y + 32} width={current.width} height={current.height - 32} fill="#d03b2d" fillOpacity=".06" />{cursorVisible && <line x1={playheadX} x2={playheadX} y1={current.y + 32} y2={current.y + current.height} stroke="#d03b2d" strokeWidth="3" />}</>}</svg>}{hiddenMeasures.length > 0 && <p className="visually-hidden" role="status">Score reveal challenge: showing the current measure and {lookahead} measures ahead. Other measures are hidden during this pass.</p>}</div></div></section>;
}
export function SightReading() {
  const { profileId, hydrated } = useProgress();
  return hydrated ? <ReadingSession key={profileId} profileId={profileId} /> : <p role="status">Loading sight reading…</p>;
}
function ReadingSession({ profileId }: { profileId: string }) {
  const [settings, setSettings] = useState<SightSettings>(DEFAULT_SIGHT_SETTINGS);
  const [lengthPreset, setLengthPreset] = useState<30 | 60 | 90 | 'custom'>(30);
  const [exercise, setExercise] = useState<SightExercise | null>(null);
  const [exerciseOrigin, setExerciseOrigin] = useState<'generated' | 'repertoire' | 'template'>('generated');
  const [repertoireSources, setRepertoireSources] = useState<SightRepertoireOption[]>([]);
  const [repertoireId, setRepertoireId] = useState('');
  const [sightTemplates, setSightTemplates] = useState<SightCustomTemplate[]>([]);
  const [templateDraft, setTemplateDraft] = useState<Array<{ step: number; instrument: typeof SIGHT_VOICES[number]; accent?: boolean }>>([]);
  const [templateName, setTemplateName] = useState('My reading phrase');
  const [templateAccent, setTemplateAccent] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [velocityCalibration, setVelocityCalibration] = useState<{ voice: typeof SIGHT_VOICES[number]; note: number; stage: 'soft' | 'accent'; samples: number[]; soft?: number } | null>(null);
  const [phase, setPhase] = useState<SightPhase>('setup');
  const [source, setSource] = useState<SightInput>('keyboard');
  const [audioConnected, setAudioConnected] = useState(false);
  const [audioProfileKey, setAudioProfileKey] = useState('audio:default');
  const [audioProfileRevision, setAudioProfileRevision] = useState(0);
  const [audioStatus, setAudioStatus] = useState('Microphone is off.');
  const [audioUncertain, setAudioUncertain] = useState(0);
  const [audioCalibrationVoice, setAudioCalibrationVoice] = useState<typeof SIGHT_VOICES[number]>('snare');
  const [audioCalibrationHits, setAudioCalibrationHits] = useState(0);
  const [audioCalibrationPrompt, setAudioCalibrationPrompt] = useState('');
  const [playTargetDrums, setPlayTargetDrums] = useState(true);
  const [liveFeedback, setLiveFeedback] = useState(false);
  const [liveHitMessage, setLiveHitMessage] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [midiId, setMidiId] = useState('');
  const [inputs, setInputs] = useState<Array<{ id: string; name: string }>>([]);
  const [message, setMessage] = useState('');
  const [clock, setClock] = useState(0);
  const [history, setHistory] = useState<SightAttempt[]>([]);
  const [clockNow, setClockNow] = useState(0);
  const [goal, setGoal] = useState<SightGoal | null>(null);
  const [goalDraft, setGoalDraft] = useState<SightGoal>({ level: 'Beginner', meter: '4/4', bpm: 100, focusRhythm: 'eighths', accuracy: 85, targetReads: 5 });
  const [goalMessage, setGoalMessage] = useState('');
  const [historyFilters, setHistoryFilters] = useState({ level: 'Any', meter: 'Any', source: 'Any', tempo: 'Any' });
  const [showSetupNotation, setShowSetupNotation] = useState(false);
  const [tempoLadder, setTempoLadder] = useState(false);
  const [previewSeconds, setPreviewSeconds] = useState<0 | 5 | 10>(10);
  const [countInBars, setCountInBars] = useState<0 | 1 | 2>(1);
  const [countInSubdivision, setCountInSubdivision] = useState<SightCountSubdivision>('quarter');
  const [countInSyllable, setCountInSyllable] = useState('1');
  const [spokenCountIn, setSpokenCountIn] = useState(false);
  const [adaptiveMode, setAdaptiveMode] = useState(false);
  const [cueLevel, setCueLevel] = useState<'full' | 'compact' | 'standard' | 'adaptive'>('full');
  const [showSticking, setShowSticking] = useState(false);
  const [hideCursorDuringPlay, setHideCursorDuringPlay] = useState(false);
  const [scoreReveal, setScoreReveal] = useState<ScoreReveal>('full');
  const [focusMode, setFocusMode] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const rootElement = useRef<HTMLDivElement>(null);
  const [reviewCursor, setReviewCursor] = useState<{ barIndex: number; fraction: number } | null>(null);
  const [sessionLength, setSessionLength] = useState<3 | 5 | 10>(5);
  const [sessionQueue, setSessionQueue] = useState<SightExercise[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionMetrics, setSessionMetrics] = useState<Array<{ accuracy: number; timingSpreadMs: number | null }>>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionLabel, setSessionLabel] = useState('Practice set');
  const [reviewSpeed, setReviewSpeed] = useState(1);
  const [audioPreferences, setAudioPreferences] = useState<SightAudioPreferences>(DEFAULT_SIGHT_AUDIO);
  const [audioPreferencesLoaded, setAudioPreferencesLoaded] = useState(false);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [rangeRepeats, setRangeRepeats] = useState(2);
  const [midiCheckRemaining, setMidiCheckRemaining] = useState<Array<typeof SIGHT_VOICES[number]>>([]);
  const [midiCheckVerified, setMidiCheckVerified] = useState<Array<typeof SIGHT_VOICES[number]>>([]);
  const [midiTimingStatus, setMidiTimingStatus] = useState('');
  const [midiTimingActive, setMidiTimingActive] = useState(false);
  const [drillParent, setDrillParent] = useState<SightExercise | null>(null);
  const [midiMappingVoice, setMidiMappingVoice] = useState<typeof SIGHT_VOICES[number] | null>(null);
  const [sharedAssignment, setSharedAssignment] = useState(false);
  const [assignmentCode, setAssignmentCode] = useState('');
  const [assignmentTitle, setAssignmentTitle] = useState('Reading assignment');
  const [assignmentDueDate, setAssignmentDueDate] = useState('');
  const [assignmentMinimumAccuracy, setAssignmentMinimumAccuracy] = useState(80);
  const [loadedAssignment, setLoadedAssignment] = useState<ReadingAssignment | null>(null);
  const [result, setResult] = useState<ReturnType<typeof scoreSightAttempt> | null>(null);
  const [confidenceRecorded, setConfidenceRecorded] = useState(true);
  const [confidenceRating, setConfidenceRating] = useState<number | null>(null);
  const [confidenceEntryId, setConfidenceEntryId] = useState<string | null>(null);
  const [classification, setClassification] = useState<SightAttempt['classification']>('reading');
  const [transferSettings, setTransferSettings] = useState<SightSettings | null>(null);
  const [transferCheck, setTransferCheck] = useState(false);
  const [reference, setReference] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const audio = useRef<DrumAudio | null>(null);
  const audioStream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const audioAnalyser = useRef<AnalyserNode | null>(null);
  const audioFrame = useRef<number | null>(null);
  const audioOnset = useRef(createDrumOnsetState());
  const audioProfileKeyRef = useRef('audio:default');
  const audioCalibration = useRef<{ voice: typeof SIGHT_VOICES[number]; features: number[][] } | null>(null);
  const audioHit = useRef<(voice: typeof SIGHT_VOICES[number], at: number) => void>(() => {});
  const velocityCalibrationRef = useRef<typeof velocityCalibration>(null);
  const midi = useRef<MIDIAccess | null>(null);
  const selectedMidi = useRef('');
  const midiMappingVoiceRef = useRef<typeof SIGHT_VOICES[number] | null>(null);
  const midiCheckRemainingRef = useRef<Array<typeof SIGHT_VOICES[number]>>([]);
  const midiTimingRef = useRef<{ expected: number[]; hits: number[]; next: number } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const token = useRef(0);
  const running = useRef(false);
  const attempted = useRef(false);
  const practicePass = useRef(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasAttempted, setHasAttempted] = useState(false);
  const assisted = useRef(false);
  const capture = useRef<{ start: number; end: number; correction: number; calibrated: boolean; calibrationSpreadMs: number | null; calibrationAt: string | null; hits: SightHit[] } | null>(null);
  const historyRef = useRef<SightAttempt[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const confidenceHeading = useRef<HTMLHeadingElement>(null);
  const historyKey = learnerStorageKey(SIGHT_HISTORY_KEY, profileId);
  const seenKey = learnerStorageKey(SIGHT_SEEN_KEY, profileId);
  const goalKey = learnerStorageKey(SIGHT_GOAL_KEY, profileId);
  const templatesKey = learnerStorageKey(SIGHT_TEMPLATES_KEY, profileId);
  const audioPreferencesKey = learnerStorageKey('drum-hero:sight-reading-audio:v1', profileId);
  const active = preparing || midiTimingActive || ['preview','count-in','playing'].includes(phase);
  const phraseMemory = () => {
    let stored: string[] = [];
    try { stored = parseSightFingerprints(localStorage.getItem(seenKey)); } catch { stored = []; }
    return [...recentSightFingerprints(history), ...stored].slice(-32);
  };
  const rememberPhrase = (phrase: SightExercise) => {
    try {
      const fingerprint = sightFingerprint(phrase), seen = parseSightFingerprints(localStorage.getItem(seenKey)).filter(value => value !== fingerprint);
      localStorage.setItem(seenKey, JSON.stringify([...seen, fingerprint].slice(-32)));
    } catch { /* history remains available if browser storage is full */ }
  };
  const selectedRepertoire = repertoireSources.find(item => item.id === repertoireId);
  const effectiveCueLevel = cueLevel === 'adaptive' ? (() => {
    const recent = history.filter(row => row.classification === 'reading' && row.settings.level === settings.level && row.settings.meter === settings.meter && row.source === source && (exerciseOrigin !== 'repertoire' || row.sourceLabel === selectedRepertoire?.label)).slice(-3);
    if (recent.length < 3) return 'full' as const;
    const average = recent.reduce((sum, row) => sum + row.accuracy, 0) / recent.length;
    return average >= 90 ? 'standard' as const : average >= 80 ? 'compact' as const : 'full' as const;
  })() : cueLevel;
  const makeCurrentExercise = (seed: number, previous = phraseMemory()): SightExercise => {
    if (exerciseOrigin === 'template') {
      const template = sightTemplates.find(item => item.id === selectedTemplateId) ?? sightTemplates[0];
      if (template) return createSightExerciseFromTemplate(settings, template, seed);
      setMessage('Choose or save a custom phrase template first.');
    }
    if (exerciseOrigin === 'repertoire' && selectedRepertoire) {
      const excerpt = createSightExerciseFromPattern(settings, selectedRepertoire, seed);
      if (excerpt) return excerpt;
      setMessage('This song part cannot be excerpted with the selected sight-reading settings.');
    }
    return generateFreshSightExercise(settings, seed, previous);
  };
  const stop = useCallback(() => {
    token.current++; running.current = false; capture.current = null;
    midiTimingRef.current = null; setMidiTimingActive(false);
    timers.current.forEach(clearTimeout); timers.current = [];
    if (ticker.current) clearInterval(ticker.current); ticker.current = null;
    audio.current?.close(); audio.current = null;
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current); feedbackTimer.current = null;
    setLiveHitMessage('');
    window.speechSynthesis?.cancel();
  }, []);
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);
  useEffect(() => {
    const refresh = () => {
      const items = readSightRepertoire();
      setRepertoireSources(items);
      setRepertoireId(current => items.some(item => item.id === current) ? current : items[0]?.id ?? '');
    };
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener('drum-hero:song-library-change', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('drum-hero:song-library-change', refresh); };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = JSON.parse(localStorage.getItem(audioPreferencesKey) || 'null') as Partial<SightAudioPreferences> | null;
        if (raw) {
          const level = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
          setAudioPreferences({ ...DEFAULT_SIGHT_AUDIO, drumLevel: level(raw.drumLevel, DEFAULT_SIGHT_AUDIO.drumLevel), targetLevel: level(raw.targetLevel, DEFAULT_SIGHT_AUDIO.targetLevel), clickLevel: level(raw.clickLevel, DEFAULT_SIGHT_AUDIO.clickLevel), clickSound: ['hat','woodblock','beep'].includes(String(raw.clickSound)) ? raw.clickSound as TrainerClickSound : DEFAULT_SIGHT_AUDIO.clickSound, groupedAccents: raw.groupedAccents !== false });
        }
      } catch { /* use defaults when local preferences are unavailable */ }
      setAudioPreferencesLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [audioPreferencesKey]);
  useEffect(() => {
    if (!audioPreferencesLoaded) return;
    try { localStorage.setItem(audioPreferencesKey, JSON.stringify(audioPreferences)); } catch { setMessage('Audio preferences could not be saved.'); }
  }, [audioPreferences, audioPreferencesKey, audioPreferencesLoaded]);
  useEffect(() => {
    audio.current?.setMasterLevel(audioPreferences.drumLevel);
    audio.current?.setTargetLevel(audioPreferences.targetLevel);
    audio.current?.setClickLevel(audioPreferences.clickLevel);
    audio.current?.setClickSound(audioPreferences.clickSound);
  }, [audioPreferences]);
  const togglePerformanceView = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      setFocusMode(false);
      return;
    }
    if (focusMode) { setFocusMode(false); return; }
    setFocusMode(true);
    try { await rootElement.current?.requestFullscreen?.(); }
    catch { setMessage('Performance view is on. Full screen is unavailable in this browser.'); }
  };
  const stopSightAudio = useCallback(() => {
    if (audioFrame.current !== null) cancelAnimationFrame(audioFrame.current);
    audioFrame.current = null; audioAnalyser.current = null; audioCalibration.current = null;
    audioStream.current?.getTracks().forEach(track => track.stop()); audioStream.current = null;
    if (audioContext.current) void audioContext.current.close(); audioContext.current = null;
    audioOnset.current = createDrumOnsetState(); setAudioConnected(false); setAudioCalibrationHits(0); setAudioStatus('Microphone is off.');
  }, []);
  useEffect(() => {
    if (source !== 'audio-voices' && audioStream.current) stopSightAudio();
  }, [source, stopSightAudio]);
  const connectSightAudio = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setAudioStatus('Microphone input is unavailable in this browser.'); return; }
    try {
      stopSightAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      audioStream.current = stream;
      const context = new AudioContext(); audioContext.current = context;
      const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0; audioAnalyser.current = analyser;
      context.createMediaStreamSource(stream).connect(analyser); await context.resume();
      const deviceId = stream.getAudioTracks()[0]?.getSettings().deviceId || 'default';
      const key = `audio:${deviceId}`; audioProfileKeyRef.current = key; setAudioProfileKey(key);
      const buffer = new Float32Array(analyser.fftSize), spectrum = new Float32Array(analyser.frequencyBinCount);
      const sample = () => {
        const activeAnalyser = audioAnalyser.current;
        if (!activeAnalyser || audioContext.current !== context) return;
        activeAnalyser.getFloatTimeDomainData(buffer);
        const detected = classifyDrumAudio(buffer, context.sampleRate), now = performance.now();
        if (isFreshDrumOnset(audioOnset.current, detected.peak, detected.rms, 0.045, now)) {
          activeAnalyser.getFloatFrequencyData(spectrum);
          const features = drumSpectrumFeatures(spectrum, context.sampleRate, activeAnalyser.fftSize);
          const calibration = audioCalibration.current;
          if (calibration) {
            calibration.features.push(features); setAudioCalibrationHits(calibration.features.length);
            if (calibration.features.length >= 5) {
              const average = features.map((_, index) => calibration.features.reduce((sum, row) => sum + row[index], 0) / calibration.features.length);
              const state = savedInputState(profileId), current = getTrainerDeviceProfile(state, key);
              state.deviceProfiles[key] = { ...current, audioTemplates: { ...current.audioTemplates, [calibration.voice]: average } };
              try { localStorage.setItem(trainerStorageKey(profileId), JSON.stringify(state)); window.dispatchEvent(new Event('drum-hero:trainer-change')); setAudioCalibrationPrompt(`${calibration.voice} calibration saved for this microphone.`); }
              catch { setAudioCalibrationPrompt('Could not save the microphone calibration.'); }
              audioCalibration.current = null; setAudioCalibrationHits(0);
            }
          } else {
            const templates = getTrainerDeviceProfile(savedInputState(profileId), audioProfileKeyRef.current).audioTemplates;
            const result = classifyDrumFeatures(features, templates);
            if (result.instrument) audioHit.current(result.instrument, now);
            else if (source === 'audio-voices') setAudioUncertain(count => count + 1);
          }
        }
        audioFrame.current = requestAnimationFrame(sample);
      };
      const track = stream.getAudioTracks()[0];
      track?.addEventListener('ended', () => { if (running.current) cancel(); stopSightAudio(); setAudioStatus('Microphone disconnected. Restart this pass as practice after reconnecting.'); }, { once: true });
      audioOnset.current = createDrumOnsetState(); setAudioConnected(true); setAudioUncertain(0); setAudioStatus('Microphone connected. Calibrate at least two drum voices; five gives the best coverage.'); sample();
    } catch { stopSightAudio(); setAudioStatus('Microphone permission was denied or the input could not start.'); }
  };
  const beginAudioCalibration = () => {
    if (!audioConnected) { setAudioCalibrationPrompt('Connect the microphone first.'); return; }
    if (running.current) { setAudioCalibrationPrompt('Finish or cancel the attempt before calibrating.'); return; }
    audioCalibration.current = { voice: audioCalibrationVoice, features: [] }; setAudioCalibrationHits(0); setAudioCalibrationPrompt(`Strike only ${audioCalibrationVoice} five times, with a clear pause between strikes.`);
  };
  const cancel = useCallback(() => { stop(); stopSightAudio(); setPreparing(false); setPhase('setup'); setReference(false); setSessionQueue([]); setSessionTotal(0); setSessionIndex(0); setSessionMetrics([]); setMessage('Attempt ended. Restarting this exercise counts as practice.'); }, [stop, stopSightAudio]);
  useEffect(() => { stopSightAudio(); return () => stopSightAudio(); }, [profileId, stopSightAudio]);
  useEffect(() => { const timer = window.setTimeout(() => setClockNow(Date.now()), 0); return () => clearTimeout(timer); }, []);
  useEffect(() => {
    const reload = () => { const rows = parseSightHistory(localStorage.getItem(historyKey)); historyRef.current = rows; setHistory(rows); };
    window.addEventListener(SIGHT_HISTORY_CHANGED_EVENT, reload);
    return () => window.removeEventListener(SIGHT_HISTORY_CHANGED_EVENT, reload);
  }, [historyKey]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { historyRef.current = parseSightHistory(localStorage.getItem(historyKey)); setHistory(historyRef.current); } catch { setMessage('Local history unavailable. You can still practice.'); }
      try { const savedGoal = parseSightGoal(localStorage.getItem(goalKey)); setGoal(savedGoal); if (savedGoal) setGoalDraft(savedGoal); } catch { setGoal(null); }
      try { const savedTemplates = parseSightTemplates(localStorage.getItem(templatesKey)); setSightTemplates(savedTemplates); setSelectedTemplateId(current => savedTemplates.some(item => item.id === current) ? current : savedTemplates[0]?.id ?? ''); } catch { setSightTemplates([]); }
      if (!sharedAssignment) {
        try {
          const params = new URLSearchParams(window.location.search);
          const encoded = params.get('exercise');
          if (encoded) {
            const assignment = decodeAssignmentCode(encoded);
            if (assignment) {
              setAssignmentCode(encoded); setLoadedAssignment(assignment);
              setSettings(assignment.settings); setLengthPreset('custom'); setExercise(generateSightExercise(assignment.settings, assignment.seed)); setSharedAssignment(true); setMessage('A shared reading assignment is ready. Preview it before you start.');
            }
          }
        } catch { setMessage('This shared assignment link is invalid.'); }
      }
    }, 0);
    const interrupt = () => { if (document.hidden && running.current) cancel(); };
    document.addEventListener('visibilitychange', interrupt);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', interrupt); stop(); stopSightAudio(); midi.current?.inputs.forEach(input => { input.onmidimessage = null; }); if (midi.current) midi.current.onstatechange = null; };
  }, [historyKey, goalKey, templatesKey, stop, stopSightAudio, cancel, sharedAssignment]);
  const hit = useCallback((instrument: typeof SIGHT_VOICES[number], input: SightInput, at = performance.now(), midiArticulation?: NonNullable<SightHit['midiArticulation']>, velocity?: number) => {
    const round = capture.current;
    if (!round || input !== source || at < round.start - 100 || at > round.end + 100) return;
    if (round.hits.length >= 10000) return;
    round.hits.push({ instrument, atMs: at - round.start - round.correction, ...(midiArticulation ? { midiArticulation } : {}), ...(settings.dynamicsFocus && velocity !== undefined ? { velocity } : {}) });
    if (input !== 'audio-voices') audio.current?.hit(instrument);
    if (liveFeedback && practicePass.current && exercise) {
      const last = scoreSightAttempt(exercise, round.hits).rated.filter(item => item.atMs !== undefined && item.rating !== 'miss').at(-1);
      setLiveHitMessage(!last || last.rating === 'extra' ? `Extra ${instrument}` : `${instrument} · ${Math.abs(last.offsetMs ?? 0)} ms ${last.offsetMs === 0 ? 'on time' : (last.offsetMs ?? 0) < 0 ? 'early' : 'late'}`);
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
      feedbackTimer.current = setTimeout(() => setLiveHitMessage(''), 1000);
    }
  }, [source, liveFeedback, exercise, settings.dynamicsFocus]);
  audioHit.current = (voice, at) => hit(voice, 'audio-voices', at);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable],a,summary,button:not([data-reading-pad])'))) return;
      const index = keys.indexOf(event.code);
      if (index >= 0 && source === 'keyboard' && capture.current) { event.preventDefault(); hit(SIGHT_VOICES[index], 'keyboard'); }
    };
    window.addEventListener('keydown', down); return () => window.removeEventListener('keydown', down);
  }, [hit, source]);
  useEffect(() => { if (phase === 'results') (confidenceRecorded ? heading : confidenceHeading).current?.focus(); }, [phase, confidenceRecorded]);
  const bindMidi = (access: MIDIAccess, selected: string) => {
    access.inputs.forEach(input => { input.onmidimessage = input.id === selected ? event => {
      const data = event.data;
      if (!data || (data[0] & 0xf0) !== 0x90 || data[2] === 0) return;
      const mappingVoice = midiMappingVoiceRef.current;
      if (mappingVoice) {
        const state = savedInputState(profileId), key = `midi:${input.id}`, current = getTrainerDeviceProfile(state, key);
        const conflict = current.midiMap[data[1]];
        if (conflict && conflict !== mappingVoice) { setMessage(`MIDI note ${data[1]} is already mapped to ${conflict}. Choose another pad or edit its mapping in Trainer.`); return; }
        const midiMap = { ...current.midiMap };
        const previous = Object.entries(midiMap).find(([, voice]) => voice === mappingVoice);
        if (previous && Number(previous[0]) !== data[1]) midiMap[Number(previous[0])] = null;
        midiMap[data[1]] = mappingVoice;
        state.deviceProfiles[key] = { ...current, midiMap };
        try { localStorage.setItem(trainerStorageKey(profileId), JSON.stringify(state)); setMessage(`Mapped MIDI note ${data[1]} to ${mappingVoice}.`); }
        catch { setMessage('Could not save this pad mapping.'); }
        midiMappingVoiceRef.current = null; setMidiMappingVoice(null); return;
      }
      const state = savedInputState(profileId);
      const profile = getTrainerDeviceProfile(state, `midi:${input.id}`);
      const voice = profile.midiMap[data[1]];
      const articulation = profile.midiArticulations[data[1]] ?? undefined;
      const calibration = velocityCalibrationRef.current;
      if (calibration && calibration.note === data[1]) {
        const samples = [...calibration.samples, data[2]];
        if (samples.length >= 5 && calibration.stage === 'soft') {
          const average = Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
          const next = { ...calibration, stage: 'accent' as const, samples: [], soft: average };
          velocityCalibrationRef.current = next; setVelocityCalibration(next); setMessage(`Soft velocity saved for ${calibration.voice}. Strike ${calibration.voice} five times with a strong accent.`);
        } else if (samples.length >= 5) {
          const soft = calibration.soft ?? 0, hard = Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
          if (hard < soft + 4) { velocityCalibrationRef.current = null; setVelocityCalibration(null); setMessage('The accented strikes were too close to the soft strikes. Restart calibration with a wider dynamic range.'); }
          else {
            const midiVelocityRanges = { ...(profile.midiVelocityRanges ?? {}), [data[1]]: { soft, hard } };
            state.deviceProfiles[`midi:${input.id}`] = { ...profile, midiVelocityRanges };
            try { localStorage.setItem(trainerStorageKey(profileId), JSON.stringify(state)); setAudioProfileRevision(value => value + 1); setMessage(`${calibration.voice} dynamics calibrated for this MIDI pad.`); }
            catch { setMessage('Could not save MIDI dynamics calibration.'); }
            velocityCalibrationRef.current = null; setVelocityCalibration(null);
          }
        } else { const next = { ...calibration, samples }; velocityCalibrationRef.current = next; setVelocityCalibration(next); }
        return;
      }
      const timingCheck = midiTimingRef.current;
      if (timingCheck) {
        if (voice !== 'snare') { setMidiTimingStatus('Use the mapped snare pad for each timing click.'); return; }
        while (timingCheck.next < timingCheck.expected.length && event.timeStamp > timingCheck.expected[timingCheck.next] + 240) timingCheck.next++;
        const expectedAt = timingCheck.expected[timingCheck.next];
        if (expectedAt !== undefined && Math.abs(event.timeStamp - expectedAt) <= 240) {
          timingCheck.hits.push(event.timeStamp - expectedAt); timingCheck.next++;
          setMidiTimingStatus(`Timing taps: ${timingCheck.hits.length} of ${timingCheck.expected.length}.`);
          if (timingCheck.hits.length === timingCheck.expected.length) finishMidiTimingCheck(timingCheck);
        }
        return;
      }
      const expectedVoice = midiCheckRemainingRef.current[0];
      if (expectedVoice) {
        if (voice === expectedVoice) {
          const next = midiCheckRemainingRef.current.slice(1);
          midiCheckRemainingRef.current = next; setMidiCheckRemaining(next);
          setMidiCheckVerified(previous => [...previous, expectedVoice]);
          setMessage(next.length ? `${expectedVoice} pad confirmed. Now strike ${next[0]}.` : 'All five mapped voices responded. MIDI is ready for this learner profile.');
        } else setMessage(voice ? `Detected ${voice}; strike the requested ${expectedVoice} pad.` : `This MIDI note is unmapped. Strike the requested ${expectedVoice} pad or learn its mapping first.`);
        return;
      }
      if (voice) hit(voice, 'midi', event.timeStamp, articulation, normalizeMidiPadVelocity(data[2], profile.midiVelocityRanges?.[data[1]]));
    } : null; });
  };
  const connectMidi = async () => {
    try {
      if (!navigator.requestMIDIAccess) throw new Error('Web MIDI is unavailable. Choose keyboard or touch.');
      const requestToken = token.current;
      const access = await navigator.requestMIDIAccess({ sysex: false }); if (token.current !== requestToken) return; midi.current = access;
      const refresh = () => {
        const available = [...access.inputs.values()].filter(i => i.state === 'connected');
        setInputs(available.map(i => ({ id: i.id, name: i.name ?? 'MIDI input' })));
        const lostSelected = !!selectedMidi.current && !available.some(i => i.id === selectedMidi.current);
        const selected = available.some(i => i.id === selectedMidi.current) ? selectedMidi.current : available[0]?.id ?? '';
        selectedMidi.current = selected; setMidiId(selected); bindMidi(access, selected);
        if (running.current && lostSelected) cancel();
      };
      access.onstatechange = refresh; refresh(); setMessage('MIDI uses your saved Trainer mapping and timing correction.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not connect MIDI.'); }
  };
  const update = (next: Partial<SightSettings>) => {
    const updated = normalizeSightSettings({ ...settings, ...next });
    if (!('bars' in next) && lengthPreset !== 'custom' && ('bpm' in next || 'meter' in next || 'level' in next)) updated.bars = sightBarsForDuration(updated, lengthPreset);
    setSettings(updated); setExercise(null); setDrillParent(null); setTransferSettings(null); setTransferCheck(false); setShowSetupNotation(false); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setSharedAssignment(false); setLoadedAssignment(null); setSessionQueue([]); setSessionTotal(0); setSessionIndex(0); setSessionMetrics([]); setReviewCursor(null);
  };
  const currentTemplate = sightTemplates.find(item => item.id === selectedTemplateId);
  const templateSubdivision = (settings.focusRhythm === 'triplets' ? 12 : settings.focusRhythm === 'sixteenths' ? 16 : settings.focusRhythm === 'quarters' ? 4 : 8) as 4 | 8 | 12 | 16;
  const templateSteps = Math.round(sightMeterBeats(settings.meter) * templateSubdivision / 4);
  const toggleTemplateHit = (step: number, instrument: typeof SIGHT_VOICES[number]) => {
    setTemplateDraft(rows => rows.some(hit => hit.step === step && hit.instrument === instrument)
      ? rows.filter(hit => !(hit.step === step && hit.instrument === instrument))
      : [...rows, { step, instrument, ...(templateAccent ? { accent: true } : {}) }].sort((a, b) => a.step - b.step || SIGHT_VOICES.indexOf(a.instrument) - SIGHT_VOICES.indexOf(b.instrument)));
  };
  const saveTemplate = () => {
    const name = templateName.trim().slice(0, 80);
    if (!name || templateDraft.length === 0) { setMessage('Add at least one hit and give the phrase a name before saving it.'); return; }
    const template: SightCustomTemplate = { id: crypto.randomUUID(), name, level: settings.level, meter: settings.meter, subdivision: templateSubdivision, beats: sightMeterBeats(settings.meter), hits: templateDraft, createdAt: new Date().toISOString() };
    const rows = parseSightTemplates(JSON.stringify([...sightTemplates, template]));
    if (!rows.some(row => row.id === template.id)) { setMessage('This phrase uses a rhythm that is not available at the selected level.'); return; }
    try { localStorage.setItem(templatesKey, JSON.stringify(rows)); setSightTemplates(rows); setSelectedTemplateId(template.id); setExerciseOrigin('template'); setMessage(`Saved “${name}” as a reusable phrase template.`); }
    catch { setMessage('Could not save this phrase template on this device.'); }
  };
  const deleteTemplate = (id: string) => {
    const rows = sightTemplates.filter(item => item.id !== id);
    try { localStorage.setItem(templatesKey, JSON.stringify(rows)); setSightTemplates(rows); if (selectedTemplateId === id) setSelectedTemplateId(rows[0]?.id ?? ''); setMessage('Phrase template removed from this learner profile.'); }
    catch { setMessage('Could not remove this phrase template.'); }
  };
  const loadTemplate = (id: string) => {
    const template = sightTemplates.find(item => item.id === id);
    if (!template) return;
    const focusRhythm: SightRhythmFocus = template.subdivision === 4 ? 'quarters' : template.subdivision === 8 ? 'eighths' : template.subdivision === 12 ? 'triplets' : 'sixteenths';
    const next = normalizeSightSettings({ ...settings, level: template.level, meter: template.meter, mixedMeters: false, focusRhythm, triplets: template.subdivision === 12, articulationFocus: null });
    setSelectedTemplateId(id); setExerciseOrigin('template'); setSettings(next); setExercise(createSightExerciseFromTemplate(next, template, crypto.getRandomValues(new Uint32Array(1))[0])); setLengthPreset('custom'); attempted.current = false; setHasAttempted(false); setResult(null); setMessage(`Loaded “${template.name}”. Choose New exercise to generate a fresh variation.`);
  };
  const fresh = () => {
    stop(); const next = makeCurrentExercise(crypto.getRandomValues(new Uint32Array(1))[0]);
    setSessionQueue([]); setSessionTotal(0); setSessionIndex(0); setSessionMetrics([]);
    setExercise(next); setReviewCursor(null); setDrillParent(null); setTransferSettings(null); setTransferCheck(false); setShowSetupNotation(false); setSharedAssignment(false); setLoadedAssignment(null); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setPhase('setup'); setReference(false); setMessage('New exercise ready. Start to reveal its notation.');
    return next;
  };
  useEffect(() => { if (exercise) { setRangeStart(0); setRangeEnd(exercise.settings.bars - 1); } }, [exercise]);
  const beginPracticeSet = () => {
    stop(); let recent = phraseMemory(); let seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const phrases = Array.from({ length: sessionLength }, () => {
      const phrase = makeCurrentExercise(seed, recent); seed = (phrase.seed + 1) >>> 0; recent = [...recent, sightFingerprint(phrase)]; return phrase;
    });
    setExercise(phrases[0]); setReviewCursor(null); setSessionQueue(phrases.slice(1)); setSessionTotal(phrases.length); setSessionLabel('Practice set'); setSessionIndex(1); setSessionMetrics([]);
    setDrillParent(null); setShowSetupNotation(false); setSharedAssignment(false); setLoadedAssignment(null); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setPhase('setup'); setReference(false); setMessage(`Practice set ready: exercise 1 of ${phrases.length}.`);
  };
  const beginGoalPath = () => {
    if (!goal) return;
    stop(); let recent = phraseMemory(); let seed = crypto.getRandomValues(new Uint32Array(1))[0];
    const path = buildSightGoalPath(goal, history);
    const phrases = path.map(step => { const phrase = generateFreshSightExercise(step, seed, recent); seed = (phrase.seed + 1) >>> 0; recent = [...recent, sightFingerprint(phrase)]; return phrase; });
    setExercise(phrases[0]); setSettings(phrases[0].settings); setReviewCursor(null); setSessionQueue(phrases.slice(1)); setSessionTotal(phrases.length); setSessionLabel('Goal study path'); setSessionIndex(1); setSessionMetrics([]);
    setDrillParent(null); setTransferSettings(null); setTransferCheck(false); setShowSetupNotation(false); setSharedAssignment(false); setLoadedAssignment(null); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setPhase('setup'); setReference(false); setMessage('Goal study path ready: warm-up, build, review, goal, and stretch phrases.');
  };
  const nextPracticeSetExercise = () => {
    if (!sessionQueue.length) return;
    stop(); const [next, ...remaining] = sessionQueue; setExercise(next); setSettings(next.settings); setSessionQueue(remaining); setSessionIndex(index => index + 1);
    setDrillParent(null); setShowSetupNotation(false); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setPhase('setup'); setReference(false); setMessage(`Exercise ${sessionIndex + 1} of ${sessionTotal}. Start when ready.`);
  };
  const startMidiReadinessCheck = () => {
    const mapped = SIGHT_VOICES.filter(voice => Object.values(selectedMidiProfile.midiMap).includes(voice));
    if (!midiId || !mapped.length) { setMessage('Connect a MIDI device and map at least one pad before checking it.'); return; }
    midiCheckRemainingRef.current = mapped; setMidiCheckRemaining(mapped); setMidiCheckVerified([]);
    setMessage(`Readiness check: strike the ${mapped[0]} pad.`);
  };
  const finishMidiTimingCheck = (check: { expected: number[]; hits: number[]; next: number }) => {
    if (midiTimingRef.current !== check) return;
    midiTimingRef.current = null;
    stop();
    if (check.hits.length < 4) { setMidiTimingStatus(`Only ${check.hits.length} usable taps; try again with a steady snare stroke.`); return; }
    const ordered = [...check.hits].sort((a, b) => a - b);
    const median = Math.round(ordered[Math.floor(ordered.length / 2)]);
    const spread = Math.round([...check.hits].map(value => Math.abs(value - median)).sort((a, b) => a - b)[Math.floor(check.hits.length / 2)]);
    saveMidiLatency(median, spread);
    setMidiTimingStatus(`Measured ${median} ms correction with ±${spread} ms median variation from ${check.hits.length} snare taps.`);
    setMessage(`MIDI timing check complete: ${median} ms correction from ${check.hits.length} taps.`);
  };
  const calibrateMidiTiming = async () => {
    if (active) return;
    if (!midiId || !inputs.some(input => input.id === midiId) || !Object.values(selectedMidiProfile.midiMap).includes('snare')) { setMessage('Connect a MIDI device and map the snare pad before timing calibration.'); return; }
    stop(); const checkToken = token.current; setMidiTimingStatus('Preparing timing clicks…');
    const player = createDrumAudio(); audio.current = player;
    if (!player) { stop(); setMidiTimingStatus(''); setMessage('MIDI timing clicks are unavailable.'); return; }
    const ready = await player.ready;
    if (token.current !== checkToken) return;
    if (!ready) { stop(); setMidiTimingStatus(''); setMessage('MIDI timing clicks are unavailable.'); return; }
    const plan = scheduleMidiTimingClicks(player, settings.bpm);
    const check = { expected: plan.expected, hits: [] as number[], next: 0 };
    midiTimingRef.current = check; running.current = true; setMidiTimingActive(true);
    setMidiTimingStatus('Listen to four count-in clicks, then tap the mapped snare on the next eight clicks.');
    timers.current.push(setTimeout(() => finishMidiTimingCheck(check), plan.timeoutMs));
  };
  const applyRecommendedSettings = () => {
    const recommendation = recommendSightSettings(history, settings, source);
    if (!recommendation) return;
    stop(); setSettings(recommendation.settings); setExercise(generateFreshSightExercise(recommendation.settings, crypto.getRandomValues(new Uint32Array(1))[0], phraseMemory()));
    attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setPhase('setup'); setMessage('Suggested setting applied. Start when ready.');
  };
  const saveGoal = () => {
    const next = parseSightGoal(JSON.stringify(goalDraft));
    if (!next) { setGoalMessage('Choose a supported level, meter, and rhythm focus.'); return; }
    setGoal(next); setGoalDraft(next); setGoalMessage('Goal saved for this learner.');
    try { localStorage.setItem(goalKey, JSON.stringify(next)); } catch { setGoalMessage('Goal could not be saved on this device.'); }
  };
  const shareExercise = async () => {
    const target = exercise ?? generateSightExercise(settings, crypto.getRandomValues(new Uint32Array(1))[0]);
    if (!exercise) setExercise(target);
    const metadata = { title: assignmentTitle.trim().slice(0, 80) || 'Reading assignment', dueDate: assignmentDueDate || undefined, minimumAccuracy: assignmentMinimumAccuracy };
    const code = encodeAssignmentCode(target, metadata); setAssignmentCode(code); setLoadedAssignment({ seed: target.seed, settings: target.settings, ...metadata });
    const url = new URL(window.location.href); url.search = ''; url.searchParams.set('exercise', code);
    try {
      if (navigator.share) await navigator.share({ title: 'Drum Hero sight-reading assignment', text: `${target.settings.level} · ${target.settings.meter} · ${target.settings.bpm} BPM`, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setMessage('Assignment link copied. Share it with your student.'); }
      setSharedAssignment(true);
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('Could not share automatically. Use the browser address after previewing the exercise.'); }
  };
  const importAssignment = () => {
    if (assignmentCode.trim().startsWith('DH-SUB1:')) {
      const submission = decodeJSONCode<{ version: number; title?: string; dueDate?: string; minimumAccuracy?: number; meter: string; level: string; bpm: number; accuracy: number; score: number; classification: string }>(assignmentCode, 'DH-SUB1:');
      if (!submission || submission.version !== 1 || !Number.isInteger(submission.accuracy) || submission.accuracy < 0 || submission.accuracy > 100 || !Number.isInteger(submission.score) || submission.score < 0 || submission.score > 100 || !Number.isInteger(submission.bpm) || submission.bpm < 40 || submission.bpm > 200 || !['4/4','3/4','5/4','7/8'].includes(submission.meter) || !['Beginner','Intermediate','Advanced'].includes(submission.level) || !['reading','practice','assisted'].includes(submission.classification) || (submission.minimumAccuracy !== undefined && (!Number.isInteger(submission.minimumAccuracy) || submission.minimumAccuracy < 50 || submission.minimumAccuracy > 100)) || (submission.dueDate !== undefined && !validAssignmentDate(submission.dueDate))) { setMessage('Student result code is invalid.'); return; }
      const outcome = submission.minimumAccuracy === undefined ? 'no target set' : submission.accuracy >= submission.minimumAccuracy ? 'target met' : 'target not met';
      setMessage(`${submission.title || 'Student assignment'} returned: ${submission.accuracy}% accuracy, ${submission.score} score (${outcome}; ${submission.classification}; ${submission.level}, ${submission.meter}, ${submission.bpm} BPM).`); return;
    }
    const assignment = decodeAssignmentCode(assignmentCode);
    if (!assignment) { setMessage('Assignment code is invalid.'); return; }
    stop(); setSettings(assignment.settings); setLengthPreset('custom'); setExercise(generateSightExercise(assignment.settings, assignment.seed)); setLoadedAssignment(assignment); setShowSetupNotation(false); setSharedAssignment(true); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setPhase('setup'); setMessage('Shared reading assignment loaded. Preview it before you start.');
  };
  const shareSubmission = async () => {
    if (!result || !exercise) return;
    const code = encodeJSONCode('DH-SUB1:', { version: 1, title: loadedAssignment?.title, dueDate: loadedAssignment?.dueDate, minimumAccuracy: loadedAssignment?.minimumAccuracy, meter: exercise.settings.meter, level: exercise.settings.level, bpm: exercise.settings.bpm, accuracy: result.summary.accuracy, score: result.summary.score, classification });
    try { await navigator.clipboard.writeText(code); setMessage('Student result code copied. Send it to your teacher.'); }
    catch { setMessage(`Share this result code with your teacher: ${code}`); }
  };
  const startBarDrill = (bar: number) => {
    if (!exercise) return;
    const parent = exercise, base = createSightBarDrill(exercise, bar);
    const drill = { ...base, settings: { ...base.settings, bpm: Math.max(40, exercise.settings.bpm - 10) } };
    stop(); setLengthPreset('custom'); setDrillParent(parent); setExercise(drill); setSettings(drill.settings); attempted.current = true; setHasAttempted(true); assisted.current = false; setResult(null); setPhase('setup'); setReference(false); setMessage(`Bar ${bar + 1} repeats twice at ${drill.settings.bpm} BPM as practice. Return to the full phrase when ready.`);
  };
  const startRangeDrill = () => {
    if (!exercise) return;
    const parent = exercise, startBar = Math.max(0, Math.min(settings.bars - 1, rangeStart)), maxRangeEnd = Math.min(settings.bars - 1, startBar + Math.floor(80 / Math.max(2, Math.min(4, rangeRepeats))) - 1), endBar = Math.max(startBar, Math.min(maxRangeEnd, rangeEnd));
    const drill = createSightRangeDrill(parent, startBar, endBar, rangeRepeats);
    stop(); setLengthPreset('custom'); setDrillParent(parent); setExercise(drill); setSettings(drill.settings); setRangeStart(0); setRangeEnd(drill.settings.bars - 1); attempted.current = true; setHasAttempted(true); assisted.current = false; setResult(null); setPhase('setup'); setReference(false); setMessage(`Bars ${startBar + 1}–${endBar + 1} repeat ${Math.max(2, Math.min(4, rangeRepeats))} times as practice. Return to the full phrase when ready.`);
  };
  const startWeakestBarDrill = () => { if (exercise && result) startBarDrill(weakestSightBar(exercise, result.rated)); };
  const startErrorFocusDrill = () => {
    if (!exercise || !result) return;
    const drill = createSightErrorDrill(exercise, result.rated, crypto.getRandomValues(new Uint32Array(1))[0], phraseMemory(), history);
    stop(); setLengthPreset('custom'); setTransferSettings(exercise.settings); setTransferCheck(false); setExercise(drill.exercise); setSettings(drill.exercise.settings); setDrillParent(null); attempted.current = true; setHasAttempted(true); assisted.current = false; setResult(null); setPhase('setup'); setReference(false);
    setMessage(`Focused ${drill.focus} practice for ${drill.voice}${drill.context ? ` around ${drill.context.replaceAll('-', ' ')}` : ''} at a gentler tempo. This drill is practice; an unseen transfer phrase follows it.`);
  };
  const startTransferCheck = () => {
    if (!transferSettings) return;
    stop(); const next = generateFreshSightExercise(transferSettings, crypto.getRandomValues(new Uint32Array(1))[0], phraseMemory());
    setExercise(next); setSettings(next.settings); setTransferSettings(null); setTransferCheck(true); setDrillParent(null); attempted.current = true; setHasAttempted(true); assisted.current = false; setResult(null); setPhase('setup'); setReference(false); setMessage('Unseen transfer phrase ready. This check remains practice and does not change first-read trends.');
  };
  const startCoverageGap = () => {
    const nextSettings = leastPracticedSightSettings(settings, history);
    stop(); setSettings(nextSettings); setExercise(generateFreshSightExercise(nextSettings, crypto.getRandomValues(new Uint32Array(1))[0], phraseMemory()));
    setSessionQueue([]); setSessionTotal(0); setSessionIndex(0); setSessionMetrics([]); setDrillParent(null); setTransferSettings(null); setTransferCheck(false); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setPhase('setup'); setReference(false); setMessage(`Coverage exercise ready: ${nextSettings.meter} ${nextSettings.focusRhythm} at ${nextSettings.bpm} BPM.`);
  };
  const recordConfidence = (value: number | null) => {
    const entryId = confidenceEntryId;
    if (entryId) {
      historyRef.current = historyRef.current.map(row => row.id === entryId ? { ...row, confidence: value } : row);
      setHistory(historyRef.current);
      try { localStorage.setItem(historyKey, JSON.stringify({ version: 1, attempts: historyRef.current })); window.dispatchEvent(new Event(SIGHT_HISTORY_CHANGED_EVENT)); } catch { setMessage('Confidence note could not be saved; the score remains available.'); }
    }
    setConfidenceRating(value); setConfidenceRecorded(true);
  };
  const returnToFullPhrase = () => {
    if (!drillParent) return;
    stop(); setExercise(drillParent); setSettings(drillParent.settings); setDrillParent(null); attempted.current = true; setHasAttempted(true); setResult(null); setPhase('setup'); setMessage('Full phrase restored. The next pass counts as practice.');
  };
  const advanceTempoLadder = () => {
    if (!exercise || !result) return;
    const bpm = result.summary.accuracy >= 85 ? Math.min(200, settings.bpm + 5) : settings.bpm;
    if (result.summary.accuracy >= 85 && settings.bpm < 200) {
      const nextSettings = normalizeSightSettings({ ...settings, bpm });
      setSettings(nextSettings); setExercise(generateSightExercise(nextSettings, crypto.getRandomValues(new Uint32Array(1))[0])); attempted.current = false; setHasAttempted(false); setResult(null); setPhase('setup'); setMessage(`Tempo ladder advanced to ${bpm} BPM.`);
    } else { setMessage(result.summary.accuracy >= 85 ? 'You reached the top of the 40–200 BPM ladder.' : 'Reach 85% accuracy to advance. Retry this phrase as practice.'); }
  };
  const saveMidiMap = (voice: typeof SIGHT_VOICES[number], note: number) => {
    if (!Number.isInteger(note) || note < 0 || note > 127 || !midiId) return;
    const state = savedInputState(profileId), key = `midi:${midiId}`, current = getTrainerDeviceProfile(state, key);
    const conflict = current.midiMap[note];
    if (conflict && conflict !== voice) { setMessage(`MIDI note ${note} is already assigned to ${conflict}.`); return; }
    const midiMap = { ...current.midiMap }, previous = Object.entries(midiMap).find(([, mapped]) => mapped === voice);
    if (previous && Number(previous[0]) !== note) midiMap[Number(previous[0])] = null;
    midiMap[note] = voice; state.deviceProfiles[key] = { ...current, midiMap };
    try { localStorage.setItem(trainerStorageKey(profileId), JSON.stringify(state)); setMessage(`Mapped MIDI note ${note} to ${voice}.`); }
    catch { setMessage('Could not save this pad mapping.'); }
  };
  const saveMidiLatency = (latencyMs: number, spreadMs?: number) => {
    if (!midiId) return;
    const state = savedInputState(profileId), key = `midi:${midiId}`, profile = getTrainerDeviceProfile(state, key);
    state.deviceProfiles[key] = { ...profile, latencyMs: Math.max(-200, Math.min(200, Math.round(latencyMs))), latencyCalibrated: spreadMs !== undefined, latencySpreadMs: spreadMs ?? null, latencyCalibratedAt: spreadMs === undefined ? null : new Date().toISOString() };
    try { localStorage.setItem(trainerStorageKey(profileId), JSON.stringify(state)); setMessage(spreadMs === undefined ? 'Manual MIDI timing correction saved. Run calibration to check input consistency.' : 'MIDI timing correction and consistency saved for this device.'); }
    catch { setMessage('Could not save the MIDI timing correction.'); }
  };
  const beginMidiVelocityCalibration = (voice: typeof SIGHT_VOICES[number]) => {
    if (active || !midiId || !inputs.some(input => input.id === midiId)) { setMessage('Connect the MIDI device and finish the current attempt before calibrating dynamics.'); return; }
    const profile = getTrainerDeviceProfile(savedInputState(profileId), `midi:${midiId}`);
    const note = Object.entries(profile.midiMap).find(([, mapped]) => mapped === voice)?.[0];
    if (note === undefined) { setMessage(`Map a MIDI note to ${voice} before calibrating its dynamics.`); return; }
    const next = { voice, note: Number(note), stage: 'soft' as const, samples: [] as number[] };
    velocityCalibrationRef.current = next; setVelocityCalibration(next); setMessage(`Strike ${voice} five times softly. Keep a short pause between strikes.`);
  };
  const saveMidiVelocityRange = (voice: typeof SIGHT_VOICES[number], soft: number, hard: number) => {
    if (!midiId || !Number.isInteger(soft) || !Number.isInteger(hard) || soft < 1 || hard > 127 || hard < soft + 4) return;
    const state = savedInputState(profileId), key = `midi:${midiId}`, profile = getTrainerDeviceProfile(state, key);
    const note = Object.entries(profile.midiMap).find(([, mapped]) => mapped === voice)?.[0];
    if (note === undefined) { setMessage(`Map a MIDI note to ${voice} first.`); return; }
    state.deviceProfiles[key] = { ...profile, midiVelocityRanges: { ...(profile.midiVelocityRanges ?? {}), [note]: { soft, hard } } };
    try { localStorage.setItem(trainerStorageKey(profileId), JSON.stringify(state)); setAudioProfileRevision(value => value + 1); }
    catch { setMessage('Could not save MIDI dynamics calibration.'); }
  };
  const startLearningPathStep = () => {
    const index = nextSightLearningPathStep(history);
    if (index < 0) return;
    const step = SIGHT_LEARNING_PATH[index]; update(step.settings); setMessage(`Learning path step ${index + 1}: ${step.title}. Start when ready.`);
  };
  const start = async () => {
    if (source === 'midi' && midi.current?.inputs.get(midiId)?.state !== 'connected') { setMessage('Connect and select a MIDI input first.'); return; }
    if (settings.articulationFocus) {
      if (source !== 'midi') { setMessage('Choose MIDI input to score articulation. The notation can still be practiced with another input after clearing Articulation focus.'); return; }
      const profile = getTrainerDeviceProfile(savedInputState(profileId), `midi:${midiId}`);
      const voice = sightArticulationVoice(settings.articulationFocus);
      const mapped = Object.entries(profile.midiArticulations).some(([note, articulation]) => articulation === settings.articulationFocus && profile.midiMap[Number(note)] === voice);
      if (!mapped) { setMessage(`Map a MIDI note to ${settings.articulationFocus.replaceAll('-', ' ')} on ${voice} in Trainer before starting.`); return; }
    }
    if (source === 'audio-voices') {
      const templateCount = Object.keys(getTrainerDeviceProfile(savedInputState(profileId), audioProfileKey).audioTemplates).length;
      if (!audioConnected || templateCount < 2) { setMessage('Connect the microphone and calibrate at least two voices before starting.'); return; }
    }
    stop(); const roundToken = token.current;
    const current = exercise ?? fresh();
    if (current.settings.dynamicsFocus) {
      if (source !== 'midi') { setMessage('Dynamics reading requires MIDI input with velocity sensitivity.'); return; }
      const profile = getTrainerDeviceProfile(savedInputState(profileId), `midi:${midiId}`);
      const missing = [...new Set(current.hits.map(item => item.instrument))].filter(voice => {
        const note = Object.entries(profile.midiMap).find(([, mapped]) => mapped === voice)?.[0];
        const range = note === undefined ? undefined : profile.midiVelocityRanges?.[Number(note)];
        return !range || range.hard < range.soft + 4;
      });
      if (missing.length) { setMessage(`Calibrate MIDI dynamics for ${missing.join(', ')} before starting this exercise.`); return; }
    }
    rememberPhrase(current);
    setSettings(current.settings);
    // fresh() cancels pending work; take the token after exercise creation.
    const sessionToken = exercise ? roundToken : token.current;
    const targetPlayback = playTargetDrums;
    const kind = targetPlayback ? 'assisted' : sightClassification(attempted.current, assisted.current); setClassification(kind); practicePass.current = attempted.current; attempted.current = true; setHasAttempted(true); setLiveHitMessage('');
    setMessage('Preparing drum sounds…'); setResult(null); setConfidenceRecorded(true); setConfidenceRating(null); setConfidenceEntryId(null); setPreparing(true); running.current = true;
    const player = createDrumAudio(); audio.current = player;
    if (!player) { cancel(); setMessage('Audio is unavailable. Enable browser audio and restart as practice.'); return; }
    player.setMasterLevel(audioPreferences.drumLevel);
    player.setTargetLevel(audioPreferences.targetLevel);
    player.setClickLevel(audioPreferences.clickLevel);
    player.setClickSound(audioPreferences.clickSound);
    const ready = await player.ready;
    if (token.current !== sessionToken) return;
    if (!ready) { cancel(); setMessage('Drum sounds could not load. Check your connection or offline download.'); return; }
    setPreparing(false); setPhase(previewSeconds > 0 ? 'preview' : countInBars > 0 ? 'count-in' : 'playing'); setClock(previewSeconds); setMessage('');
    const previewEnd = performance.now() + previewSeconds * 1000;
    const beatMs = 60000 / current.settings.bpm;
    const countInDuration = countInBars * current.beatsPerBar * beatMs;
    const startAt = previewEnd + countInDuration;
    const end = startAt + sightDuration(current);
    const state = savedInputState(profileId);
    const profile = source === 'midi' ? getTrainerDeviceProfile(state, `midi:${midiId}`) : source === 'audio-voices' ? getTrainerDeviceProfile(state, audioProfileKey) : state.deviceProfiles[source] ?? defaultTrainerDeviceProfile(state);
    const schedule = (fn: () => void, delay: number) => timers.current.push(setTimeout(() => { if (token.current === sessionToken) fn(); }, delay));
    if (previewSeconds > 0 && countInBars > 0) schedule(() => { setPhase('count-in'); }, previewEnd - performance.now());
    if (previewSeconds === 0 && countInBars > 0) setPhase('count-in');
    if (countInBars === 0) schedule(() => setPhase('playing'), previewEnd - performance.now());
    const barBeatStarts = sightBarBeatStarts(current), meters = sightExerciseMeters(current);
    for (let bar = -countInBars; bar < current.settings.bars; bar++) {
      const meter = bar < 0 ? meters[0] : meters[bar];
      const beatsInBar = sightMeterBeats(meter);
      const groupStarts = sightMeterGroupStarts(meter);
      const base = startAt + (bar < 0 ? bar * current.beatsPerBar : barBeatStarts[bar]) * beatMs;
      if (bar < 0) {
        const divisions = countDivisions[countInSubdivision];
        for (let tick = 0; tick < Math.ceil(beatsInBar * divisions); tick++) {
          const beatPosition = tick / divisions;
          const accent = groupStarts.some(start => Math.abs(start - beatPosition) < 0.001);
          player.scheduleClick(base + beatPosition * beatMs, audioPreferences.groupedAccents && accent);
        }
      } else {
        for (let beat = 0; beat < Math.ceil(beatsInBar); beat++) {
          if (beat < beatsInBar) player.scheduleClick(base + beat * beatMs, audioPreferences.groupedAccents && groupStarts.includes(beat));
        }
      }
      if (bar < 0 && spokenCountIn && 'speechSynthesis' in window) schedule(() => {
        const words = meter === '7/8' ? 'One, two, three, four' : Array.from({ length: Math.ceil(beatsInBar) }, (_, index) => ['one','two','three','four','five','six','seven'][index]).join(', ');
        const utterance = new SpeechSynthesisUtterance(words); utterance.rate = Math.min(2, Math.max(0.65, current.settings.bpm / 80)); speechSynthesis.speak(utterance);
      }, base - performance.now());
    }
    if (targetPlayback) for (const hit of current.hits) player.scheduleTargetHit(hit.instrument, startAt + hit.step * beatMs * 4 / current.subdivision, !!hit.accent);
    schedule(() => { capture.current = { start: startAt, end, correction: profile.latencyMs, calibrated: (source === 'midi' || source === 'audio-voices') && profile.latencyCalibrated === true, calibrationSpreadMs: source === 'midi' || source === 'audio-voices' ? profile.latencySpreadMs ?? null : null, calibrationAt: source === 'midi' || source === 'audio-voices' ? profile.latencyCalibratedAt ?? null : null, hits: [] }; }, startAt - performance.now() - 100);
    schedule(() => setPhase('playing'), startAt - performance.now());
    ticker.current = setInterval(() => {
      const now = performance.now(); setClock(now < previewEnd ? Math.max(0, Math.ceil((previewEnd - now) / 1000)) : (now - startAt) / beatMs);
      if (now >= previewEnd && now < startAt) {
        const elapsed = now - previewEnd, barDuration = sightMeterBeats(sightExerciseMeters(current)[0]) * beatMs, inBar = elapsed % barDuration;
        const divisions = countDivisions[countInSubdivision], tick = Math.floor(inBar / beatMs * divisions);
        const beat = Math.floor(tick / divisions) + 1, syllable = countSyllables[countInSubdivision][tick % divisions];
        setCountInSyllable(`${beat}${syllable}`);
      }
    }, 40);
    schedule(() => {
      const performed = capture.current?.hits ?? [];
      const scored = scoreSightAttempt(current, performed);
      const inputCapture = capture.current;
      const entry: SightAttempt = { id: crypto.randomUUID(), playedAt: new Date().toISOString(), version: current.version, seed: current.seed, settings: current.settings, source, inputProfile: source === 'midi' ? `midi:${midiId}` : source === 'audio-voices' ? audioProfileKey : source, classification: targetPlayback || assisted.current ? 'assisted' : kind, targetPlayback, score: scored.summary.score, accuracy: scored.summary.accuracy, dynamicAccuracy: scored.dynamicAccuracy, contextErrors: scored.contextErrors, meanOffsetMs: scored.meanOffsetMs, timingSpreadMs: scored.timingSpreadMs, pulseRecovery: scored.pulseRecovery, confidence: null, inputCalibrated: source === 'midi' || source === 'audio-voices' ? inputCapture?.calibrated ?? false : undefined, inputCalibrationSpreadMs: source === 'midi' || source === 'audio-voices' ? inputCapture?.calibrationSpreadMs ?? null : undefined, inputCalibrationAt: source === 'midi' || source === 'audio-voices' ? inputCapture?.calibrationAt ?? null : undefined, inputTimingCorrectionMs: source === 'midi' || source === 'audio-voices' ? Math.round(inputCapture?.correction ?? 0) : undefined, earlyHits: scored.earlyHits, lateHits: scored.lateHits, fingerprint: sightFingerprint(current), misses: scored.summary.miss, extras: scored.summary.extra, fluency: scored.fluency, voiceScores: sightVoiceScores(current, scored.rated), sourceLabel: current.sourceLabel, previewSeconds, countInBars, assignmentTitle: loadedAssignment?.title, assignmentDueDate: loadedAssignment?.dueDate, assignmentMinimumAccuracy: loadedAssignment?.minimumAccuracy };
      if (sessionTotal > 0 && entry.classification === 'reading') setSessionMetrics(rows => [...rows, { accuracy: entry.accuracy, timingSpreadMs: entry.timingSpreadMs ?? null }]);
      historyRef.current = [...historyRef.current, entry].slice(-100); setHistory(historyRef.current);
      try { localStorage.setItem(historyKey, JSON.stringify({ version: 1, attempts: historyRef.current })); window.dispatchEvent(new Event(SIGHT_HISTORY_CHANGED_EVENT)); } catch { setMessage('Result could not be saved.'); }
      stop(); if (document.fullscreenElement) void document.exitFullscreen(); setFocusMode(false); setResult(scored); setClassification(entry.classification); setConfidenceEntryId(entry.id); setConfidenceRecorded(false); setPhase('results');
    }, end - performance.now() + 110);
  };
  const playReview = async (mode: 'reference' | 'learner' | 'compare' = 'reference', onlyBar?: number, highlightStep?: number) => {
    if (!exercise) return;
    const barSteps = onlyBar === undefined ? 1 : sightBarSteps(exercise, onlyBar);
    const barStartStep = onlyBar === undefined ? 0 : sightBarStarts(exercise)[onlyBar];
    setReviewCursor(onlyBar === undefined ? null : { barIndex: onlyBar, fraction: highlightStep === undefined ? 0 : Math.max(0, Math.min(1, (highlightStep - barStartStep) / barSteps)) });
    stop(); const roundToken = token.current; setReference(true); running.current = true;
    const player = createDrumAudio(); audio.current = player;
    if (!player || !await player.ready) { stop(); setReference(false); setMessage('Review audio unavailable.'); return; }
    if (roundToken !== token.current) return;
    player.setMasterLevel(audioPreferences.drumLevel);
    player.setTargetLevel(audioPreferences.targetLevel);
    player.setClickLevel(audioPreferences.clickLevel);
    player.setClickSound(audioPreferences.clickSound);
    const base = performance.now() + 100;
    const scale = reviewSpeed;
    const beatDurationMs = 60000 / exercise.settings.bpm;
    const barBeatStarts = sightBarBeatStarts(exercise), meters = sightExerciseMeters(exercise);
    const segmentStartMs = onlyBar === undefined ? 0 : barBeatStarts[onlyBar] * beatDurationMs;
    const segmentDurationMs = onlyBar === undefined ? sightDuration(exercise) : sightMeterBeats(meters[onlyBar]) * beatDurationMs;
    const passDuration = segmentDurationMs / scale;
    const schedulePass = (kind: 'reference' | 'learner', offset: number) => {
      const when = (relative: number) => base + offset + relative / scale;
      const firstBar = onlyBar ?? 0, lastBar = onlyBar ?? exercise.settings.bars - 1;
      for (let bar = firstBar; bar <= lastBar; bar++) for (let beat = 0; beat < Math.ceil(sightMeterBeats(meters[bar])); beat++) {
        const relative = (barBeatStarts[bar] + beat) * beatDurationMs - segmentStartMs;
        if (relative >= 0 && relative < segmentDurationMs) player.scheduleClick(when(relative), audioPreferences.groupedAccents && sightMeterGroupStarts(meters[bar]).includes(beat));
      }
      if (kind === 'reference') for (const note of exercise.hits) {
        if (onlyBar !== undefined && sightStepBar(exercise, note.step) !== onlyBar) continue;
        const relative = note.step * beatDurationMs * 4 / exercise.subdivision - segmentStartMs;
        if (relative >= 0 && relative < segmentDurationMs) player.scheduleTargetHit(note.instrument, when(relative), note.accent);
      } else for (const note of result?.rated ?? []) {
        if (note.rating === 'miss' || note.atMs === undefined) continue;
        if (onlyBar !== undefined && (note.atMs < segmentStartMs || note.atMs >= segmentStartMs + segmentDurationMs)) continue;
        player.scheduleHit(note.instrument, when(note.atMs - segmentStartMs));
      }
    };
    if (mode === 'reference') schedulePass('reference', 0);
    else if (mode === 'learner') schedulePass('learner', 0);
    else { schedulePass('reference', 0); schedulePass('learner', passDuration + 700); }
    timers.current.push(setTimeout(() => { stop(); setReference(false); }, passDuration * (mode === 'compare' ? 2 : 1) + (mode === 'compare' ? 1300 : 600)));
  };
  const noteText = exercise ? describeSightExercise(exercise) : '';
  const cursor = exercise && phase === 'playing' ? (() => { const barIndex = sightBeatBar(exercise, clock), starts = sightBarBeatStarts(exercise), beats = sightMeterBeats(sightExerciseMeters(exercise)[barIndex]); return { barIndex, fraction: Math.max(0, Math.min(1, (clock - starts[barIndex]) / beats)) }; })() : reviewCursor ?? undefined;
  const notationReview = useMemo(() => {
    if (!exercise || !result || !confidenceRecorded) return undefined;
    const events: AttemptEventTiming[] = [], extras: AttemptExtraTiming[] = [];
    for (const hit of result.rated) {
      const step = hit.step ?? 0;
      const bar = sightStepBar(exercise, step);
      const beat = sightStepLocal(exercise, step) * 4 / exercise.subdivision;
      if (hit.rating === 'extra') extras.push({ bar: bar + 1, beat, instrument: hit.instrument });
      else events.push({ bar: bar + 1, beat, instrument: hit.instrument, offsetMs: hit.rating === 'miss' ? null : hit.offsetMs });
    }
    return { events, extras };
  }, [exercise, result, confidenceRecorded]);
  const currentRecommendation = recommendSightSettings(history, settings, source);
  const trendReadings = history.filter(h => h.classification === 'reading' && (historyFilters.level === 'Any' || h.settings.level === historyFilters.level) && (historyFilters.meter === 'Any' || historyFilters.meter === 'Mixed' && h.settings.mixedMeters === true || historyFilters.meter !== 'Mixed' && h.settings.meter === historyFilters.meter) && (historyFilters.source === 'Any' || h.source === historyFilters.source) && (historyFilters.tempo === 'Any' || historyFilters.tempo === 'under80' && h.settings.bpm < 80 || historyFilters.tempo === '80to119' && h.settings.bpm >= 80 && h.settings.bpm < 120 || historyFilters.tempo === '120plus' && h.settings.bpm >= 120));
  const voiceTrends = SIGHT_VOICES.map(voice => {
    const readings = trendReadings.flatMap(row => {
      const value = row.voiceScores?.[voice];
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? [value] : [];
    });
    return { voice, average: readings.length ? Math.round(readings.reduce((sum, value) => sum + value, 0) / readings.length) : null, count: readings.length };
  });
  const practiceReadings = history.filter(h => h.classification !== 'reading');
  const goalAttempts = goal ? matchingSightGoalAttempts(history, goal) : [];
  const pathIndex = nextSightLearningPathStep(history);
  const selectedMidiProfile = getTrainerDeviceProfile(savedInputState(profileId), `midi:${midiId}`);
  const selectedAudioProfile = useMemo(() => getTrainerDeviceProfile(savedInputState(profileId), audioProfileKey), [profileId, audioProfileKey, audioProfileRevision]);
  const calibratedAudioVoices = SIGHT_VOICES.filter(voice => Array.isArray(selectedAudioProfile.audioTemplates[voice]) && selectedAudioProfile.audioTemplates[voice]!.length === 5);
  const midiCalibrationAgeDays = selectedMidiProfile.latencyCalibratedAt && clockNow > 0 ? Math.max(0, Math.floor((clockNow - Date.parse(selectedMidiProfile.latencyCalibratedAt)) / 86400000)) : null;
  const midiCalibrationSummary = selectedMidiProfile.latencyCalibrated ? `calibrated ${midiCalibrationAgeDays === null ? 'previously' : `${midiCalibrationAgeDays} days ago`} · ${selectedMidiProfile.latencyMs} ms correction${selectedMidiProfile.latencySpreadMs == null ? '' : ` · ±${Math.round(selectedMidiProfile.latencySpreadMs)} ms tap variation`}${midiCalibrationAgeDays !== null && midiCalibrationAgeDays > 30 ? ' · recalibration recommended' : ''}` : 'not calibrated for this device';
  const currentAttempt = history.find(row => row.id === confidenceEntryId);
  const articulationTargets = exercise?.settings.articulationFocus ? exercise.hits.filter(hit => hit.midiArticulationTarget === exercise.settings.articulationFocus) : [];
  const articulationCorrect = result && articulationTargets.length ? articulationTargets.filter(target => result.rated.some(hit => hit.step === target.step && hit.instrument === target.instrument && hit.midiArticulationTarget === target.midiArticulationTarget && (hit.rating === 'great' || hit.rating === 'good'))).length : 0;
  const articulationSummary = result && exercise?.settings.articulationFocus && articulationTargets.length ? `${articulationCorrect}/${articulationTargets.length} ${exercise.settings.articulationFocus.replaceAll('-', ' ')} readings · ${Math.round(articulationCorrect * 100 / articulationTargets.length)}%` : null;
  const attemptCalibrationAgeDays = currentAttempt?.inputCalibrationAt ? Math.max(0, Math.floor((clockNow - Date.parse(currentAttempt.inputCalibrationAt)) / 86400000)) : null;
  const attemptCalibrationSummary = currentAttempt?.inputCalibrated ? `calibrated ${attemptCalibrationAgeDays === null ? 'previously' : `${attemptCalibrationAgeDays} days ago`} · ${currentAttempt.inputTimingCorrectionMs ?? 0} ms correction${currentAttempt.inputCalibrationSpreadMs == null ? '' : ` · ±${Math.round(currentAttempt.inputCalibrationSpreadMs)} ms tap variation`}${attemptCalibrationAgeDays !== null && attemptCalibrationAgeDays > 30 ? ' · recalibration recommended' : ''}` : 'not calibrated for this device';
  const rhythmFluency = ['quarters','eighths','sixteenths','triplets','syncopation','rests'].map(name => {
    const rows = trendReadings.flatMap(row => row.fluency?.[name as keyof NonNullable<SightAttempt['fluency']>] === undefined ? [] : [row.fluency![name as keyof NonNullable<SightAttempt['fluency']>]!]);
    return { name, average: rows.length ? Math.round(rows.reduce((sum, value) => sum + value, 0) / rows.length) : null, count: rows.length };
  });
  const timingTrend = trendReadings.filter(row => row.timingSpreadMs !== undefined && row.timingSpreadMs !== null);
  const avgTimingSpread = timingTrend.length ? Math.round(timingTrend.reduce((sum, row) => sum + (row.timingSpreadMs ?? 0), 0) / timingTrend.length) : null;
  const confidenceTrend = trendReadings.filter(row => row.confidence !== undefined && row.confidence !== null);
  const confidenceBias = confidenceTrend.length ? Math.round(confidenceTrend.reduce((sum, row) => sum + ((row.confidence ?? 3) * 20 - row.accuracy), 0) / confidenceTrend.length) : null;
  const pulseTrend = trendReadings.filter(row => row.pulseRecovery !== undefined && row.pulseRecovery !== null);
  const avgPulseRecovery = pulseTrend.length ? Math.round(pulseTrend.reduce((sum, row) => sum + (row.pulseRecovery ?? 0), 0) / pulseTrend.length) : null;
  const variety = sightVarietySummary(history);
  const coverageGap = leastPracticedSightSettings(settings, history);
  const timingDirection = trendReadings.reduce((acc, row) => ({ early: acc.early + (row.earlyHits ?? 0), late: acc.late + (row.lateHits ?? 0) }), { early: 0, late: 0 });
  const setTimingRows = sessionMetrics.filter(item => item.timingSpreadMs !== null);
  const setAvgTimingSpread = setTimingRows.length ? Math.round(setTimingRows.reduce((sum, item) => sum + (item.timingSpreadMs ?? 0), 0) / setTimingRows.length) : null;
  const sessionStage = sessionLabel === 'Goal study path' ? ['Warm-up', 'Build', 'Review', 'Goal', 'Stretch'][sessionIndex - 1] ?? '' : '';
  const adaptiveNext = adaptiveMode && result && exercise && classification === 'reading' ? adaptiveSightSettings(exercise.settings, result.summary.accuracy, result.timingSpreadMs) : null;
  const adaptivePreview = adaptiveMode && result && classification === 'reading' ? adaptiveSightPreviewSeconds(previewSeconds, result.summary.accuracy, result.timingSpreadMs) : null;
  const progressRows = [...new Set(trendReadings.map(row => `${row.settings.mixedMeters ? 'Mixed' : row.settings.meter}|${row.settings.focusRhythm}`))].sort();
  const tempoBands = [{ id: 'under80', label: '<80 BPM', matches: (bpm: number) => bpm < 80 }, { id: '80to119', label: '80–119 BPM', matches: (bpm: number) => bpm >= 80 && bpm < 120 }, { id: '120plus', label: '120+ BPM', matches: (bpm: number) => bpm >= 120 }];
  const styleOptions: SightStyle[] = settings.level === 'Beginner' ? ['varied', 'rock'] : settings.level === 'Intermediate' ? ['varied', 'rock', 'fill', 'half-time', 'funk'] : settings.mixedMeters || settings.meter === '7/8' ? ['varied', 'rock', 'fill', 'half-time', 'funk', 'latin'] : ['varied', 'rock', 'shuffle', 'fill', 'half-time', 'funk', 'latin'];
  const recommendationAction = currentRecommendation ? currentRecommendation.reason.startsWith('Spaced review:') ? 'Review overdue skill' : currentRecommendation.settings.bpm !== settings.bpm ? 'Use suggested tempo' : currentRecommendation.settings.level !== settings.level ? 'Use suggested level' : 'Use suggested rhythm' : '';
  return <div ref={rootElement} className={`${styles.root} ${focusMode ? styles.focusMode : ''}`} data-focus-mode={focusMode}>
    <div className={styles.actions}><button type="button" aria-pressed={focusMode} onClick={() => { void togglePerformanceView(); }}>{isFullscreen ? 'Exit full screen' : focusMode ? 'Exit performance view' : 'Enter performance view'}</button></div>
    {!active && <fieldset hidden={focusMode} disabled={reference}><legend>Quick start</legend><div className={styles.quickControls}>
      <label>Exercise source<select value={exerciseOrigin} onChange={e => { const origin = e.target.value as typeof exerciseOrigin; setExerciseOrigin(origin); if (origin === 'repertoire') setSettings(current => normalizeSightSettings({ ...current, articulationFocus: null })); if (origin === 'template' && sightTemplates.length) setSelectedTemplateId(sightTemplates[0].id); setExercise(null); attempted.current = false; setHasAttempted(false); setResult(null); }}><option value="generated">Generated phrase</option><option value="repertoire" disabled={!repertoireSources.length}>Song library excerpt</option><option value="template" disabled={!sightTemplates.length}>Saved custom phrase</option></select></label>
      {exerciseOrigin === 'template' && <div className={styles.controls}><label>Saved phrase<select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}>{sightTemplates.map(item => <option key={item.id} value={item.id}>{item.name} · {item.meter}</option>)}</select></label><button type="button" onClick={() => loadTemplate(selectedTemplateId)} disabled={!selectedTemplateId}>Load saved phrase</button></div>}
      {exerciseOrigin === 'repertoire' && <label>Song part<select value={repertoireId} onChange={e => { setRepertoireId(e.target.value); setExercise(null); attempted.current = false; setHasAttempted(false); setResult(null); }}>{repertoireSources.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
      <label>Level<select value={settings.level} onChange={e => { const level = e.target.value as SightSettings['level']; setAdvancedOpen(level === 'Advanced'); update({ level }); }}>{['Beginner','Intermediate','Advanced'].map(l => <option key={l}>{l}</option>)}</select></label>
      <label>Tempo (quarter-note BPM)<input type="number" min={40} max={200} value={settings.bpm} onChange={e => { setSettings({ ...settings, bpm: Number(e.target.value) }); setExercise(null); attempted.current = false; setHasAttempted(false); }} onBlur={() => update({ bpm: settings.bpm })} /></label>
      <label>Exercise length<select value={lengthPreset} onChange={e => { const value = e.target.value === 'custom' ? 'custom' : Number(e.target.value) as 30 | 60 | 90; setLengthPreset(value); if (value !== 'custom') update({ bars: sightBarsForDuration(settings, value) }); }}><option value={30}>About 30 seconds</option><option value={60}>About 60 seconds</option><option value={90}>About 90 seconds</option><option value="custom">Custom bars</option></select></label>
      <label>Bars<select value={settings.bars} onChange={e => { setLengthPreset('custom'); update({ bars: Number(e.target.value) }); }}>{[...new Set([1,2,4,8,10,12,16,20,24,32,40,48,64,80,settings.bars])].sort((a,b) => a-b).map(count => <option key={count} value={count}>{count}</option>)}</select></label>
      <label>Input<select value={source} onChange={e => setSource(e.target.value as SightInput)}><option value="keyboard">Keyboard</option><option value="touch">Touch pads</option><option value="midi">MIDI</option><option value="audio-voices">Microphone · drum recognition</option></select></label>
      <label>Silent preview<select value={previewSeconds} onChange={e => setPreviewSeconds(Number(e.target.value) as 0 | 5 | 10)}><option value={0}>Cold read · 0 seconds</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option></select></label>
      <label>Count-in bars<select value={countInBars} onChange={e => setCountInBars(Number(e.target.value) as 0 | 1 | 2)}><option value={0}>None</option><option value={1}>1 bar</option><option value={2}>2 bars</option></select></label>
      <label><input type="checkbox" checked={playTargetDrums} onChange={e => setPlayTargetDrums(e.target.checked)} /> Play target drums during the attempt (assisted)</label>
      <p className={styles.chartCaption}>About {Math.round((settings.mixedMeters ? sightMeters(settings.level).reduce((sum, meter) => sum + sightMeterBeats(meter), 0) / sightMeters(settings.level).length : sightMeterBeats(settings.meter)) * settings.bars * 60 / settings.bpm)} seconds · {settings.bars} bars {settings.mixedMeters ? 'with changing meters' : `in ${settings.meter}`}.</p>
    </div><details className={styles.advancedSetup} open={advancedOpen} onToggle={e => setAdvancedOpen(e.currentTarget.open)}><summary>Advanced exercise settings</summary><div className={styles.controls}>
      <label>Meter<select value={settings.meter} onChange={e => update({ meter: e.target.value as SightSettings['meter'] })}>{sightMeters(settings.level).map(m => <option key={m}>{m}</option>)}</select></label>
      {settings.level !== 'Beginner' && <label><input type="checkbox" checked={settings.mixedMeters === true} onChange={e => update({ mixedMeters: e.target.checked })} /> Change meter between bars</label>}
      {settings.level === 'Beginner' && <label><input type="checkbox" checked={settings.snareOnly} onChange={e => update({ snareOnly: e.target.checked })} /> Snare only</label>}
      {settings.level === 'Advanced' && settings.meter !== '7/8' && !settings.mixedMeters && <label><input type="checkbox" checked={settings.triplets} onChange={e => update({ triplets: e.target.checked })} /> Triplets</label>}
      <label>Rhythm focus<select value={settings.focusRhythm} onChange={e => update({ focusRhythm: e.target.value as SightRhythmFocus })}>{(['mixed','quarters','eighths',...(settings.level === 'Beginner' ? [] : ['sixteenths']),...(settings.level === 'Advanced' && settings.meter !== '7/8' && !settings.mixedMeters ? ['triplets'] : [])] as SightRhythmFocus[]).map(value => <option key={value} value={value}>{value === 'mixed' ? 'Mixed' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      <label>Voice focus<select disabled={settings.snareOnly} value={settings.focusVoice} onChange={e => update({ focusVoice: e.target.value as SightSettings['focusVoice'] })}><option value="mixed">Mixed voices</option>{SIGHT_VOICES.map(voice => <option key={voice} value={voice}>{voice[0].toUpperCase() + voice.slice(1)}</option>)}</select></label>
      {settings.level !== 'Beginner' && <label>Articulation focus<select value={settings.articulationFocus ?? 'none'} onChange={e => update({ articulationFocus: e.target.value === 'none' ? null : e.target.value as NonNullable<SightSettings['articulationFocus']> })}><option value="none">None</option>{['closed-hat','open-hat','pedal-hat','foot-splash','ride','crash','rimshot','side-stick'].map(value => <option key={value} value={value}>{value.replaceAll('-', ' ')}</option>)}</select></label>}
      {settings.level === 'Advanced' && <label><input type="checkbox" checked={settings.dynamicsFocus === true} onChange={e => { update({ dynamicsFocus: e.target.checked }); if (e.target.checked) setSource('midi'); }} /> Read ghost, normal, and accented notes with MIDI velocity (requires MIDI calibration)</label>}
      <label>Groove and phrase<select value={settings.style} onChange={e => update({ style: e.target.value as SightStyle })}>{styleOptions.map(style => <option key={style} value={style}>{style === 'varied' ? 'Varied reading' : style === 'rock' ? 'Rock backbeat' : style === 'shuffle' ? 'Shuffle feel' : style === 'fill' ? 'Groove with a fill' : style === 'half-time' ? 'Half-time groove' : style === 'funk' ? 'Funk syncopation' : 'Latin groove'}</option>)}</select></label>
      {settings.style === 'varied' && <label>Phrase density<select value={settings.density} onChange={e => update({ density: e.target.value as SightSettings['density'] })}><option value="light">Light · fewer subdivisions</option><option value="balanced">Balanced</option><option value="dense">Dense · more subdivisions</option></select></label>}
      <label>Reading cues<select value={cueLevel} onChange={e => setCueLevel(e.target.value as typeof cueLevel)}><option value="full">Full legend and pad labels</option><option value="compact">Compact legend</option><option value="standard">Standard notation · no legend</option><option value="adaptive">Fade cues with progress</option></select></label>
      <label><input type="checkbox" checked={showSticking} onChange={e => setShowSticking(e.target.checked)} /> Show suggested R/L sticking</label>
      <label><input type="checkbox" checked={hideCursorDuringPlay} onChange={e => setHideCursorDuringPlay(e.target.checked)} /> Hide the moving beat cursor for a challenge</label>
      <label>Score reveal during the pass<select value={scoreReveal} onChange={e => setScoreReveal(e.target.value as ScoreReveal)}><option value="full">Show the full score</option><option value="current">Current measure only</option><option value="ahead-1">Current + 1 measure ahead</option><option value="ahead-2">Current + 2 measures ahead</option></select></label>
      <section className={styles.soundMix}><h3>Sound balance</h3><label>Learner drums · {Math.round(audioPreferences.drumLevel * 100)}%<input type="range" min="0" max="1" step="0.05" value={audioPreferences.drumLevel} onChange={e => setAudioPreferences({ ...audioPreferences, drumLevel: Number(e.target.value) })} /></label><label>Target drums · {Math.round(audioPreferences.targetLevel * 100)}%<input type="range" min="0" max="1" step="0.05" value={audioPreferences.targetLevel} onChange={e => setAudioPreferences({ ...audioPreferences, targetLevel: Number(e.target.value) })} /></label><label>Metronome · {Math.round(audioPreferences.clickLevel * 100)}%<input type="range" min="0" max="1" step="0.05" value={audioPreferences.clickLevel} onChange={e => setAudioPreferences({ ...audioPreferences, clickLevel: Number(e.target.value) })} /></label><label>Click sound<select value={audioPreferences.clickSound} onChange={e => setAudioPreferences({ ...audioPreferences, clickSound: e.target.value as TrainerClickSound })}><option value="woodblock">Woodblock</option><option value="hat">Hi-hat</option><option value="beep">Beep</option></select></label><label><input type="checkbox" checked={audioPreferences.groupedAccents} onChange={e => setAudioPreferences({ ...audioPreferences, groupedAccents: e.target.checked })} /> Accent meter groups</label></section>
      <label>Count-in subdivision<select value={countInSubdivision} onChange={e => setCountInSubdivision(e.target.value as SightCountSubdivision)}><option value="quarter">Quarter notes</option><option value="eighth">Eighth notes</option><option value="sixteenth">Sixteenth notes</option></select></label>
      <label><input type="checkbox" checked={spokenCountIn} onChange={e => setSpokenCountIn(e.target.checked)} /> Speak the count-in</label>
      <label><input type="checkbox" checked={liveFeedback} onChange={e => setLiveFeedback(e.target.checked)} /> Show live timing feedback on practice retries</label>
      <label><input type="checkbox" checked={adaptiveMode} onChange={e => setAdaptiveMode(e.target.checked)} /> Adaptive progression after first reads</label>
      <label>Practice set<select value={sessionLength} onChange={e => setSessionLength(Number(e.target.value) as 3 | 5 | 10)}>{[3,5,10].map(n => <option key={n} value={n}>{n} exercises</option>)}</select></label>
      <label><input type="checkbox" checked={tempoLadder} onChange={e => setTempoLadder(e.target.checked)} /> Tempo ladder (+5 BPM after 85% accuracy)</label>
      {source === 'midi' && <><button onClick={connectMidi}>Connect MIDI</button><label>MIDI device<select value={midiId} onChange={e => { setMidiId(e.target.value); selectedMidi.current = e.target.value; if (midi.current) bindMidi(midi.current, e.target.value); setMidiCheckRemaining([]); midiCheckRemainingRef.current = []; midiTimingRef.current = null; }}>{inputs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>{midiId && <section className={styles.midiCalibration}><h3>Pad mapping and timing</h3><p>Mappings and correction are saved for {inputs.find(input => input.id === midiId)?.name ?? 'this MIDI device'} in this learner profile.</p><p role="status">Input health: {inputs.some(input => input.id === midiId) ? 'connected' : 'disconnected'} · {SIGHT_VOICES.filter(voice => Object.values(selectedMidiProfile.midiMap).includes(voice)).length}/5 voices mapped · {midiCalibrationSummary}.</p>{SIGHT_VOICES.map(voice => { const note = Object.entries(selectedMidiProfile.midiMap).find(([, mapped]) => mapped === voice)?.[0] ?? ''; return <div className={styles.controls} key={voice}><label>{voice} MIDI note<input aria-label={`${voice} MIDI note`} type="number" min={0} max={127} value={note} onChange={e => saveMidiMap(voice, Number(e.target.value))} /></label><button type="button" onClick={() => { midiMappingVoiceRef.current = voice; setMidiMappingVoice(voice); setMessage(`Strike the ${voice} pad to learn its MIDI note.`); }}>Learn {voice} pad</button>{settings.dynamicsFocus && <button type="button" onClick={() => beginMidiVelocityCalibration(voice)} disabled={!note || active}>{velocityCalibration?.voice === voice ? `Calibrating ${velocityCalibration.stage} ${velocityCalibration.samples.length}/5` : `Calibrate ${voice} dynamics`}</button>}</div>; })}<label>Device timing correction ({selectedMidiProfile.latencyMs} ms)<input type="range" min={-200} max={200} step={5} value={selectedMidiProfile.latencyMs} onChange={e => saveMidiLatency(Number(e.target.value))} /></label><p>{SIGHT_VOICES.filter(voice => Object.values(selectedMidiProfile.midiMap).includes(voice)).length} of 5 voices mapped. Timing correction is currently {selectedMidiProfile.latencyMs} ms.</p>{settings.dynamicsFocus && <p>Dynamics mode maps each calibrated soft-to-accented MIDI range to ghost, normal, and accent targets. Calibrate each voice used in the phrase.</p>}<button type="button" onClick={startMidiReadinessCheck} disabled={!inputs.some(input => input.id === midiId)}>Run MIDI readiness check</button>{midiCheckRemaining.length > 0 && <p role="status">Confirmed: {midiCheckVerified.join(', ') || 'none yet'}. Strike {midiCheckRemaining[0]} next.</p>}<button type="button" onClick={() => { void calibrateMidiTiming(); }} disabled={!inputs.some(input => input.id === midiId) || active}>Estimate input timing correction</button><p className={styles.chartCaption}>Tap the mapped snare on eight clicks after the count-in. The median offset includes both device delay and tap consistency.</p>{midiTimingStatus && <p role="status">{midiTimingStatus}</p>}{midiMappingVoice && <p role="status">Strike a pad to map {midiMappingVoice}, or choose another voice.</p>}</section>}</>}
      {source === 'audio-voices' && <section className={styles.midiCalibration}><h3>Microphone voice recognition</h3><p>Audio is analyzed locally and is not recorded. Calibrate each drum voice on this microphone; uncertain strikes are left unscored.</p><div className={styles.actions}><button type="button" onClick={() => void connectSightAudio()} disabled={active}>{audioConnected ? 'Reconnect microphone' : 'Connect microphone'}</button><button type="button" onClick={stopSightAudio} disabled={!audioConnected || active}>Disconnect</button></div><p role="status">{audioStatus} · {calibratedAudioVoices.length}/5 voices calibrated.</p><label>Voice to calibrate<select value={audioCalibrationVoice} onChange={e => setAudioCalibrationVoice(e.target.value as typeof audioCalibrationVoice)}>{SIGHT_VOICES.map(voice => <option key={voice} value={voice}>{voice}</option>)}</select></label><button type="button" onClick={beginAudioCalibration} disabled={!audioConnected || active}>{audioCalibrationHits ? `Capturing ${audioCalibrationHits}/5 hits` : `Calibrate ${audioCalibrationVoice}`}</button><p role="status">{audioCalibrationPrompt}</p><label>Microphone timing correction ({selectedAudioProfile.latencyMs} ms)<input type="range" min={-200} max={200} step={5} value={selectedAudioProfile.latencyMs} onChange={e => { const state = savedInputState(profileId), current = getTrainerDeviceProfile(state, audioProfileKey); state.deviceProfiles[audioProfileKey] = { ...current, latencyMs: Number(e.target.value), latencyCalibrated: false, latencySpreadMs: null, latencyCalibratedAt: null }; try { localStorage.setItem(trainerStorageKey(profileId), JSON.stringify(state)); window.dispatchEvent(new Event('drum-hero:trainer-change')); setAudioProfileRevision(value => value + 1); } catch { setMessage('Could not save the microphone timing correction.'); } }} /></label><p>{audioUncertain} uncertain strikes skipped in this connection. Wear headphones when target drums are on to reduce audio bleed.</p></section>}
      <details className={styles.advancedSetup}><summary>Create and save a custom phrase</summary><p>Write a one-bar phrase on the selected meter and rhythm grid. Saved templates are private to this learner on this device.</p><div className={styles.controls}><label>Phrase name<input maxLength={80} value={templateName} onChange={e => setTemplateName(e.target.value)} /></label><label><input type="checkbox" checked={templateAccent} onChange={e => setTemplateAccent(e.target.checked)} /> Mark new notes as accented</label><button type="button" onClick={saveTemplate} disabled={!templateDraft.length}>Save phrase template</button>{currentTemplate && <button type="button" onClick={() => { setTemplateDraft(currentTemplate.hits.map(hit => ({ ...hit }))); setTemplateName(`${currentTemplate.name} copy`); }}>Edit “{currentTemplate.name}” as a new phrase</button>}</div><div className={styles.scroll}><table><caption>Phrase editor · {settings.meter} · {templateSubdivision === 12 ? 'triplet' : templateSubdivision === 16 ? 'sixteenth' : templateSubdivision === 8 ? 'eighth' : 'quarter'} grid</caption><thead><tr><th scope="col">Voice</th>{Array.from({ length: templateSteps }, (_, step) => <th scope="col" key={step}>{step + 1}</th>)}</tr></thead><tbody>{SIGHT_VOICES.map(voice => <tr key={voice}><th scope="row">{voice}</th>{Array.from({ length: templateSteps }, (_, step) => { const item = templateDraft.find(hit => hit.step === step && hit.instrument === voice); return <td key={step}><button type="button" aria-label={`${item ? 'Remove' : 'Add'} ${templateAccent ? 'accented ' : ''}${voice} at grid step ${step + 1}`} aria-pressed={!!item} onClick={() => toggleTemplateHit(step, voice)}>{item ? item.accent ? '>' : '●' : '·'}</button></td>; })}</tr>)}</tbody></table></div>{sightTemplates.length > 0 && <ul>{sightTemplates.map(item => <li key={item.id}>{item.name} · {item.level} · {item.meter} · {item.hits.length} notes <button type="button" onClick={() => { setSelectedTemplateId(item.id); setExerciseOrigin('template'); }}>Use</button> <button type="button" onClick={() => deleteTemplate(item.id)}>Delete</button></li>)}</ul>}</details>
    </div></details></fieldset>}
    {active && <p>{settings.level} · {settings.bpm} BPM · {settings.mixedMeters ? `mixed meters · ${exercise ? sightExerciseMeters(exercise).join(' → ') : 'meter changes by bar'}` : settings.meter} · {settings.bars} bars · {settings.style} · {settings.focusRhythm} · {settings.focusVoice}</p>}
    {sessionTotal > 0 && phase !== 'results' && <p role="status">Practice set · exercise {sessionIndex} of {sessionTotal} · {sessionMetrics.length} first reads complete.</p>}
    <p hidden={focusMode}>{previewSeconds === 0 ? 'Cold read' : `${previewSeconds}-second silent preview`} · {countInBars === 0 ? 'no count-in' : `${countInBars}-bar count-in`}{spokenCountIn ? ' with spoken count' : ''} · one scored pass. Accents are reading cues; scoring checks voice and timing. <Link href="/trainer?setup=1">Trainer input help</Link></p>
    <div className={styles.actions}>
      {!active && !reference && <button onClick={start}>{phase === 'results' || hasAttempted ? 'Retry as practice' : 'Start sight reading'}</button>}
      {!active && !reference && <button onClick={fresh}>New exercise</button>}
      {!active && !reference && !focusMode && <button onClick={beginPracticeSet}>Start {sessionLength}-exercise set</button>}
      {!active && !reference && !focusMode && <button onClick={() => { void shareExercise(); }}>Share assignment</button>}
      {!active && !reference && !focusMode && exercise && <button onClick={() => { rememberPhrase(exercise); setShowSetupNotation(true); window.setTimeout(() => window.print(), 120); }}>Print exercise</button>}
      {active && <button onClick={cancel}>{midiTimingActive ? 'Cancel MIDI timing check' : 'Cancel attempt'}</button>}
      {reference && <button onClick={() => { stop(); setReference(false); }}>Stop playback</button>}
    </div>
    {!active && !focusMode && <details><summary>Teacher assignment and student result</summary><p>Create a seeded exercise with a due date and accuracy target. Students return their result with a short code; no account or cloud sync is needed.</p><div className={styles.controls}><label>Assignment title<input maxLength={80} value={assignmentTitle} onChange={e => setAssignmentTitle(e.target.value)} /></label><label>Due date<input type="date" value={assignmentDueDate} onChange={e => setAssignmentDueDate(e.target.value)} /></label><label>Minimum accuracy (%)<input type="number" min={50} max={100} value={assignmentMinimumAccuracy} onChange={e => setAssignmentMinimumAccuracy(Number(e.target.value))} /></label></div><label>Assignment or student result code<input value={assignmentCode} onChange={e => setAssignmentCode(e.target.value)} placeholder="Paste DH-SA1 or DH-SUB1 code" /></label><button onClick={importAssignment}>Load assignment / review result</button></details>}
    {sharedAssignment && loadedAssignment && <p className={styles.assignment} role="status" hidden={focusMode}>{loadedAssignment.title || 'Shared assignment'}{loadedAssignment.dueDate ? ` · due ${loadedAssignment.dueDate}` : ''}{loadedAssignment.minimumAccuracy ? ` · target ${loadedAssignment.minimumAccuracy}%` : ''} · {exercise?.settings.level} · {exercise?.settings.meter} · {exercise?.settings.bpm} BPM. Preview it before starting.</p>}
    {!active && !focusMode && currentRecommendation && <section className={styles.panel}><h2>Suggested next step</h2><p>{currentRecommendation.reason}</p><button onClick={applyRecommendedSettings}>{recommendationAction}</button></section>}
    {!active && !focusMode && <section className={styles.panel}><h2>Learning path</h2>{pathIndex >= 0 ? <><p>Step {pathIndex + 1} of {SIGHT_LEARNING_PATH.length}: {SIGHT_LEARNING_PATH[pathIndex].title}. Complete a first reading at 80% to advance.</p><progress max={SIGHT_LEARNING_PATH.length} value={pathIndex} aria-label="Reading learning path progress" /><button onClick={startLearningPathStep}>Start this step</button></> : <><p>All reading foundation steps are complete.</p><progress max={SIGHT_LEARNING_PATH.length} value={SIGHT_LEARNING_PATH.length} aria-label="Reading learning path complete" /></>}</section>}
    <p role="status" aria-live="polite">{phase === 'preview' ? `Silent preview · ${clock} seconds` : phase === 'count-in' ? `Count-in · ${countInSyllable}` : phase === 'playing' ? 'Play the notation' : message || (hasAttempted && phase !== 'results' ? 'This exercise will count as practice.' : 'Ready')}</p>
    {exercise && (phase !== 'setup' || hasAttempted || showSetupNotation) && <div className={styles.printable}><h2>Drum Hero sight-reading exercise</h2><p>{exercise.settings.level} · {exercise.settings.meter} · {exercise.settings.bpm} quarter-note BPM · {exercise.settings.bars} bars · {exercise.settings.style}</p><Notation exercise={exercise} cursor={cursor} review={notationReview} showSticking={showSticking} cursorVisible={!hideCursorDuringPlay || phase !== 'playing'} revealMode={phase === 'playing' ? scoreReveal : 'full'} />{notationReview && <p className={styles.chartCaption}>Review marks: green matched · blue early · amber late · red missed · purple extra.</p>}{effectiveCueLevel === 'full' ? <p>Legend: Kick (Space), Snare (F), Hi-hat (J), Tom (K), Crash (L). Cross noteheads: cymbals. &gt; accent. Rests: silence. {settings.meter === '7/8' ? 'Grouping: 2+2+3 eighths.' : settings.meter === '5/4' ? 'Grouping: 3+2 quarters.' : ''}</p>  : effectiveCueLevel === 'compact' ? <p>Voice is encoded by staff position. &gt; marks an accent; rests are silence.</p> : null}<details><summary>{effectiveCueLevel === 'full' ? 'Accessible counted notation' : 'Show voice legend and counted notation'}</summary><p>Kick (Space), Snare (F), Hi-hat (J), Tom (K), Crash (L). Cross noteheads: cymbals. &gt; marks an accent; rests are silence.</p><p>{noteText}</p><button disabled={phase === 'playing' || phase === 'count-in'} onClick={() => { assisted.current = true; setClassification('assisted'); if ('speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(noteText)); } else setMessage('Speech is unavailable; read the counted notes.'); }}>Speak notes (assisted attempt)</button></details></div>}
    <div className={`${styles.pads} ${effectiveCueLevel === 'standard' ? styles.standardPads : ''}`}>{SIGHT_VOICES.map((voice, index) => <button key={voice} aria-label={`${labels[index]} drum pad`} data-reading-pad disabled={phase !== 'playing' || source === 'midi' || source === 'audio-voices'} onPointerDown={e => { e.preventDefault(); hit(voice, source); }} onClick={e => { if (e.detail === 0) hit(voice, source); }}>{effectiveCueLevel === 'standard' ? `Pad ${index + 1}` : labels[index]}{effectiveCueLevel !== 'standard' && <small>{keys[index].replace('Key','')}</small>}</button>)}</div>
    {liveFeedback && practicePass.current && liveHitMessage && <p className={styles.liveFeedback} role="status" aria-live="polite">{liveHitMessage}</p>}
    {result && !confidenceRecorded && <section className={styles.panel} aria-labelledby="confidence-title"><h2 id="confidence-title" ref={confidenceHeading} tabIndex={-1}>Before seeing your score</h2><p>How confident did you feel while reading this phrase?</p><div className={styles.actions}>{[['1','Not sure'],['2','A little sure'],['3','Somewhat sure'],['4','Very sure'],['5','Certain']].map(([value,label]) => <button type="button" key={value} onClick={() => recordConfidence(Number(value))} aria-label={`${label}, ${value} out of 5`}>{value} · {label}</button>)}<button type="button" onClick={() => recordConfidence(null)}>Skip</button></div><p>This reflection is saved with the attempt; it does not affect the score or reading trends.</p></section>}
    {result && confidenceRecorded && <section className={styles.panel}><h2 ref={heading} tabIndex={-1}>Sight-reading results</h2>{result.dynamicAccuracy !== null && result.dynamicAccuracy !== undefined && <p>Dynamic reading accuracy: {result.dynamicAccuracy}% · ghost, normal, and accented strokes are scored separately from timing and voice.</p>}{result.contextErrors?.length ? <section><h3>Where the reading broke down</h3><ul>{result.contextErrors.map(item => <li key={item.context}>{item.context.replaceAll('-', ' ')} · {item.count} {item.count === 1 ? 'error' : 'errors'}</li>)}</ul></section> : null}<p><strong>{classification === 'reading' ? 'First reading' : classification === 'assisted' ? 'Assisted attempt' : 'Practice retry'}{exercise?.sourceLabel ? ` · ${exercise.sourceLabel}` : ''} · {result.summary.accuracy}% accuracy · {result.summary.score} score</strong></p>{articulationSummary && <p>Articulation focus: {articulationSummary}. A wrong articulation is scored as a miss and extra.</p>}<p>{result.meanOffsetMs === null ? 'No matched hits' : `Average timing: ${Math.abs(result.meanOffsetMs)} ms ${result.meanOffsetMs < 0 ? 'early' : result.meanOffsetMs > 0 ? 'late' : 'on time'}`} · {result.summary.miss} misses · {result.summary.extra} extras{result.timingSpreadMs !== null ? ` · ${result.timingSpreadMs} ms timing spread` : ''}{result.pulseRecovery !== null ? ` · ${result.pulseRecovery}% pulse recovery after errors` : ''}</p>{confidenceRating !== null && <p>Confidence: {confidenceRating}/5 ({confidenceRating * 20}%) · {confidenceRating * 20 - result.summary.accuracy >= 0 ? `${confidenceRating * 20 - result.summary.accuracy} points more confident than the score` : `${result.summary.accuracy - confidenceRating * 20} points less confident than the score`}.</p>}{classification === 'reading' && (currentAttempt?.source === 'midi' || currentAttempt?.source === 'audio-voices') && <p>Input check: {attemptCalibrationSummary}.</p>}{loadedAssignment && <p role="status">{result.summary.accuracy >= (loadedAssignment.minimumAccuracy ?? 0) ? 'Assignment target met' : 'Assignment target not met'}{loadedAssignment.minimumAccuracy ? ` · ${loadedAssignment.minimumAccuracy}% required` : ''}{loadedAssignment.dueDate ? ` · due ${loadedAssignment.dueDate}` : ''}</p>}<div className={styles.actions}><button onClick={shareSubmission}>Copy student result code</button>{drillParent ? <button onClick={returnToFullPhrase}>Return to full phrase</button> : <button onClick={startWeakestBarDrill}>Practice weakest bar twice</button>}{result.summary.miss + result.summary.extra > 0 && !transferCheck && <button onClick={startErrorFocusDrill}>Practice the main error pattern</button>}{transferSettings && !transferCheck && <button onClick={startTransferCheck}>Check transfer on a new phrase</button>}</div>{exercise && <section className={styles.rangeLoop}><h3>Loop a bar range</h3><p>Select a contiguous passage and repeat it as practice.</p><div className={styles.controls}><label>From bar<select value={Math.min(rangeStart, exercise.settings.bars - 1)} onChange={e => { const start = Number(e.target.value); setRangeStart(start); setRangeEnd(Math.max(start, Math.min(rangeEnd, start + Math.floor(80 / rangeRepeats) - 1))); }}>{Array.from({ length: exercise.settings.bars }, (_, index) => <option value={index} key={index}>Bar {index + 1}</option>)}</select></label><label>Through bar<select value={Math.max(rangeStart, Math.min(rangeEnd, exercise.settings.bars - 1))} onChange={e => setRangeEnd(Number(e.target.value))}>{Array.from({ length: Math.min(exercise.settings.bars - rangeStart, Math.floor(80 / rangeRepeats)) }, (_, index) => <option value={rangeStart + index} key={index}>Bar {rangeStart + index + 1}</option>)}</select></label><label>Repeats<select value={rangeRepeats} onChange={e => {const repeats = Number(e.target.value); setRangeRepeats(repeats); setRangeEnd(Math.min(rangeEnd, rangeStart + Math.floor(80 / repeats) - 1));}}>{[2,3,4].map(count => <option value={count} key={count}>{count} times</option>)}</select></label><button onClick={startRangeDrill}>Practice this range</button></div></section>}<div className={styles.actions}><label>Playback speed<select value={reviewSpeed} onChange={e => setReviewSpeed(Number(e.target.value))}><option value={0.5}>0.5×</option><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option></select></label><button disabled={reference} onClick={() => { void playReview('reference'); }}>Play reference</button><button disabled={reference} onClick={() => { void playReview('learner'); }}>Play my pass</button><button disabled={reference} onClick={() => { void playReview('compare'); }}>Compare reference and my pass</button></div>{result.fluency && <section><h3>Rhythm reading fluency</h3><div className={styles.scroll}><table><caption>Accuracy by rhythm family</caption><thead><tr><th>Rhythm</th><th>Accuracy</th></tr></thead><tbody>{Object.entries(result.fluency).map(([name, accuracy]) => <tr key={name}><th scope="row">{name}</th><td>{accuracy}%</td></tr>)}</tbody></table></div></section>}{voiceTrends.some(row => row.count > 0) && <section><h3>First-read accuracy by drum voice</h3><div className={styles.scroll}><table><caption>Voice accuracy across first readings</caption><thead><tr><th>Voice</th><th>Accuracy</th><th>Readings</th></tr></thead><tbody>{voiceTrends.filter(row => row.count > 0).map(row => <tr key={row.voice}><th scope="row">{row.voice}</th><td>{row.average}%</td><td>{row.count}</td></tr>)}</tbody></table></div></section>}<div className={styles.scroll}><table><caption>Misses and extras by bar and voice</caption><thead><tr><th>Bar</th><th>Voice</th><th>Misses</th><th>Extras</th></tr></thead><tbody>{exercise && Array.from({ length: exercise.settings.bars }, (_, bar) => SIGHT_VOICES.map(voice => { const rows = result.rated.filter(h => h.instrument === voice && sightStepBar(exercise, h.step ?? 0) === bar); return <tr key={`${bar}-${voice}`}><td>{bar + 1}</td><td>{voice}</td><td>{rows.filter(h => h.rating === 'miss').length}</td><td>{rows.filter(h => h.rating === 'extra').length}</td></tr>; }))}</tbody></table></div><details><summary>Review every expected and played note</summary>{exercise && Array.from({ length: exercise.settings.bars }, (_, bar) => <section key={bar}><h3>Bar {bar + 1}</h3><ol className={styles.review}>{result.rated.filter(h => sightStepBar(exercise, h.step ?? 0) === bar).sort((a,b) => (a.step ?? 0) - (b.step ?? 0)).map((hit,index) => { const step = hit.step ?? 0; const beat = (sightStepLocal(exercise, step) * 4 / exercise.subdivision) + 1; const timing = hit.offsetMs === null ? '' : ` · ${Math.abs(hit.offsetMs)} ms ${hit.offsetMs < 0 ? 'early' : hit.offsetMs > 0 ? 'late' : 'on time'}`; const barIndex = sightStepBar(exercise, step); const needsReview = hit.rating === 'miss' || hit.rating === 'extra' || hit.offsetMs !== null && Math.abs(hit.offsetMs) > 50; return <li className={styles[hit.rating]} key={`${hit.instrument}-${step}-${hit.rating}-${index}`}><strong>{hit.rating === 'miss' ? 'Missed' : hit.rating === 'extra' ? 'Extra' : hit.rating === 'great' ? 'On time' : 'Played'}</strong> · {hit.instrument} · beat {Number.isInteger(beat) ? beat : beat.toFixed(2)}{timing}{needsReview && <><button className={styles.inlineReview} disabled={reference} onClick={() => { void playReview('compare', barIndex, step); }}>Hear this bar at {reviewSpeed}×</button><button className={styles.inlineReview} onClick={() => startBarDrill(barIndex)}>Practice this bar twice at {Math.max(40, settings.bpm - 10)} BPM</button></>}</li>; })}</ol></section>)}</details>{sessionTotal > 0 && <section className={styles.session}><h3>{sessionLabel} · {sessionStage ? `${sessionStage} · ` : ''}exercise {sessionIndex} of {sessionTotal}</h3>{sessionQueue.length ? <><p>{sessionMetrics.length} first reads complete · {sessionMetrics.length ? `${Math.round(sessionMetrics.reduce((sum, item) => sum + item.accuracy, 0) / sessionMetrics.length)}% average accuracy so far` : 'This exercise did not count as a first read.'}</p><button onClick={nextPracticeSetExercise}>Next exercise in set</button></> : <><p>Set complete · {sessionMetrics.length} first reads · {sessionMetrics.length ? `${Math.round(sessionMetrics.reduce((sum, item) => sum + item.accuracy, 0) / sessionMetrics.length)}% average accuracy` : 'No first-read results were recorded.'} · {sessionMetrics.flatMap(item => item.timingSpreadMs === null ? [] : [item.timingSpreadMs]).length ? `${setAvgTimingSpread} ms average timing spread` : 'timing spread unavailable'}</p></>}</section>}{tempoLadder && <div className={styles.ladder}><p>Tempo ladder: advance after 85% accuracy.</p><button onClick={advanceTempoLadder}>{result.summary.accuracy >= 85 && settings.bpm < 200 ? `Next tempo: ${settings.bpm + 5} BPM` : result.summary.accuracy >= 85 ? 'Ladder complete' : 'Retry before advancing'}</button></div>}</section>}
    {adaptiveMode && result && exercise && classification === 'reading' && <section className={styles.panel} hidden={focusMode}><h2>Adaptive next step</h2>{adaptiveNext || adaptivePreview !== null ? <><p>Based on this first read, {adaptiveNext ? `try ${adaptiveNext.focusRhythm} rhythms at ${adaptiveNext.density} density and ${adaptiveNext.bpm} BPM` : 'keep the same rhythm and tempo'}{adaptivePreview !== null ? ` with a ${adaptivePreview}-second preview` : ''}.</p><button onClick={() => { const next = adaptiveNext ?? exercise.settings; setSettings(next); setPreviewSeconds(adaptivePreview ?? previewSeconds); setExercise(generateFreshSightExercise(next, crypto.getRandomValues(new Uint32Array(1))[0], phraseMemory())); setSessionQueue([]); setSessionTotal(0); setSessionIndex(0); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setReviewCursor(null); setPhase('setup'); setMessage('Adaptive exercise ready. Preview it before your first read.'); }}>Continue with adaptive exercise</button></> : <p>Hold this setting steady; accuracy and timing are in the practice range.</p>}</section>}
    {result && exercise && <section className={styles.panel} hidden={focusMode}><h2>Replay a specific error</h2><p>Choose a missed or extra note to compare its bar against the reference. The staff cursor marks that note.</p><div className={styles.actions}>{result.rated.filter(hit => hit.rating === 'miss' || hit.rating === 'extra').map((hit, index) => { const step = hit.step ?? 0, bar = Math.min(exercise.settings.bars - 1, sightStepBar(exercise, step)), barBeats = sightMeterBeats(sightExerciseMeters(exercise)[bar]), beat = (sightStepLocal(exercise, step) * 4 / exercise.subdivision) + 1; return <button key={`${hit.instrument}-${step}-${hit.rating}-${index}`} disabled={reference} onClick={() => { setReviewCursor({ barIndex: bar, fraction: sightStepLocal(exercise, step) * 4 / exercise.subdivision / barBeats }); void playReview('compare', bar); }}>{hit.rating === 'miss' ? 'Missed' : 'Extra'} {hit.instrument} · bar {bar + 1}, beat {Number.isInteger(beat) ? beat : beat.toFixed(2)}</button>; })}</div>{result.rated.every(hit => hit.rating !== 'miss' && hit.rating !== 'extra') && <p>No missed or extra notes to replay.</p>}</section>}
    <section className={styles.panel} hidden={focusMode}><h2>Practice goal</h2>{goal ? <><p>{goalAttempts.length} of {goal.targetReads} first readings at {goal.accuracy}% or higher · {goal.level}, {goal.focusRhythm} in {goal.meter} at {goal.bpm} BPM</p><progress max={goal.targetReads} value={Math.min(goal.targetReads,goalAttempts.length)} aria-label="Practice goal progress" /><button onClick={beginGoalPath}>Run five-step goal study path</button><button onClick={() => { setGoal(null); localStorage.removeItem(goalKey); setGoalMessage('Goal removed.'); }}>Remove goal</button></> : <p>Set a target for a rhythm and tempo, then track successful first readings.</p>}<div className={styles.controls}><label>Goal level<select value={goalDraft.level} onChange={e => { const level = e.target.value as SightGoal['level']; setGoalDraft({ ...goalDraft, level, meter: sightMeters(level).includes(goalDraft.meter) ? goalDraft.meter : sightMeters(level)[0] }); }}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Goal meter<select value={goalDraft.meter} onChange={e => setGoalDraft({ ...goalDraft, meter: e.target.value as SightGoal['meter'] })}>{sightMeters(goalDraft.level).map(meter => <option key={meter}>{meter}</option>)}</select></label><label>Goal tempo<input type="number" min={40} max={200} value={goalDraft.bpm} onChange={e => setGoalDraft({ ...goalDraft, bpm: Number(e.target.value) })} /></label><label>Goal rhythm<select value={goalDraft.focusRhythm} onChange={e => setGoalDraft({ ...goalDraft, focusRhythm: e.target.value as SightRhythmFocus })}>{(['mixed','quarters','eighths',...(goalDraft.level === 'Beginner' ? [] : ['sixteenths']),...(goalDraft.level === 'Advanced' && goalDraft.meter !== '7/8' ? ['triplets'] : [])] as SightRhythmFocus[]).map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Accuracy target<input type="number" min={50} max={100} value={goalDraft.accuracy} onChange={e => setGoalDraft({ ...goalDraft, accuracy: Number(e.target.value) })} /></label><label>First readings to complete<input type="number" min={1} max={20} value={goalDraft.targetReads} onChange={e => setGoalDraft({ ...goalDraft, targetReads: Number(e.target.value) })} /></label><button onClick={saveGoal}>{goal ? 'Update goal' : 'Save goal'}</button></div><p role="status">{goalMessage}</p></section>
    <section className={styles.panel} hidden={focusMode}><h2>Progress insights</h2><div className={styles.controls}><label>Level<select value={historyFilters.level} onChange={e => setHistoryFilters({ ...historyFilters, level: e.target.value })}><option>Any</option>{['Beginner','Intermediate','Advanced'].map(level => <option key={level}>{level}</option>)}</select></label><label>Meter<select value={historyFilters.meter} onChange={e => setHistoryFilters({ ...historyFilters, meter: e.target.value })}><option>Any</option>{['4/4','3/4','5/4','7/8','Mixed'].map(meter => <option key={meter}>{meter}</option>)}</select></label><label>Input<select value={historyFilters.source} onChange={e => setHistoryFilters({ ...historyFilters, source: e.target.value })}><option>Any</option>{['keyboard','touch','midi','audio-voices'].map(input => <option key={input} value={input}>{input === 'audio-voices' ? 'Microphone' : input}</option>)}</select></label><label>Tempo<select value={historyFilters.tempo} onChange={e => setHistoryFilters({ ...historyFilters, tempo: e.target.value })}><option value="Any">Any tempo</option><option value="under80">Under 80</option><option value="80to119">80–119</option><option value="120plus">120+</option></select></label></div><p>{trendReadings.length} first readings · {trendReadings.length < 3 ? 'early estimate' : 'trend'}{trendReadings.length ? ` · ${Math.round(trendReadings.reduce((sum,h) => sum+h.accuracy,0)/trendReadings.length)}% average accuracy` : ' · complete a first reading to start a trend'} · {practiceReadings.length} practice/assisted attempts shown separately.</p><p>Timing consistency: {avgTimingSpread === null ? 'matched hits will build this trend' : `${avgTimingSpread} ms average spread around each read's mean`} · {timingDirection.early} early and {timingDirection.late} late matched hits.</p><p>Pulse recovery after errors: {avgPulseRecovery === null ? 'no first-read recovery samples yet' : `${avgPulseRecovery}% average across ${pulseTrend.length} first readings`} · confidence calibration: {confidenceBias === null ? 'record a confidence check to begin' : `${Math.abs(confidenceBias)} points ${confidenceBias > 0 ? 'overconfident' : confidenceBias < 0 ? 'underconfident' : 'well matched'} on average`}.</p><p>Phrase variety: {variety.uniquePhrases} unique phrases across {variety.attempts} first reads · {variety.meters} meters · {variety.rhythmSettings} meter/rhythm pairs · {variety.styles} styles.</p><button onClick={startCoverageGap}>Try a coverage gap: {coverageGap.meter} {coverageGap.focusRhythm}</button>{rhythmFluency.some(row => row.average !== null) && <div className={styles.scroll}><table><caption>First-reading fluency by rhythm family</caption><thead><tr><th>Pattern</th><th>Average</th><th>Readings</th></tr></thead><tbody>{rhythmFluency.filter(row => row.average !== null).map(row => <tr key={row.name}><th scope="row">{row.name}</th><td>{row.average}%</td><td>{row.count}</td></tr>)}</tbody></table></div>}{trendReadings.length > 0 && <><div className={styles.chart} role="img" aria-label={`Recent first-reading accuracy: ${trendReadings.slice(-10).map(row => row.accuracy).join(', ')} percent`}><div>{trendReadings.slice(-10).map((row,index) => <span key={`${row.id}-${index}`} style={{ height: `${Math.max(6,row.accuracy)}%` }} title={`${row.accuracy}% · ${row.settings.bpm} BPM`} />)}</div></div><p className={styles.chartCaption}>Most recent {Math.min(10,trendReadings.length)} first readings, oldest to newest.</p></>}<details><summary>First-reading history ({trendReadings.length})</summary><ol>{[...trendReadings].reverse().map(row => <li key={row.id}>{new Date(row.playedAt).toLocaleDateString()} · {row.settings.level} · {row.settings.mixedMeters ? 'Mixed meter' : row.settings.meter} · {row.settings.bpm} BPM · {row.source}{row.sourceLabel ? ` · ${row.sourceLabel}` : ''} · {row.accuracy}%{row.confidence == null ? '' : ` · confidence ${row.confidence}/5`}{row.pulseRecovery == null ? '' : ` · ${row.pulseRecovery}% pulse recovery`} · {row.meanOffsetMs === null ? 'no timing match' : `${Math.abs(row.meanOffsetMs)} ms ${row.meanOffsetMs < 0 ? 'early' : row.meanOffsetMs > 0 ? 'late' : 'on time'}`} · {row.timingSpreadMs === undefined || row.timingSpreadMs === null ? 'timing spread not recorded' : `${row.timingSpreadMs} ms spread; ${row.earlyHits ?? 0} early, ${row.lateHits ?? 0} late`}</li>)}</ol></details><details><summary>Practice and assisted attempts ({practiceReadings.length})</summary><ol>{[...practiceReadings].reverse().map(row => <li key={row.id}>{new Date(row.playedAt).toLocaleDateString()} · {row.settings.level} · {row.settings.mixedMeters ? 'Mixed meter' : row.settings.meter} · {row.settings.bpm} BPM · {row.source}{row.sourceLabel ? ` · ${row.sourceLabel}` : ''}{row.targetPlayback ? ' · audible target' : ''} · {row.classification} · {row.accuracy}%</li>)}</ol></details></section>
    {trendReadings.length > 0 && <section className={styles.panel} hidden={focusMode}><h2>Progress map</h2><p>First-read accuracy by meter, rhythm focus, and tempo band. Input and level filters above apply here too.</p><div className={styles.scroll}><table className={styles.progressMap}><caption>First-reading accuracy map</caption><thead><tr><th scope="col">Meter · rhythm</th>{tempoBands.map(band => <th scope="col" key={band.id}>{band.label}</th>)}</tr></thead><tbody>{progressRows.map(key => { const [meter, rhythm] = key.split('|'); return <tr key={key}><th scope="row">{meter} · {rhythm}</th>{tempoBands.map(band => { const rows = trendReadings.filter(row => (row.settings.mixedMeters ? 'Mixed' : row.settings.meter) === meter && row.settings.focusRhythm === rhythm && band.matches(row.settings.bpm)); const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length) : null; const tone = average === null ? styles.progressEmpty : average >= 85 ? styles.progressGood : average >= 70 ? styles.progressMid : styles.progressLow; return <td key={band.id} className={`${styles.progressCell} ${tone}`} aria-label={average === null ? 'No first readings' : `${average}% average from ${rows.length} first readings`}>{average === null ? '—' : `${average}% · ${rows.length}`}</td>; })}</tr>; })}</tbody></table></div></section>}

  </div>;
}
