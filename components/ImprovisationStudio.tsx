"use client";

import Link from 'next/link';
import { CHALLENGE_LABELS, adaptDrummerSettings, challengeInstruction, improvisationSoundInstrument, suggestImprovisationPractice, virtualDrummerResponse } from '@/lib/improvisation';
import { ImprovisationAssignments } from './ImprovisationAssignments';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createDrumAudio, type DrumAudio } from '@/lib/audio';
import { createPracticeBass, type PracticeBass } from '@/lib/practice-accompaniment';
import { DEFAULT_IMPROVISATION_SETTINGS, IMPROVISATION_KEY, IMPROVISATION_METERS, IMPROVISATION_PROMPTS, IMPROVISATION_STYLES, IMPROVISATION_WORKSPACE_KEY, IMPROVISATION_TAKES_KEY, IMPROVISATION_PATH, PROMPT_LABELS, ImprovisationTransport, improvisationAudioEvents, normalizeImprovisationSettings, parseImprovisationHistory, parseImprovisationTakes, parseImprovisationWorkspace, summarizeImprovisation, phraseDuration, playerPhraseStart, completedPlayerPhrases, promptForPhrase, repeatPhraseSettings, learningStepSettings, demonstrationPhrase, barCountIn, meterParts, stepDuration, type ImprovisationHit, type ImprovisationInput, type ImprovisationPosition, type ImprovisationSettings, type ImprovisationSummary, type ImprovisationPrompt, type ImprovisationTake, type ImprovisationWorkspace } from '@/lib/improvisation';
import { learnerStorageKey } from '@/lib/learner-profiles';
import { getTrainerDeviceProfile, midiNoteFromMessage, midiVelocityFromMessage, parseTrainerState, trainerStorageKey } from '@/lib/trainer';
import type { Instrument, MidiArticulation } from '@/lib/types';
import { useProgress } from './ProgressProvider';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';
import { ImprovisationLearning } from './ImprovisationLearning';
import { ImprovisationReplay } from './ImprovisationReplay';
import { ImprovisationRecap } from './ImprovisationRecap';
import { ImprovisationLibrary } from './ImprovisationLibrary';
import { ImprovisationNotation } from './ImprovisationNotation';
import { ImprovisationPhrasePreview } from './ImprovisationPhrasePreview';
import { createImprovisationResponsePack } from '@/lib/improvisation-response-pack';


const pads: Array<{ instrument: Instrument; label: string; code: string; key: string }> = [
  { instrument: 'kick', label: 'Kick', code: 'Space', key: 'Space' }, { instrument: 'snare', label: 'Snare', code: 'KeyF', key: 'F' }, { instrument: 'hihat', label: 'Hi-hat', code: 'KeyJ', key: 'J' }, { instrument: 'tom', label: 'Tom', code: 'KeyK', key: 'K' }, { instrument: 'crash', label: 'Crash', code: 'KeyL', key: 'L' }
];
type CalibrationRun = { targets: number[]; used: Set<number>; offsets: number[]; source: ImprovisationInput; deviceId?: string };
const idlePosition: ImprovisationPosition = { phase: 'idle', elapsedMs: 0, phrase: 0, bar: 1, beat: 1, prompt: 'free', warning: false, activePlayer: null };

export function ImprovisationStudio() {
  const { profileId, hydrated } = useProgress();
  const { t } = useLocalization();
  return hydrated ? <ImprovisationSession key={profileId} profileId={profileId} /> : <p role="status">{t('Loading improvisation…')}</p>;
}

