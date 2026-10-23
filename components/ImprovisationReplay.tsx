"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createDrumAudio, type DrumAudio } from '@/lib/audio';
import { demonstrationPhrase, phraseDuration, playerPhraseStart, promptForPhrase, virtualDrummerPhrase, type ImprovisationTake } from '@/lib/improvisation';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';

type Material = ImprovisationTake & { demo?: boolean };
export function ImprovisationReplay({ take, disabled, onSave, saved }: { take: Material; disabled: boolean; saved: boolean; onSave: (name: string) => void }) {
  const { t } = useLocalization();
  const [phrase, setPhrase] = useState(0), [speed, setSpeed] = useState(1), [name, setName] = useState(take.name);
  const [playing, setPlaying] = useState(false), [status, setStatus] = useState('');
  const [part, setPart] = useState('');
  const audio = useRef<DrumAudio | null>(null), token = useRef(0), timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => {
    token.current++; if (timer.current) clearInterval(timer.current); timer.current = null;
    audio.current?.close(); audio.current = null;
  }, []);
  useEffect(() => {
    const generation = token;
    const hidden = () => { if (document.hidden) { stop(); setPlaying(false); setStatus(t('Replay paused because the page was hidden.')); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { generation.current++; document.removeEventListener('visibilitychange', hidden); stop(); };
  }, [stop, t]);
  useEffect(() => { if (disabled) { const task = setTimeout(() => { stop(); setPlaying(false); }, 0); return () => clearTimeout(task); } }, [disabled, stop]);
  const duration = phraseDuration(take.settings), start = playerPhraseStart(take.settings, phrase);
  const response = take.hits.filter(hit => hit.atMs >= start && hit.atMs < start + duration).map(hit => ({ ...hit, atMs: hit.atMs - start }));
  const referenceLabel = take.settings.mode === 'guided' ? 'Example phrase' : 'Virtual drummer';
  const referenceHits = take.settings.mode === 'guided' ? demonstrationPhrase({ ...take.settings, prompt: promptForPhrase(take.settings, phrase) }) : virtualDrummerPhrase(phrase, take.settings);
  const partner = referenceHits.map(hit => ({ instrument: hit.instrument, atMs: hit.step * 60000 / take.settings.bpm / 4, velocity: hit.velocityTarget }));
  const handlePlay = useCallback(async (which: 'partner' | 'response' | 'compare') => {
    stop(); const request = token.current; setPlaying(true); setStatus(t('Loading replay…'));
    try {
    const player = createDrumAudio(undefined, undefined, () => { stop(); setPlaying(false); setStatus(t('Replay audio was interrupted. Start it again when ready.')); }); audio.current = player;
    if (!player || !await player.ready) { if (request === token.current) { stop(); setPlaying(false); setStatus(t('Replay sounds could not load. Try again.')); } return; }
    if (request !== token.current) return;
    const segments = which === 'compare' ? [partner, response] : [which === 'partner' ? partner : response];
    const notes = segments.flatMap((notes, i) => notes.map(note => ({ ...note, atMs: (i * (duration + 600) + note.atMs) / speed })));
    const scheduled = new Set<number>();
    const epoch = performance.now() + 80;
    const total = (segments.length * duration + (segments.length - 1) * 600) / speed;
    setStatus(t('Replay uses synthesized drum sounds; no microphone audio was recorded.'));
    const tick = () => {
      if (request !== token.current) return;
      const now = performance.now();
      setPart(t(which === 'compare' && now - epoch >= (duration + 600) / speed ? 'Your response' : which === 'response' ? take.demo ? 'Demonstration' : 'Your response' : referenceLabel));
      notes.forEach((note, index) => {
        const at = epoch + note.atMs;
        if (scheduled.has(index) || at < now - 30 || at > now + 120) return;
        scheduled.add(index); player.scheduleHit(note.instrument, at, false, note.velocity);
      });
      if (now >= epoch + total + 250) { stop(); setPlaying(false); setPart(''); setStatus(t('Replay complete.')); }
    };
    tick(); timer.current = setInterval(tick, 20);
    } catch { if (request === token.current) { stop(); setPlaying(false); setStatus(t('Replay sounds could not load. Try again.')); } }
  }, [duration, partner, referenceLabel, response, speed, stop, t, take.demo]);
  return <section id="improvisation-replay" className="card" aria-label={t('Phrase replay')}>
    <h2 tabIndex={-1}>{t(take.demo ? 'Listen to the idea' : 'Listen and compare')}</h2>
    <p>{t('Replay is available for this visit. Saving a take is optional and stores drum events locally. Acoustic practice has no captured response.')}</p>
    <fieldset disabled={playing || disabled} className={styles.settings}><legend>{t('Replay controls')}</legend>
      <label>{t('Replay phrase')}<select value={phrase} onChange={event => setPhrase(Number(event.target.value))}>{Array.from({ length: take.phrases }, (_, i) => <option value={i} key={i}>{i + 1}</option>)}</select></label>
      <label>{t('Replay speed')}<select value={speed} onChange={event => setSpeed(Number(event.target.value))}>{[0.5, 0.75, 1].map(value => <option value={value} key={value}>{value * 100}%</option>)}</select></label>
    </fieldset>
    <div className={styles.replayLanes}>
      {!take.demo && <div><strong>{t(referenceLabel)}</strong><div className={styles.replayLane} role="img" aria-label={t('Reference phrase: {count} hits', { count: partner.length })}>{partner.slice(0, 256).map((hit, i) => <span key={i} style={{ left: `${Math.min(99, hit.atMs / duration * 100)}%` }} aria-hidden="true" />)}</div></div>}
      <div><strong>{t(take.demo ? 'Demonstration' : 'Your response')}</strong><div className={styles.replayLane} role="img" aria-label={t('Response phrase: {count} hits', { count: response.length })}>{response.slice(0, 256).map((hit, i) => <span key={i} style={{ left: `${Math.min(99, hit.atMs / duration * 100)}%` }} aria-hidden="true" />)}</div></div>
    </div>
    <div className={styles.transport}>
      {!take.demo && <button className="button-secondary" disabled={playing || disabled} onClick={() => void handlePlay('partner')}>{t(take.settings.mode === 'guided' ? 'Play example' : 'Play partner')}</button>}
      <button className="button-secondary" disabled={playing || disabled || !response.length} onClick={() => void handlePlay('response')}>{t(take.demo ? 'Play demonstration' : 'Play response')}</button>
      {!take.demo && <button className="button-secondary" disabled={playing || disabled || !response.length} onClick={() => void handlePlay('compare')}>{t('Compare phrases')}</button>}
      {playing && <button className="button-secondary" onClick={() => { stop(); setPlaying(false); setPart(''); setStatus(t('Replay stopped.')); }}>{t('Stop replay')}</button>}
    </div><p role="status">{playing ? `${part} · ${status}` : status}</p>
    {!take.demo && <div className={styles.settings}><label>{t('Take name')}<input maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><button className="button-secondary" disabled={disabled || saved || !name.trim() || !take.hits.length || take.hits.length > 10000} onClick={() => onSave(name.trim())}>{t(saved ? 'Take saved' : 'Save this take')}</button></div>}
  </section>;
}
