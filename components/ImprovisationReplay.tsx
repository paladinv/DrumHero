"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDrumAudio, type DrumAudio } from '@/lib/audio';
import { barDuration, demonstrationPhrase, improvisationPhraseSettings, improvisationScoreGrid, improvisationSoundInstrument, meterParts, notationFlagCount, phraseDuration, playerPhraseStart, promptForPhrase, stepDuration, virtualDrummerResponse, type ImprovisationTake } from '@/lib/improvisation';
import { ImprovisationTimingReview } from './ImprovisationTimingReview';
import { DrumStaffNotation, type DrumNotationEvent, type DrumNotationFrame } from './TrainerNotationView';
import { createImprovisationMidi } from '@/lib/improvisation-midi';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';

type Material = ImprovisationTake & { demo?: boolean };
function monotonicNow() { return performance.now(); }
export function ImprovisationReplay({ take, disabled, onSave, saved }: { take: Material; disabled: boolean; saved: boolean; onSave: (name: string) => void }) {
  const { t } = useLocalization();
  const [phrase, setPhrase] = useState(0), [bar, setBar] = useState(0), [speed, setSpeed] = useState(1), [loopBar, setLoopBar] = useState(false), [name, setName] = useState(take.name);
  const [playing, setPlaying] = useState(false), [status, setStatus] = useState('');
  const [part, setPart] = useState('');
  const [playback, setPlayback] = useState<{ segment: number; atMs: number } | null>(null);
  const audio = useRef<DrumAudio | null>(null), token = useRef(0), timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => {
    token.current++; if (timer.current) clearInterval(timer.current); timer.current = null;
    audio.current?.close(); audio.current = null;
  }, []);
  useEffect(() => {
    const generation = token;
    const hidden = () => { if (document.hidden) { stop(); setPlayback(null); setPlaying(false); setPart(''); setStatus(t('Replay paused because the page was hidden.')); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { generation.current++; document.removeEventListener('visibilitychange', hidden); stop(); };
  }, [stop, t]);
  useEffect(() => { if (disabled) { const task = setTimeout(() => { stop(); setPlayback(null); setPlaying(false); }, 0); return () => clearTimeout(task); } }, [disabled, stop]);
  const phraseSettings = improvisationPhraseSettings(take.settings, phrase);
  const duration = phraseDuration(phraseSettings), barMs = barDuration(phraseSettings), rangeStartMs = bar ? (bar - 1) * barMs : 0, segmentDurationMs = bar ? barMs : duration, start = playerPhraseStart(take.settings, phrase);
  const response = take.hits.filter(hit => hit.atMs >= start && hit.atMs < start + duration).map(hit => ({ ...hit, atMs: hit.atMs - start }));
  const referenceLabel = take.settings.mode === 'guided' || take.settings.mode === 'ensemble' ? 'Example phrase' : 'Virtual drummer';
  const responseLabel = take.settings.mode === 'duet' ? (phrase % 2 === 0 ? take.settings.playerOneName : take.settings.playerTwoName) : take.settings.mode === 'ensemble' ? take.settings.ensemblePlayers[phrase % take.settings.ensemblePlayers.length]?.name ?? 'Workshop player' : 'Your response';
  const previousStart = phrase > 0 ? playerPhraseStart(take.settings, phrase - 1) : -1;
  const previousSettings = phrase > 0 ? improvisationPhraseSettings(take.settings, phrase - 1) : phraseSettings;
  const previousDuration = phraseDuration(previousSettings);
  const previousHits = phrase > 0 ? take.hits.filter(hit => hit.atMs >= previousStart && hit.atMs < previousStart + previousDuration).map(hit => ({ ...hit, atMs: (hit.atMs - previousStart) / stepDuration(previousSettings) * stepDuration(phraseSettings) })) : [];
  const referenceHits = take.settings.mode === 'guided' || take.settings.mode === 'ensemble' ? demonstrationPhrase({ ...phraseSettings, prompt: promptForPhrase(take.settings, phrase) }) : take.settings.mode === 'trading' ? virtualDrummerResponse(phrase, take.drummerSettings?.[phrase] ?? phraseSettings, previousHits) : [];
  const drummerSettings = take.drummerSettings?.[phrase] ?? phraseSettings;
  const pocketMs = take.settings.mode === 'trading' && drummerSettings.challenge === 'none' ? drummerSettings.pocketMs : 0;
  const partner = referenceHits.map(hit => ({ instrument: hit.instrument, atMs: Math.max(0, Math.min(duration - 1, hit.step * stepDuration(phraseSettings) + pocketMs)), velocity: hit.velocityTarget }));
  const { stepsPerBar, stepsPerPulse } = meterParts(phraseSettings);
  const totalSteps = phraseSettings.bars * stepsPerBar;
  const grid = improvisationScoreGrid(phraseSettings);
  const frameFor = (label: string, notes: typeof referenceHits | typeof response, played: boolean, activeSegment: number) => {
    const events: DrumNotationEvent[] = notes.map(note => {
      const step = 'step' in note ? note.step + (played ? 0 : pocketMs / stepDuration(phraseSettings)) : note.atMs / stepDuration(phraseSettings);
      const safeStep = Math.max(0, Math.min(totalSteps - 0.001, step));
      return { step: safeStep, instrument: note.instrument, source: played ? 'played' : 'reference', flagCount: notationFlagCount(phraseSettings, safeStep), velocity: 'velocity' in note ? note.velocity : undefined, velocityTarget: 'velocityTarget' in note ? note.velocityTarget : undefined, articulation: 'articulation' in note ? note.articulation : undefined };
    });
    const current = playback && playback.segment === activeSegment ? playback.atMs / stepDuration(phraseSettings) : undefined;
    const frame: DrumNotationFrame = { name: label, meter: phraseSettings.meter, bars: phraseSettings.bars, stepsPerBar, totalSteps, stepsPerPulse, flagCount: phraseSettings.subdivision === 'sixteenth' ? 2 : 1, grid, events, showRests: true, ...(current === undefined ? {} : { playheadStep: current, playheadTransitionMs: 0 }), autoFollow: current !== undefined, emptyCountLabel: t('No note at this count') };
    return frame;
  };
  const handlePlay = async (which: 'partner' | 'response' | 'compare') => {
    stop(); const request = token.current; setPlayback(null); setPlaying(true); setStatus(t('Loading replay…'));
    try {
    const player = createDrumAudio(take.settings.kitMix, undefined, () => { stop(); setPlaying(false); setStatus(t('Replay audio was interrupted. Start it again when ready.')); }); audio.current = player;
    if (!player || !await player.ready) { if (request === token.current) { stop(); setPlaying(false); setStatus(t('Replay sounds could not load. Try again.')); } return; }
    if (request !== token.current) return;
    const fullSegments = which === 'compare' ? [partner, response] : [which === 'partner' ? partner : response];
    const segments = fullSegments.map(segment => bar ? segment.filter(note => note.atMs >= rangeStartMs && note.atMs < rangeStartMs + segmentDurationMs).map(note => ({ ...note, atMs: note.atMs - rangeStartMs })) : segment);
    const notes = segments.flatMap((segment, i) => segment.map(note => ({ ...note, atMs: (i * (segmentDurationMs + 600) + note.atMs) / speed })));
    const scheduled = new Set<number>();
    let epoch = monotonicNow() + 80;
    const total = (segments.length * segmentDurationMs + (segments.length - 1) * 600) / speed;
    setStatus(t('Replay uses synthesized drum sounds; no microphone audio was recorded.'));
    let lastVisualUpdate = 0;
    const tick = () => {
      if (request !== token.current) return;
      const now = performance.now();
      const segment = which === 'compare' && now - epoch >= (segmentDurationMs + 600) / speed ? 1 : 0;
      const atMs = Math.max(0, (now - epoch) * speed - (segment ? segmentDurationMs + 600 : 0));
      setPart(t(segment === 1 || which === 'response' ? take.demo ? 'Demonstration' : responseLabel : referenceLabel));
      if (now - lastVisualUpdate >= 90) { lastVisualUpdate = now; setPlayback({ segment: which === 'partner' ? -1 : which === 'response' ? 1 : segment, atMs: rangeStartMs + (which === 'partner' ? (now - epoch) * speed : atMs) }); }
      notes.forEach((note, index) => {
        const at = epoch + note.atMs;
        if (scheduled.has(index) || at < now - 30 || at > now + 120) return;
        scheduled.add(index); player.scheduleHit(improvisationSoundInstrument(note), at, false, note.velocity);
      });
      if (now >= epoch + total + 250) {
        if (bar > 0 && loopBar) { epoch = now + 80; scheduled.clear(); setPlayback(null); }
        else { stop(); setPlayback(null); setPlaying(false); setPart(''); setStatus(t('Replay complete.')); }
      }
    };
    tick(); timer.current = setInterval(tick, 20);
    } catch { if (request === token.current) { stop(); setPlaying(false); setStatus(t('Replay sounds could not load. Try again.')); } }
  };
  const exportMidi = () => {
    const bytes = createImprovisationMidi(take);
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'audio/midi' }));
    const link = document.createElement('a'); link.href = url; link.download = `${take.name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'improvisation'}.mid`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(t('MIDI file exported. It contains drum notes and no microphone audio.'));
  };
  const partnerFrame = frameFor(take.settings.mode === 'guided' || take.settings.mode === 'ensemble' ? t('Example phrase') : t('Virtual drummer'), referenceHits, false, -1);
  const responseFrame = frameFor(take.demo ? t('Demonstration') : responseLabel, response, true, 1);
  const partnerPlayback = playback && (playback.segment === -1 || playback.segment === 0) ? playback.atMs / stepDuration(phraseSettings) : undefined;
  if (partnerPlayback !== undefined) { partnerFrame.playheadStep = partnerPlayback; partnerFrame.playheadTransitionMs = 0; partnerFrame.autoFollow = true; }
  const responsePlayback = playback?.segment === 1 ? playback.atMs / stepDuration(phraseSettings) : undefined;
  if (responsePlayback !== undefined) { responseFrame.playheadStep = responsePlayback; responseFrame.playheadTransitionMs = 0; responseFrame.autoFollow = true; }

  return <section id="improvisation-replay" className="card" aria-label={t('Phrase replay')}>
    <h2 tabIndex={-1}>{t(take.demo ? 'Listen to the idea' : 'Listen and compare')}</h2>
    <p>{t('Replay is available for this visit. Saving a take is optional and stores drum events locally. Acoustic practice has no captured response.')}</p>
    <fieldset disabled={playing || disabled} className={styles.settings}><legend>{t('Replay controls')}</legend>
      <label>{t('Replay phrase')}<select value={phrase} onChange={event => setPhrase(Number(event.target.value))}>{Array.from({ length: take.phrases }, (_, i) => <option value={i} key={i}>{i + 1}</option>)}</select></label>
      <label>{t('Replay range')}<select value={bar} onChange={event => { const next = Number(event.target.value); setBar(next); if (next === 0) setLoopBar(false); }}><option value={0}>{t('Full phrase')}</option>{Array.from({ length: phraseSettings.bars }, (_, i) => <option value={i + 1} key={i}>{t('Bar {bar}', { bar: i + 1 })}</option>)}</select></label>
      <label>{t('Replay speed')}<select value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[0.5, 0.75, 1].map(value => <option value={value} key={value}>{value * 100}%</option>)}</select></label>
      <label className={styles.check}><input type="checkbox" checked={loopBar} disabled={bar === 0} onChange={event => setLoopBar(event.target.checked)} />{t('Loop selected bar')}</label>
    </fieldset>
    {!take.demo && take.settings.mode !== 'duet' && take.settings.mode !== 'ensemble' && <DrumStaffNotation frame={partnerFrame} showRhythmStems improvisationControls />}
    <DrumStaffNotation frame={responseFrame} showRhythmStems improvisationControls />
    {!take.demo && <ImprovisationTimingReview settings={take.settings} phrase={phrase} hits={response} sessionHits={take.hits} sessionPhraseCount={take.phrases} />}
    <div className={styles.transport}>
      {!take.demo && take.settings.mode !== 'duet' && take.settings.mode !== 'ensemble' && <button className="button-secondary" disabled={playing || disabled} onClick={() => void handlePlay('partner')}>{t(take.settings.mode === 'guided' ? 'Play example' : 'Play partner')}</button>}
      <button className="button-secondary" disabled={playing || disabled || !response.length} onClick={() => void handlePlay('response')}>{t(take.demo ? 'Play demonstration' : take.settings.mode === 'duet' || take.settings.mode === 'ensemble' ? 'Play phrase' : 'Play response')}</button>
      {!take.demo && take.settings.mode !== 'duet' && take.settings.mode !== 'ensemble' && <button className="button-secondary" disabled={playing || disabled || !response.length} onClick={() => void handlePlay('compare')}>{t('Compare phrases')}</button>}
      {!take.demo && <button className="button-secondary" disabled={disabled || !take.hits.length} onClick={exportMidi}>{t('Export take as MIDI')}</button>}
      {playing && <button className="button-secondary" onClick={() => { stop(); setPlayback(null); setPlaying(false); setPart(''); setStatus(t('Replay stopped.')); }}>{t('Stop replay')}</button>}
    </div><p role="status">{playing ? `${part} · ${status}` : status}</p>
    {!take.demo && <div className={styles.settings}><label>{t('Take name')}<input maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><button className="button-secondary" disabled={disabled || saved || !name.trim() || !take.hits.length || take.hits.length > 10000} onClick={() => onSave(name.trim())}>{t(saved ? 'Take saved' : 'Save this take')}</button></div>}
  </section>;
}
