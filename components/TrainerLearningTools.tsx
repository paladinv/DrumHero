"use client";

import { useEffect, useMemo, useState } from "react";
import { learnerStorageKey } from "@/lib/learner-profiles";
import { createRetentionRoutine, groupGrooveFamilies, recommendUnfamiliarTransferPattern } from "@/lib/trainer-next";
import type { TrainerRound } from "@/lib/trainer";
import type { PracticePattern } from "@/lib/types";
import type { TrainerRoutineStep } from "@/lib/trainer-enhancements";
import { TrainerNotationView } from "@/components/TrainerNotationView";

type Goal = { bpm: number; accuracy: number; passes: number };
type GoalMap = Record<string, Goal>;
type NoteMap = Record<string, string>;
const DEFAULT_GOAL = (pattern: PracticePattern): Goal => ({ bpm: pattern.defaultBpm, accuracy: 85, passes: 3 });

function parseGoalMap(raw: string | null): GoalMap {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([id, item]) => {
      if (!id || !item || typeof item !== "object") return [];
      const goal = item as Partial<Goal>;
      if (!Number.isInteger(goal.bpm) || goal.bpm! < 40 || goal.bpm! > 220 || ![70, 75, 80, 85, 90, 95, 100].includes(Number(goal.accuracy)) || !Number.isInteger(goal.passes) || goal.passes! < 1 || goal.passes! > 10) return [];
      return [[id, { bpm: goal.bpm!, accuracy: goal.accuracy!, passes: goal.passes! }]];
    }));
  } catch { return {}; }
}

function goalAccuracy(round: TrainerRound) {
  if (round.result) return round.result.accuracy;
  return round.ratings.length ? Math.round(round.ratings.filter(item => item === "clean").length / round.ratings.length * 100) : 0;
}

function goalStreak(rounds: TrainerRound[], patternId: string, goal: Goal) {
  let count = 0;
  const matching = rounds.filter(round => round.patternId === patternId && !round.inputClipped && !round.uncertainDetections && !round.focusedDrill && !round.learningMode && (!round.adaptation || round.adaptation === "standard"))
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  for (const round of matching) {
    if (round.bpm >= goal.bpm && goalAccuracy(round) >= goal.accuracy) count += 1;
    else break;
  }
  return count;
}

