"use client";

import { backbeatPulseIndices, challengeTargets, isSwing, meterParts, notationFlagCount, promptForPhrase, stepDuration, timingGridDuration, timingReview, type ImprovisationHit, type ImprovisationSettings } from '@/lib/improvisation';
import type { Instrument } from '@/lib/types';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';
import { DrumStaffNotation, type DrumNotationEvent, type DrumNotationFrame } from './TrainerNotationView';

export function ImprovisationTimingReview({ settings, phrase, hits }: { settings: ImprovisationSettings; phrase: number; hits: ImprovisationHit[] }) {
  const { t, formatNumber } = useLocalization();
  const beatMs = 60000 / settings.bpm, { numerator, denominator } = meterParts(settings), pulseMs = beatMs * (denominator === 4 ? 1 : 0.5), prompt = promptForPhrase(settings, phrase);
  const targets: Array<{ atMs: number; instrument: Instrument; label: string }> = [];
  if (settings.mode === 'trading' && settings.challenge !== 'none') targets.push(...challengeTargets(settings, phrase).map(hit => ({ atMs: hit.step * beatMs / 4, instrument: hit.instrument, label: 'Challenge note' })));
  else {
    if (prompt === 'backbeat') for (let bar = 0; bar < settings.bars; bar++) for (const beat of backbeatPulseIndices(settings)) targets.push({ atMs: (bar * numerator + beat) * pulseMs, instrument: 'snare', label: 'Backbeat' });
  }
  if (settings.entry !== 'none' && !targets.some(target => target.atMs === 0 && target.instrument === settings.entry)) targets.push({ atMs: 0, instrument: settings.entry, label: 'Entry' });
  const used = new Set<number>();
  const reviewedTargets = targets.map(target => {
    let best = -1, delta = Infinity;
    hits.forEach((hit, index) => { const distance = Math.abs(hit.atMs - target.atMs); if (!used.has(index) && hit.instrument === target.instrument && distance <= Math.min(125, beatMs / 4) && distance < delta) { best = index; delta = distance; } });
    if (best >= 0) used.add(best);
    return { ...target, matched: best >= 0, hitIndex: best, delta: best >= 0 ? hits[best].atMs - target.atMs : null };
  });
  const reviewed = timingReview(settings, hits);
  const { stepsPerBar, stepsPerPulse } = meterParts(settings), totalSteps = settings.bars * stepsPerBar;
  const gridStep = timingGridDuration(settings) / stepDuration(settings), grid: DrumNotationFrame['grid'] = [];
  for (let step = 0; step < totalSteps - 0.001; step += gridStep) {
    const beat = step / stepsPerPulse, onBeat = Math.abs(beat - Math.round(beat)) < 0.015;
    grid.push({ step, ...(onBeat ? { label: String(Math.round(beat) % numerator + 1), beat: true } : {}) });
  }
  for (let beat = 0; beat < settings.bars * numerator; beat++) {
    const step = beat * stepsPerPulse;
    if (!grid.some(mark => Math.abs(mark.step - step) < 0.015)) grid.push({ step, label: String(beat % numerator + 1), beat: true });
  }
  grid.sort((a, b) => a.step - b.step);
  const targetEvents: DrumNotationEvent[] = reviewedTargets.map(target => { const step = target.atMs / stepDuration(settings); return { step, instrument: target.instrument, source: 'target', flagCount: notationFlagCount(settings, step), review: target.matched ? 'matched' : 'missed' }; });
  const hitEvents: DrumNotationEvent[] = hits.map((hit, index) => {
    const matched = reviewedTargets.find(target => target.hitIndex === index);
    const restViolation = prompt === 'space' && Math.floor(hit.atMs / pulseMs) % numerator === numerator - 1;
    const voiceViolation = prompt === 'two-voices' && !['kick', 'snare'].includes(hit.instrument);
    const delta = matched?.delta;
    const review = restViolation || voiceViolation ? 'violation' as const : delta === null || delta === undefined ? undefined : Math.abs(delta) <= 10 ? 'matched' as const : delta < 0 ? 'early' as const : 'late' as const;
    const step = hit.atMs / stepDuration(settings);
    return { step, instrument: hit.instrument, source: 'played', flagCount: notationFlagCount(settings, step), velocity: hit.velocity, articulation: hit.articulation, review };
  });
  const reviewFrame: DrumNotationFrame = {
    name: t('Prompt feedback · {prompt}', { prompt: t(prompt === 'free' ? 'Free exploration' : prompt === 'backbeat' ? 'Backbeat' : prompt === 'two-voices' ? 'Two voices' : prompt === 'space' ? 'Leave space' : prompt) }),
    meter: settings.meter, bars: settings.bars, stepsPerBar, totalSteps, stepsPerPulse, flagCount: settings.subdivision === 'sixteenth' ? 2 : 1, grid,
    events: [...targetEvents, ...hitEvents],
    ...(prompt === 'two-voices' ? { allowedInstruments: ['kick', 'snare'] as Instrument[] } : {}),
    ...(prompt === 'space' ? { regions: Array.from({ length: settings.bars }, (_, bar) => { const start = bar * stepsPerBar + stepsPerBar - stepsPerPulse; return { start, end: start + stepsPerPulse, kind: 'rest' as const, label: t('Requested rest') }; }) } : {}),
    guidance: [t('Outlined notes are requested targets. Filled notes are your hits. Colors mark timing and prompt feedback.')],
  };
  const location = (atMs: number) => { const beat = atMs / pulseMs; return t('Bar {bar}, beat {beat}', { bar: Math.floor(beat / numerator) + 1, beat: formatNumber(beat % numerator + 1, { maximumFractionDigits: 2 }) }); };
  const velocityHits = hits.filter((hit): hit is ImprovisationHit & { velocity: number } => typeof hit.velocity === 'number' && Number.isFinite(hit.velocity));
  const meanVelocity = velocityHits.length ? Math.round(velocityHits.reduce((sum, hit) => sum + hit.velocity, 0) / velocityHits.length) : null;
  const velocityRange = velocityHits.length ? velocityHits.reduce<[number, number]>((range, hit) => [Math.min(range[0], hit.velocity), Math.max(range[1], hit.velocity)], [127, 1]) : null;
  return <details><summary>{t('Visual timing review')}</summary>
    <p>{t(isSwing(settings) ? 'Triplet grid. Signed offsets show early (−) and late (+) notes.' : 'Sixteenth-note grid. Signed offsets show early (−) and late (+) notes.')}</p>
    <DrumStaffNotation frame={reviewFrame} showRhythmStems />
    <p className={styles.reviewLegend}>{t('Score key')}: {t('Green is matched, amber is early or late, red is missed or violates a prompt.')}</p>
    {!hits.length && <p>{t('No timing evidence — no player hits were captured in this phrase.')}</p>}
    {reviewedTargets.length > 0 && <ul>{reviewedTargets.map((target, i) => <li key={i} className={target.matched ? undefined : styles.missedTarget}>{t(target.label)} · {t(target.instrument)} · {location(target.atMs)} · {t(target.matched ? 'Captured' : 'Missed required target')}</li>)}</ul>}
    {velocityHits.length > 0 && <section aria-label={t('MIDI dynamics review')}><h3>{t('MIDI dynamics')}</h3><p>{t('{count} hits with velocity data · average {average} · range {minimum}–{maximum}', { count: velocityHits.length, average: meanVelocity ?? 0, minimum: velocityRange?.[0] ?? 0, maximum: velocityRange?.[1] ?? 0 })}</p><div className={styles.velocityLane} role="img" aria-label={t('MIDI hit velocity by phrase position')}>
      {velocityHits.slice(0, 256).map((hit, index) => <span key={index} style={{ left: `${Math.min(99, hit.atMs / (settings.bars * numerator * pulseMs) * 100)}%`, height: `${Math.max(8, hit.velocity / 127 * 100)}%` }} aria-hidden="true" />)}
    </div><p>{t('Tall marks are stronger hits. Use the lane to spot accents, ghost notes, and changes in volume; it is descriptive feedback, not a creativity score.')}</p></section>}
    {hits.length > 0 && <div className={styles.tableScroll}><table><caption>{t('Captured hit timing')}</caption><thead><tr><th scope="col">{t('Drum')}</th><th scope="col">{t('Articulation')}</th><th scope="col">{t('Position')}</th><th scope="col">{t('Grid offset')}</th><th scope="col">{t('Velocity')}</th><th scope="col">{t('Prompt check')}</th></tr></thead><tbody>{reviewed.slice(0, 128).map((hit, i) => <tr key={i}><th scope="row">{t(hit.instrument)}</th><td>{hit.articulation ? t(hit.articulation) : '—'}</td><td>{location(hit.atMs)}</td><td>{hit.offsetMs > 0 ? '+' : ''}{hit.offsetMs} ms · {t(hit.offsetMs < 0 ? 'Early' : hit.offsetMs > 0 ? 'Late' : 'On grid')}</td><td>{hit.velocity ?? '—'}</td><td>{t(prompt === 'space' && Math.floor(hit.atMs / pulseMs) % numerator === numerator - 1 ? 'Requested rest' : prompt === 'two-voices' && !['kick', 'snare'].includes(hit.instrument) ? 'Restricted voice' : 'Allowed note')}</td></tr>)}</tbody></table>{hits.length > 128 && <p>{t('Showing the first 128 hits. Replay includes the complete phrase.')}</p>}</div>}
  </details>;
}
