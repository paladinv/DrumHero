"use client";
import { useState } from 'react';
import { createCustomGrooveId, readCustomGrooves, writeCustomGrooves } from '@/lib/custom-grooves';
import { createTrainerChallenge, parseTrainerChallenge, type TrainerChallenge } from '@/lib/trainer-challenge';
import type { PracticePattern } from '@/lib/types';
export function TrainerPeerChallenge({ pattern, patterns, bpm, disabled, onAccept }: { pattern: PracticePattern; patterns: PracticePattern[]; bpm: number; disabled: boolean; onAccept: (challenge: TrainerChallenge) => void }) {
  const [goal, setGoal] = useState('Keep a steady pulse with clear accents.'), [attribution, setAttribution] = useState('');
  const [accuracy, setAccuracy] = useState(85), [duration, setDuration] = useState<30 | 60 | 120>(60);
  const [selection, setSelection] = useState<{ patternId: string; ids: string[] }>({ patternId: pattern.id, ids: [pattern.id] });
  const selectedIds = selection.patternId === pattern.id ? selection.ids.filter(id => patterns.some(item => item.id === id)) : [pattern.id];
  const [incoming, setIncoming] = useState<TrainerChallenge | null>(null), [message, setMessage] = useState('');
  const updateSelection = (ids: string[]) => setSelection({ patternId: pattern.id, ids });
  const exportFile = () => {
    try {
      const challengePatterns = selectedIds.flatMap((id) => { const item = patterns.find((pattern) => pattern.id === id); return item ? [item] : []; }).slice(0, 20);
      const challenge = createTrainerChallenge(challengePatterns.length ? challengePatterns : [pattern], { bpm, goal, attribution, targetAccuracy: accuracy, durationSeconds: duration });
      const url = URL.createObjectURL(new Blob([JSON.stringify(challenge, null, 2)], { type: 'application/json' })), link = document.createElement('a');
      link.href = url; link.download = 'drum-hero-peer-challenge.json'; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Challenge exported. Share the file yourself when ready.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Challenge could not be exported.'); }
  };
  const importFile = async (file?: File) => {
    setIncoming(null); if (!file) return;
    try { if (file.size > 200000) throw new Error('Challenge files must be smaller than 200 KB.'); setIncoming(parseTrainerChallenge(await file.text())); setMessage('Review the challenge before adding its pattern.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not import this challenge.'); }
  };
  const accept = () => {
    if (!incoming) return;
    const existing = readCustomGrooves();
    const additions = incoming.patterns.map((item) => ({ ...item, id: createCustomGrooveId() }));
    if (existing.length + additions.length > 100) { setMessage('The custom pattern library is full. Remove patterns before accepting this assignment.'); return; }
    if (!writeCustomGrooves([...existing, ...additions])) { setMessage('The patterns could not be saved. Check local storage.'); return; }
    const challenge = { ...incoming, patterns: additions, pattern: additions[0] };
    onAccept(challenge); setIncoming(null); setMessage(`Accepted ${additions.length} challenge pattern${additions.length === 1 ? '' : 's'}. Their tempo and goal are ready in Trainer.`);
  };
  return <details className="trainer-peer-challenge"><summary>Private peer challenges</summary><p>Export an ordered assignment with up to 20 patterns. Files include patterns, tempo, goal, duration, target accuracy, and attribution; they exclude profile information, scores, recordings, and audio IDs.</p><fieldset disabled={disabled}>
    <label>Challenge goal<textarea maxLength={300} value={goal} onChange={event => setGoal(event.target.value)} /></label>
    <label>Pattern attribution<input maxLength={300} value={attribution} onChange={event => setAttribution(event.target.value)} placeholder="Original pattern by… / source and licence" /></label>
    <details className="trainer-challenge-patterns"><summary>Select patterns · {selectedIds.length || 1} selected</summary><button type="button" className="button-secondary" onClick={() => updateSelection([pattern.id])}>Use current pattern only</button><div>{patterns.map((item) => <label key={item.id}><input type="checkbox" checked={selectedIds.includes(item.id)} disabled={!selectedIds.includes(item.id) && selectedIds.length >= 20} onChange={(event) => updateSelection(event.target.checked ? [...selectedIds, item.id] : selectedIds.filter(id => id !== item.id))} />{item.name}</label>)}</div></details>
    <label>Target accuracy<input type="number" min={50} max={100} value={accuracy} onChange={event => setAccuracy(Number(event.target.value))} /></label>
    <label>Time per pattern<select value={duration} onChange={event => setDuration(Number(event.target.value) as typeof duration)}>{[30, 60, 120].map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label>
    <button type="button" onClick={exportFile} disabled={!goal.trim() || !attribution.trim()}>Export assignment</button>
    <label>Import peer challenge<input type="file" accept=".json,application/json" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
    {incoming && <section><h4>{incoming.title}</h4><p>{incoming.goal}</p><p>{incoming.patterns.length} patterns · {incoming.bpm} BPM · {incoming.durationSeconds} seconds per pattern · {incoming.targetAccuracy}% target</p><ol>{incoming.patterns.map((item) => <li key={item.id}>{item.name} · {item.beats}/{item.subdivision === 12 ? 12 : 4}</li>)}</ol><p>{incoming.attribution}</p><button type="button" onClick={accept}>Accept assignment</button><button type="button" className="button-secondary" onClick={() => setIncoming(null)}>Discard preview</button></section>}
  </fieldset><p role="status">{message}</p></details>;
}