export function TrainerLearningTools({ rounds, pattern, patterns, profileId, disabled, onSelectPattern, onUseGoalTempo, onStartRetention, onStartTransfer }: {
  rounds: TrainerRound[];
  pattern: PracticePattern;
  patterns: PracticePattern[];
  profileId: string;
  disabled: boolean;
  onSelectPattern: (id: string) => void;
  onUseGoalTempo: (bpm: number) => void;
  onStartRetention: (steps: TrainerRoutineStep[]) => void;
  onStartTransfer: (pattern: PracticePattern) => void;
}) {
  const goalKey = learnerStorageKey("drum-hero:trainer-goals:v1", profileId);
  const noteKey = learnerStorageKey("drum-hero:trainer-pattern-notes:v1", profileId);
  const [goals, setGoals] = useState<GoalMap>({});
  const [notes, setNotes] = useState<NoteMap>({});
  const [loadedStorageKey, setLoadedStorageKey] = useState("");
  const [storageMessage, setStorageMessage] = useState("");
  const storageReady = loadedStorageKey === `${goalKey}|${noteKey}`;
  const storedGoal = storageReady ? goals[pattern.id] : undefined;
  const goal = {
    bpm: Math.max(pattern.tempoRange[0], Math.min(pattern.tempoRange[1], storedGoal?.bpm ?? pattern.defaultBpm)),
    accuracy: storedGoal?.accuracy ?? 85,
    passes: storedGoal?.passes ?? 3
  };
  const note = storageReady ? notes[pattern.id] ?? "" : "";
  const families = useMemo(() => groupGrooveFamilies(patterns), [patterns]);
  const retentionSteps = useMemo(() => createRetentionRoutine(rounds, patterns), [patterns, rounds]);
  const transferCandidate = useMemo(() => recommendUnfamiliarTransferPattern(pattern, patterns, rounds), [pattern, patterns, rounds]);
  const transferAttempts = rounds.filter(round => round.transferFromPatternId === pattern.id && round.mode === "scored" && round.result && !round.inputClipped && !round.uncertainDetections);
  const passed = goalStreak(rounds, pattern.id, goal);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const rawGoals = localStorage.getItem(goalKey);
        const rawNotes = localStorage.getItem(noteKey);
        setGoals(parseGoalMap(rawGoals));
        const parsedNotes: unknown = JSON.parse(rawNotes ?? "{}");
        setNotes(parsedNotes && typeof parsedNotes === "object" && !Array.isArray(parsedNotes)
          ? Object.fromEntries(Object.entries(parsedNotes).filter((entry): entry is [string, string] => typeof entry[1] === "string").slice(0, 500))
          : {});
      } catch { setGoals({}); setNotes({}); setStorageMessage("Trainer goals or notes could not be loaded from this device."); }
      setLoadedStorageKey(`${goalKey}|${noteKey}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [goalKey, noteKey]);

  const updateGoal = (patch: Partial<Goal>) => {
    const nextGoal = { ...goal, ...patch };
    const next = { ...goals, [pattern.id]: nextGoal };
    setGoals(next);
    try { localStorage.setItem(goalKey, JSON.stringify(next)); setStorageMessage(""); }
    catch { setStorageMessage("Goal settings could not be saved; they remain available for this visit."); }
  };
  const updateNote = (value: string) => {
    const next = { ...notes, [pattern.id]: value.slice(0, 1200) };
    setNotes(next);
    try { localStorage.setItem(noteKey, JSON.stringify(next)); setStorageMessage(""); }
    catch { setStorageMessage("Pattern notes could not be saved; they remain available for this visit."); }
  };

  return <div className="trainer-learning-tools">
    <details className="trainer-practice-goal" open>
      <summary>Practice goal · {passed >= goal.passes ? "complete" : `${Math.min(passed, goal.passes)}/${goal.passes} passes`}</summary>
      <p>Set a measurable target for {pattern.name}. A pass is a completed, reliable round at or above the target tempo and accuracy.</p>
      <div className="trainer-goal-fields">
        <label>Target BPM<input type="number" min={pattern.tempoRange[0]} max={pattern.tempoRange[1]} value={Math.min(pattern.tempoRange[1], Math.max(pattern.tempoRange[0], goal.bpm))} disabled={disabled || !storageReady} onChange={event => updateGoal({ bpm: Math.max(pattern.tempoRange[0], Math.min(pattern.tempoRange[1], Number(event.target.value) || pattern.tempoRange[0])) })} /></label>
        <label>Accuracy target<select value={goal.accuracy} disabled={disabled || !storageReady} onChange={event => updateGoal({ accuracy: Number(event.target.value) })}>{[70, 75, 80, 85, 90, 95, 100].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
        <label>Clean passes needed<select value={goal.passes} disabled={disabled || !storageReady} onChange={event => updateGoal({ passes: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 8, 10].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <progress max={goal.passes} value={Math.min(goal.passes, passed)} aria-label={`${passed} of ${goal.passes} target rounds completed`} />
      <p role="status">{passed >= goal.passes ? `Goal reached: ${goal.passes} qualifying rounds at ${goal.bpm}+ BPM and ${goal.accuracy}%+ accuracy.` : `${passed} consecutive qualifying round${passed === 1 ? "" : "s"} at ${goal.bpm}+ BPM and ${goal.accuracy}%+ accuracy.`}</p>
      <button type="button" disabled={disabled} onClick={() => onUseGoalTempo(Math.max(pattern.tempoRange[0], Math.min(pattern.tempoRange[1], goal.bpm)))}>Set Trainer to goal tempo</button>
    </details>

    <details className="trainer-pattern-notes">
      <summary>Pattern notes</summary>
      <label>Private practice notes for {pattern.name}<textarea rows={3} maxLength={1200} value={note} disabled={!storageReady} onChange={event => updateNote(event.target.value)} placeholder="What improved? What should you listen for next time?" /></label>
      <small>{note.length}/1200 characters · saved on this device for the active learner profile.</small>
    </details>

    <details className="trainer-groove-families">
      <summary>Groove families · style and progression</summary>
      <p>Choose a groove by style, then follow its beginner to advanced progression. Your own groove families appear here too.</p>
      {families.map(family => <section key={family.style}><h4>{family.style}</h4>{(["Beginner", "Intermediate", "Advanced"] as const).map(level => {
        const items = family.grooves.filter(item => item.level === level);
        return items.length ? <div className="trainer-family-level" key={level}><strong>{level}</strong><div>{items.map(item => <button type="button" key={item.id} disabled={disabled} aria-current={pattern.id === item.id ? "true" : undefined} onClick={() => onSelectPattern(item.id)}>{item.name}</button>)}</div></div> : null;
      })}</section>)}
    </details>

    <details className="trainer-retention-remix">
      <summary>Retention remix · grooves and fills</summary>
      <p>Revisit grooves you have played reliably, start near your recent successful tempo, and add a compatible fill that has fewer or weaker results. Groove and fill steps alternate.</p>
      {retentionSteps.length ? <><small>{retentionSteps.length} steps ready · 8 repetitions each · lower-confidence fills are paired where available.</small><button type="button" disabled={disabled} onClick={() => onStartRetention(retentionSteps)}>Start retention remix</button></> : <p>Complete two reliable rounds on at least one groove to build a personalized retention session.</p>}
    </details>

    <details className="trainer-transfer-check">
      <summary>Unfamiliar pattern transfer{transferAttempts.length ? ` · ${transferAttempts.length} scored checks` : ""}</summary>
      {transferCandidate ? <>
        <p>Try a pattern you have not scored before that shares a style, meter, subdivision, or fill role with <strong>{pattern.name}</strong>. This checks whether the skill carries to new notes rather than repeating a memorized chart.</p>
        <TrainerNotationView pattern={transferCandidate} compact />
        <p><strong>{transferCandidate.name}</strong> · {transferCandidate.level} · {"meter" in transferCandidate && transferCandidate.meter ? String(transferCandidate.meter) : `${transferCandidate.beats}/4`} · {transferCandidate.defaultBpm} BPM</p>
        <button type="button" disabled={disabled} onClick={() => onStartTransfer(transferCandidate)}>Set up scored transfer check</button>
      </> : <p>No unplayed related pattern is available in this library. Add a groove or fill you have not practised yet to try a transfer check.</p>}
      {transferAttempts.length > 0 && <p role="status">Your latest reliable transfer score was {transferAttempts[0]?.result?.accuracy}% on a new pattern.</p>}
    </details>
    {storageMessage && <p role="status">{storageMessage}</p>}
  </div>;
}
