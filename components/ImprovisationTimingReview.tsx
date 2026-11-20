"use client";

import { backbeatPulseIndices, challengeTargets, improvisationPhraseSettings, improvisationScoreGrid, isSwing, meterParts, nearestTimingPosition, notationFlagCount, phraseDuration, playerPhraseStart, promptForPhrase, stepDuration, timingGridDuration, timingReview, type ImprovisationHit, type ImprovisationSettings } from '@/lib/improvisation';
import type { Instrument } from '@/lib/types';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';
import { DrumStaffNotation, type DrumNotationEvent, type DrumNotationFrame } from './TrainerNotationView';

export function ImprovisationTimingReview({ settings, phrase, hits, sessionHits = [], sessionPhraseCount }: { settings: ImprovisationSettings; phrase: number; hits: ImprovisationHit[]; sessionHits?: ImprovisationHit[]; sessionPhraseCount?: number }) {
  const { t, formatNumber } = useLocalization();
  const phraseSettings = improvisationPhraseSettings(settings, phrase);
  const beatMs = 60000 / phraseSettings.bpm, { numerator, denominator, stepsPerPulse, stepsPerBar } = meterParts(phraseSettings), pulseMs = beatMs * (denominator === 4 ? 1 : 0.5), prompt = promptForPhrase(settings, phrase);
  const targets: Array<{ atMs: number; instrument: Instrument; label: string }> = [];
  if (settings.mode === 'trading' && phraseSettings.challenge !== 'none') targets.push(...challengeTargets(phraseSettings, phrase).map(hit => ({ atMs: hit.step * beatMs / 4, instrument: hit.instrument, label: 'Challenge note' })));
  else {
    if (prompt === 'backbeat') for (let bar = 0; bar < phraseSettings.bars; bar++) for (const beat of backbeatPulseIndices(phraseSettings)) targets.push({ atMs: (bar * numerator + beat) * pulseMs, instrument: 'snare', label: 'Backbeat' });
  }
  if (phraseSettings.entry !== 'none' && !targets.some(target => target.atMs === 0 && target.instrument === phraseSettings.entry)) targets.push({ atMs: 0, instrument: phraseSettings.entry, label: 'Entry' });
  const used = new Set<number>();
  const reviewedTargets = targets.map(target => {
    let best = -1, delta = Infinity;
    hits.forEach((hit, index) => { const distance = Math.abs(hit.atMs - target.atMs); if (!used.has(index) && hit.instrument === target.instrument && distance <= Math.min(125, beatMs / 4) && distance < delta) { best = index; delta = distance; } });
    if (best >= 0) used.add(best);
    return { ...target, matched: best >= 0, hitIndex: best, delta: best >= 0 ? hits[best].atMs - target.atMs : null };
  });
  const reviewed = timingReview(phraseSettings, hits);
  const subdivisionLabel = (atMs: number) => {
    const nearest = nearestTimingPosition(phraseSettings, atMs), withinPulse = ((nearest % pulseMs) + pulseMs) % pulseMs;
    const gridMs = timingGridDuration(phraseSettings), subdivisions = Math.max(1, Math.round(pulseMs / gridMs));
    if (withinPulse < gridMs * 0.35 || pulseMs - withinPulse < gridMs * 0.35) return t('Beat');
    if (isSwing(phraseSettings)) {
      const swingPosition = pulseMs * phraseSettings.swingRatio / 100;
      if (Math.abs(withinPulse - swingPosition) < gridMs * 0.45) return t('Swing offbeat');
      const slot = Math.round(withinPulse / (pulseMs / subdivisions));
      return t(slot <= 1 ? 'Triplet subdivision 1' : 'Triplet subdivision 2');
    }
    const slot = Math.round(withinPulse / (pulseMs / subdivisions));
    if (subdivisions >= 4) return t(slot === 2 ? 'Eighth-note offbeat' : slot <= 1 ? 'Sixteenth subdivision 1' : 'Sixteenth subdivision 2');
    return t('Offbeat subdivision');
  };
  const subdivisionStats = new Map<string, { count: number; signed: number; early: number; on: number; late: number }>();
  reviewed.forEach(hit => {
    const label = subdivisionLabel(hit.atMs), current = subdivisionStats.get(label) ?? { count: 0, signed: 0, early: 0, on: 0, late: 0 };
    current.count++; current.signed += hit.offsetMs;
    if (hit.offsetMs < -10) current.early++; else if (hit.offsetMs > 10) current.late++; else current.on++;
    subdivisionStats.set(label, current);
  });
  const phraseCount = Math.max(phrase + 1, Math.min(sessionPhraseCount ?? (settings.openEnded ? phrase + 1 : settings.phrases), 1000));
  const phraseBuckets: ImprovisationHit[][] = Array.from({ length: phraseCount }, () => []);
  const orderedSessionHits = sessionHits.filter(hit => Number.isFinite(hit.atMs)).slice().sort((a, b) => a.atMs - b.atMs);
  let sessionHitIndex = 0;
  for (let index = 0; index < phraseBuckets.length; index++) {
    const duration = phraseDuration(improvisationPhraseSettings(settings, index)), start = playerPhraseStart(settings, index);
    while (sessionHitIndex < orderedSessionHits.length && orderedSessionHits[sessionHitIndex].atMs < start) sessionHitIndex++;
    while (sessionHitIndex < orderedSessionHits.length && orderedSessionHits[sessionHitIndex].atMs < start + duration) {
      const hit = orderedSessionHits[sessionHitIndex++];
      phraseBuckets[index].push({ ...hit, atMs: hit.atMs - start });
    }
  }
  const phraseTrend = phraseBuckets.map((local, index) => {
    const timing = timingReview(improvisationPhraseSettings(settings, index), local), signed = timing.reduce((sum, hit) => sum + hit.offsetMs, 0);
    return { phrase: index + 1, count: local.length, mean: local.length ? Math.round(signed / local.length) : null, early: timing.filter(hit => hit.offsetMs < -10).length, on: timing.filter(hit => Math.abs(hit.offsetMs) <= 10).length, late: timing.filter(hit => hit.offsetMs > 10).length };
  });
  const totalSteps = phraseSettings.bars * stepsPerBar;
  const grid = improvisationScoreGrid(phraseSettings);
  const targetEvents: DrumNotationEvent[] = reviewedTargets.map(target => { const step = target.atMs / stepDuration(phraseSettings); return { step, instrument: target.instrument, source: 'target', flagCount: notationFlagCount(phraseSettings, step), review: target.matched ? 'matched' : 'missed' }; });
  const hitEvents: DrumNotationEvent[] = hits.map((hit, index) => {
    const matched = reviewedTargets.find(target => target.hitIndex === index);
    const beat = Math.floor(hit.atMs / pulseMs);
    const restViolation = prompt === 'space' && beat % numerator === numerator - 1 || phraseSettings.challenge === 'custom' && phraseSettings.customChallenge.rests.includes(beat);
    const allowedVoices = phraseSettings.challenge === 'custom' ? phraseSettings.customChallenge.allowed : ['kick', 'snare'];
    const voiceViolation = (prompt === 'two-voices' || phraseSettings.challenge === 'custom') && !allowedVoices.includes(hit.instrument);
    const delta = matched?.delta;
    const review = restViolation || voiceViolation ? 'violation' as const : delta === null || delta === undefined ? undefined : Math.abs(delta) <= 10 ? 'matched' as const : delta < 0 ? 'early' as const : 'late' as const;
    const step = hit.atMs / stepDuration(phraseSettings);
    return { step, instrument: hit.instrument, source: 'played', flagCount: notationFlagCount(phraseSettings, step), velocity: hit.velocity, articulation: hit.articulation, review };
  });
  const customRegions = phraseSettings.challenge === 'custom' ? phraseSettings.customChallenge.rests.map(beat => ({ start: beat * stepsPerPulse, end: (beat + 1) * stepsPerPulse, kind: 'rest' as const, label: t('Custom requested rest') })) : [];
  const reviewFrame: DrumNotationFrame = {
    name: t('Prompt feedback · {prompt}', { prompt: t(phraseSettings.challenge === 'custom' ? 'Custom challenge' : prompt === 'free' ? 'Free exploration' : prompt === 'backbeat' ? 'Backbeat' : prompt === 'two-voices' ? 'Two voices' : prompt === 'space' ? 'Leave space' : prompt) }),
    meter: phraseSettings.meter, bars: phraseSettings.bars, stepsPerBar, totalSteps, stepsPerPulse, flagCount: phraseSettings.subdivision === 'sixteenth' ? 2 : 1, grid,
    events: [...targetEvents, ...hitEvents], showRests: true,
    ...(phraseSettings.challenge === 'custom' ? { allowedInstruments: phraseSettings.customChallenge.allowed } : prompt === 'two-voices' ? { allowedInstruments: ['kick', 'snare'] as Instrument[] } : {}),
    ...((prompt === 'space' || customRegions.length > 0) ? { regions: [...(prompt === 'space' ? Array.from({ length: phraseSettings.bars }, (_, bar) => { const start = bar * stepsPerBar + stepsPerBar - stepsPerPulse; return { start, end: start + stepsPerPulse, kind: 'rest' as const, label: t('Requested rest') }; }) : []), ...customRegions] } : {}),
    guidance: [t('Outlined notes are requested targets. Filled notes are your hits. Colors mark timing and prompt feedback.')],
  };
  const location = (atMs: number) => { const beat = atMs / pulseMs; return t('Bar {bar}, beat {beat}', { bar: Math.floor(beat / numerator) + 1, beat: formatNumber(beat % numerator + 1, { maximumFractionDigits: 2 }) }); };
  const velocityHits = hits.filter((hit): hit is ImprovisationHit & { velocity: number } => typeof hit.velocity === 'number' && Number.isFinite(hit.velocity));
  const meanVelocity = velocityHits.length ? Math.round(velocityHits.reduce((sum, hit) => sum + hit.velocity, 0) / velocityHits.length) : null;
  const velocityRange = velocityHits.length ? velocityHits.reduce<[number, number]>((range, hit) => [Math.min(range[0], hit.velocity), Math.max(range[1], hit.velocity)], [127, 1]) : null;
  const barShapes = Array.from({ length: phraseSettings.bars }, (_, bar) => {
    const barHits = hits.filter(hit => Math.floor(hit.atMs / (pulseMs * numerator)) === bar);
    const occupiedPulses = new Set(barHits.map(hit => Math.floor((hit.atMs - bar * pulseMs * numerator) / pulseMs))).size;
    const velocities = barHits.flatMap(hit => typeof hit.velocity === 'number' ? [hit.velocity] : []);
    return { bar: bar + 1, hits: barHits.length, rests: Math.max(0, numerator - occupiedPulses), meanVelocity: velocities.length ? Math.round(velocities.reduce((sum, velocity) => sum + velocity, 0) / velocities.length) : null };
  });
  const silentPulses = barShapes.reduce((sum, bar) => sum + bar.rests, 0);
  const voiceCounts = (['kick', 'snare', 'hihat', 'tom', 'crash'] as const).map(voice => ({ voice, count: hits.filter(hit => hit.instrument === voice).length }));
  return <details><summary>{t('Visual timing review')}</summary>
    <p>{t(isSwing(phraseSettings) ? 'Triplet grid. Signed offsets show early (−) and late (+) notes.' : 'Sixteenth-note grid. Signed offsets show early (−) and late (+) notes.')}</p>
    <DrumStaffNotation frame={reviewFrame} showRhythmStems improvisationControls />
    <p className={styles.reviewLegend}>{t('Score key')}: {t('Green is matched, amber is early or late, red is missed or violates a prompt.')}</p>
    {!hits.length && <p>{t('No timing evidence — no player hits were captured in this phrase.')}</p>}
    <section aria-label={t('Phrase shape')}><h3>{t('Phrase shape')}</h3><p>{t('Descriptive view — not a quality score. Bars show captured hits and pulses with no hit.')}</p><ol>{barShapes.map(bar => <li key={bar.bar}>{t('Bar {bar}', { bar: bar.bar })} · {t('{count} hits', { count: bar.hits })} · {t('{count} quiet beats', { count: bar.rests })}{bar.meanVelocity === null ? '' : ` · ${t('Average MIDI velocity')}: ${bar.meanVelocity}`}</li>)}</ol><p>{t('{quiet} of {total} beats had no captured hit.', { quiet: silentPulses, total: phraseSettings.bars * numerator })}</p><p>{t('Voice use')}: {voiceCounts.map(({ voice, count }) => `${t(voice)} ${count}`).join(' · ')}</p>{hits.length > 0 && !velocityHits.length && <p>{t('No MIDI velocity data is available for this phrase.')}</p>}</section>
    {hits.length > 0 && <section><h3>{t('Timing by subdivision')}</h3><p>{t('Signed mean offsets describe when your hits tend to land. Early is before the nearest grid point; late is after it.')}</p><div className={styles.tableScroll}><table><caption>{t('Timing by subdivision')}</caption><thead><tr><th scope="col">{t('Subdivision')}</th><th scope="col">{t('Hits')}</th><th scope="col">{t('Mean offset')}</th><th scope="col">{t('Early')}</th><th scope="col">{t('On grid')}</th><th scope="col">{t('Late')}</th></tr></thead><tbody>{[...subdivisionStats].map(([label, stat]) => <tr key={label}><th scope="row">{label}</th><td>{stat.count}</td><td>{stat.signed > 0 ? '+' : ''}{Math.round(stat.signed / stat.count)} ms</td><td>{stat.early}</td><td>{stat.on}</td><td>{stat.late}</td></tr>)}</tbody></table></div></section>}
    {sessionHits.length > 0 && <section><h3>{t('Timing by phrase')}</h3><div className={styles.tableScroll}><table><caption>{t('Timing by phrase')}</caption><thead><tr><th scope="col">{t('Phrase')}</th><th scope="col">{t('Hits')}</th><th scope="col">{t('Mean signed offset')}</th><th scope="col">{t('Early')}</th><th scope="col">{t('On grid')}</th><th scope="col">{t('Late')}</th></tr></thead><tbody>{phraseTrend.map(item => <tr key={item.phrase}><th scope="row">{t('Phrase {phrase}', { phrase: item.phrase })}</th><td>{item.count || '—'}</td><td>{item.mean === null ? t('No timing evidence') : `${item.mean > 0 ? '+' : ''}${item.mean} ms`}</td><td>{item.count ? item.early : '—'}</td><td>{item.count ? item.on : '—'}</td><td>{item.count ? item.late : '—'}</td></tr>)}</tbody></table></div></section>}
    {reviewedTargets.length > 0 && <ul>{reviewedTargets.map((target, i) => <li key={i} className={target.matched ? undefined : styles.missedTarget}>{t(target.label)} · {t(target.instrument)} · {location(target.atMs)} · {t(target.matched ? 'Captured' : 'Missed required target')}</li>)}</ul>}
    {velocityHits.length > 0 && <section aria-label={t('MIDI dynamics review')}><h3>{t('MIDI dynamics')}</h3><p>{t('{count} hits with velocity data · average {average} · range {minimum}–{maximum}', { count: velocityHits.length, average: meanVelocity ?? 0, minimum: velocityRange?.[0] ?? 0, maximum: velocityRange?.[1] ?? 0 })}</p><div className={styles.velocityLane} role="img" aria-label={t('MIDI hit velocity by phrase position')}>
      {velocityHits.slice(0, 256).map((hit, index) => <span key={index} style={{ left: `${Math.min(99, hit.atMs / (phraseSettings.bars * numerator * pulseMs) * 100)}%`, height: `${Math.max(8, hit.velocity / 127 * 100)}%` }} aria-hidden="true" />)}
    </div><p>{t('Tall marks are stronger hits. Use the lane to spot accents, ghost notes, and changes in volume; it is descriptive feedback, not a creativity score.')}</p></section>}
    {hits.length > 0 && <div className={styles.tableScroll}><table><caption>{t('Captured hit timing')}</caption><thead><tr><th scope="col">{t('Drum')}</th><th scope="col">{t('Articulation')}</th><th scope="col">{t('Position')}</th><th scope="col">{t('Grid offset')}</th><th scope="col">{t('Velocity')}</th><th scope="col">{t('Prompt check')}</th></tr></thead><tbody>{reviewed.slice(0, 128).map((hit, i) => { const beat = Math.floor(hit.atMs / pulseMs), rest = prompt === 'space' && beat % numerator === numerator - 1 || phraseSettings.challenge === 'custom' && phraseSettings.customChallenge.rests.includes(beat), allowed = phraseSettings.challenge === 'custom' ? phraseSettings.customChallenge.allowed : ['kick', 'snare']; const restricted = (prompt === 'two-voices' || phraseSettings.challenge === 'custom') && !allowed.includes(hit.instrument); return <tr key={i}><th scope="row">{t(hit.instrument)}</th><td>{hit.articulation ? t(hit.articulation) : '—'}</td><td>{location(hit.atMs)}</td><td>{hit.offsetMs > 0 ? '+' : ''}{hit.offsetMs} ms · {t(hit.offsetMs < 0 ? 'Early' : hit.offsetMs > 0 ? 'Late' : 'On grid')}</td><td>{hit.velocity ?? '—'}</td><td>{t(rest ? 'Requested rest' : restricted ? 'Restricted voice' : 'Allowed note')}</td></tr>; })}</tbody></table>{hits.length > 128 && <p>{t('Showing the first 128 hits. Replay includes the complete phrase.')}</p>}</div>}
  </details>;
}