function ImprovisationSession({ profileId }: { profileId: string }) {
  const { t, formatNumber, locale } = useLocalization();
  const [settings, setSettings] = useState<ImprovisationSettings>(DEFAULT_IMPROVISATION_SETTINGS);
  const [focused, setFocused] = useState(false), [checking, setChecking] = useState(false), [checkLoading, setCheckLoading] = useState(false);
  const [checkHit, setCheckHit] = useState<{ instrument: Instrument; velocity?: number; latency: number; articulation?: MidiArticulation } | null>(null);
  const [calibration, setCalibration] = useState<{ active: boolean; count: number; result?: string } | null>(null);
  const [assignment, setAssignment] = useState<{ id: string; stepId: string } | null>(null);
  const roundAssignment = useRef<{ id: string; stepId: string } | null>(null);
  const [input, setInput] = useState<ImprovisationInput>('keyboard');
  const [position, setPosition] = useState(idlePosition);
  const [message, setMessage] = useState('');
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDevice, setSelectedDevice] = useState(''), [selectedDuetDevice, setSelectedDuetDevice] = useState('');
  const [history, setHistory] = useState<ImprovisationSummary[]>([]);
  const [result, setResult] = useState<ImprovisationSummary | null>(null);
  const [hitCount, setHitCount] = useState(0);
  const [liveHits, setLiveHits] = useState<ImprovisationHit[]>([]);
  const [adaptiveDisplay, setAdaptiveDisplay] = useState<{ phrase: number; settings: ImprovisationSettings; direction: 'steady' | 'simpler' | 'more-challenging' }>({ phrase: -1, settings: DEFAULT_IMPROVISATION_SETTINGS, direction: 'steady' });
  const [workspace, setWorkspace] = useState<ImprovisationWorkspace>({ presets: [], completedSteps: [] });
  const [takes, setTakes] = useState<ImprovisationTake[]>([]);
  const [reviewTake, setReviewTake] = useState<(ImprovisationTake & { demo?: boolean }) | null>(null);
  const [pathStep, setPathStep] = useState<number | null>(null), [finishedStep, setFinishedStep] = useState<number | null>(null);
  const pathRound = useRef<number | null>(null), inputContexts = useRef(new Set<string>());
  const adaptiveSettingsRef = useRef<ImprovisationSettings>(DEFAULT_IMPROVISATION_SETTINGS);
  const adaptivePhraseRef = useRef(-1);
  const drummerSettingsRef = useRef<ImprovisationSettings[]>([]);
  const spoken = useRef('');
  const transport = useRef<ImprovisationTransport | null>(null);
  const hits = useRef<ImprovisationHit[]>([]);
  const unscoredUsed = useRef(false);
  const calibrationRun = useRef<CalibrationRun | null>(null), calibrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<DrumAudio | null>(null), bass = useRef<PracticeBass | null>(null);
  const scheduled = useRef(new Set<string>());
  const midi = useRef<MIDIAccess | null>(null);
  const midiGeneration = useRef(0), generation = useRef(0);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const historyRef = useRef<ImprovisationSummary[]>([]);
  const storageKey = learnerStorageKey(IMPROVISATION_KEY, profileId);
  const active = ['loading', 'count-in', 'partner', 'player', 'paused'].includes(position.phase);
  const running = ['count-in', 'partner', 'player'].includes(position.phase);

  useEffect(() => { if (!focused) return; const exit = (event: KeyboardEvent) => { if (event.key === 'Escape') setFocused(false); }; window.addEventListener('keydown', exit); return () => window.removeEventListener('keydown', exit); }, [focused]);

  const silence = useCallback(() => { if (typeof window !== 'undefined') window.speechSynthesis?.cancel(); spoken.current = ''; audio.current?.silence(); bass.current?.silence(); scheduled.current.clear(); }, []);
  const closeAudio = useCallback(() => { silence(); audio.current?.close(); audio.current = null; void bass.current?.close(); bass.current = null; }, [silence]);
  const cancelCalibration = useCallback((notice?: string) => {
    if (calibrationTimer.current) clearTimeout(calibrationTimer.current);
    calibrationTimer.current = null; calibrationRun.current = null; setCalibration(null); closeAudio();
    if (notice) setMessage(notice);
  }, [closeAudio]);
  const completeCalibration = useCallback(() => {
    if (calibrationTimer.current) clearTimeout(calibrationTimer.current);
    calibrationTimer.current = null;
    const run = calibrationRun.current; calibrationRun.current = null;
    if (!run) return;
    closeAudio();
    if (run.offsets.length < 4) {
      setCalibration({ active: false, count: run.offsets.length, result: t('Calibration needs at least four clear taps. No timing setting was changed.') });
      setMessage(t('Calibration needs at least four clear taps. Try again in a quiet moment.'));
      return;
    }
    const values = [...run.offsets].sort((a, b) => a - b), middle = Math.floor(values.length / 2);
    const median = Math.round(values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2);
    const spread = Math.round(values[values.length - 1] - values[0]);
    const profileKey = run.source === 'midi' ? `midi:${run.deviceId ?? ''}` : run.source;
    try {
      const saved = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))), profile = getTrainerDeviceProfile(saved, profileKey);
      const deviceProfile = { ...profile, latencyMs: Math.max(-200, Math.min(200, median)), latencyCalibrated: true, latencySpreadMs: Math.min(240, spread), latencyCalibratedAt: new Date().toISOString() };
      localStorage.setItem(trainerStorageKey(profileId), JSON.stringify({ ...saved, version: 2, deviceProfiles: { ...saved.deviceProfiles, [profileKey]: deviceProfile } }));
      const resultText = t('Timing correction saved: {offset} ms · spread {spread} ms · {count} taps.', { offset: median, spread, count: run.offsets.length });
      setCalibration({ active: false, count: run.offsets.length, result: resultText }); setMessage(resultText);
    } catch {
      setCalibration({ active: false, count: run.offsets.length, result: t('Could not save the calibration. Your previous timing setting is unchanged.') });
      setMessage(t('Could not save the calibration. Your previous timing setting is unchanged.'));
    }
  }, [closeAudio, profileId, t]);
  const disconnectMidi = useCallback(() => {
    midiGeneration.current++;
    if (midi.current) { midi.current.onstatechange = null; midi.current.inputs.forEach(device => { device.onmidimessage = null; }); }
    midi.current = null;
  }, []);
  const persist = useCallback((next: ImprovisationSummary[]) => {
    historyRef.current = next; setHistory(next);
    try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, sessions: next })); }
    catch { setMessage(t('This history could not be saved. You can keep practicing.')); }
  }, [storageKey, t]);
  const workspaceKey = learnerStorageKey(IMPROVISATION_WORKSPACE_KEY, profileId), takesKey = learnerStorageKey(IMPROVISATION_TAKES_KEY, profileId);
  const persistWorkspace = (next: ImprovisationWorkspace) => {
    setWorkspace(next);
    try { localStorage.setItem(workspaceKey, JSON.stringify({ version: 1, ...next })); }
    catch { setMessage(t('This setup could not be saved. You can keep practicing.')); }
  };
  const persistTakes = (next: ImprovisationTake[]) => {
    setTakes(next);
    try { localStorage.setItem(takesKey, JSON.stringify({ version: 1, takes: next })); }
    catch { setMessage(t('This take could not be saved. Download a full backup after freeing space.')); }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      try { const saved = parseImprovisationHistory(localStorage.getItem(storageKey)); historyRef.current = saved; setHistory(saved); setWorkspace(parseImprovisationWorkspace(localStorage.getItem(workspaceKey))); setTakes(parseImprovisationTakes(localStorage.getItem(takesKey))); }
      catch { setMessage(t('Local history is unavailable. You can still practice.')); }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey, workspaceKey, takesKey, t]);

  const pause = useCallback(() => {
    const clock = transport.current;
    if (!clock) return;
    const now = performance.now(); clock.pause(now); silence(); setPosition(clock.position(now));
  }, [silence]);
  const pauseCurrent = useEffectEvent(pause);
  useEffect(() => {
    const generationRef = generation;
    const hidden = () => {
      if (!document.hidden) return;
      generation.current++; setChecking(false); setCheckLoading(false);
      if (calibrationRun.current) cancelCalibration(t('Timing calibration paused because the page was hidden.'));
      if (transport.current) pauseCurrent();
      else { closeAudio(); setPosition(current => current.phase === 'loading' ? { ...current, phase: 'stopped' } : current); }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => { generationRef.current++; document.removeEventListener('visibilitychange', hidden); if (calibrationTimer.current) clearTimeout(calibrationTimer.current); calibrationRun.current = null; closeAudio(); disconnectMidi(); };
  }, [closeAudio, disconnectMidi, cancelCalibration, t]);
  const resultId = result?.id;
  useEffect(() => { if (resultId) resultHeading.current?.focus(); }, [resultId]);

  const receiveHit = useCallback((instrument: Instrument, source: ImprovisationInput, deviceId?: string, velocity?: number, timestamp = performance.now(), articulation?: MidiArticulation) => {
    const clock = transport.current;
    if (source !== input || (!clock && !checking && !calibrationRun.current)) return;
    let latency = 0, map = ''; 
    try {
      const saved = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId)));
      const profile = getTrainerDeviceProfile(saved, source === 'midi' ? `midi:${deviceId}` : source); latency = profile.latencyMs; map = source === 'midi' ? JSON.stringify([profile.midiMap, profile.midiArticulations]) : '';
    } catch { /* Unavailable storage uses an uncorrected timestamp. */ }
    if (source === 'midi') {
      const duet = clock?.settings.mode === 'duet' || (!clock && settings.mode === 'duet');
      const activePlayer = clock?.position(timestamp - latency).activePlayer;
      const ownsDevice = checking && duet ? [selectedDevice, selectedDuetDevice].includes(deviceId ?? '') : deviceId === (duet && activePlayer === 2 ? selectedDuetDevice : selectedDevice);
      if (!ownsDevice) return;
    }
    const calibrating = calibrationRun.current;
    if (calibrating) {
      if (calibrating.source !== source || (source === 'midi' && calibrating.deviceId !== deviceId)) return;
      let best = -1, distance = Infinity;
      calibrating.targets.forEach((target, index) => {
        const delta = Math.abs(timestamp - target);
        if (!calibrating.used.has(index) && delta < distance) { best = index; distance = delta; }
      });
      if (best >= 0 && distance <= 60000 / settings.bpm * 0.45) {
        calibrating.used.add(best); calibrating.offsets.push(Math.round(timestamp - calibrating.targets[best]));
        setCalibration({ active: true, count: calibrating.offsets.length });
        if (calibrating.offsets.length >= calibrating.targets.length) completeCalibration();
      }
      return;
    }
    if (checking) { setCheckHit({ instrument, velocity, latency, articulation }); audio.current?.hit(improvisationSoundInstrument({ instrument, articulation }), false, velocity); return; }
    if (!clock) return;
    const captured = clock.capture(instrument, timestamp, latency, velocity);
    if (!captured) return;
    if (hits.current.length >= 100000) { clock.pause(performance.now()); silence(); setPosition(clock.position(performance.now())); setMessage(t('This session reached its capture limit. Finish the completed phrases before starting another session.')); return; }
    inputContexts.current.add(contextFingerprint(source, deviceId ?? '', latency, map));
    const recorded = articulation ? { ...captured, articulation } : captured;
    hits.current.push(recorded); setHitCount(hits.current.length); setLiveHits(previous => [...previous, recorded].slice(-384));
    audio.current?.hit(improvisationSoundInstrument(recorded), false, velocity);
      }, [input, selectedDevice, selectedDuetDevice, profileId, silence, t, checking, settings.mode, settings.bpm, completeCalibration]);
  const receiveHitRef = useRef(receiveHit);
  useEffect(() => { receiveHitRef.current = receiveHit; }, [receiveHit]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, select, textarea, [contenteditable], a, summary') || (target?.closest('button') && !target.closest('[data-improvisation-pad]'))) return;
      const pad = pads.find(pad => pad.code === event.code);
      if (pad && (checking || Boolean(calibrationRun.current) || transport.current?.position(performance.now()).phase === 'player')) { if (input === 'keyboard') event.preventDefault(); receiveHit(pad.instrument, 'keyboard'); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [input, receiveHit, checking]);

  const warnUnmapped = useRef<(id: string, note: number) => void>(() => {});
  useEffect(() => { warnUnmapped.current = (id, note) => { if (input === 'midi' && (id === selectedDevice || (settings.mode === 'duet' && id === selectedDuetDevice))) setMessage(t('MIDI note {note} has no saved mapping. Map it in Trainer before practicing.', { note })); }; }, [input, selectedDevice, selectedDuetDevice, settings.mode, t]);

  const connectMidi = async () => {
    if (!navigator.requestMIDIAccess) { setMessage(t('Web MIDI is unavailable. Choose keyboard, touch, or unscored practice.')); return; }
    disconnectMidi(); const token = midiGeneration.current;
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      if (token !== midiGeneration.current) return;
      midi.current = access;
      const bind = (initial = false) => {
        const connected = [...access.inputs.values()].filter(device => device.state === 'connected');
        setDevices(connected.map(device => ({ id: device.id, name: device.name || t('MIDI input') })));
        setSelectedDevice(current => connected.some(device => device.id === current) ? current : initial ? connected[0]?.id ?? '' : '');
        setSelectedDuetDevice(current => connected.some(device => device.id === current) ? current : initial ? connected[1]?.id ?? connected[0]?.id ?? '' : '');
        access.inputs.forEach(device => {
          device.onmidimessage = device.state !== 'connected' ? null : event => {
            if (!event.data) return;
            const note = midiNoteFromMessage(event.data); if (note === null) return;
            let instrument: Instrument | null = null, articulation: MidiArticulation | null = null;
            try { const profile = getTrainerDeviceProfile(parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))), `midi:${device.id}`); instrument = profile.midiMap[note] ?? null; articulation = profile.midiArticulations[note] ?? null; } catch { return; }
            if (!instrument) warnUnmapped.current(device.id, note);
            if (instrument) receiveHitRef.current(instrument, 'midi', device.id, midiVelocityFromMessage(event.data) ?? undefined, event.timeStamp || performance.now(), articulation ?? undefined);
          };
        });
      };
      bind(true);
      access.onstatechange = event => {
        const port = event.port;
        if (port?.type === 'input' && port.state === 'disconnected') midiDisconnectedRef.current(port.id);
        bind();
      };
      setMessage(t('MIDI connected. Saved Trainer mappings and timing corrections are used.'));
    } catch { setMessage(t('MIDI connection failed. Reconnect or choose another input.')); }
  };
  const midiDisconnected = useCallback((id: string) => {
    if (input === 'midi' && (id === selectedDevice || (settings.mode === 'duet' && id === selectedDuetDevice))) {
      if (calibrationRun.current?.deviceId === id) cancelCalibration(t('MIDI disconnected during calibration. No timing setting was changed.'));
      if (!transport.current) { generation.current++; setChecking(false); setCheckLoading(false); closeAudio(); setPosition({ ...idlePosition, phase: 'stopped' }); }
      else pause();
      setMessage(t('Your MIDI input disconnected. Reconnect, or choose another input while paused.')); }
  }, [input, selectedDevice, selectedDuetDevice, settings.mode, pause, closeAudio, cancelCalibration, t]);
  const midiDisconnectedRef = useRef(midiDisconnected);
  useEffect(() => { midiDisconnectedRef.current = midiDisconnected; }, [midiDisconnected]);

  const stop = () => {
    if (calibrationRun.current || calibration?.active) cancelCalibration();
    generation.current++; setChecking(false); setCheckLoading(false); setFocused(false);
    const now = performance.now(); transport.current?.stop(now); closeAudio(); hits.current = []; setLiveHits([]);
    setPosition(transport.current?.position(now) ?? { ...idlePosition, phase: 'stopped' });
    setMessage(t('Stopped. Incomplete sessions are not saved.'));
  };
  const start = async (override?: ImprovisationSettings) => {
    if (calibrationRun.current || calibration?.active) { setMessage(t('Finish or stop input calibration before starting.')); return; }
    const requested = normalizeImprovisationSettings(override ?? settings);
    if (input === 'midi' && [selectedDevice, ...(requested.mode === 'duet' ? [selectedDuetDevice] : [])].some(id => !devices.some(device => device.id === id))) { setMessage(t('Connect and select MIDI inputs for each active player before starting.')); return; }
    if (requested.challenge !== 'none' && requested.mode !== 'trading') { setMessage(t('Call-and-response challenges use trading mode. Choose trading or open improvisation.')); return; }
    if (requested.challenge !== 'none' && requested.prompt !== 'free') { setMessage(t('Choose Free exploration for a call-and-response challenge so its targets stay consistent.')); return; }
    if ((requested.prompt === 'two-voices' || (requested.mode === 'guided' && requested.cyclePrompts && ['free', 'backbeat', 'two-voices', 'space'].includes(requested.prompt))) && !['kick', 'snare', 'none'].includes(requested.entry)) { setMessage(t('Choose kick, snare, or no required entry for the kick/snare-only prompt.')); return; }
    setChecking(false); setCheckLoading(false);
    roundAssignment.current = !override && assignment && workspace.assignments?.some(a => a.id === assignment.id && a.steps.some(step => step.id === assignment.stepId && JSON.stringify(normalizeImprovisationSettings(step.settings)) === JSON.stringify(requested))) ? assignment : null;
    generation.current++; const token = generation.current;
    adaptiveSettingsRef.current = requested;
    adaptivePhraseRef.current = -1;
    drummerSettingsRef.current = [];
    closeAudio(); transport.current = null; hits.current = []; setLiveHits([]); setHitCount(0); setAdaptiveDisplay({ phrase: -1, settings: requested, direction: 'steady' }); setResult(null); setReviewTake(null); setFinishedStep(null); setMessage(''); pathRound.current = !override && pathStep !== null && requested.prompt === learningStepSettings(pathStep).prompt && requested.response === learningStepSettings(pathStep).response && requested.bars === learningStepSettings(pathStep).bars ? pathStep : null; inputContexts.current.clear();
    setPosition({ ...idlePosition, phase: 'loading' });
    const config = requested; setSettings(config); if (config.audibleCues && !window.speechSynthesis) setMessage(t('Spoken cues are unavailable in this browser. Follow the visual handoff cues.')); unscoredUsed.current = input === 'unscored';
    try {
      const profile = getTrainerDeviceProfile(parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))), input === 'midi' ? `midi:${selectedDevice}` : input);
      inputContexts.current.add(contextFingerprint(input, input === 'midi' ? selectedDevice : '', profile.latencyMs, input === 'midi' ? JSON.stringify([profile.midiMap, profile.midiArticulations]) : ''));
      if (input === 'midi' && requested.mode === 'duet' && selectedDuetDevice && selectedDuetDevice !== selectedDevice) {
        const second = getTrainerDeviceProfile(parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))), `midi:${selectedDuetDevice}`);
        inputContexts.current.add(contextFingerprint(input, selectedDuetDevice, second.latencyMs, JSON.stringify([second.midiMap, second.midiArticulations])));
      }
    } catch { inputContexts.current.add(contextFingerprint(input, '', 0, '')); }
    try {
      audio.current = createDrumAudio(undefined, undefined, pause);
      if (!audio.current) throw new Error('Audio unavailable');
      audio.current.setClickSound('woodblock'); audio.current.setClickLevel(config.clickLevel);
      if (config.bass) { bass.current = createPracticeBass(); bass.current?.setLevel(config.bassLevel); await bass.current?.resume(); }
      const ready = await audio.current.ready;
      if (token !== generation.current) return;
      if (!ready) throw new Error('Samples unavailable');
      const clock = new ImprovisationTransport(config); clock.start(performance.now() + 50); transport.current = clock;
      setPosition(clock.position(performance.now()));
    } catch {
      if (token !== generation.current) return;
      closeAudio(); setPosition({ ...idlePosition, phase: 'stopped' }); setMessage(t('Drum sounds could not load. Check your audio connection and try again.'));
    }
  };
  const resume = () => {
    if (input === 'midi' && [selectedDevice, ...(settings.mode === 'duet' ? [selectedDuetDevice] : [])].some(id => !devices.some(device => device.id === id))) { setMessage(t('Reconnect MIDI or choose another input before resuming.')); return; }
    silence(); audio.current?.setClickLevel(settings.clickLevel); const now = performance.now() + 50; transport.current?.resume(now); setPosition(transport.current?.position(now) ?? idlePosition); setMessage('');
  };
  const finish = useCallback(() => {
    const clock = transport.current; if (!clock) return;
    const elapsed = clock.position(performance.now()).elapsedMs;
    const count = completedPlayerPhrases(clock.settings, elapsed);
    if (!count) { setMessage(t('Complete one player phrase before finishing.')); return; }
    const sessionInput = unscoredUsed.current ? 'unscored' : input;
    const summary: ImprovisationSummary = { version: 1, engineVersion: 2, id: crypto.randomUUID(), playedAt: new Date().toISOString(), settings: clock.settings, input: sessionInput, inputContext: [...inputContexts.current].sort().join('|'), phrases: summarizeImprovisation(clock.settings, hits.current, sessionInput, count), ...(roundAssignment.current ? { assignment: roundAssignment.current } : {}) };
    const end = playerPhraseStart(clock.settings, count - 1) + phraseDuration(clock.settings);
    if (sessionInput !== 'unscored') setReviewTake({ id: summary.id, name: t('Improvisation take'), createdAt: summary.playedAt, settings: clock.settings, phrases: count, hits: hits.current.filter(hit => hit.atMs < end), ...(clock.settings.mode === 'trading' ? { drummerSettings: drummerSettingsRef.current.slice(0, count) } : {}) });
    hits.current = []; setLiveHits([]); closeAudio(); transport.current = null; setFocused(false);
    persist([...historyRef.current, summary].slice(-50)); setResult(summary); setFinishedStep(pathRound.current);
    setPosition({ ...clock.position(performance.now()), phase: 'complete', phrase: count - 1, prompt: promptForPhrase(clock.settings, count - 1), bar: clock.settings.bars, beat: barCountIn(clock.settings) });
  }, [input, closeAudio, persist, t]);
  const finishCurrent = useEffectEvent(finish);

  useEffect(() => {
    if (!running) return;
    const clock = transport.current; if (!clock) return;
    const { stepsPerPulse } = meterParts(clock.settings), pulseMs = stepDuration(clock.settings) * stepsPerPulse;
    let chunk = -1, events: ReturnType<typeof improvisationAudioEvents> = [];
    const tick = () => {
      const now = performance.now(), next = clock.position(now);
      if (next.phase === 'complete') { finishCurrent(); return; }
      if (next.phrase >= 1000) { clock.pause(now); silence(); setPosition(clock.position(now)); setMessage(t('Finish these completed phrases before starting another session.')); return; }
      if (chunk !== next.phrase) {
        chunk = next.phrase;
        const drummerSettingsForPhrase = (phrase: number) => {
          let adapted: ReturnType<typeof adaptDrummerSettings> = { settings: adaptiveSettingsRef.current, direction: 'steady' };
          if (phrase === next.phrase && adaptivePhraseRef.current !== phrase) {
            if (clock.settings.adaptiveDrummer && input !== 'unscored' && !unscoredUsed.current && phrase >= 2) {
              adapted = adaptDrummerSettings(adaptiveSettingsRef.current, summarizeImprovisation(clock.settings, hits.current, input, phrase).slice(-2));
              adaptiveSettingsRef.current = adapted.settings;
            }
            adaptivePhraseRef.current = phrase;
            if (clock.settings.mode === 'trading') drummerSettingsRef.current[phrase] = adapted.settings;
            setAdaptiveDisplay({ phrase, ...adapted });
          }
          return adapted.settings;
        };
        const drummerPhraseForPhrase = (phrase: number, phraseSettings: ImprovisationSettings) => {
          const previousStart = phrase > 0 ? playerPhraseStart(clock.settings, phrase - 1) : -1;
          const previousHits = phrase > 0 ? hits.current.filter(hit => hit.atMs >= previousStart && hit.atMs < previousStart + phraseDuration(clock.settings)).map(hit => ({ ...hit, atMs: hit.atMs - previousStart })) : [];
          return virtualDrummerResponse(phrase, phraseSettings, previousHits);
        };
        events = improvisationAudioEvents(clock.settings, chunk, 2, drummerSettingsForPhrase, drummerPhraseForPhrase);
      }
      setPosition(previous => previous.phase === next.phase && previous.phrase === next.phrase && previous.bar === next.bar && previous.beat === next.beat && previous.warning === next.warning ? previous : next);
      const cue = `${next.phase}:${next.phrase}:${next.warning}`;
      if (clock.settings.audibleCues && spoken.current !== cue && ['partner', 'player'].includes(next.phase)) {
        spoken.current = cue;
        const text = next.warning ? next.phase === 'partner' ? t('Your turn in one bar') : t('Last bar') : next.phase === 'player' ? t('Your turn') : t('Virtual drummer');
        if (window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = locale; utterance.rate = 1.1; window.speechSynthesis.speak(utterance); }
      }
      const end = now + 120;
      for (let beat = 0; beat < barCountIn(clock.settings); beat++) {
        const at = clock.countStart + beat * pulseMs, key = `count:${beat}`;
        if (at >= now - 25 && at <= end && !scheduled.current.has(key)) { scheduled.current.add(key); audio.current?.scheduleClick(at, beat === 0); }
      }
      events.forEach(event => {
        const at = clock.epoch + event.atMs, key = `event:${event.atMs}:${event.kind}:${event.instrument ?? ''}`;
        if (at < clock.gate || at < now - 25 || at > end || scheduled.current.has(key)) return;
        scheduled.current.add(key);
        if (event.kind === 'click') { audio.current?.setClickLevel(clock.settings.clickLevel * (event.level ?? 1)); audio.current?.scheduleClick(at, event.accent); }
        else if (event.kind === 'bass') bass.current?.schedule(event.bassPart!, at, event.frequency);
        else if (event.kind === 'chord') bass.current?.scheduleChord(event.frequencies ?? [], at);
        else audio.current?.scheduleHit(event.instrument!, at, false, event.velocity);
      });
    };
    tick(); const timer = window.setInterval(tick, 20);
    return () => clearInterval(timer);
  }, [running, locale, silence, t, input]);

  const change = (update: Partial<ImprovisationSettings>) => setSettings(current => normalizeImprovisationSettings({ ...current, ...update }));
  const stage = position.phase === 'partner' ? t('Virtual drummer') : position.phase === 'player' && settings.mode === 'duet' ? t('{name} turn', { name: position.activePlayer === 1 ? settings.playerOneName : settings.playerTwoName }) : position.phase === 'player' ? t('Your turn') : position.phase === 'count-in' ? t('Count-in') : position.phase === 'paused' ? t('Paused') : position.phase === 'complete' ? t('Session complete') : position.phase === 'loading' ? t('Loading drum sounds…') : t('Ready to improvise');
  const lastPhrase = !settings.openEnded && position.phrase + 1 === settings.phrases;
  const nextLabel = position.phase === 'player' && lastPhrase ? t('Session ends in one bar') : settings.mode === 'guided' ? t('Next prompt in one bar: {prompt}', { prompt: t(PROMPT_LABELS[promptForPhrase(settings, position.phrase + 1)]) }) : settings.mode === 'duet' ? t('Next player in one bar: {name}', { name: position.activePlayer === 1 ? settings.playerTwoName : settings.playerOneName }) : position.phase === 'partner' ? t('Your turn in one bar') : t('Virtual drummer returns in one bar');
  const updateResult = (updated: ImprovisationSummary) => {
    if (result?.id === updated.id) setResult(updated);
    persist(historyRef.current.map(item => item.id === updated.id ? updated : item));
  };
  const exportResponsePack = () => {
    if (!result || !reviewTake || !reviewTake.hits.length) return;
    try {
      const savedAssignment = result.assignment && workspace.assignments?.find(item => item.id === result.assignment?.id);
      const assignment = savedAssignment ?? (!result.settings.openEnded ? { id: result.assignment?.id ?? crypto.randomUUID(), name: t('Improvisation response'), steps: [{ id: result.assignment?.stepId ?? crypto.randomUUID(), name: t('Session setup'), settings: result.settings }] } : undefined);
      const contents = createImprovisationResponsePack(result, reviewTake, assignment);
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' })), link = document.createElement('a');
      link.href = url; link.download = `${result.settings.playerOneName.trim().replace(/[^a-z0-9-_]+/gi, '-') || 'improvisation'}-response.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(t('Response pack exported. Review its contents before sharing.'));
    } catch (error) { setMessage(t(error instanceof Error ? error.message : 'Could not export this response pack.')); }
  };
  const loadSetup = (next: ImprovisationSettings) => { cancelCalibration(); setAssignment(null); generation.current++; setChecking(false); setCheckLoading(false); closeAudio(); setSettings(normalizeImprovisationSettings(next)); setPosition(idlePosition); setPathStep(null); setFinishedStep(null); setMessage(t('Setup loaded. Start when you are ready.')); };
  const selectStep = (step: number | null) => { setReviewTake(null); setPathStep(step); setFinishedStep(null); if (step !== null) setSettings(learningStepSettings(step)); };
  const demo = () => {
    const config = { ...settings, mode: 'guided' as const, openEnded: false, phrases: 1 as const };
    setReviewTake({ id: 'demo', demo: true, name: t('Lesson example'), createdAt: new Date().toISOString(), settings: config, phrases: 1, hits: demonstrationPhrase(config).map(hit => ({ instrument: hit.instrument, atMs: hit.step * 60000 / config.bpm / 4, velocity: hit.velocityTarget })) });
  };
  const nextStep = () => {
    if (pathStep === null) return;
    persistWorkspace({ ...workspace, completedSteps: [...new Set([...workspace.completedSteps, IMPROVISATION_PATH[pathStep].id])] });
    if (pathStep === IMPROVISATION_PATH.length - 1) { setPathStep(null); setMessage(t('Learning path complete. Explore your own musical ideas.')); }
    else selectStep(pathStep + 1);
  };


  const suggestion = suggestImprovisationPractice(history);
  const { stepsPerBar } = meterParts(settings);
  const grooveSteps = stepsPerBar * settings.customGroove.bars;
  const adaptation = adaptiveDisplay.phrase === position.phrase ? adaptiveDisplay : { settings, direction: 'steady' as const };
  const adaptationLabel = adaptation.direction === 'simpler' ? 'The drummer simplified its phrase after your recent turns.' : adaptation.direction === 'more-challenging' ? 'The drummer added complexity after your recent turns.' : 'The drummer is holding its current difficulty until there is enough evidence.';
  const grooveVoices: Array<{ instrument: 'kick' | 'snare' | 'hihat'; label: string }> = [{ instrument: 'kick', label: 'Kick' }, { instrument: 'snare', label: 'Snare' }, { instrument: 'hihat', label: 'Hi-hat' }];
  const toggleGrooveStep = (instrument: 'kick' | 'snare' | 'hihat', step: number) => change({ customGroove: { ...settings.customGroove, [instrument]: settings.customGroove[instrument].includes(step) ? settings.customGroove[instrument].filter(value => value !== step) : [...settings.customGroove[instrument], step].sort((a, b) => a - b) } });
  const soundCheck = async () => {
    generation.current++; const token = generation.current; closeAudio(); transport.current = null; setCheckHit(null); setChecking(false); setCheckLoading(true); setMessage(t('Loading sound check…'));
    try { const player = createDrumAudio(undefined, undefined, () => { generation.current++; setChecking(false); setCheckLoading(false); closeAudio(); setMessage(t('Sound check interrupted. Start it again when ready.')); }); audio.current = player;
      if (!player || !await player.ready) throw new Error('Audio unavailable');
      if (generation.current !== token) return;
      setCheckLoading(false); setChecking(true); setMessage(t('Sound check ready. Test each pad or play your selected input. Timing is not scored.'));
    } catch { if (generation.current === token) { closeAudio(); setChecking(false); setCheckLoading(false); setMessage(t('Sound check could not load. Try again.')); } }
  };
  const calibrateInput = async () => {
    if (input === 'unscored') return;
    const deviceId = input === 'midi' ? selectedDevice : undefined;
    if (input === 'midi' && !devices.some(device => device.id === deviceId)) { setMessage(t('Connect and select a MIDI input before calibrating.')); return; }
    generation.current++; const token = generation.current; cancelCalibration(); setChecking(false); setCheckLoading(false); setCalibration({ active: true, count: 0 }); setMessage(t('Follow the eight clicks and strike once on each.'));
    try {
      const player = createDrumAudio(undefined, undefined, () => { if (generation.current === token) cancelCalibration(t('Calibration audio was interrupted. Try again.')); }); audio.current = player;
      if (!player || !await player.ready || generation.current !== token) { if (generation.current === token) cancelCalibration(t('Calibration sounds could not load. Try again.')); return; }
      const beatMs = 60000 / settings.bpm, epoch = performance.now() + 1000, targets = Array.from({ length: 8 }, (_, beat) => epoch + beat * beatMs);
      calibrationRun.current = { targets, used: new Set(), offsets: [], source: input, ...(deviceId ? { deviceId } : {}) };
      targets.forEach((at, beat) => player.scheduleClick(at, beat === 0));
      calibrationTimer.current = setTimeout(completeCalibration, Math.max(0, epoch - performance.now() + targets.length * beatMs + 120));
    } catch { if (generation.current === token) cancelCalibration(t('Calibration sounds could not load. Try again.')); }
  };
  return <div className={`${styles.studio} ${focused ? styles.focused : ''}`}>
    <button className={`button-secondary ${styles.focusToggle}`} aria-pressed={focused} onClick={() => setFocused(!focused)}>{t(focused ? 'Exit performance view' : 'Performance view')}</button>
    {suggestion && <section className="card" aria-label={t('Suggested practice')}><h2>{t('Try this next')}</h2><p>{t(suggestion.reason)}</p><button className="button-secondary" disabled={active || checkLoading || checking} onClick={() => loadSetup(suggestion.settings)}>{t('Apply practice suggestion')}</button></section>}

    <ImprovisationLearning step={pathStep} completed={workspace.completedSteps} disabled={active} canAdvance={finishedStep !== null && finishedStep === pathStep} onSelect={selectStep} onDemo={demo} onNext={nextStep} />
    <section className="card" aria-label={t('Improvisation setup')}>
      <div className={styles.quickSetups} role="group" aria-label={t('Quick-start setups')}>
        <strong>{t('Start with a setup')}</strong>
        <button type="button" className="button-secondary" disabled={active || calibration?.active} onClick={() => loadSetup({ ...DEFAULT_IMPROVISATION_SETTINGS, mode: 'trading', bpm: 80, bars: 4, phrases: 4, prompt: 'free', entry: 'kick' })}>{t('First trade')}</button>
        <button type="button" className="button-secondary" disabled={active || calibration?.active} onClick={() => loadSetup({ ...DEFAULT_IMPROVISATION_SETTINGS, mode: 'trading', bpm: 90, bars: 4, phrases: 4, prompt: 'backbeat', entry: 'kick' })}>{t('Steady backbeat')}</button>
        <button type="button" className="button-secondary" disabled={active || calibration?.active} onClick={() => loadSetup({ ...DEFAULT_IMPROVISATION_SETTINGS, mode: 'guided', bpm: 80, bars: 4, phrases: 4, prompt: 'two-voices', entry: 'kick', cyclePrompts: true })}>{t('Two-voice ideas')}</button>
      </div>
      <fieldset className={styles.settings} disabled={active || calibration?.active}>
        <legend>{t('Session setup')}</legend>
        <label>{t('Mode')}<select value={settings.mode} onChange={event => { const mode = event.target.value as ImprovisationSettings['mode']; change({ mode, ...(mode === 'trading' ? {} : { challenge: 'none', developmentOffset: 0 }) }); }}><option value="trading">{t('Trading fours')}</option><option value="guided">{t('Guided improvisation')}</option><option value="duet">{t('Two-player duet')}</option></select></label>
        <label>{t('Meter')}<select value={settings.meter} onChange={event => change({ meter: event.target.value as ImprovisationSettings['meter'] })}>{IMPROVISATION_METERS.map(meter => <option value={meter} key={meter}>{meter}</option>)}</select></label>
        <label>{t('Tempo')} · {formatNumber(settings.bpm)} BPM<input type="range" min="40" max="200" value={settings.bpm} onChange={event => change({ bpm: Number(event.target.value) })} /><small>{t('Quarter-note tempo; eighth-note meters count each eighth in the display.')}</small></label>
        <label>{settings.mode === 'trading' ? t('Exchanges') : settings.mode === 'duet' ? t('Duet turns') : t(settings.bars === 4 ? 'Four-bar phrases' : 'Player phrases')}<select disabled={settings.openEnded} value={settings.phrases} onChange={event => change({ phrases: Number(event.target.value) as 1 | 2 | 4 | 8 })}>{[1, 2, 4, 8].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{t('Bars per turn')}<select value={settings.bars} onChange={event => change({ bars: Number(event.target.value) as 2 | 4 | 8 })}>{[2, 4, 8].map(bars => <option value={bars} key={bars}>{bars}</option>)}</select></label>
        <label className={styles.check}><input type="checkbox" checked={settings.openEnded} onChange={event => change({ openEnded: event.target.checked })} />{t('Open-ended session')}</label>
        <label>{t('Musical style')}<select value={settings.style} onChange={event => change({ style: event.target.value as ImprovisationSettings['style'] })}>{IMPROVISATION_STYLES.map(style => <option value={style} key={style}>{t(style === 'rock' ? 'Rock' : style === 'funk' ? 'Funk' : style === 'shuffle' ? 'Shuffle' : style === 'blues' ? 'Blues' : 'Jazz')}</option>)}</select></label>
        {settings.mode === 'duet' && <><label>{t('Player 1 name')}<input maxLength={32} value={settings.playerOneName} onChange={event => change({ playerOneName: event.target.value })} /></label><label>{t('Player 2 name')}<input maxLength={32} value={settings.playerTwoName} onChange={event => change({ playerTwoName: event.target.value })} /></label></>}
        <details className={styles.advanced}><summary>{t('Drummer and handoff options')}</summary><div className={styles.settings}><label>{t('Drummer difficulty')}<select value={settings.difficulty} onChange={event => change({ difficulty: event.target.value as ImprovisationSettings['difficulty'] })}><option value="beginner">{t('Beginner')}</option><option value="intermediate">{t('Intermediate')}</option><option value="advanced">{t('Advanced')}</option></select></label>
        <label>{t('Note density')}<select value={settings.density} onChange={event => change({ density: event.target.value as ImprovisationSettings['density'] })}><option value="sparse">{t('Sparse')}</option><option value="balanced">{t('Balanced')}</option><option value="busy">{t('Busy')}</option></select></label>
        <label>{t('Response exercise')}<select value={settings.response} onChange={event => change({ response: event.target.value as ImprovisationSettings['response'] })}><option value="copy">{t('Copy the idea')}</option><option value="vary">{t('Answer with a variation')}</option><option value="contrast">{t('Contrast the phrase')}</option></select></label>
        <label>{t('Required entry')}<select value={settings.entry} onChange={event => change({ entry: event.target.value as ImprovisationSettings['entry'] })}><option value="none">{t('No required entry')}</option>{pads.map(pad => <option value={pad.instrument} key={pad.instrument}>{t(pad.label)}</option>)}</select></label>
        <label className={styles.check}><input type="checkbox" checked={settings.audibleCues} onChange={event => change({ audibleCues: event.target.checked })} />{t('Spoken handoff cues')}</label>
        <label className={styles.check}><input type="checkbox" checked={settings.adaptiveDrummer} disabled={settings.mode !== 'trading' || settings.challenge !== 'none'} onChange={event => change({ adaptiveDrummer: event.target.checked })} />{t('Adaptive virtual drummer')}</label>
        <small>{t('After two scored player turns, the drummer adjusts one difficulty or density step for the next exchange. No evidence leaves it unchanged.')}</small></div></details>
        <details className={styles.advanced}><summary>{t('Groove and subdivision builder')}</summary><div className={styles.settings}>
          <label>{t('Groove pattern')}<select value={settings.groove} onChange={event => change({ groove: event.target.value as ImprovisationSettings['groove'] })}><option value="style">{t('Style groove')}</option><option value="straight">{t('Straight backbeat')}</option><option value="half-time">{t('Half-time')}</option><option value="four-on-floor">{t('Four-on-the-floor')}</option><option value="custom">{t('Build a custom groove')}</option></select></label>
          {settings.groove !== 'custom' && <label>{t('Hi-hat subdivision')}<select value={settings.subdivision} onChange={event => change({ subdivision: event.target.value as ImprovisationSettings['subdivision'] })}><option value="eighth">{t('Eighth notes')}</option><option value="sixteenth">{t('Sixteenth notes')}</option><option value="triplet">{t('Triplets')}</option></select></label>}
          {settings.groove === 'custom' && <><label>{t('Custom phrase length')}<select value={settings.customGroove.bars} onChange={event => change({ customGroove: { ...settings.customGroove, bars: Number(event.target.value) as 1 | 2 | 4 } })}>{[1, 2, 4].map(count => <option value={count} key={count}>{count}</option>)}</select></label><div className={styles.grooveBuilder}><p>{t('Build a {bars}-bar phrase with sixteenth-note steps. Longer patterns repeat if the drummer turn has more bars. Save it as a practice setup to reuse it.', { bars: settings.customGroove.bars })}</p>{grooveVoices.map(voice => <div className={styles.grooveRow} style={{ gridTemplateColumns: `5rem repeat(${grooveSteps}, minmax(1.8rem, 1fr))` }} key={voice.instrument}><strong>{t(voice.label)}</strong>{Array.from({ length: grooveSteps }, (_, step) => <button type="button" key={step} aria-label={t('Toggle {voice} on bar {bar}, step {step}', { voice: t(voice.label), bar: Math.floor(step / stepsPerBar) + 1, step: step % stepsPerBar + 1 })} aria-pressed={settings.customGroove[voice.instrument].includes(step)} className={`${settings.customGroove[voice.instrument].includes(step) ? styles.grooveOn : ''} ${step > 0 && step % stepsPerBar === 0 ? styles.grooveBarStart : ''}`} onClick={() => toggleGrooveStep(voice.instrument, step)}>{step % stepsPerBar + 1}</button>)}</div>)}</div></>}
        </div></details>
        <label>{t('Musical prompt')}<select value={settings.prompt} onChange={event => change({ prompt: event.target.value as ImprovisationPrompt })}>{IMPROVISATION_PROMPTS.map(prompt => <option value={prompt} key={prompt}>{t(PROMPT_LABELS[prompt])}</option>)}</select></label>
        <label>{t('Live score reveal')}<select value={settings.scoreReveal} onChange={event => change({ scoreReveal: event.target.value as ImprovisationSettings['scoreReveal'] })}><option value="full">{t('Show the full phrase')}</option><option value="one-bar">{t('Reveal one bar ahead')}</option><option value="live">{t('Reveal as it is heard')}</option></select><small>{t('Reveal controls apply to the virtual drummer. Player improvisation stays open.')}</small></label>
        {settings.mode === 'guided' && <label className={styles.check}><input type="checkbox" checked={settings.cyclePrompts} onChange={event => change({ cyclePrompts: event.target.checked })} />{t(settings.bars === 4 ? 'Change prompt every four bars' : 'Change prompt each phrase')}</label>}
        <label className={styles.check}><input type="checkbox" checked={settings.bass} onChange={event => change({ bass: event.target.checked })} />{t('Synthesized accompaniment')}</label>
        <label>{t('Practice intention')}<input maxLength={200} placeholder={t('e.g. Develop one idea and leave space')} value={settings.intention} onChange={e => change({ intention: e.target.value })} /></label>
        <details className={styles.advanced}><summary>{t('Challenges and accompaniment')}</summary><div className={styles.settings}>
          <label>{t('Call-and-response challenge')}<select value={settings.challenge} onChange={e => change({ challenge: e.target.value as ImprovisationSettings['challenge'], mode: 'trading', developmentOffset: 0, prompt: 'free', cyclePrompts: false, entry: 'none', adaptiveDrummer: e.target.value === 'none' ? settings.adaptiveDrummer : false, ...(e.target.value === 'development' ? { phrases: 4, openEnded: false } : {}) })}>{Object.entries(CHALLENGE_LABELS).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
          <label>{t('Answer drum')}<select value={settings.answerVoice} onChange={e => change({ answerVoice: e.target.value as Instrument })}>{pads.map(pad => <option key={pad.instrument} value={pad.instrument}>{t(pad.label)}</option>)}</select></label>
          <label>{t('Metronome support')}<select value={settings.clickTraining} onChange={e => change({ clickTraining: e.target.value as ImprovisationSettings['clickTraining'] })}><option value="steady">{t('Every bar')}</option><option value="alternate">{t('One bar on, one bar off')}</option><option value="fade">{t('Full bar, quiet bar, two silent bars')}</option></select></label>
          <label>{t('Chord progression')}<select value={settings.progression} onChange={e => change({ progression: e.target.value as ImprovisationSettings['progression'] })}><option value="style">{t('Follow musical style')}</option><option value="one-chord">{t('One-chord groove')}</option><option value="blues">{t('12-bar blues')}</option><option value="pop">{t('Pop · I–V–vi–IV')}</option><option value="jazz">{t('Jazz · ii–V–I–vi')}</option></select></label>
          <label>{t('Key')}<select value={settings.key} onChange={e => change({ key: e.target.value as ImprovisationSettings['key'] })}>{(['C', 'D', 'F', 'G', 'Bb'] as const).map(key => <option value={key} key={key}>{key}</option>)}</select></label>
          <label>{t('Accompaniment texture')}<select value={settings.accompaniment} onChange={e => change({ accompaniment: e.target.value as ImprovisationSettings['accompaniment'] })}><option value="bass">Bass line</option><option value="chords">Chord voicings</option><option value="bass-and-chords">Bass and chords</option></select></label>
          <label>{t('Accompaniment volume')}<input type="range" min="0" max="1" step="0.05" value={settings.bassLevel} onChange={e => change({ bassLevel: Number(e.target.value) })} /></label>
          <label className={styles.check}><input type="checkbox" checked={settings.leaveSpace} onChange={e => change({ leaveSpace: e.target.checked })} />{t('Sparse bass during player turns')}</label>
        </div></details>
        <label>{t('Metronome volume')}<input type="range" min="0" max="1" step="0.05" value={settings.clickLevel} onChange={event => change({ clickLevel: Number(event.target.value) })} /></label>
      </fieldset>
      <ImprovisationPhrasePreview settings={settings} disabled={active || checking || checkLoading || Boolean(calibration?.active)} />
      <div className={styles.settings}>
        <label>{t('Input')}<select disabled={Boolean(calibration?.active) || (active && position.phase !== 'paused')} value={input} onChange={event => {
          const next = event.target.value as ImprovisationInput;
          if (checking || checkLoading || calibration?.active) { generation.current++; setChecking(false); setCheckLoading(false); cancelCalibration(); closeAudio(); }
          setCheckHit(null);
          // Switching a paused session to acoustic practice discards captured evidence.
          if (next === 'unscored') { unscoredUsed.current = true; hits.current = []; setLiveHits([]); setHitCount(0); setMessage(t('This session will be saved as unscored practice.')); }
          setInput(next);
        }}><option value="keyboard">{t('Keyboard')}</option><option value="touch">{t('Touch pads')}</option><option value="midi">{t('MIDI kit')}</option><option value="unscored">{t('Acoustic / unscored')}</option></select></label>
        {input === 'midi' && <><button className="button-secondary" type="button" onClick={() => void connectMidi()} disabled={Boolean(calibration?.active) || (active && position.phase !== 'paused')}>{t('Connect MIDI')}</button><label>{settings.mode === 'duet' ? t('Player 1 MIDI input') : t('MIDI input')}<select value={selectedDevice} disabled={Boolean(calibration?.active) || (active && position.phase !== 'paused')} onChange={event => setSelectedDevice(event.target.value)}><option value="">{t('Choose a MIDI input')}</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>{settings.mode === 'duet' && <label>{t('Player 2 MIDI input')}<select value={selectedDuetDevice} disabled={Boolean(calibration?.active) || (active && position.phase !== 'paused')} onChange={event => setSelectedDuetDevice(event.target.value)}><option value="">{t('Choose a MIDI input')}</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>}</>}
      </div>
      <p className={styles.note}>{t('{meter} · one-bar count-in. Choose your entry and develop your own musical idea. Shuffle, blues, and jazz use triplet timing targets.', { meter: settings.meter })}</p>
      {input === 'unscored' ? <p>{t('Play your acoustic kit along with the session. No microphone is used and no automated feedback is saved.')}</p> : <p>{t('Saved Trainer note maps and input timing corrections apply.')} <Link href="/trainer?setup=1">{t('Calibrate input in Trainer')}</Link></p>}
      <details className={styles.preflight}><summary>{t('Pre-session sound and input check')}</summary>
      <p>{t('Use headphones or speakers at a comfortable level. Start the check, play every drum, and confirm that you hear the expected sound. Use input calibration to follow eight clicks and save a timing correction for the selected keyboard, touch pad, or MIDI device.')}</p>
        <div className={styles.transport}><button className="button-secondary" disabled={active || checkLoading || checking || Boolean(calibration?.active) || (input === 'midi' && [selectedDevice, ...(settings.mode === 'duet' ? [selectedDuetDevice] : [])].some(id => !devices.some(device => device.id === id)))} onClick={() => void soundCheck()}>{t('Start sound check')}</button><button className="button-secondary" type="button" disabled={active || checking || checkLoading || Boolean(calibration?.active) || input === 'unscored'} onClick={() => void calibrateInput()}>{t(calibration?.active ? 'Calibrating… {count}/8' : 'Calibrate input timing', { count: calibration?.count ?? 0 })}</button>{calibration?.active && <button className="button-secondary" type="button" onClick={() => cancelCalibration(t('Calibration stopped. No setting was changed.'))}>{t('Stop calibration')}</button>}{checking && <button className="button-secondary" onClick={() => { generation.current++; setChecking(false); setCheckLoading(false); closeAudio(); setMessage(t('Sound check ended.')); }}>{t('End sound check')}</button>}</div>
        {calibration?.active && <p role="status" aria-live="polite">{t('Strike once with each click: {count} of 8 captured.', { count: calibration.count })}</p>}{calibration?.result && <p role="status">{calibration.result}</p>}
        {checkHit && <p role="status">{t('Received {voice}{articulation} · velocity {velocity} · saved correction {latency} ms', { voice: t(pads.find(p => p.instrument === checkHit.instrument)?.label ?? checkHit.instrument), articulation: checkHit.articulation ? ` · ${t(checkHit.articulation)}` : '', velocity: checkHit.velocity ?? '—', latency: checkHit.latency })}</p>}
        {checking && <div className={styles.pads}>{pads.map(pad => <button key={pad.instrument} onClick={() => { setCheckHit({ instrument: pad.instrument, latency: 0 }); audio.current?.hit(pad.instrument); }}>{t('Test {voice} sound', { voice: t(pad.label) })}</button>)}</div>}
      </details>
      <div className={styles.transport}>
        {!active && <button className="button" type="button" disabled={Boolean(calibration?.active)} onClick={() => void start()}>{t(position.phase === 'complete' ? 'Repeat session' : 'Start session')}</button>}
        {running && <button className="button-secondary" type="button" onClick={pause}>{t('Pause')}</button>}
        {position.phase === 'paused' && <button className="button" type="button" onClick={resume}>{t('Resume with count-in')}</button>}
        {active && settings.openEnded && <button className="button" type="button" onClick={finish}>{t('Finish session')}</button>}
        {active && <button className="button-secondary" type="button" onClick={stop}>{t('Stop')}</button>}
      </div>
      <p role="status">{message}</p>
    </section>
    <section className={styles.stage} aria-label={t('Live improvisation')}>
      <div className={styles.liveTransport}>{!active && <button className="button-secondary" onClick={() => void start()}>{t('Start practice')}</button>}{running && <button className="button-secondary" onClick={pause}>{t('Pause practice')}</button>}{position.phase === 'paused' && <button className="button-secondary" onClick={resume}>{t('Resume practice')}</button>}{active && settings.openEnded && <button className="button-secondary" onClick={finish}>{t('Finish practice')}</button>}{active && <button className="button-secondary" onClick={stop}>{t('Stop practice')}</button>}</div>
      {focused && <p role="status">{message}</p>}
      <h2 aria-live="polite" aria-atomic="true">{stage}</h2>
      <p aria-live={position.phase === 'count-in' ? 'polite' : 'off'} aria-atomic="true">{position.phase === 'count-in' ? t('Count-in beat {beat} of {total}', { beat: formatNumber(position.beat), total: formatNumber(barCountIn(settings)) }) : settings.openEnded ? t('Phrase {phrase}', { phrase: formatNumber(position.phrase + 1) }) : t('Phrase {phrase} of {total}', { phrase: formatNumber(position.phrase + 1), total: formatNumber(settings.phrases) })}</p>
      <p aria-live="polite" aria-atomic="true"><strong>{t(PROMPT_LABELS[active || position.phase === 'complete' ? position.prompt : settings.prompt])}</strong></p>
      {settings.intention && <p><strong>{t('Intention')}: {settings.intention}</strong></p>}
      {settings.challenge !== 'none' && <p aria-live="polite"><strong>{t(challengeInstruction(settings, position.phrase))}</strong> {t('Answer drum')}: {t(pads.find(p => p.instrument === settings.answerVoice)?.label ?? 'Tom')}</p>}
      <p>{settings.entry === 'none' ? t('No required entry — choose your own opening.') : t('Enter on beat 1 with {voice}.', { voice: t(pads.find(pad => pad.instrument === settings.entry)?.label ?? 'Kick') })}</p>
      {settings.challenge === 'none' && <p>{t(settings.response === 'copy' ? 'Listen for the idea and echo it in your response.' : settings.response === 'contrast' ? 'Answer with a contrasting rhythm, register, or density.' : 'Keep an idea from the drummer and change one part of it.')}</p>}
      <p aria-live="polite">{running && position.warning ? nextLabel : ''}</p>
      <p>{t('Captured player hits: {count}', { count: formatNumber(hitCount) })}</p>
      <ImprovisationNotation settings={settings} drummerSettings={adaptation.settings} position={position} hits={liveHits} completedTake={reviewTake} />
      {settings.adaptiveDrummer && settings.mode === 'trading' && <p>{position.phase === 'partner' && position.phrase >= 2 ? t(adaptationLabel) : t('The virtual drummer uses your last two scored turns to shape a later phrase.')}</p>}
      <div className={styles.pads} role="group" aria-label={t('Drum pads')}>{pads.map(pad => <button data-improvisation-pad type="button" key={pad.instrument} disabled={(!checking && !calibration?.active && position.phase !== 'player') || (input !== 'keyboard' && input !== 'touch')} onPointerDown={event => { if (input !== 'touch' || event.button !== 0) return; event.preventDefault(); receiveHit(pad.instrument, 'touch'); }} onClick={event => { if (input === 'keyboard' || event.detail === 0) receiveHit(pad.instrument, input === 'touch' ? 'touch' : 'keyboard'); }}><span>{t(pad.label)}</span><kbd>{pad.key}</kbd></button>)}</div>
    </section>
    {result && <ImprovisationRecap result={result} headingRef={resultHeading} disabled={active} canExportPack={Boolean(reviewTake?.hits.length && result.input !== 'unscored')} onExportPack={exportResponsePack} onUpdate={updateResult} onRepeat={(phrase, slower) => { setPathStep(null); void start(repeatPhraseSettings(result.settings, phrase, slower)); }} />}
    {reviewTake && <ImprovisationReplay key={reviewTake.id} take={reviewTake} disabled={active || checkLoading || checking} saved={takes.some(take => take.id === reviewTake.id)} onSave={name => {
      if (takes.length >= 12 || takes.reduce((total, take) => total + take.hits.length, 0) + reviewTake.hits.length > 50000) { setMessage(t('Delete a saved take before saving more drum events.')); return; }
      persistTakes([...takes, { id: reviewTake.id, name, createdAt: reviewTake.createdAt, settings: reviewTake.settings, phrases: reviewTake.phrases, hits: reviewTake.hits, ...(reviewTake.drummerSettings ? { drummerSettings: reviewTake.drummerSettings } : {}) }]);
    }} />}
    <ImprovisationAssignments workspace={workspace} settings={settings} history={history} disabled={active || checkLoading || checking || Boolean(calibration?.active)} activeAssignment={assignment} onSave={persistWorkspace} onLoad={(next, selected) => { loadSetup(next); setAssignment(selected); setMessage(t('Playlist step loaded. Start when ready; changing its setup removes completion credit.')); }} />
    <ImprovisationLibrary history={history} takes={takes} workspace={workspace} settings={settings} disabled={active || Boolean(calibration?.active)} onWorkspace={persistWorkspace} onLoad={loadSetup} onReview={take => { setReviewTake(take); requestAnimationFrame(() => document.querySelector<HTMLElement>('#improvisation-replay h2')?.focus()); }} onDeleteTake={id => { persistTakes(takes.filter(take => take.id !== id)); if (reviewTake?.id === id) setReviewTake(null); }} onUpdate={updateResult} onDeleteSession={id => { persist(historyRef.current.filter(entry => entry.id !== id)); if (result?.id === id) setResult(null); if (reviewTake?.id === id && !takes.some(take => take.id === id)) setReviewTake(null); }} />
  </div>;
}

function contextFingerprint(input: ImprovisationInput, device: string, latency: number, mapping: string) {
  const text = JSON.stringify([input, device, latency, mapping]); let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${input}:${hash >>> 0}`;
}
