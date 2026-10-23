"use client";

import Link from 'next/link';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createDrumAudio, type DrumAudio } from '@/lib/audio';
import { createPracticeBass, type PracticeBass } from '@/lib/practice-accompaniment';
import { DEFAULT_IMPROVISATION_SETTINGS, IMPROVISATION_KEY, IMPROVISATION_PROMPTS, IMPROVISATION_STYLES, IMPROVISATION_WORKSPACE_KEY, IMPROVISATION_TAKES_KEY, IMPROVISATION_PATH, PROMPT_LABELS, ImprovisationTransport, improvisationAudioEvents, normalizeImprovisationSettings, parseImprovisationHistory, parseImprovisationTakes, parseImprovisationWorkspace, summarizeImprovisation, phraseDuration, playerPhraseStart, completedPlayerPhrases, promptForPhrase, repeatPhraseSettings, learningStepSettings, demonstrationPhrase, type ImprovisationHit, type ImprovisationInput, type ImprovisationPosition, type ImprovisationSettings, type ImprovisationSummary, type ImprovisationPrompt, type ImprovisationTake, type ImprovisationWorkspace } from '@/lib/improvisation';
import { learnerStorageKey } from '@/lib/learner-profiles';
import { getTrainerDeviceProfile, midiNoteFromMessage, midiVelocityFromMessage, parseTrainerState, trainerStorageKey } from '@/lib/trainer';
import type { Instrument } from '@/lib/types';
import { useProgress } from './ProgressProvider';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';
import { ImprovisationLearning } from './ImprovisationLearning';
import { ImprovisationReplay } from './ImprovisationReplay';
import { ImprovisationRecap } from './ImprovisationRecap';
import { ImprovisationLibrary } from './ImprovisationLibrary';


const pads: Array<{ instrument: Instrument; label: string; code: string; key: string }> = [
  { instrument: 'kick', label: 'Kick', code: 'Space', key: 'Space' }, { instrument: 'snare', label: 'Snare', code: 'KeyF', key: 'F' }, { instrument: 'hihat', label: 'Hi-hat', code: 'KeyJ', key: 'J' }, { instrument: 'tom', label: 'Tom', code: 'KeyK', key: 'K' }, { instrument: 'crash', label: 'Crash', code: 'KeyL', key: 'L' }
];
const idlePosition: ImprovisationPosition = { phase: 'idle', elapsedMs: 0, phrase: 0, bar: 1, beat: 1, prompt: 'free', warning: false };

export function ImprovisationStudio() {
  const { profileId, hydrated } = useProgress();
  const { t } = useLocalization();
  return hydrated ? <ImprovisationSession key={profileId} profileId={profileId} /> : <p role="status">{t('Loading improvisation…')}</p>;
}

