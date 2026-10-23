'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDrumAudio, type DrumAudio } from '@/lib/audio';
import { compactNotation, type CompactMeasure } from '@/lib/song-compact-notation';
import type { DrumSong } from '@/lib/song-library';
import { defaultTrainerDeviceProfile, getTrainerDeviceProfile, parseTrainerState, trainerStorageKey } from '@/lib/trainer';
import { learnerStorageKey } from '@/lib/learner-profiles';
import { DEFAULT_SIGHT_SETTINGS, SIGHT_GOAL_KEY, SIGHT_HISTORY_KEY, SIGHT_VOICES, generateSightExercise, matchingSightGoalAttempts, normalizeSightSettings, parseSightGoal, parseSightHistory, recommendSightSettings, scoreSightAttempt, sightClassification, sightDuration, sightFingerprint, sightMeters, sightNotationBars, type SightAttempt, type SightExercise, type SightGoal, type SightHit, type SightInput, type SightPhase, type SightRhythmFocus, type SightSettings, type SightStyle } from '@/lib/sight-reading';
import { useProgress } from './ProgressProvider';
import styles from './SightReading.module.css';
const keys = ['Space', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'];
const labels = ['Kick', 'Snare', 'Hi-hat', 'Tom', 'Crash'];
const notationSong: DrumSong = { id: 'sight', title: 'Sight-reading exercise', artist: 'Drum Hero', difficulty: 'Beginner', bpm: 80, meter: '4/4', tags: [], notes: '', sections: [], createdAt: '', updatedAt: '' };
function savedInputState(profileId: string) {
  try { return parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))); }
  catch { return parseTrainerState(null); }
}
function encodeAssignmentCode(exercise: SightExercise) {
  const payload = btoa(JSON.stringify(exercise.settings)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  return `${exercise.seed}.${payload}`;
}
function decodeAssignmentCode(code: string): { seed: number; settings: SightSettings } | null {
  try {
    const [seedText, payload, ...extra] = code.trim().replace(/^DH-SR1:/, '').split('.');
    const seed = Number(seedText);
    if (extra.length || !payload || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return null;
    const raw = payload.replaceAll('-', '+').replaceAll('_', '/');
    const padded = raw.padEnd(raw.length + ((4 - raw.length % 4) % 4), '=');
    const settings = JSON.parse(atob(padded)) as SightSettings;
    return { seed, settings: normalizeSightSettings(settings) };
  } catch { return null; }
}
function Notation({ exercise, cursor }: { exercise: SightExercise; cursor?: { barIndex: number; fraction: number } }) {
  const host = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const measures = useRef<CompactMeasure[]>([]);
  const [zoom, setZoom] = useState(100);
  const bars = useMemo(() => sightNotationBars(exercise), [exercise]);
  useEffect(() => {
    if (!host.current) return;
    const { canvas, measures: layout } = compactNotation({ ...notationSong, bpm: exercise.settings.bpm, meter: bars[0].meter }, bars, 'staff', 0, cursor);
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'Percussion staff notation; counted notes available below');
    host.current.replaceChildren(canvas); measures.current = layout;
  }, [bars, exercise, cursor]);
  useEffect(() => {
    const canvas = host.current?.querySelector('canvas');
    const frame = scroller.current;
    if (!canvas || !frame) return;
    const target = measures.current.find(m => m.barIndex === (cursor?.barIndex ?? 0));
    if (!target) return;
    const scale = canvas.getBoundingClientRect().width / canvas.width;
    frame.scrollLeft = Math.max(0, target.x * scale - 20);
    const top = canvas.getBoundingClientRect().top + target.y * scale;
    const bottom = top + target.height * scale;
    if (top < 60 || bottom > innerHeight - 60) window.scrollTo({ top: window.scrollY + top - 80, behavior: 'instant' });
  }, [cursor?.barIndex, exercise]);
  return <section><label>Notation zoom <select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[75,100,125,150,200].map(n => <option key={n} value={n}>{n}%</option>)}</select></label><div ref={scroller} className={styles.scroll}><div ref={host} className={styles.notation} style={{ width: `${zoom}%` }} /></div></section>;
}
export function SightReading() {
  const { profileId, hydrated } = useProgress();
  return hydrated ? <ReadingSession key={profileId} profileId={profileId} /> : <p role="status">Loading sight reading…</p>;
}
function ReadingSession({ profileId }: { profileId: string }) {
  const [settings, setSettings] = useState<SightSettings>(DEFAULT_SIGHT_SETTINGS);
  const [exercise, setExercise] = useState<SightExercise | null>(null);
  const [phase, setPhase] = useState<SightPhase>('setup');
  const [source, setSource] = useState<SightInput>('keyboard');
  const [midiId, setMidiId] = useState('');
  const [inputs, setInputs] = useState<Array<{ id: string; name: string }>>([]);
  const [message, setMessage] = useState('');
  const [clock, setClock] = useState(0);
  const [history, setHistory] = useState<SightAttempt[]>([]);
  const [goal, setGoal] = useState<SightGoal | null>(null);
  const [goalDraft, setGoalDraft] = useState<SightGoal>({ level: 'Beginner', meter: '4/4', bpm: 100, focusRhythm: 'eighths', accuracy: 85, targetReads: 5 });
  const [goalMessage, setGoalMessage] = useState('');
  const [historyFilters, setHistoryFilters] = useState({ level: 'Any', meter: 'Any', source: 'Any', tempo: 'Any' });
  const [showSetupNotation, setShowSetupNotation] = useState(false);
  const [tempoLadder, setTempoLadder] = useState(false);
  const [sharedAssignment, setSharedAssignment] = useState(false);
  const [assignmentCode, setAssignmentCode] = useState('');
  const [result, setResult] = useState<ReturnType<typeof scoreSightAttempt> | null>(null);
  const [classification, setClassification] = useState<SightAttempt['classification']>('reading');
  const [reference, setReference] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const audio = useRef<DrumAudio | null>(null);
  const midi = useRef<MIDIAccess | null>(null);
  const selectedMidi = useRef('');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const token = useRef(0);
  const running = useRef(false);
  const attempted = useRef(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const assisted = useRef(false);
  const capture = useRef<{ start: number; end: number; correction: number; hits: SightHit[] } | null>(null);
  const historyRef = useRef<SightAttempt[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const historyKey = learnerStorageKey(SIGHT_HISTORY_KEY, profileId);
  const goalKey = learnerStorageKey(SIGHT_GOAL_KEY, profileId);
  const active = preparing || ['preview','count-in','playing'].includes(phase);
  const stop = useCallback(() => {
    token.current++; running.current = false; capture.current = null;
    timers.current.forEach(clearTimeout); timers.current = [];
    if (ticker.current) clearInterval(ticker.current); ticker.current = null;
    audio.current?.close(); audio.current = null;
    window.speechSynthesis?.cancel();
  }, []);
  const cancel = useCallback(() => { stop(); setPreparing(false); setPhase('setup'); setReference(false); setMessage('Attempt ended. Restarting this exercise counts as practice.'); }, [stop]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { historyRef.current = parseSightHistory(localStorage.getItem(historyKey)); setHistory(historyRef.current); } catch { setMessage('Local history unavailable. You can still practice.'); }
      try { const savedGoal = parseSightGoal(localStorage.getItem(goalKey)); setGoal(savedGoal); if (savedGoal) setGoalDraft(savedGoal); } catch { setGoal(null); }
      if (!sharedAssignment) {
        try {
          const params = new URLSearchParams(window.location.search);
          const encoded = params.get('exercise');
          if (encoded) {
            const assignment = decodeAssignmentCode(encoded);
            if (assignment) {
              setAssignmentCode(encoded);
              setSettings(assignment.settings); setExercise(generateSightExercise(assignment.settings, assignment.seed)); setSharedAssignment(true); setMessage('A shared reading assignment is ready. Preview it before you start.');
            }
          }
        } catch { setMessage('This shared assignment link is invalid.'); }
      }
    }, 0);
    const interrupt = () => { if (document.hidden && running.current) cancel(); };
    document.addEventListener('visibilitychange', interrupt);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', interrupt); stop(); midi.current?.inputs.forEach(input => { input.onmidimessage = null; }); if (midi.current) midi.current.onstatechange = null; };
  }, [historyKey, goalKey, stop, cancel, sharedAssignment]);
  const hit = useCallback((instrument: typeof SIGHT_VOICES[number], input: SightInput, at = performance.now()) => {
    const round = capture.current;
    if (!round || input !== source || at < round.start - 100 || at > round.end + 100) return;
    if (round.hits.length >= 10000) return;
    round.hits.push({ instrument, atMs: at - round.start - round.correction }); audio.current?.hit(instrument);
  }, [source]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof Element && event.target.closest('input,select,textarea,[contenteditable],a,summary,button:not([data-reading-pad])'))) return;
      const index = keys.indexOf(event.code);
      if (index >= 0 && source === 'keyboard' && capture.current) { event.preventDefault(); hit(SIGHT_VOICES[index], 'keyboard'); }
    };
    window.addEventListener('keydown', down); return () => window.removeEventListener('keydown', down);
  }, [hit, source]);
  useEffect(() => { if (phase === 'results') heading.current?.focus(); }, [phase]);
  const bindMidi = (access: MIDIAccess, selected: string) => {
    access.inputs.forEach(input => { input.onmidimessage = input.id === selected ? event => {
      const data = event.data;
      if (!data || (data[0] & 0xf0) !== 0x90 || data[2] === 0) return;
      const state = savedInputState(profileId);
      const voice = getTrainerDeviceProfile(state, `midi:${input.id}`).midiMap[data[1]];
      if (voice) hit(voice, 'midi', event.timeStamp);
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
  const update = (next: Partial<SightSettings>) => { setSettings(normalizeSightSettings({ ...settings, ...next })); setExercise(null); setShowSetupNotation(false); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setSharedAssignment(false); };
  const fresh = () => {
    stop(); const next = generateSightExercise(settings, crypto.getRandomValues(new Uint32Array(1))[0], exercise ? sightFingerprint(exercise) : undefined);
    setExercise(next); setShowSetupNotation(false); setSharedAssignment(false); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setPhase('setup'); setReference(false); setMessage('New exercise ready. Start to reveal its notation.');
    return next;
  };
  const applyRecommendedSettings = () => {
    const recommendation = recommendSightSettings(history, settings, source);
    if (!recommendation) return;
    stop(); setSettings(recommendation.settings); setExercise(generateSightExercise(recommendation.settings, crypto.getRandomValues(new Uint32Array(1))[0], exercise ? sightFingerprint(exercise) : undefined));
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
    const code = encodeAssignmentCode(target); setAssignmentCode(code);
    const url = new URL(window.location.href); url.search = ''; url.searchParams.set('exercise', code);
    try {
      if (navigator.share) await navigator.share({ title: 'Drum Hero sight-reading assignment', text: `${target.settings.level} · ${target.settings.meter} · ${target.settings.bpm} BPM`, url: url.toString() });
      else { await navigator.clipboard.writeText(url.toString()); setMessage('Assignment link copied. Share it with your student.'); }
      setSharedAssignment(true);
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('Could not share automatically. Use the browser address after previewing the exercise.'); }
  };
  const importAssignment = () => {
    const assignment = decodeAssignmentCode(assignmentCode);
    if (!assignment) { setMessage('Assignment code is invalid.'); return; }
    stop(); setSettings(assignment.settings); setExercise(generateSightExercise(assignment.settings, assignment.seed)); setShowSetupNotation(false); setSharedAssignment(true); attempted.current = false; setHasAttempted(false); assisted.current = false; setResult(null); setPhase('setup'); setMessage('Shared reading assignment loaded. Preview it before you start.');
  };
  const advanceTempoLadder = () => {
    if (!exercise || !result) return;
    const bpm = result.summary.accuracy >= 85 ? Math.min(200, settings.bpm + 5) : settings.bpm;
    if (result.summary.accuracy >= 85 && settings.bpm < 200) {
      const nextSettings = normalizeSightSettings({ ...settings, bpm });
      setSettings(nextSettings); setExercise(generateSightExercise(nextSettings, crypto.getRandomValues(new Uint32Array(1))[0])); attempted.current = false; setHasAttempted(false); setResult(null); setPhase('setup'); setMessage(`Tempo ladder advanced to ${bpm} BPM.`);
    } else { setMessage(result.summary.accuracy >= 85 ? 'You reached the top of the 40–200 BPM ladder.' : 'Reach 85% accuracy to advance. Retry this phrase as practice.'); }
  };
  const start = async () => {
    if (source === 'midi' && midi.current?.inputs.get(midiId)?.state !== 'connected') { setMessage('Connect and select a MIDI input first.'); return; }
    stop(); const roundToken = token.current;
    const current = exercise ?? fresh();
    setSettings(current.settings);
    // fresh() cancels pending work; take the token after exercise creation.
    const sessionToken = exercise ? roundToken : token.current;
    const kind = sightClassification(attempted.current, assisted.current); setClassification(kind); attempted.current = true; setHasAttempted(true);
    setMessage('Preparing drum sounds…'); setResult(null); setPreparing(true); running.current = true;
    const player = createDrumAudio(); audio.current = player;
    if (!player) { cancel(); setMessage('Audio is unavailable. Enable browser audio and restart as practice.'); return; }
    player.setClickSound('woodblock');
    const ready = await player.ready;
    if (token.current !== sessionToken) return;
    if (!ready) { cancel(); setMessage('Drum sounds could not load. Check your connection or offline download.'); return; }
    setPreparing(false); setPhase('preview'); setClock(10); setMessage('');
    const previewEnd = performance.now() + 10000;
    const beatMs = 60000 / current.settings.bpm;
    const startAt = previewEnd + current.beatsPerBar * beatMs;
    const end = startAt + sightDuration(current);
    const state = savedInputState(profileId);
    const profile = source === 'midi' ? getTrainerDeviceProfile(state, `midi:${midiId}`) : state.deviceProfiles[source] ?? defaultTrainerDeviceProfile(state);
    const schedule = (fn: () => void, delay: number) => timers.current.push(setTimeout(() => { if (token.current === sessionToken) fn(); }, delay));
    schedule(() => { setPhase('count-in'); }, previewEnd - performance.now());
    for (let bar = -1; bar < current.settings.bars; bar++) {
      const base = startAt + bar * current.beatsPerBar * beatMs;
      for (let beat = 0; beat < current.beatsPerBar; beat++) player.scheduleClick(base + beat * beatMs, beat === 0);
    }
    schedule(() => { capture.current = { start: startAt, end, correction: profile.latencyMs, hits: [] }; }, startAt - performance.now() - 100);
    schedule(() => setPhase('playing'), startAt - performance.now());
    ticker.current = setInterval(() => {
      const now = performance.now(); setClock(now < previewEnd ? Math.max(0, Math.ceil((previewEnd - now) / 1000)) : (now - startAt) / beatMs);
    }, 40);
    schedule(() => {
      const scored = scoreSightAttempt(current, capture.current?.hits ?? []);
      const entry: SightAttempt = { id: crypto.randomUUID(), playedAt: new Date().toISOString(), version: 1, seed: current.seed, settings: current.settings, source, inputProfile: source === 'midi' ? `midi:${midiId}` : source, classification: assisted.current ? 'assisted' : kind, score: scored.summary.score, accuracy: scored.summary.accuracy, meanOffsetMs: scored.meanOffsetMs, misses: scored.summary.miss, extras: scored.summary.extra };
      historyRef.current = [...historyRef.current, entry].slice(-100); setHistory(historyRef.current);
      try { localStorage.setItem(historyKey, JSON.stringify({ version: 1, attempts: historyRef.current })); } catch { setMessage('Result could not be saved.'); }
      stop(); setResult(scored); setClassification(entry.classification); setPhase('results');
    }, end - performance.now() + 110);
  };
  const playReference = async () => {
    if (!exercise) return;
    stop(); const roundToken = token.current; setReference(true); running.current = true;
    const player = createDrumAudio(); audio.current = player;
    if (!player || !await player.ready) { stop(); setReference(false); setMessage('Reference audio unavailable.'); return; }
    if (roundToken !== token.current) return;
    const base = performance.now() + 100;
    for (const note of exercise.hits) player.scheduleHit(note.instrument, base + note.step * 60000 / exercise.settings.bpm * 4 / exercise.subdivision, note.accent);
    timers.current.push(setTimeout(() => { stop(); setReference(false); }, sightDuration(exercise) + 600));
  };
  const noteText = exercise?.hits.map(h => `Bar ${Math.floor(h.step / exercise.stepsPerBar) + 1}, beat ${(h.step % exercise.stepsPerBar) * 4 / exercise.subdivision + 1}: ${h.instrument}${h.accent ? ', accent' : ''}`).join('. ') ?? '';
  const cursor = exercise && phase === 'playing' ? { barIndex: Math.min(settings.bars - 1, Math.max(0, Math.floor(clock / exercise.beatsPerBar))), fraction: Math.max(0, clock % exercise.beatsPerBar) / exercise.beatsPerBar } : undefined;
  const currentRecommendation = recommendSightSettings(history, settings, source);
  const trendReadings = history.filter(h => h.classification === 'reading' && (historyFilters.level === 'Any' || h.settings.level === historyFilters.level) && (historyFilters.meter === 'Any' || h.settings.meter === historyFilters.meter) && (historyFilters.source === 'Any' || h.source === historyFilters.source) && (historyFilters.tempo === 'Any' || historyFilters.tempo === 'under80' && h.settings.bpm < 80 || historyFilters.tempo === '80to119' && h.settings.bpm >= 80 && h.settings.bpm < 120 || historyFilters.tempo === '120plus' && h.settings.bpm >= 120));
  const practiceReadings = history.filter(h => h.classification !== 'reading');
  const goalAttempts = goal ? matchingSightGoalAttempts(history, goal) : [];
  const styleOptions: SightStyle[] = settings.level === 'Beginner' ? ['varied', 'rock'] : settings.level === 'Intermediate' ? ['varied', 'rock', 'fill'] : settings.meter === '7/8' ? ['varied', 'rock', 'fill'] : ['varied', 'rock', 'shuffle', 'fill'];
  const recommendationAction = currentRecommendation ? currentRecommendation.settings.bpm !== settings.bpm ? 'Use suggested tempo' : currentRecommendation.settings.level !== settings.level ? 'Use suggested level' : 'Use suggested rhythm' : '';
  return <div className={styles.root}>
    {!active && <fieldset disabled={reference}><legend>Exercise setup</legend><div className={styles.controls}>
      <label>Level<select value={settings.level} onChange={e => update({ level: e.target.value as SightSettings['level'] })}>{['Beginner','Intermediate','Advanced'].map(l => <option key={l}>{l}</option>)}</select></label>
      <label>Tempo (quarter-note BPM)<input type="number" min={40} max={200} value={settings.bpm} onChange={e => { setSettings({ ...settings, bpm: Number(e.target.value) }); setExercise(null); attempted.current = false; setHasAttempted(false); }} onBlur={() => update({ bpm: settings.bpm })} /></label>
      <label>Bars<select value={settings.bars} onChange={e => update({ bars: Number(e.target.value) as SightSettings['bars'] })}>{[1,2,4].map(n => <option key={n}>{n}</option>)}</select></label>
      <label>Meter<select value={settings.meter} onChange={e => update({ meter: e.target.value as SightSettings['meter'] })}>{sightMeters(settings.level).map(m => <option key={m}>{m}</option>)}</select></label>
      {settings.level === 'Beginner' && <label><input type="checkbox" checked={settings.snareOnly} onChange={e => update({ snareOnly: e.target.checked })} /> Snare only</label>}
      {settings.level === 'Advanced' && settings.meter !== '7/8' && <label><input type="checkbox" checked={settings.triplets} onChange={e => update({ triplets: e.target.checked })} /> Triplets</label>}
      <label>Rhythm focus<select value={settings.focusRhythm} onChange={e => update({ focusRhythm: e.target.value as SightRhythmFocus })}>{(['mixed','quarters','eighths',...(settings.level === 'Beginner' ? [] : ['sixteenths']),...(settings.level === 'Advanced' && settings.meter !== '7/8' ? ['triplets'] : [])] as SightRhythmFocus[]).map(value => <option key={value} value={value}>{value === 'mixed' ? 'Mixed' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>
      <label>Voice focus<select disabled={settings.snareOnly} value={settings.focusVoice} onChange={e => update({ focusVoice: e.target.value as SightSettings['focusVoice'] })}><option value="mixed">Mixed voices</option>{SIGHT_VOICES.map(voice => <option key={voice} value={voice}>{voice[0].toUpperCase() + voice.slice(1)}</option>)}</select></label>
      <label>Groove and phrase<select value={settings.style} onChange={e => update({ style: e.target.value as SightStyle })}>{styleOptions.map(style => <option key={style} value={style}>{style === 'varied' ? 'Varied reading' : style === 'rock' ? 'Rock backbeat' : style === 'shuffle' ? 'Shuffle feel' : 'Groove with a fill'}</option>)}</select></label>
      <label>Input<select value={source} onChange={e => { setSource(e.target.value as SightInput); }}><option value="keyboard">Keyboard</option><option value="touch">Touch pads</option><option value="midi">MIDI</option></select></label>
      <label><input type="checkbox" checked={tempoLadder} onChange={e => setTempoLadder(e.target.checked)} /> Tempo ladder (+5 BPM after 85% accuracy)</label>
      {source === 'midi' && <><button onClick={connectMidi}>Connect MIDI</button><label>MIDI device<select value={midiId} onChange={e => { setMidiId(e.target.value); selectedMidi.current = e.target.value; if (midi.current) bindMidi(midi.current, e.target.value); }}>{inputs.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label></>}
    </div></fieldset>}
    {active && <p>{settings.level} · {settings.bpm} BPM · {settings.meter} · {settings.bars} bars · {settings.style} · {settings.focusRhythm} · {settings.focusVoice}</p>}
    <p>Ten-second silent preview · one-bar count-in · one pass. Accents are reading cues; scoring checks voice and timing. <Link href="/trainer?setup=1">Input mapping and calibration</Link></p>
    <div className={styles.actions}>{!active && !reference && <><button onClick={start}>{phase === 'results' || hasAttempted ? 'Retry as practice' : 'Start sight reading'}</button><button onClick={fresh}>New exercise</button><button onClick={() => { void shareExercise(); }}>Share assignment</button>{exercise && <button onClick={() => { setShowSetupNotation(true); window.setTimeout(() => window.print(), 120); }}>Print exercise</button>}</>}{active && <button onClick={cancel}>Cancel attempt</button>}{phase === 'results' && <button disabled={reference} onClick={playReference}>Play reference</button>}{reference && <button onClick={() => { stop(); setReference(false); }}>Stop reference</button>}</div>
    {!active && <details><summary>Share or import a student assignment</summary><p>Share creates a link and a short code. Students can open the link or paste the code here.</p><label>Assignment code<input value={assignmentCode} onChange={e => setAssignmentCode(e.target.value)} placeholder="seed.settings-code" /></label><button onClick={importAssignment}>Load shared assignment</button></details>}
    {sharedAssignment && <p className={styles.assignment} role="status">Shared assignment loaded · {exercise?.settings.level} · {exercise?.settings.meter} · {exercise?.settings.bpm} BPM. Preview it before starting.</p>}
    {!active && currentRecommendation && <section className={styles.panel}><h2>Suggested next step</h2><p>{currentRecommendation.reason}</p><button onClick={applyRecommendedSettings}>{recommendationAction}</button></section>}
    <p role="status" aria-live="polite">{phase === 'preview' ? `Silent preview · ${clock} seconds` : phase === 'count-in' ? 'Count-in' : phase === 'playing' ? 'Play the notation' : message || (hasAttempted && phase !== 'results' ? 'This exercise will count as practice.' : 'Ready')}</p>
    {exercise && (phase !== 'setup' || hasAttempted || showSetupNotation) && <div className={styles.printable}><h2>Drum Hero sight-reading exercise</h2><p>{exercise.settings.level} · {exercise.settings.meter} · {exercise.settings.bpm} quarter-note BPM · {exercise.settings.bars} bars · {exercise.settings.style}</p><Notation exercise={exercise} cursor={cursor} /><p>Legend: Kick (Space), Snare (F), Hi-hat (J), Tom (K), Crash (L). Cross noteheads: cymbals. &gt; accent. Rests: silence. {settings.meter === '7/8' ? 'Grouping: 2+2+3 eighths.' : settings.meter === '5/4' ? 'Grouping: 3+2 quarters.' : ''}</p><details><summary>Counted note descriptions</summary><p>{noteText}</p><button disabled={phase === 'playing' || phase === 'count-in'} onClick={() => { assisted.current = true; setClassification('assisted'); if ('speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(noteText)); } else setMessage('Speech is unavailable; read the counted notes.'); }}>Speak notes (assisted attempt)</button></details></div>}
    <div className={styles.pads}>{SIGHT_VOICES.map((voice, index) => <button key={voice} data-reading-pad disabled={phase !== 'playing' || source === 'midi'} onPointerDown={e => { e.preventDefault(); hit(voice, source); }} onClick={e => { if (e.detail === 0) hit(voice, source); }}>{labels[index]}<small>{keys[index].replace('Key','')}</small></button>)}</div>
    {result && <section className={styles.panel}><h2 ref={heading} tabIndex={-1}>Sight-reading results</h2><p><strong>{classification === 'reading' ? 'First reading' : classification === 'assisted' ? 'Assisted attempt' : 'Practice retry'} · {result.summary.accuracy}% accuracy · {result.summary.score} score</strong></p><p>{result.meanOffsetMs === null ? 'No matched hits' : `Average timing: ${Math.abs(result.meanOffsetMs)} ms ${result.meanOffsetMs < 0 ? 'early' : result.meanOffsetMs > 0 ? 'late' : 'on time'}`} · {result.summary.miss} misses · {result.summary.extra} extras</p><div className={styles.scroll}><table><caption>Misses and extras by bar and voice</caption><thead><tr><th>Bar</th><th>Voice</th><th>Misses</th><th>Extras</th></tr></thead><tbody>{exercise && Array.from({ length: exercise.settings.bars }, (_, bar) => SIGHT_VOICES.map(voice => { const rows = result.rated.filter(h => h.instrument === voice && Math.floor((h.step ?? 0) / exercise.stepsPerBar) === bar); return <tr key={`${bar}-${voice}`}><td>{bar + 1}</td><td>{voice}</td><td>{rows.filter(h => h.rating === 'miss').length}</td><td>{rows.filter(h => h.rating === 'extra').length}</td></tr>; }))}</tbody></table></div><details><summary>Review every expected and played note</summary>{exercise && Array.from({ length: exercise.settings.bars }, (_, bar) => <section key={bar}><h3>Bar {bar + 1}</h3><ol className={styles.review}>{result.rated.filter(h => Math.floor((h.step ?? 0) / exercise.stepsPerBar) === bar).sort((a,b) => (a.step ?? 0) - (b.step ?? 0)).map((hit,index) => { const step = hit.step ?? 0; const beat = ((step % exercise.stepsPerBar) * 4 / exercise.subdivision) + 1; const timing = hit.offsetMs === null ? '' : ` · ${Math.abs(hit.offsetMs)} ms ${hit.offsetMs < 0 ? 'early' : hit.offsetMs > 0 ? 'late' : 'on time'}`; return <li className={styles[hit.rating]} key={`${hit.instrument}-${step}-${hit.rating}-${index}`}><strong>{hit.rating === 'miss' ? 'Missed' : hit.rating === 'extra' ? 'Extra' : hit.rating === 'great' ? 'On time' : 'Played'}</strong> · {hit.instrument} · beat {Number.isInteger(beat) ? beat : beat.toFixed(2)}{timing}</li>; })}</ol></section>)}</details>{tempoLadder && <div className={styles.ladder}><p>Tempo ladder: advance after 85% accuracy.</p><button onClick={advanceTempoLadder}>{result.summary.accuracy >= 85 && settings.bpm < 200 ? `Next tempo: ${settings.bpm + 5} BPM` : result.summary.accuracy >= 85 ? 'Ladder complete' : 'Retry before advancing'}</button></div>}</section>}
    <section className={styles.panel}><h2>Practice goal</h2>{goal ? <><p>{goalAttempts.length} of {goal.targetReads} first readings at {goal.accuracy}% or higher · {goal.level}, {goal.focusRhythm} in {goal.meter} at {goal.bpm} BPM</p><progress max={goal.targetReads} value={Math.min(goal.targetReads,goalAttempts.length)} aria-label="Practice goal progress" /><button onClick={() => { setGoal(null); localStorage.removeItem(goalKey); setGoalMessage('Goal removed.'); }}>Remove goal</button></> : <p>Set a target for a rhythm and tempo, then track successful first readings.</p>}<div className={styles.controls}><label>Goal level<select value={goalDraft.level} onChange={e => { const level = e.target.value as SightGoal['level']; setGoalDraft({ ...goalDraft, level, meter: sightMeters(level).includes(goalDraft.meter) ? goalDraft.meter : sightMeters(level)[0] }); }}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Goal meter<select value={goalDraft.meter} onChange={e => setGoalDraft({ ...goalDraft, meter: e.target.value as SightGoal['meter'] })}>{sightMeters(goalDraft.level).map(meter => <option key={meter}>{meter}</option>)}</select></label><label>Goal tempo<input type="number" min={40} max={200} value={goalDraft.bpm} onChange={e => setGoalDraft({ ...goalDraft, bpm: Number(e.target.value) })} /></label><label>Goal rhythm<select value={goalDraft.focusRhythm} onChange={e => setGoalDraft({ ...goalDraft, focusRhythm: e.target.value as SightRhythmFocus })}>{(['mixed','quarters','eighths',...(goalDraft.level === 'Beginner' ? [] : ['sixteenths']),...(goalDraft.level === 'Advanced' && goalDraft.meter !== '7/8' ? ['triplets'] : [])] as SightRhythmFocus[]).map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Accuracy target<input type="number" min={50} max={100} value={goalDraft.accuracy} onChange={e => setGoalDraft({ ...goalDraft, accuracy: Number(e.target.value) })} /></label><label>First readings to complete<input type="number" min={1} max={20} value={goalDraft.targetReads} onChange={e => setGoalDraft({ ...goalDraft, targetReads: Number(e.target.value) })} /></label><button onClick={saveGoal}>{goal ? 'Update goal' : 'Save goal'}</button></div><p role="status">{goalMessage}</p></section>
    <section className={styles.panel}><h2>Progress insights</h2><div className={styles.controls}><label>Level<select value={historyFilters.level} onChange={e => setHistoryFilters({ ...historyFilters, level: e.target.value })}><option>Any</option>{['Beginner','Intermediate','Advanced'].map(level => <option key={level}>{level}</option>)}</select></label><label>Meter<select value={historyFilters.meter} onChange={e => setHistoryFilters({ ...historyFilters, meter: e.target.value })}><option>Any</option>{['4/4','3/4','5/4','7/8'].map(meter => <option key={meter}>{meter}</option>)}</select></label><label>Input<select value={historyFilters.source} onChange={e => setHistoryFilters({ ...historyFilters, source: e.target.value })}><option>Any</option>{['keyboard','touch','midi'].map(input => <option key={input}>{input}</option>)}</select></label><label>Tempo<select value={historyFilters.tempo} onChange={e => setHistoryFilters({ ...historyFilters, tempo: e.target.value })}><option value="Any">Any tempo</option><option value="under80">Under 80</option><option value="80to119">80–119</option><option value="120plus">120+</option></select></label></div><p>{trendReadings.length} first readings · {trendReadings.length ? `${Math.round(trendReadings.reduce((sum,h) => sum+h.accuracy,0)/trendReadings.length)}% average accuracy` : 'Complete a first reading to start a trend.'} · {practiceReadings.length} practice/assisted attempts shown separately.</p>{trendReadings.length > 0 && <><div className={styles.chart} role="img" aria-label={`Recent first-reading accuracy: ${trendReadings.slice(-10).map(row => row.accuracy).join(', ')} percent`}><div>{trendReadings.slice(-10).map((row,index) => <span key={`${row.id}-${index}`} style={{ height: `${Math.max(6,row.accuracy)}%` }} title={`${row.accuracy}% · ${row.settings.bpm} BPM`} />)}</div></div><p className={styles.chartCaption}>Most recent {Math.min(10,trendReadings.length)} first readings, oldest to newest.</p></>}<details><summary>First-reading history ({trendReadings.length})</summary><ol>{[...trendReadings].reverse().map(row => <li key={row.id}>{new Date(row.playedAt).toLocaleDateString()} · {row.settings.level} · {row.settings.meter} · {row.settings.bpm} BPM · {row.source} · {row.accuracy}% · {row.meanOffsetMs === null ? 'no timing match' : `${Math.abs(row.meanOffsetMs)} ms ${row.meanOffsetMs < 0 ? 'early' : row.meanOffsetMs > 0 ? 'late' : 'on time'}`}</li>)}</ol></details><details><summary>Practice and assisted attempts ({practiceReadings.length})</summary><ol>{[...practiceReadings].reverse().map(row => <li key={row.id}>{new Date(row.playedAt).toLocaleDateString()} · {row.settings.level} · {row.settings.meter} · {row.settings.bpm} BPM · {row.source} · {row.classification} · {row.accuracy}%</li>)}</ol></details></section>
  </div>;
}
