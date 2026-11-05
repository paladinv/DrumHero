"use client";

import type { TrainerRound } from "@/lib/trainer";

const TAGS = [
  ["warm-up", "Warm-up"],
  ["focused", "Focused practice"],
  ["teacher", "With a teacher"],
  ["recording-review", "Recording review"],
  ["rough-session", "Tough session"],
] as const;

export function TrainerRoundJournal({ rounds, onUpdate }: { rounds: TrainerRound[]; onUpdate: (roundId: string, notes: string, tags: TrainerRound["tags"]) => void }) {
  if (!rounds.length) return <p>Complete a round to start a practice journal.</p>;
  return <details className="trainer-round-journal">
    <summary>Practice notes and tags</summary>
    <p>Notes stay with each round in this learner profile and are included in the Trainer backup.</p>
    <ol>{rounds.slice(0, 8).map((round) => <li key={round.id}>
      <details>
        <summary><strong>{round.patternName}</strong><span>{round.bpm} BPM · {round.result ? `${round.result.accuracy}%` : `${round.ratings.filter((rating) => rating === "clean").length} clean`} · {new Date(round.playedAt).toLocaleDateString()}{round.tags?.length ? ` · ${round.tags.length} tag${round.tags.length === 1 ? "" : "s"}` : ""}</span></summary>
        <label>Round note<textarea maxLength={500} value={round.notes ?? ""} onChange={(event) => onUpdate(round.id, event.target.value, round.tags ?? [])} placeholder="What felt steady? What should you revisit?" /></label>
        <fieldset><legend>Tags</legend>{TAGS.map(([id, label]) => <label key={id}><input type="checkbox" checked={Boolean(round.tags?.includes(id))} onChange={(event) => {
          const tags = new Set(round.tags ?? []);
          if (event.target.checked) tags.add(id); else tags.delete(id);
          onUpdate(round.id, round.notes ?? "", [...tags] as NonNullable<TrainerRound["tags"]>);
        }} />{label}</label>)}</fieldset>
      </details>
    </li>)}</ol>
  </details>;
}
