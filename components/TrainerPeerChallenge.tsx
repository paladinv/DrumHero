"use client";
import { useState } from 'react';
import { createCustomGrooveId, readCustomGrooves, writeCustomGrooves } from '@/lib/custom-grooves';
import { createTrainerChallenge, parseTrainerChallenge, type TrainerChallenge } from '@/lib/trainer-challenge';
import type { PracticePattern } from '@/lib/types';
export function TrainerPeerChallenge({ pattern, bpm, disabled, onAccept }: { pattern: PracticePattern; bpm: number; disabled: boolean; onAccept: (challenge: TrainerChallenge) => void }) {
  const [goal, setGoal] = useState('Keep a steady pulse with clear accents.'), [attribution, setAttribution] = useState('');
  const [accuracy, setAccuracy] = useState(85), [duration, setDuration] = useState<30 | 60 | 120>(60);
  const [incoming, setIncoming] = useState<TrainerChallenge | null>(null), [message, setMessage] = useState('');
  const exportFile = () => {
    try {
      const challenge = createTrainerChallenge(pattern, { bpm, goal, attribution, targetAccuracy: accuracy, durationSeconds: duration });
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
    if (existing.length >= 100) { setMessage('The custom pattern library is full. Remove a pattern first.'); return; }
    const challenge = { ...incoming, pattern: { ...incoming.pattern, id: createCustomGrooveId() } };
    if (!writeCustomGrooves([...existing, challenge.pattern])) { setMessage('The pattern could not be saved. Check local storage.'); return; }
    onAccept(challenge); setIncoming(null); setMessage('Challenge pattern saved. Its tempo and goal are ready in Trainer. Start when ready.');
  };
  return <details className="trainer-peer-challenge"><summary>Private peer challenges</summary><p>Files contain the pattern, tempo, goal, and attribution. Profile information, scores, recordings, and audio IDs are excluded. Import previews a file before adding its pattern.</p><fieldset disabled={disabled}><label>Challenge goal<textarea maxLength={300} value={goal} onChange={event => setGoal(event.target.value)} /></label><label>Pattern attribution<input maxLength={300} value={attribution} onChange={event => setAttribution(event.target.value)} placeholder="Original pattern by… / source and licence" /></label><label>Target accuracy<input type="number" min={50} max={100} value={accuracy} onChange={event => setAccuracy(Number(event.target.value))} /></label><label>Challenge duration<select value={duration} onChange={event => setDuration(Number(event.target.value) as typeof duration)}>{[30, 60, 120].map(value => <option key={value} value={value}>{value} seconds</option>)}</select></label><button type="button" onClick={exportFile} disabled={!goal.trim() || !attribution.trim()}>Export peer challenge</button><label>Import peer challenge<input type="file" accept=".json,application/json" onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>{incoming && <section><h4>{incoming.title}</h4><p>{incoming.goal}</p><p>{incoming.bpm} BPM · {incoming.durationSeconds} seconds · {incoming.targetAccuracy}% target</p><p>{incoming.attribution}</p><button type="button" onClick={accept}>Accept challenge pattern</button><button type="button" onClick={() => setIncoming(null)}>Discard challenge preview</button></section>}</fieldset><p role="status">{message}</p></details>;
}