function ImprovisationSession({ profileId }: { profileId: string }) {
  const { t, formatNumber, locale } = useLocalization();
  const [settings, setSettings] = useState<ImprovisationSettings>(DEFAULT_IMPROVISATION_SETTINGS);
  const [input, setInput] = useState<ImprovisationInput>('keyboard');
  const [position, setPosition] = useState(idlePosition);
  const [message, setMessage] = useState('');
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [history, setHistory] = useState<ImprovisationSummary[]>([]);
  const [result, setResult] = useState<ImprovisationSummary | null>(null);
  const [hitCount, setHitCount] = useState(0);
  const [workspace, setWorkspace] = useState<ImprovisationWorkspace>({ presets: [], completedSteps: [] });
  const [takes, setTakes] = useState<ImprovisationTake[]>([]);
  const [reviewTake, setReviewTake] = useState<(ImprovisationTake & { demo?: boolean }) | null>(null);
  const [pathStep, setPathStep] = useState<number | null>(null), [finishedStep, setFinishedStep] = useState<number | null>(null);
  const pathRound = useRef<number | null>(null), inputContexts = useRef(new Set<string>());
  const spoken = useRef('');
  const transport = useRef<ImprovisationTransport | null>(null);
  const hits = useRef<ImprovisationHit[]>([]);
  const unscoredUsed = useRef(false);
  const audio = useRef<DrumAudio | null>(null), bass = useRef<PracticeBass | null>(null);
  const scheduled = useRef(new Set<string>());
  const midi = useRef<MIDIAccess | null>(null);
  const midiGeneration = useRef(0), generation = useRef(0);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const historyRef = useRef<ImprovisationSummary[]>([]);
  const storageKey = learnerStorageKey(IMPROVISATION_KEY, profileId);
  const active = ['loading', 'count-in', 'partner', 'player', 'paused'].includes(position.phase);
  const running = ['count-in', 'partner', 'player'].includes(position.phase);

  const silence = useCallback(() => { if (typeof window !== 'undefined') window.speechSynthesis?.cancel(); spoken.current = ''; audio.current?.silence(); bass.current?.silence(); scheduled.current.clear(); }, []);
  const closeAudio = useCallback(() => { silence(); audio.current?.close(); audio.current = null; void bass.current?.close(); bass.current = null; }, [silence]);
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
      generation.current++;
      if (transport.current) pauseCurrent();
      else { closeAudio(); setPosition(current => current.phase === 'loading' ? { ...current, phase: 'stopped' } : current); }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => { generationRef.current++; document.removeEventListener('visibilitychange', hidden); closeAudio(); disconnectMidi(); };
  }, [closeAudio, disconnectMidi]);
  const resultId = result?.id;
  useEffect(() => { if (resultId) resultHeading.current?.focus(); }, [resultId]);

  const receiveHit = useCallback((instrument: Instrument, source: ImprovisationInput, deviceId?: string, velocity?: number, timestamp = performance.now()) => {
    if (source !== input || (source === 'midi' && deviceId !== selectedDevice)) return;
    const clock = transport.current;
    if (!clock) return;
    let latency = 0, map = ''; 
    try {
      const saved = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId)));
      const profile = getTrainerDeviceProfile(saved, source === 'midi' ? `midi:${deviceId}` : source); latency = profile.latencyMs; map = source === 'midi' ? JSON.stringify(profile.midiMap) : '';
    } catch { /* Unavailable storage uses an uncorrected timestamp. */ }
    const captured = clock.capture(instrument, timestamp, latency, velocity);
    if (!captured) return;
    if (hits.current.length >= 100000) { clock.pause(performance.now()); silence(); setPosition(clock.position(performance.now())); setMessage(t('This session reached its capture limit. Finish the completed phrases before starting another session.')); return; }
    inputContexts.current.add(contextFingerprint(source, deviceId ?? '', latency, map));
    hits.current.push(captured); setHitCount(hits.current.length);
    audio.current?.hit(instrument, false, velocity);
  }, [input, selectedDevice, profileId, silence, t]);
  const receiveHitRef = useRef(receiveHit);
  useEffect(() => { receiveHitRef.current = receiveHit; }, [receiveHit]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || target?.closest('input, select, textarea, [contenteditable], a, summary') || (target?.closest('button') && !target.closest('[data-improvisation-pad]'))) return;
      const pad = pads.find(pad => pad.code === event.code);
      if (pad && transport.current?.position(performance.now()).phase === 'player') { if (input === 'keyboard') event.preventDefault(); receiveHit(pad.instrument, 'keyboard'); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [input, receiveHit]);

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
        access.inputs.forEach(device => {
          device.onmidimessage = device.state !== 'connected' ? null : event => {
            if (!event.data) return;
            const note = midiNoteFromMessage(event.data); if (note === null) return;
            let instrument: Instrument | null = null;
            try { instrument = getTrainerDeviceProfile(parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))), `midi:${device.id}`).midiMap[note] ?? null; } catch { return; }
            if (instrument) receiveHitRef.current(instrument, 'midi', device.id, midiVelocityFromMessage(event.data) ?? undefined, event.timeStamp || performance.now());
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
    if (input === 'midi' && id === selectedDevice) {
      if (!transport.current) { generation.current++; closeAudio(); setPosition({ ...idlePosition, phase: 'stopped' }); }
      else pause();
      setMessage(t('Your MIDI input disconnected. Reconnect, or choose another input while paused.')); }
  }, [input, selectedDevice, pause, closeAudio, t]);
  const midiDisconnectedRef = useRef(midiDisconnected);
  useEffect(() => { midiDisconnectedRef.current = midiDisconnected; }, [midiDisconnected]);

  const stop = () => {
    generation.current++;
    const now = performance.now(); transport.current?.stop(now); closeAudio(); hits.current = [];
    setPosition(transport.current?.position(now) ?? { ...idlePosition, phase: 'stopped' });
    setMessage(t('Stopped. Incomplete sessions are not saved.'));
  };
  const start = async (override?: ImprovisationSettings) => {
    if (input === 'midi' && !devices.some(device => device.id === selectedDevice)) { setMessage(t('Connect a MIDI input before starting.')); return; }
    const requested = normalizeImprovisationSettings(override ?? settings);
    if ((requested.prompt === 'two-voices' || (requested.mode === 'guided' && requested.cyclePrompts && ['free', 'backbeat', 'two-voices', 'space'].includes(requested.prompt))) && !['kick', 'snare', 'none'].includes(requested.entry)) { setMessage(t('Choose kick, snare, or no required entry for the kick/snare-only prompt.')); return; }
    generation.current++; const token = generation.current;
    closeAudio(); transport.current = null; hits.current = []; setHitCount(0); setResult(null); setReviewTake(null); setFinishedStep(null); setMessage(''); pathRound.current = !override && pathStep !== null && requested.prompt === learningStepSettings(pathStep).prompt && requested.response === learningStepSettings(pathStep).response && requested.bars === learningStepSettings(pathStep).bars ? pathStep : null; inputContexts.current.clear();
    setPosition({ ...idlePosition, phase: 'loading' });
    const config = requested; setSettings(config); if (config.audibleCues && !window.speechSynthesis) setMessage(t('Spoken cues are unavailable in this browser. Follow the visual handoff cues.')); unscoredUsed.current = input === 'unscored';
    try {
      const profile = getTrainerDeviceProfile(parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))), input === 'midi' ? `midi:${selectedDevice}` : input);
      inputContexts.current.add(contextFingerprint(input, input === 'midi' ? selectedDevice : '', profile.latencyMs, input === 'midi' ? JSON.stringify(profile.midiMap) : ''));
    } catch { inputContexts.current.add(contextFingerprint(input, '', 0, '')); }
    try {
      audio.current = createDrumAudio(undefined, undefined, pause);
      if (!audio.current) throw new Error('Audio unavailable');
      audio.current.setClickSound('woodblock'); audio.current.setClickLevel(config.clickLevel);
      if (config.bass) { bass.current = createPracticeBass(); await bass.current?.resume(); }
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
    if (input === 'midi' && !devices.some(device => device.id === selectedDevice)) { setMessage(t('Reconnect MIDI or choose another input before resuming.')); return; }
    silence(); const now = performance.now() + 50; transport.current?.resume(now); setPosition(transport.current?.position(now) ?? idlePosition); setMessage('');
  };
  const finish = useCallback(() => {
    const clock = transport.current; if (!clock) return;
    const elapsed = clock.position(performance.now()).elapsedMs;
    const count = completedPlayerPhrases(clock.settings, elapsed);
    if (!count) { setMessage(t('Complete one player phrase before finishing.')); return; }
    const sessionInput = unscoredUsed.current ? 'unscored' : input;
    const summary: ImprovisationSummary = { version: 1, engineVersion: 2, id: crypto.randomUUID(), playedAt: new Date().toISOString(), settings: clock.settings, input: sessionInput, inputContext: [...inputContexts.current].sort().join('|'), phrases: summarizeImprovisation(clock.settings, hits.current, sessionInput, count) };
    const end = playerPhraseStart(clock.settings, count - 1) + phraseDuration(clock.settings);
    if (sessionInput !== 'unscored') setReviewTake({ id: summary.id, name: t('Improvisation take'), createdAt: summary.playedAt, settings: clock.settings, phrases: count, hits: hits.current.filter(hit => hit.atMs < end) });
    hits.current = []; closeAudio(); transport.current = null;
    persist([...historyRef.current, summary].slice(-50)); setResult(summary); setFinishedStep(pathRound.current);
    setPosition({ ...clock.position(performance.now()), phase: 'complete', phrase: count - 1, prompt: promptForPhrase(clock.settings, count - 1), bar: clock.settings.bars, beat: 4 });
  }, [input, closeAudio, persist, t]);
  const finishCurrent = useEffectEvent(finish);

  useEffect(() => {
    if (!running) return;
    const clock = transport.current; if (!clock) return;
    const beatMs = 60000 / clock.settings.bpm;
    let chunk = -1, events: ReturnType<typeof improvisationAudioEvents> = [];
    const tick = () => {
      const now = performance.now(), next = clock.position(now);
      if (next.phase === 'complete') { finishCurrent(); return; }
      if (next.phrase >= 1000) { clock.pause(now); silence(); setPosition(clock.position(now)); setMessage(t('Finish these completed phrases before starting another session.')); return; }
      if (chunk !== next.phrase) { chunk = next.phrase; events = improvisationAudioEvents(clock.settings, chunk, 2); }
      setPosition(previous => previous.phase === next.phase && previous.phrase === next.phrase && previous.bar === next.bar && previous.beat === next.beat && previous.warning === next.warning ? previous : next);
      const cue = `${next.phase}:${next.phrase}:${next.warning}`;
      if (clock.settings.audibleCues && spoken.current !== cue && ['partner', 'player'].includes(next.phase)) {
        spoken.current = cue;
        const text = next.warning ? next.phase === 'partner' ? t('Your turn in one bar') : t('Last bar') : next.phase === 'player' ? t('Your turn') : t('Virtual drummer');
        if (window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = locale; utterance.rate = 1.1; window.speechSynthesis.speak(utterance); }
      }
      const end = now + 120;
      for (let beat = 0; beat < 4; beat++) {
        const at = clock.countStart + beat * beatMs, key = `count:${beat}`;
        if (at >= now - 25 && at <= end && !scheduled.current.has(key)) { scheduled.current.add(key); audio.current?.scheduleClick(at, beat === 0); }
      }
      events.forEach(event => {
        const at = clock.epoch + event.atMs, key = `event:${event.atMs}:${event.kind}:${event.instrument ?? ''}`;
        if (at < clock.gate || at < now - 25 || at > end || scheduled.current.has(key)) return;
        scheduled.current.add(key);
        if (event.kind === 'click') audio.current?.scheduleClick(at, event.accent);
        else if (event.kind === 'bass') bass.current?.schedule(event.bassPart!, at, event.frequency);
        else audio.current?.scheduleHit(event.instrument!, at, false, event.velocity);
      });
    };
    tick(); const timer = window.setInterval(tick, 20);
    return () => clearInterval(timer);
  }, [running, locale, silence, t]);

  const change = (update: Partial<ImprovisationSettings>) => setSettings(current => normalizeImprovisationSettings({ ...current, ...update }));
  const stage = position.phase === 'partner' ? t('Virtual drummer') : position.phase === 'player' ? t('Your turn') : position.phase === 'count-in' ? t('Count-in') : position.phase === 'paused' ? t('Paused') : position.phase === 'complete' ? t('Session complete') : position.phase === 'loading' ? t('Loading drum sounds…') : t('Ready to improvise');
  const lastPhrase = !settings.openEnded && position.phrase + 1 === settings.phrases;
  const nextLabel = position.phase === 'player' && lastPhrase ? t('Session ends in one bar') : settings.mode === 'guided' ? t('Next prompt in one bar: {prompt}', { prompt: t(PROMPT_LABELS[promptForPhrase(settings, position.phrase + 1)]) }) : position.phase === 'partner' ? t('Your turn in one bar') : t('Virtual drummer returns in one bar');
  const updateResult = (updated: ImprovisationSummary) => {
    if (result?.id === updated.id) setResult(updated);
    persist(historyRef.current.map(item => item.id === updated.id ? updated : item));
  };
  const loadSetup = (next: ImprovisationSettings) => { setSettings(normalizeImprovisationSettings(next)); setPosition(idlePosition); setPathStep(null); setFinishedStep(null); setMessage(t('Setup loaded. Start when you are ready.')); };
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


  return <div className={styles.studio}>
    <ImprovisationLearning step={pathStep} completed={workspace.completedSteps} disabled={active} canAdvance={finishedStep !== null && finishedStep === pathStep} onSelect={selectStep} onDemo={demo} onNext={nextStep} />
    <section className="card" aria-label={t('Improvisation setup')}>
      <fieldset className={styles.settings} disabled={active}>
        <legend>{t('Session setup')}</legend>
        <label>{t('Mode')}<select value={settings.mode} onChange={event => change({ mode: event.target.value as ImprovisationSettings['mode'] })}><option value="trading">{t('Trading fours')}</option><option value="guided">{t('Guided improvisation')}</option></select></label>
        <label>{t('Tempo')} · {formatNumber(settings.bpm)} BPM<input type="range" min="40" max="200" value={settings.bpm} onChange={event => change({ bpm: Number(event.target.value) })} /></label>
        <label>{settings.mode === 'trading' ? t('Exchanges') : t(settings.bars === 4 ? 'Four-bar phrases' : 'Player phrases')}<select disabled={settings.openEnded} value={settings.phrases} onChange={event => change({ phrases: Number(event.target.value) as 1 | 2 | 4 | 8 })}>{[1, 2, 4, 8].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>{t('Bars per turn')}<select value={settings.bars} onChange={event => change({ bars: Number(event.target.value) as 2 | 4 | 8 })}>{[2, 4, 8].map(bars => <option value={bars} key={bars}>{bars}</option>)}</select></label>
        <label className={styles.check}><input type="checkbox" checked={settings.openEnded} onChange={event => change({ openEnded: event.target.checked })} />{t('Open-ended session')}</label>
        <label>{t('Musical style')}<select value={settings.style} onChange={event => change({ style: event.target.value as ImprovisationSettings['style'] })}>{IMPROVISATION_STYLES.map(style => <option value={style} key={style}>{t(style === 'rock' ? 'Rock' : style === 'funk' ? 'Funk' : style === 'shuffle' ? 'Shuffle' : style === 'blues' ? 'Blues' : 'Jazz')}</option>)}</select></label>
        <details className={styles.advanced}><summary>{t('Drummer and handoff options')}</summary><div className={styles.settings}><label>{t('Drummer difficulty')}<select value={settings.difficulty} onChange={event => change({ difficulty: event.target.value as ImprovisationSettings['difficulty'] })}><option value="beginner">{t('Beginner')}</option><option value="intermediate">{t('Intermediate')}</option><option value="advanced">{t('Advanced')}</option></select></label>
        <label>{t('Note density')}<select value={settings.density} onChange={event => change({ density: event.target.value as ImprovisationSettings['density'] })}><option value="sparse">{t('Sparse')}</option><option value="balanced">{t('Balanced')}</option><option value="busy">{t('Busy')}</option></select></label>
        <label>{t('Response exercise')}<select value={settings.response} onChange={event => change({ response: event.target.value as ImprovisationSettings['response'] })}><option value="copy">{t('Copy the idea')}</option><option value="vary">{t('Answer with a variation')}</option><option value="contrast">{t('Contrast the phrase')}</option></select></label>
        <label>{t('Required entry')}<select value={settings.entry} onChange={event => change({ entry: event.target.value as ImprovisationSettings['entry'] })}><option value="none">{t('No required entry')}</option>{pads.map(pad => <option value={pad.instrument} key={pad.instrument}>{t(pad.label)}</option>)}</select></label>
        <label className={styles.check}><input type="checkbox" checked={settings.audibleCues} onChange={event => change({ audibleCues: event.target.checked })} />{t('Spoken handoff cues')}</label></div></details>
        <label>{t('Musical prompt')}<select value={settings.prompt} onChange={event => change({ prompt: event.target.value as ImprovisationPrompt })}>{IMPROVISATION_PROMPTS.map(prompt => <option value={prompt} key={prompt}>{t(PROMPT_LABELS[prompt])}</option>)}</select></label>
        {settings.mode === 'guided' && <label className={styles.check}><input type="checkbox" checked={settings.cyclePrompts} onChange={event => change({ cyclePrompts: event.target.checked })} />{t(settings.bars === 4 ? 'Change prompt every four bars' : 'Change prompt each phrase')}</label>}
        <label className={styles.check}><input type="checkbox" checked={settings.bass} onChange={event => change({ bass: event.target.checked })} />{t('Bass accompaniment')}</label>
        <label>{t('Metronome volume')}<input type="range" min="0" max="1" step="0.05" value={settings.clickLevel} onChange={event => change({ clickLevel: Number(event.target.value) })} /></label>
      </fieldset>
      <div className={styles.settings}>
        <label>{t('Input')}<select disabled={active && position.phase !== 'paused'} value={input} onChange={event => {
          const next = event.target.value as ImprovisationInput;
          // Switching a paused session to acoustic practice discards captured evidence.
          if (next === 'unscored') { unscoredUsed.current = true; hits.current = []; setHitCount(0); setMessage(t('This session will be saved as unscored practice.')); }
          setInput(next);
        }}><option value="keyboard">{t('Keyboard')}</option><option value="touch">{t('Touch pads')}</option><option value="midi">{t('MIDI kit')}</option><option value="unscored">{t('Acoustic / unscored')}</option></select></label>
        {input === 'midi' && <><button className="button-secondary" type="button" onClick={() => void connectMidi()} disabled={active && position.phase !== 'paused'}>{t('Connect MIDI')}</button><label>{t('MIDI input')}<select value={selectedDevice} disabled={active && position.phase !== 'paused'} onChange={event => setSelectedDevice(event.target.value)}><option value="">{t('Choose a MIDI input')}</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label></>}
      </div>
      <p className={styles.note}>{t('4/4 · four-beat count-in. Choose your entry and develop your own musical idea. Shuffle, blues, and jazz use triplet timing targets.')}</p>
      {input === 'unscored' ? <p>{t('Play your acoustic kit along with the session. No microphone is used and no automated feedback is saved.')}</p> : <p>{t('Saved Trainer note maps and input timing corrections apply.')} <Link href="/trainer?setup=1">{t('Calibrate input in Trainer')}</Link></p>}
      <div className={styles.transport}>
        {!active && <button className="button" type="button" onClick={() => void start()}>{t(position.phase === 'complete' ? 'Repeat session' : 'Start session')}</button>}
        {running && <button className="button-secondary" type="button" onClick={pause}>{t('Pause')}</button>}
        {position.phase === 'paused' && <button className="button" type="button" onClick={resume}>{t('Resume with count-in')}</button>}
        {active && settings.openEnded && <button className="button" type="button" onClick={finish}>{t('Finish session')}</button>}
        {active && <button className="button-secondary" type="button" onClick={stop}>{t('Stop')}</button>}
      </div>
      <p role="status">{message}</p>
    </section>
    <section className={styles.stage} aria-label={t('Live improvisation')}>
      <h2 aria-live="polite" aria-atomic="true">{stage}</h2>
      <p>{settings.openEnded ? t('Phrase {phrase}', { phrase: position.phrase + 1 }) : t('Phrase {phrase} of {total}', { phrase: formatNumber(position.phrase + 1), total: formatNumber(settings.phrases) })} · {t('Bar {bar} of {total}', { bar: formatNumber(position.bar), total: settings.bars })}</p>
      <div className={styles.bars} role="group" aria-label={t('Phrase progress')}>{Array.from({ length: settings.bars }, (_, index) => <span key={index} aria-current={position.bar === index + 1 ? 'step' : undefined} className={position.bar === index + 1 ? styles.currentBar : undefined}>{index + 1}</span>)}</div>
      <div className={styles.beats} role="group" aria-label={t('Beat {beat}', { beat: formatNumber(position.beat) })}>{[1, 2, 3, 4].map(beat => <span key={beat} className={position.beat === beat ? styles.activeBeat : undefined} aria-current={position.beat === beat ? 'step' : undefined}>{formatNumber(beat)}</span>)}</div>
      <p aria-live="polite" aria-atomic="true"><strong>{t(PROMPT_LABELS[active || position.phase === 'complete' ? position.prompt : settings.prompt])}</strong></p>
      <p>{settings.entry === 'none' ? t('No required entry — choose your own opening.') : t('Enter on beat 1 with {voice}.', { voice: t(pads.find(pad => pad.instrument === settings.entry)?.label ?? 'Kick') })}</p>
      <p>{t(settings.response === 'copy' ? 'Listen for the idea and echo it in your response.' : settings.response === 'contrast' ? 'Answer with a contrasting rhythm, register, or density.' : 'Keep an idea from the drummer and change one part of it.')}</p>
      <p aria-live="polite">{running && position.warning ? nextLabel : ''}</p>
      <p>{t('Captured player hits: {count}', { count: formatNumber(hitCount) })}</p>
      <div className={styles.pads} role="group" aria-label={t('Drum pads')}>{pads.map(pad => <button data-improvisation-pad type="button" key={pad.instrument} disabled={position.phase !== 'player' || (input !== 'keyboard' && input !== 'touch')} onPointerDown={event => { if (input !== 'touch' || event.button !== 0) return; event.preventDefault(); receiveHit(pad.instrument, 'touch'); }} onClick={event => { if (input === 'keyboard' || event.detail === 0) receiveHit(pad.instrument, input === 'touch' ? 'touch' : 'keyboard'); }}><span>{t(pad.label)}</span><kbd>{pad.key}</kbd></button>)}</div>
    </section>
    {result && <ImprovisationRecap result={result} headingRef={resultHeading} disabled={active} onUpdate={updateResult} onRepeat={(phrase, slower) => { setPathStep(null); void start(repeatPhraseSettings(result.settings, phrase, slower)); }} />}
    {reviewTake && <ImprovisationReplay key={reviewTake.id} take={reviewTake} disabled={active} saved={takes.some(take => take.id === reviewTake.id)} onSave={name => {
      if (takes.length >= 12 || takes.reduce((total, take) => total + take.hits.length, 0) + reviewTake.hits.length > 50000) { setMessage(t('Delete a saved take before saving more drum events.')); return; }
      persistTakes([...takes, { id: reviewTake.id, name, createdAt: reviewTake.createdAt, settings: reviewTake.settings, phrases: reviewTake.phrases, hits: reviewTake.hits }]);
    }} />}
    <ImprovisationLibrary history={history} takes={takes} workspace={workspace} settings={settings} disabled={active} onWorkspace={persistWorkspace} onLoad={loadSetup} onReview={take => { setReviewTake(take); requestAnimationFrame(() => document.querySelector<HTMLElement>('#improvisation-replay h2')?.focus()); }} onDeleteTake={id => { persistTakes(takes.filter(take => take.id !== id)); if (reviewTake?.id === id) setReviewTake(null); }} onUpdate={updateResult} onDeleteSession={id => { persist(historyRef.current.filter(entry => entry.id !== id)); if (result?.id === id) setResult(null); if (reviewTake?.id === id && !takes.some(take => take.id === id)) setReviewTake(null); }} />
  </div>;
}

function contextFingerprint(input: ImprovisationInput, device: string, latency: number, mapping: string) {
  const text = JSON.stringify([input, device, latency, mapping]); let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${input}:${hash >>> 0}`;
}
