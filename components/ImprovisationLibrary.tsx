"use client";

import { useState } from 'react';
import { comparableImprovisationSessions, PROMPT_LABELS, type ImprovisationSettings, type ImprovisationSummary, type ImprovisationTake, type ImprovisationWorkspace } from '@/lib/improvisation';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';

type Props = { history: ImprovisationSummary[]; takes: ImprovisationTake[]; workspace: ImprovisationWorkspace; settings: ImprovisationSettings; disabled: boolean; onWorkspace: (workspace: ImprovisationWorkspace) => void; onLoad: (settings: ImprovisationSettings) => void; onReview: (take: ImprovisationTake) => void; onDeleteTake: (id: string) => void; onDeleteSession: (id: string) => void; onUpdate: (summary: ImprovisationSummary) => void };
export function ImprovisationLibrary({ history, takes, workspace, settings, disabled, onWorkspace, onLoad, onReview, onDeleteTake, onDeleteSession, onUpdate }: Props) {
  const { t, formatDate } = useLocalization();
  const [name, setName] = useState(''), [referenceId, setReferenceId] = useState('');
  const reference = history.find(s => s.id === referenceId) ?? history.at(-1);
  const comparable = reference ? comparableImprovisationSessions(history, reference).slice(-10) : [];
  return <>
    <section className="card" aria-label={t('Saved improvisation presets')}><h2>{t('Your practice setups')}</h2>
      <div className={styles.settings}><label>{t('Preset name')}<input value={name} maxLength={80} onChange={event => setName(event.target.value)} /></label><button className="button-secondary" disabled={disabled || !name.trim() || workspace.presets.length >= 12} onClick={() => { onWorkspace({ ...workspace, presets: [...workspace.presets, { id: crypto.randomUUID(), name: name.trim(), settings: { ...settings } }] }); setName(''); }}>{t('Save practice preset')}</button></div>
      <p>{t('Save up to 12 named setups on this learner profile.')}</p><ul className={styles.history}>{workspace.presets.map(preset => <li key={preset.id}><strong>{preset.name}</strong> · {preset.settings.bpm} BPM<div className={styles.transport}><button className="button-secondary" disabled={disabled} onClick={() => onLoad(preset.settings)}>{t('Load preset {name}', { name: preset.name })}</button><button className="button-secondary" onClick={() => onWorkspace({ ...workspace, presets: workspace.presets.filter(p => p.id !== preset.id) })}>{t('Delete preset {name}', { name: preset.name })}</button></div></li>)}</ul>
    </section>
    <section className="card" aria-label={t('Saved improvisation takes')}><h2>{t('Saved phrase takes')}</h2><p>{t('Only takes you choose to save retain drum events. Up to 12 takes and 50,000 hits are included in full backups. No microphone audio is stored.')}</p>
      <ul className={styles.history}>{takes.map(take => <li key={take.id}><strong>{take.name}</strong> · {formatDate(new Date(take.createdAt))}<div className={styles.transport}><button className="button-secondary" disabled={disabled} onClick={() => onReview(take)}>{t('Review take {name}', { name: take.name })}</button><button className="button-secondary" onClick={() => onDeleteTake(take.id)}>{t('Delete take {name}', { name: take.name })}</button></div></li>)}</ul>
    </section>
    <section className="card" aria-label={t('Improvisation progress trends')}><h2>{t('See your development')}</h2><p>{t('Compare sessions with the same style, phrase length, prompt, response exercise, difficulty, entry rule, input setup, and tempo within 5 BPM. Older scoring versions and unscored practice remain separate.')}</p>
      {history.length > 0 && <label className={styles.rating}>{t('Compare with session')}<select value={reference?.id ?? ''} onChange={event => setReferenceId(event.target.value)}>{[...history].reverse().map(item => <option key={item.id} value={item.id}>{formatDate(new Date(item.playedAt), true)} · {item.settings.bpm} BPM · {item.settings.style}</option>)}</select></label>}
      {comparable.length < 2 ? <p>{t('Complete two comparable scored sessions to see a trend.')}</p> : <div className={styles.tableScroll}><table><caption>{t('Comparable improvisation sessions')}</caption><thead><tr><th scope="col">{t('Date')}</th><th scope="col">{t('Tempo')}</th><th scope="col">{t('Mean timing distance')}</th><th scope="col">{t('Backbeats')}</th><th scope="col">{t('Rest violations')}</th></tr></thead><tbody>{comparable.map(item => <tr key={item.id}><th scope="row">{formatDate(new Date(item.playedAt))}</th><td>{item.bpm}</td><td>{item.timingDistanceMs === null ? t('No timing evidence') : `${item.timingDistanceMs} ms`}</td><td>{item.backbeatTargets ? `${item.backbeats}/${item.backbeatTargets}` : '—'}</td><td>{reference?.settings.prompt === 'space' ? item.restViolations : '—'}</td></tr>)}</tbody></table></div>}
    </section>
    <section className="card"><h2>{t('Improvisation history')}</h2><p>{t('{count} saved sessions on this learner profile', { count: history.length })}</p><p>{t('The latest 50 completed session summaries are included in full backups. Choose a previous setup to practise it again.')}</p>
      <ul className={styles.history}>{[...history].reverse().map(item => <li key={item.id}><details><summary>{formatDate(new Date(item.playedAt), true)} · {t(item.settings.mode === 'trading' ? 'Trading fours' : 'Guided improvisation')} · {item.settings.bpm} BPM · {item.phrases.length} {t('phrases')}</summary>
        <p>{t(item.input === 'unscored' ? 'Unscored practice' : 'Musical-constraint feedback')} · {item.settings.bars} {t('bars')} · {t(item.settings.style)}</p>
        {item.input !== 'unscored' && item.phrases.map(phrase => <p key={phrase.phrase}>{t('Phrase {phrase}', { phrase: phrase.phrase + 1 })}: {t(PROMPT_LABELS[phrase.prompt])} · {phrase.timingDistanceMs === null ? t('No timing evidence') : `${phrase.timingDistanceMs} ms`}{phrase.reflection ? ` · ${phrase.reflection}` : ''}</p>)}
        {item.input === 'unscored' && item.phrases.filter(p => p.reflection).map(phrase => <p key={phrase.phrase}>{t('Phrase {phrase}', { phrase: phrase.phrase + 1 })}: {phrase.reflection}</p>)}
        <label className={styles.rating}>{t('Notes for session {date}', { date: formatDate(new Date(item.playedAt), true) })}<textarea rows={2} maxLength={1000} value={item.notes ?? ''} onChange={event => onUpdate({ ...item, notes: event.target.value })} /></label>
      </details><div className={styles.transport}><button className="button-secondary" disabled={disabled} onClick={() => onLoad(item.settings)}>{t('Reopen session setup')}</button><button className="button-secondary" aria-label={t('Delete session {date}', { date: formatDate(new Date(item.playedAt), true) })} onClick={() => onDeleteSession(item.id)}>{t('Delete session')}</button></div></li>)}</ul>
    </section>
  </>;
}
