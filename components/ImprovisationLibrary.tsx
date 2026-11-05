"use client";

import { useRef, useState } from 'react';
import { comparableImprovisationSessions, PROMPT_LABELS, type ImprovisationSettings, type ImprovisationSummary, type ImprovisationTake, type ImprovisationWorkspace } from '@/lib/improvisation';
import { decodeResponseMidi, parseImprovisationResponsePack, type ImprovisationResponsePack } from '@/lib/improvisation-response-pack';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';

type Props = { history: ImprovisationSummary[]; takes: ImprovisationTake[]; workspace: ImprovisationWorkspace; settings: ImprovisationSettings; disabled: boolean; onWorkspace: (workspace: ImprovisationWorkspace) => void; onLoad: (settings: ImprovisationSettings) => void; onReview: (take: ImprovisationTake) => void; onDeleteTake: (id: string) => void; onDeleteSession: (id: string) => void; onUpdate: (summary: ImprovisationSummary) => void };
export function ImprovisationLibrary({ history, takes, workspace, settings, disabled, onWorkspace, onLoad, onReview, onDeleteTake, onDeleteSession, onUpdate }: Props) {
  const { t, formatDate } = useLocalization();
  const [name, setName] = useState(''), [referenceId, setReferenceId] = useState('');
  const [sharedPack, setSharedPack] = useState<ImprovisationResponsePack | null>(null), [packMessage, setPackMessage] = useState('');
  const responseFile = useRef<HTMLInputElement>(null);
  const reference = history.find(s => s.id === referenceId) ?? history.at(-1);
  const comparable = reference ? comparableImprovisationSessions(history, reference).slice(-10) : [];
  const timingPoints = comparable.map((item, index) => ({ item, x: comparable.length === 1 ? 260 : 28 + index * 464 / (comparable.length - 1), y: item.timingDistanceMs === null ? null : 118 - Math.min(125, item.timingDistanceMs) / 125 * 96 }));
  const timingSegments = timingPoints.slice(1).flatMap((point, index) => {
    const previous = timingPoints[index]; return point.y === null || previous.y === null ? [] : [`${previous.x},${previous.y} ${point.x},${point.y}`];
  });
  const backbeatBars = comparable.map((item, index) => ({ item, x: 26 + index * (468 / comparable.length), height: item.backbeatTargets ? item.backbeats / item.backbeatTargets * 88 : null }));
  const importResponsePack = async (file?: File) => {
    if (!file) return;
    if (file.size > 2_000_000) { setPackMessage(t('This response pack is too large.')); return; }
    try { setSharedPack(parseImprovisationResponsePack(await file.text())); setPackMessage(t('Response pack loaded for review. It has not been added to your history.')); }
    catch (error) { setPackMessage(t(error instanceof Error ? error.message : 'Could not open this response pack.')); }
    if (responseFile.current) responseFile.current.value = '';
  };
  const downloadSharedMidi = () => {
    if (!sharedPack) return;
    try {
      const bytes = decodeResponseMidi(sharedPack.midiBase64), url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'audio/midi' })), link = document.createElement('a');
      link.href = url; link.download = `${sharedPack.take.name.replace(/[^a-z0-9-_]+/gi, '-') || 'shared-response'}.mid`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setPackMessage(t(error instanceof Error ? error.message : 'Could not download the MIDI file.')); }
  };
  return <>
    <section className="card" aria-label={t('Saved improvisation presets')}><h2>{t('Your practice setups')}</h2>
      <div className={styles.settings}><label>{t('Preset name')}<input value={name} maxLength={80} onChange={event => setName(event.target.value)} /></label><button className="button-secondary" disabled={disabled || !name.trim() || workspace.presets.length >= 12} onClick={() => { onWorkspace({ ...workspace, presets: [...workspace.presets, { id: crypto.randomUUID(), name: name.trim(), settings: { ...settings } }] }); setName(''); }}>{t('Save practice preset')}</button></div>
      <p>{t('Save up to 12 named setups on this learner profile.')}</p><ul className={styles.history}>{workspace.presets.map(preset => <li key={preset.id}><strong>{preset.name}</strong> · {preset.settings.bpm} BPM<div className={styles.transport}><button className="button-secondary" disabled={disabled} onClick={() => onLoad(preset.settings)}>{t('Load preset {name}', { name: preset.name })}</button><button className="button-secondary" onClick={() => onWorkspace({ ...workspace, presets: workspace.presets.filter(p => p.id !== preset.id) })}>{t('Delete preset {name}', { name: preset.name })}</button></div></li>)}</ul>
    </section>
    <section className="card" aria-label={t('Saved improvisation takes')}><h2>{t('Saved phrase takes')}</h2><p>{t('Only takes you choose to save retain drum events. Up to 12 takes and 50,000 hits are included in full backups. MIDI export is available in replay. No microphone audio is stored.')}</p>
      <ul className={styles.history}>{takes.map(take => <li key={take.id}><strong>{take.name}</strong> · {formatDate(new Date(take.createdAt))}<div className={styles.transport}><button className="button-secondary" disabled={disabled} onClick={() => onReview(take)}>{t('Review take {name}', { name: take.name })}</button><button className="button-secondary" onClick={() => onDeleteTake(take.id)}>{t('Delete take {name}', { name: take.name })}</button></div></li>)}</ul>
    </section>
    <section className="card" aria-label={t('Shareable response packs')}><h2>{t('Share a response with a teacher')}</h2><p>{t('Export from a session recap to include its assignment, written reflections, MIDI drum take, and objective feedback. Imported packs are reviewed locally and never added to your session history automatically.')}</p>
      <div className={styles.transport}><button className="button-secondary" disabled={disabled} onClick={() => responseFile.current?.click()}>{t('Import response pack')}</button><input ref={responseFile} type="file" accept="application/json,.json" aria-label={t('Choose a Drum Hero response pack')} onChange={event => void importResponsePack(event.currentTarget.files?.[0])} hidden /></div>
      <p role="status">{packMessage}</p>
      {sharedPack && <article className={styles.sharedPack}><h3>{sharedPack.assignment?.name ?? t('Shared improvisation response')}</h3><p>{formatDate(new Date(sharedPack.summary.playedAt), true)} · {sharedPack.summary.settings.mode} · {sharedPack.summary.settings.meter} · {sharedPack.summary.settings.bpm} BPM · {t(sharedPack.summary.settings.style)}</p>
        {sharedPack.assignment?.steps.map(step => <p key={step.id}>{step.name} · {step.settings.bpm} BPM · {step.settings.bars} {t('bars')}</p>)}
        {sharedPack.summary.settings.intention && <p><strong>{t('Intention')}:</strong> {sharedPack.summary.settings.intention}</p>}
        {sharedPack.summary.phrases.map(phrase => <p key={phrase.phrase}>{t('Phrase {phrase}', { phrase: phrase.phrase + 1 })} · {t(PROMPT_LABELS[phrase.prompt])} · {phrase.timingDistanceMs === null ? t('No timing evidence') : `${phrase.timingDistanceMs} ms`}{phrase.challenge ? ` · ${phrase.challenge.matched}/${phrase.challenge.total}` : ''}{phrase.reflection ? ` · ${phrase.reflection}` : ''}</p>)}
        {sharedPack.summary.notes && <p>{sharedPack.summary.notes}</p>}
        <div className={styles.transport}><button className="button-secondary" onClick={() => onReview(sharedPack.take)}>{t('Replay shared response')}</button><button className="button-secondary" onClick={downloadSharedMidi}>{t('Download shared MIDI file')}</button><button className="button-secondary" onClick={() => { setSharedPack(null); setPackMessage(''); }}>{t('Close response pack')}</button></div>
      </article>}
    </section>
    <section className="card" aria-label={t('Improvisation progress trends')}><h2>{t('See your development')}</h2><p>{t('Compare sessions with the same style, phrase length, prompt, response exercise, difficulty, entry rule, input setup, and tempo within 5 BPM. Older scoring versions and unscored practice remain separate.')}</p>
      {history.length > 0 && <label className={styles.rating}>{t('Compare with session')}<select value={reference?.id ?? ''} onChange={event => setReferenceId(event.target.value)}>{[...history].reverse().map(item => <option key={item.id} value={item.id}>{formatDate(new Date(item.playedAt), true)} · {item.settings.bpm} BPM · {item.settings.style}</option>)}</select></label>}
      {comparable.length < 2 ? <p>{t('Complete two comparable scored sessions to see a trend.')}</p> : <>
        <div className={styles.trendCharts}>
          <figure className={styles.trendChart}><figcaption>{t('Timing distance · lower is steadier')}</figcaption><svg viewBox="0 0 520 150" role="img" aria-label={t('Mean timing distance by comparable session. Missing timing evidence is left blank.')}>
            <path d="M28 22V118H492" fill="none" stroke="currentColor" strokeWidth="1" />
            <text x="2" y="25">125</text><text x="12" y="120">0 ms</text>
            {timingSegments.map((points, index) => <polyline key={index} points={points} fill="none" stroke="var(--coral-dark)" strokeWidth="3" />)}
            {timingPoints.map((point, index) => point.y === null ? <text key={point.item.id} x={point.x - 4} y="140" aria-label={t('Session {step}: no timing evidence', { step: index + 1 })}>—</text> : <circle key={point.item.id} cx={point.x} cy={point.y} r="5" fill="var(--coral-dark)"><title>{`${formatDate(new Date(point.item.playedAt), true)} · ${point.item.timingDistanceMs} ms`}</title></circle>)}
          </svg><p>{t('The chart caps its vertical scale at 125 ms. The table below keeps exact values.')}</p></figure>
          <figure className={styles.trendChart}><figcaption>{t('Backbeat coverage')}</figcaption><svg viewBox="0 0 520 150" role="img" aria-label={t('Matched backbeat targets by comparable session')}>
            <path d="M18 112H502" fill="none" stroke="currentColor" strokeWidth="1" />
            {backbeatBars.map((bar, index) => bar.height === null ? <text key={bar.item.id} x={bar.x + 10} y="132">—</text> : <g key={bar.item.id}><rect x={bar.x + 4} y={112 - bar.height} width={Math.max(12, 420 / comparable.length - 12)} height={bar.height} rx="3" fill="var(--coral-dark)"><title>{`${formatDate(new Date(bar.item.playedAt), true)} · ${bar.item.backbeats}/${bar.item.backbeatTargets}`}</title></rect><text x={bar.x + 8} y="132">{index + 1}</text></g>)}
          </svg><p>{t('Sessions without backbeat targets are left blank. The table below shows each exact result.')}</p></figure>
        </div>
        <div className={styles.tableScroll}><table><caption>{t('Comparable improvisation sessions')}</caption><thead><tr><th scope="col">{t('Date')}</th><th scope="col">{t('Tempo')}</th><th scope="col">{t('Mean timing distance')}</th><th scope="col">{t('Backbeats')}</th><th scope="col">{t('Rest violations')}</th></tr></thead><tbody>{comparable.map(item => <tr key={item.id}><th scope="row">{formatDate(new Date(item.playedAt))}</th><td>{item.bpm}</td><td>{item.timingDistanceMs === null ? t('No timing evidence') : `${item.timingDistanceMs} ms`}</td><td>{item.backbeatTargets ? `${item.backbeats}/${item.backbeatTargets}` : '—'}</td><td>{reference?.settings.prompt === 'space' ? item.restViolations : '—'}</td></tr>)}</tbody></table></div>
      </>}
    </section>
    <section className="card"><h2>{t('Improvisation history')}</h2><p>{t('{count} saved sessions on this learner profile', { count: history.length })}</p><p>{t('The latest 50 completed session summaries are included in full backups. Choose a previous setup to practise it again.')}</p>
      <ul className={styles.history}>{[...history].reverse().map(item => <li key={item.id}><details><summary>{formatDate(new Date(item.playedAt), true)} · {t(item.settings.mode === 'trading' ? 'Trading fours' : item.settings.mode === 'duet' ? 'Two-player duet' : 'Guided improvisation')} · {item.settings.bpm} BPM · {item.settings.meter} · {item.phrases.length} {t('phrases')}</summary>
        {item.settings.intention && <p>{t('Intention')}: {item.settings.intention}</p>}
        <p>{t(item.input === 'unscored' ? 'Unscored practice' : 'Musical-constraint feedback')} · {item.settings.bars} {t('bars')} · {t(item.settings.style)}</p>
        {item.input !== 'unscored' && item.phrases.map(phrase => <p key={phrase.phrase}>{phrase.activePlayer ? t('{name} · phrase {phrase}', { name: phrase.activePlayer === 1 ? item.settings.playerOneName : item.settings.playerTwoName, phrase: phrase.phrase + 1 }) : t('Phrase {phrase}', { phrase: phrase.phrase + 1 })}: {t(PROMPT_LABELS[phrase.prompt])} · {phrase.timingDistanceMs === null ? t('No timing evidence') : `${phrase.timingDistanceMs} ms`}{phrase.reflection ? ` · ${phrase.reflection}` : ''}</p>)}
        {item.input === 'unscored' && item.phrases.filter(p => p.reflection).map(phrase => <p key={phrase.phrase}>{t('Phrase {phrase}', { phrase: phrase.phrase + 1 })}: {phrase.reflection}</p>)}
        <label className={styles.rating}>{t('Notes for session {date}', { date: formatDate(new Date(item.playedAt), true) })}<textarea rows={2} maxLength={1000} value={item.notes ?? ''} onChange={event => onUpdate({ ...item, notes: event.target.value })} /></label>
      </details><div className={styles.transport}><button className="button-secondary" disabled={disabled} onClick={() => onLoad(item.settings)}>{t('Reopen session setup')}</button><button className="button-secondary" aria-label={t('Delete session {date}', { date: formatDate(new Date(item.playedAt), true) })} onClick={() => onDeleteSession(item.id)}>{t('Delete session')}</button></div></li>)}</ul>
    </section>
  </>;
}
