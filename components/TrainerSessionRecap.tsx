"use client";

import type { TrainerRound } from "@/lib/trainer";
import type { PracticePattern } from "@/lib/types";
import { TrainerNotationView } from "@/components/TrainerNotationView";

export type TrainerCompletedPlanStep = { stepIndex: number; round: TrainerRound };

function roundAccuracy(round: TrainerRound) {
  if (round.mode === "scored") {
    if (!round.result || round.inputClipped || round.uncertainDetections) return null;
    return round.result.accuracy;
  }
  return round.ratings.length ? Math.round(round.ratings.filter(rating => rating === "clean").length / round.ratings.length * 100) : null;
}

function csvCell(value: string | number | boolean | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function TrainerSessionRecap({ title, startedAt, patternIds, completedSteps, patterns, disabled, onPractice }: {
  title: string;
  startedAt?: string;
  patternIds: string[];
  completedSteps: TrainerCompletedPlanStep[];
  patterns: PracticePattern[];
  disabled: boolean;
  onPractice: (patternId: string, bpm: number) => void;
}) {
  const latestByStep = new Map(completedSteps.map(item => [item.stepIndex, item.round]));
  const scored = [...latestByStep.values()].filter(round => round.mode === "scored" && round.result && !round.inputClipped && !round.uncertainDetections);
  const averageAccuracy = scored.length ? Math.round(scored.reduce((sum, round) => sum + (round.result?.accuracy ?? 0), 0) / scored.length) : null;
  const weakest = [...latestByStep.entries()].flatMap(([index, round]) => {
    const accuracy = roundAccuracy(round);
    const patternId = patternIds[index];
    return accuracy === null || !patternId ? [] : [{ index, round, accuracy, patternId }];
  }).sort((a, b) => a.accuracy - b.accuracy)[0];
  const weakestPattern = weakest ? patterns.find(item => item.id === weakest.patternId) : undefined;
  const nextBpm = weakest && weakestPattern ? Math.max(weakestPattern.tempoRange[0], Math.min(weakestPattern.tempoRange[1], weakest.round.bpm - 4)) : null;
  const completionTimes = [...latestByStep.values()].map(round => Date.parse(round.playedAt)).filter(Number.isFinite);
  const finishedAt = completionTimes.length ? Math.max(...completionTimes) : null;
  const elapsedMinutes = startedAt && finishedAt !== null && Number.isFinite(Date.parse(startedAt))
    ? Math.max(1, Math.round((finishedAt - Date.parse(startedAt)) / 60_000)) : null;
  const exportRecap = () => {
    const rows = [
      ["Session", title],
      ["Started", startedAt ?? ""],
      ["Completed steps", `${latestByStep.size}/${patternIds.length}`],
      [],
      ["Step", "Pattern", "Status", "Accuracy percent", "Tempo BPM", "Input", "Timing calibrated", "Uncertain detections", "Clipping"],
      ...patternIds.map((patternId, index) => {
        const round = latestByStep.get(index);
        const accuracy = round ? roundAccuracy(round) : null;
        const pattern = patterns.find(item => item.id === patternId);
        return [
          index + 1,
          pattern?.name ?? patternId,
          round ? accuracy === null ? "Completed · score not comparable" : "Completed" : "Not completed",
          accuracy,
          round?.bpm ?? "",
          round?.source ?? "",
          round?.timingCalibrated === true,
          round?.uncertainDetections ?? 0,
          round?.inputClipped === true,
        ];
      }),
    ];
    const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trainer"}-recap.csv`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="trainer-session-recap" aria-labelledby="trainer-session-recap-title" aria-live="polite">
    <span className="eyebrow">Session complete</span>
    <h3 id="trainer-session-recap-title">{title} · recap</h3>
    <p>{latestByStep.size} of {patternIds.length} steps completed{elapsedMinutes ? ` · about ${elapsedMinutes} minutes` : ""}{averageAccuracy === null ? "." : ` · ${averageAccuracy}% average accuracy across ${scored.length} reliable scored steps.`}</p>
    <div className="trainer-recap-actions"><button type="button" className="button-secondary" onClick={exportRecap}>Download session recap (CSV)</button><small>Includes the session steps, tempo, input mode, and scoring reliability flags. It does not include audio or device identifiers.</small></div>
    <ol>{patternIds.map((patternId, index) => {
      const pattern = patterns.find(item => item.id === patternId);
      const round = latestByStep.get(index);
      const accuracy = round ? roundAccuracy(round) : null;
      return <li key={`${index}-${patternId}`}>
        <div><strong>{pattern?.name ?? "Unavailable pattern"}</strong><span>{round ? accuracy === null ? "Completed · score not comparable" : `Completed · ${accuracy}% at ${round.bpm} BPM` : "Not completed"}</span></div>
      </li>;
    })}</ol>
    {weakest && weakestPattern && nextBpm !== null && <div className="trainer-session-next"><div><p>Suggested next: repeat {weakestPattern.name} at {nextBpm} BPM. Follow the score below.</p><TrainerNotationView pattern={weakestPattern} compact /></div><button type="button" className="button-secondary" disabled={disabled} onClick={() => onPractice(weakest.patternId, nextBpm)}>Practise this step</button></div>}
  </section>;
}
