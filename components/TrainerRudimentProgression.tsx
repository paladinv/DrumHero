"use client";

import { useMemo } from "react";
import type { TrainerRound } from "@/lib/trainer";
import type { Groove } from "@/lib/types";

const targetForLevel = (rudiment: Groove) => {
  const target = rudiment.level === "Beginner" ? 70 : rudiment.level === "Intermediate" ? 90 : 110;
  return Math.min(rudiment.tempoRange[1], Math.max(rudiment.defaultBpm, target));
};
const levelOrder: Record<Groove["level"], number> = { Beginner: 0, Intermediate: 1, Advanced: 2 };

export function TrainerRudimentProgression({ rudiments, rounds, selectedId, disabled, onSelect }: {
  rudiments: Groove[];
  rounds: TrainerRound[];
  selectedId: string;
  disabled: boolean;
  onSelect: (patternId: string, bpm: number) => void;
}) {
  const orderedRudiments = useMemo(() => rudiments.map((rudiment, index) => ({ rudiment, index }))
    .sort((a, b) => levelOrder[a.rudiment.level] - levelOrder[b.rudiment.level] || a.index - b.index)
    .map(item => item.rudiment), [rudiments]);
  const progress = useMemo(() => orderedRudiments.map(rudiment => {
    const attempts = rounds.filter(round => round.patternId === rudiment.id && round.mode === "scored" && round.result)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
    const successful = attempts.filter(round => {
      if ((round.result?.accuracy ?? 0) < 85) return false;
      if (!round.rudimentHandCheck) return true;
      const handHits = (round.hits ?? []).filter(hit => hit.handTarget);
      return handHits.length > 0 && handHits.filter(hit => hit.handTarget === hit.handPlayed).length / handHits.length >= 0.8;
    });
    const bestTempo = successful.reduce((best, round) => Math.max(best, round.bpm), 0);
    const targetBpm = targetForLevel(rudiment);
    return { rudiment, attempts, bestTempo, targetBpm, mastered: bestTempo >= targetBpm };
  }), [orderedRudiments, rounds]);
  const next = progress.find(item => !item.mastered);
  const completed = progress.filter(item => item.mastered).length;
  const current = progress.find(item => item.rudiment.id === selectedId);
  const lastHandRound = rounds.find(round => round.patternId === selectedId && round.rudimentHandCheck);
  const checkedHands = (lastHandRound?.hits ?? []).filter(hit => hit.handTarget);
  const handAccuracy = checkedHands.length ? Math.round(checkedHands.filter(hit => hit.handTarget === hit.handPlayed).length / checkedHands.length * 100) : null;

  return <details className="trainer-rudiment-progression">
    <summary>Rudiment progression · {completed}/{progress.length} tempo goals</summary>
    <p>Build each rudiment at 85% accuracy or better. Goals are 70 BPM for beginner, 90 BPM for intermediate, and 110 BPM for advanced exercises. When keyboard hand check is enabled, aim for at least 80% correct hands as well.</p>
    {current && <p className="trainer-rudiment-current"><strong>{current.rudiment.name}</strong> · best qualifying tempo {current.bestTempo ? `${current.bestTempo} BPM` : "not yet recorded"} · next goal {current.targetBpm} BPM{handAccuracy === null ? "" : ` · last hand check ${handAccuracy}%`}</p>}
    {next ? <div className="trainer-rudiment-next"><span>Next exercise</span><strong>{next.rudiment.name}</strong><small>{next.rudiment.level} · goal {next.targetBpm} BPM{next.bestTempo ? ` · best ${next.bestTempo} BPM` : " · start at a comfortable tempo"}</small><button type="button" className="button-secondary" disabled={disabled} onClick={() => onSelect(next.rudiment.id, next.bestTempo ? Math.min(next.targetBpm, next.bestTempo + 2) : next.rudiment.defaultBpm)}>Set up next rudiment</button></div> : <p role="status">All rudiment tempo goals are met. Keep your hands balanced by using both lead-hand settings.</p>}
    <ol className="trainer-rudiment-steps">{progress.map(item => <li key={item.rudiment.id} className={item.mastered ? "is-mastered" : item.rudiment.id === selectedId ? "is-current" : ""}><span>{item.mastered ? "✓" : item.bestTempo ? "↗" : "○"}</span><div><strong>{item.rudiment.name}</strong><small>{item.rudiment.level} · {item.mastered ? `goal met at ${item.bestTempo} BPM` : `${item.bestTempo ? `best ${item.bestTempo} BPM · ` : ""}goal ${item.targetBpm} BPM`}</small></div></li>)}</ol>
  </details>;
}
