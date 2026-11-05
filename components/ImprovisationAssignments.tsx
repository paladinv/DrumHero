"use client";

import { useRef, useState } from 'react';
import { phraseAdvice, type ImprovisationAssignment, type ImprovisationSettings, type ImprovisationSummary, type ImprovisationWorkspace } from '@/lib/improvisation';
import { createImprovisationPlaylistFile, parseImprovisationPlaylistFile } from '@/lib/improvisation-playlist';
import { useLocalization } from './LocalizationProvider';
import styles from './ImprovisationStudio.module.css';

export function ImprovisationAssignments({ workspace, settings, history, disabled, activeAssignment, onSave, onLoad }: { workspace: ImprovisationWorkspace; settings: ImprovisationSettings; history: ImprovisationSummary[]; disabled: boolean; activeAssignment: { id: string; stepId: string } | null; onSave: (workspace: ImprovisationWorkspace) => void; onLoad: (settings: ImprovisationSettings, assignment: { id: string; stepId: string }) => void }) {
  const { t, formatDate } = useLocalization();
  const [name, setName] = useState(''), [stepName, setStepName] = useState(''), [planName, setPlanName] = useState('Tempo ladder');
  const [steps, setSteps] = useState<ImprovisationAssignment['steps']>([]);
  const [planIncrement, setPlanIncrement] = useState(5), [planLength, setPlanLength] = useState(4), [transferMessage, setTransferMessage] = useState('');
  const playlistFile = useRef<HTMLInputElement>(null);
  const assignments = workspace.assignments ?? [];
  const maxPlanLength = Math.min(8, Math.floor((200 - settings.bpm) / planIncrement) + 1);
  const ladderLength = Math.min(maxPlanLength, Math.max(2, planLength));
  const saveTempoPlan = () => {
    if (assignments.length >= 12 || maxPlanLength < 2) return;
    const plan: ImprovisationAssignment = { id: crypto.randomUUID(), name: planName.trim() || t('Tempo ladder'), steps: Array.from({ length: ladderLength }, (_, index) => {
      const bpm = settings.bpm + index * planIncrement;
      return { id: crypto.randomUUID(), name: t('Step {step} · {tempo} BPM', { step: index + 1, tempo: bpm }), settings: { ...settings, bpm, openEnded: false } };
    }) };
    onSave({ ...workspace, assignments: [...assignments, plan] }); setTransferMessage(t('Tempo ladder saved as a practice playlist.'));
  };
  const exportPlaylist = (assignment: ImprovisationAssignment) => {
    const file = new Blob([createImprovisationPlaylistFile(assignment)], { type: 'application/json' }), url = URL.createObjectURL(file), link = document.createElement('a');
    link.href = url; link.download = `${assignment.name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'improvisation-playlist'}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importPlaylist = async (file?: File) => {
    if (!file) return;
    if (assignments.length >= 12) { setTransferMessage(t('Delete a playlist before importing another.')); return; }
    if (file.size > 1_000_000) { setTransferMessage(t('This playlist file is too large.')); return; }
    try {
      const assignment = parseImprovisationPlaylistFile(await file.text());
      onSave({ ...workspace, assignments: [...assignments, assignment] }); setTransferMessage(t('Imported playlist: {name}.', { name: assignment.name }));
    } catch (error) { setTransferMessage(t(error instanceof Error ? error.message : 'Could not import that playlist.')); }
    if (playlistFile.current) playlistFile.current.value = '';
  };
  return <section id="improvisation-assignments" className="card" aria-label={t('Improvisation assignments')}>
    <h2>{t('Practice playlists')}</h2><p>{t('Build ordered practice sets, create tempo ladders, and move teacher assignments between devices. Playlist completion tracks participation, not musical mastery.')}</p>
    <details><summary>{t('Build a tempo ladder')}</summary><fieldset disabled={disabled || assignments.length >= 12} className={styles.settings}><legend>{t('Progressive tempo plan')}</legend>
      <label>{t('Playlist name')}<input maxLength={80} value={planName} onChange={event => setPlanName(event.target.value)} /></label>
      <label>{t('Increase BPM per step')}<input type="number" min="1" max="20" value={planIncrement} onChange={event => setPlanIncrement(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></label>
      <label>{t('Number of tempo steps')}<select disabled={maxPlanLength < 2} value={ladderLength} onChange={event => setPlanLength(Number(event.target.value))}>{Array.from({ length: Math.max(0, maxPlanLength - 1) }, (_, index) => index + 2).map(count => <option value={count} key={count}>{count}</option>)}</select></label>
      {maxPlanLength < 2 ? <p>{t('Raise the tempo below 200 BPM to make a ladder with at least two steps.')}</p> : <p>{t('Starts at {start} BPM and increases by {step} BPM to {end} BPM. Each step keeps this setup and has a separate recap.', { start: settings.bpm, step: planIncrement, end: settings.bpm + (ladderLength - 1) * planIncrement })}</p>}
      <button className="button-secondary" disabled={assignments.length >= 12 || maxPlanLength < 2} onClick={saveTempoPlan}>{t('Create tempo playlist')}</button>
    </fieldset></details>
    <details><summary>{t('Create a practice assignment')}</summary>
      <fieldset disabled={disabled} className={styles.settings}><legend>{t('Assignment builder')}</legend>
        <label>{t('Assignment name')}<input maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>{t('Step name')}<input maxLength={80} value={stepName} onChange={e => setStepName(e.target.value)} /></label>
        <button className="button-secondary" disabled={!stepName.trim() || steps.length >= 8 || settings.openEnded} onClick={() => { setSteps([...steps, { id: crypto.randomUUID(), name: stepName.trim(), settings: { ...settings } }]); setStepName(''); }}>{t('Append current setup')}</button>
      </fieldset>
      {settings.openEnded && <p>{t('Choose a finite session before appending a step.')}</p>}
      <ol>{steps.map((step, index) => <li key={step.id}>{step.name} · {step.settings.bpm} BPM · {step.settings.style} · {step.settings.bars} {t('bars')}<div className={styles.transport}><button disabled={disabled || index === 0} onClick={() => setSteps(previous => { const next = [...previous]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>{t('Move step {step} up', { step: index + 1 })}</button><button disabled={disabled} onClick={() => setSteps(steps.filter(s => s.id !== step.id))}>{t('Remove step {step}', { step: index + 1 })}</button></div></li>)}</ol>
      <button className="button-secondary" disabled={disabled || !name.trim() || !steps.length || assignments.length >= 12} onClick={() => { onSave({ ...workspace, assignments: [...assignments, { id: crypto.randomUUID(), name: name.trim(), steps }] }); setSteps([]); setName(''); }}>{t('Save assignment')}</button>
    </details>
    <div className={styles.transport}><button className="button-secondary" disabled={disabled || assignments.length >= 12} onClick={() => playlistFile.current?.click()}>{t('Import playlist file')}</button><input ref={playlistFile} type="file" accept="application/json,.json" aria-label={t('Choose an improvisation playlist file')} onChange={event => void importPlaylist(event.currentTarget.files?.[0])} hidden /></div>
    <p role="status">{transferMessage}</p>
    <ul className={styles.history}>{assignments.map(assignment => <li key={assignment.id}><h3>{assignment.name}</h3><div className={styles.transport}><button className="button-secondary" disabled={disabled} onClick={() => exportPlaylist(assignment)}>{t('Export playlist file')}</button><button className="button-secondary" disabled={disabled} onClick={() => onSave({ ...workspace, assignments: assignments.filter(a => a.id !== assignment.id) })}>{t('Delete playlist {name}', { name: assignment.name })}</button></div><ol>{assignment.steps.map((step, index) => {
      const sessions = history.filter(s => s.assignment?.id === assignment.id && s.assignment.stepId === step.id);
      return <li key={step.id}><strong>{step.name}</strong> · {step.settings.bpm} BPM · {step.settings.style} · {step.settings.bars} {t('bars')}
        <p>{t('{count} completed sessions', { count: sessions.length })}</p><button className="button-secondary" disabled={disabled} onClick={() => onLoad(step.settings, { id: assignment.id, stepId: step.id })}>{t('Load playlist step {step}', { step: index + 1 })}</button>
        {activeAssignment?.id === assignment.id && activeAssignment.stepId === step.id && sessions.length > 0 && index < assignment.steps.length - 1 && <button className="button" disabled={disabled} onClick={() => { const next = assignment.steps[index + 1]; onLoad(next.settings, { id: assignment.id, stepId: next.id }); }}>{t('Continue to playlist step {step}', { step: index + 2 })}</button>}
        {sessions.length > 0 && <details><summary>{t('Review step results and reflections')}</summary>{sessions.map(session => <article key={session.id}><p>{formatDate(new Date(session.playedAt), true)} · {t(session.input)} · {t(session.selfRating ?? 'No self-rating')}</p>{session.settings.intention && <p>{t('Intention')}: {session.settings.intention}</p>}{session.phrases.map(phrase => <p key={phrase.phrase}>{t('Phrase {phrase}', { phrase: phrase.phrase + 1 })}: {session.input === 'unscored' ? t('Unscored practice') : phrase.timingDistanceMs === null ? t('No timing evidence') : `${phrase.timingDistanceMs} ms`}{phrase.challenge ? ` · ${phrase.challenge.matched}/${phrase.challenge.total}` : ''}{phrase.reflection ? ` · ${phrase.reflection}` : ''} · {t(phraseAdvice(session.settings, phrase, session.input))}</p>)}{session.notes && <p>{session.notes}</p>}</article>)}</details>}
      </li>;
    })}</ol></li>)}</ul>
  </section>;
}
