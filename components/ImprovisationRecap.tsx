"use client";

import { useState, type RefObject } from 'react';
import { improvisationPhraseSettings, isSwing, phraseAdvice, PROMPT_LABELS, REFLECTION_QUESTIONS, type ImprovisationSummary } from '@/lib/improvisation';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';

export function ImprovisationRecap({ result, headingRef, onUpdate, onRepeat, onExportPack, canExportPack, disabled }: { result: ImprovisationSummary; headingRef: RefObject<HTMLHeadingElement | null>; onUpdate: (result: ImprovisationSummary) => void; onRepeat: (phrase: number, slower: boolean) => void; onExportPack: () => void; canExportPack: boolean; disabled: boolean }) {
  const { t, formatNumber } = useLocalization();
  const [slower, setSlower] = useState(true);
  return <section className="card" aria-label={t('Improvisation recap')}>
    <h2 tabIndex={-1} ref={headingRef}>{t('Your improvisation recap')}</h2>
    <p>{t(result.settings.mode === 'duet' || result.settings.mode === 'ensemble' ? 'Each phrase is shown under the player who took that turn. Creative note choices are not graded.' : 'Creative note choices are not graded. These results stay separate from pattern mastery.')}</p>
    <p>{t('Session meter')}: {result.settings.meter} · {result.settings.bpm} BPM · {t(result.settings.style)}</p>
    {result.settings.intention && <p><strong>{t('Your practice intention')}:</strong> {result.settings.intention}</p>}
    <label className={styles.check}><input type="checkbox" checked={slower} onChange={event => setSlower(event.target.checked)} />{t('Repeat focused phrases at 80% tempo')}</label>
    <div className={styles.results}>{result.phrases.map(phrase => <article className={styles.phrase} key={phrase.phrase}>
      <h3>{phrase.activePlayer ? t('{name} · phrase {phrase}', { name: result.settings.mode === 'ensemble' ? result.settings.ensemblePlayers[phrase.activePlayer - 1]?.name ?? t('Player {number}', { number: phrase.activePlayer }) : phrase.activePlayer === 1 ? result.settings.playerOneName : result.settings.playerTwoName, phrase: formatNumber(phrase.phrase + 1) }) : t('Phrase {phrase}', { phrase: formatNumber(phrase.phrase + 1)})}</h3><p>{t(PROMPT_LABELS[phrase.prompt])} · {(() => { const section = improvisationPhraseSettings(result.settings, phrase.phrase); return `${section.meter} · ${section.bars} ${t('bars')} · ${section.bpm} BPM`; })()}</p>
      <p className={styles.advice}>{t(phraseAdvice(result.settings, phrase, result.input))}</p>
      {result.input === 'unscored' ? <p>{t('Completed · unscored practice')}</p> : <details><summary>{t('Timing and constraint details')}</summary>
        <p>{phrase.timingDistanceMs === null ? t('No timing evidence — try playing a short phrase next time.') : t(isSwing(result.settings) ? 'Mean distance from triplet grid: {distance} ms' : 'Mean distance from sixteenth-note grid: {distance} ms', { distance: formatNumber(phrase.timingDistanceMs) })}</p>
        {result.settings.entry !== 'none' && <p>{phrase.entryOffsetMs === null ? t('Chosen entry was not captured within the beat-1 window.') : t('Entry: {offset} ms after beat 1', { offset: formatNumber(phrase.entryOffsetMs) })}</p>}
        {phrase.challenge && <p>{phrase.challenge.total ? t('Challenge targets: {matched} of {total}', { matched: phrase.challenge.matched, total: phrase.challenge.total }) : t('Free closing phrase — use your reflection to review the motif.')}</p>}
        {phrase.backbeats && <p>{t('Snare backbeats: {matched} of {total}', { matched: formatNumber(phrase.backbeats.matched), total: phrase.backbeats.total })}</p>}
        {phrase.prompt === 'two-voices' && <p>{phrase.voiceCompliance === null ? t('No drum-voice evidence') : t('Kick/snare choices: {percent}%', { percent: formatNumber(phrase.voiceCompliance) })}</p>}
        {phrase.restViolations !== null && <p>{t('Hits during the requested beat-4 rests: {count}', { count: formatNumber(phrase.restViolations) })}</p>}
      </details>}
      <button className="button-secondary" disabled={disabled} onClick={() => onRepeat(phrase.phrase, slower)}>{t('Repeat phrase {phrase}', { phrase: phrase.phrase + 1 })}</button>
      <label className={styles.rating}>{t(result.settings.challenge === 'none' ? REFLECTION_QUESTIONS[phrase.prompt] : result.settings.challenge === 'development' ? 'How did your motif change through repetition, orchestration, variation, and resolution?' : result.settings.challenge === 'echo' ? 'How clearly did you hear and echo the reference rhythm?' : result.settings.challenge === 'ending' ? 'Could you hear the original opening in your changed ending?' : result.settings.challenge === 'cross-3-2' ? 'Did three even notes feel steady against the two-beat pulse?' : result.settings.challenge === 'cross-5-4' ? 'Could you keep five even accents over the four-beat bar?' : 'Was the rhythm recognizable on your chosen answer drum?')}<textarea aria-label={t('Reflection for phrase {phrase}', { phrase: phrase.phrase + 1 })} maxLength={500} rows={2} value={phrase.reflection ?? ''} onChange={event => onUpdate({ ...result, phrases: result.phrases.map(p => p.phrase === phrase.phrase ? { ...p, reflection: event.target.value } : p) })} /></label>
    </article>)}</div>
    <label className={styles.rating}>{t('How did it feel?')}<select value={result.selfRating ?? ''} onChange={event => onUpdate({ ...result, selfRating: (event.target.value || undefined) as ImprovisationSummary['selfRating'] })}><option value="">{t('Optional self-rating')}</option><option value="comfortable">{t('Comfortable')}</option><option value="developing">{t('Developing')}</option><option value="challenging">{t('Challenging')}</option></select></label>
    {result.settings.intention && <p>{t('Compare your reflection with the intention you chose. What would you keep or change next time?')}</p>}
    <label className={styles.rating}>{t('Session notes')}<textarea maxLength={1000} rows={3} value={result.notes ?? ''} onChange={event => onUpdate({ ...result, notes: event.target.value })} /></label>
    <div className={styles.transport}><button className="button-secondary" disabled={disabled || !canExportPack} onClick={onExportPack}>{t('Export shareable response pack')}</button></div>
    {canExportPack && <p>{t('The response pack includes this recap, its written reflections, the practice assignment, drum events, and a MIDI file. It contains no microphone audio.')}</p>}
  </section>;
}
