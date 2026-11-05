"use client";

import { useMemo } from "react";
import { comparableRounds } from "@/lib/trainer-coaching";
import type { TrainerRound } from "@/lib/trainer";
import type { Instrument, PracticePattern } from "@/lib/types";

export function TrainerNextDrill({ round, rounds, pattern, disabled, onIsolateVoice, onChangeTempo }: {
  round: TrainerRound;
  rounds: TrainerRound[];
  pattern: PracticePattern;
  disabled: boolean;
  onIsolateVoice: (instrument: Instrument, bpm: number) => void;
  onChangeTempo: (bpm: number) => void;
}) {
  const suggestion = useMemo(() => {
    if (round.mode !== "scored" || !round.result || round.inputClipped || round.uncertainDetections) return null;
    const attempts = comparableRounds(rounds, round)
      .filter(item => item.mode === "scored" && item.result && !item.inputClipped && !item.uncertainDetections && !item.focusedDrill && !item.learningMode)
      .sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 5);
    const measured = attempts.length ? attempts : [round];
    const voices = new Map<Instrument, { total: number; clean: number; rounds: number }>();
    for (const attempt of measured) {
      const seen = new Set<Instrument>();
      for (const hit of attempt.hits ?? []) {
        if (hit.rating === "extra" || hit.transition === "landing") continue;
        const value = voices.get(hit.instrument) ?? { total: 0, clean: 0, rounds: 0 };
        value.total += 1;
        if (hit.rating === "great" || hit.rating === "good") value.clean += 1;
        seen.add(hit.instrument);
        voices.set(hit.instrument, value);
      }
      for (const instrument of seen) voices.get(instrument)!.rounds += 1;
    }
    const weakest = [...voices.entries()].filter(([, value]) => value.total >= 4)
      .map(([instrument, value]) => ({ instrument, accuracy: value.clean / value.total, clean: value.clean, total: value.total, rounds: value.rounds }))
      .sort((a, b) => a.accuracy - b.accuracy)[0];
    const averageAccuracy = measured.reduce((sum, item) => sum + (item.result?.accuracy ?? 0), 0) / measured.length;
    const slowTempo = Math.max(pattern.tempoRange[0], Math.min(round.bpm, round.bpm - Math.max(4, Math.round(round.bpm * 0.08))));
    const reliableEvidence = attempts.length >= 3;
    if (reliableEvidence && weakest && weakest.accuracy < 0.85) return {
      title: `Isolate ${weakest.instrument}`,
      description: `${Math.round(weakest.accuracy * 100)}% of ${weakest.instrument} targets were on time across ${weakest.rounds} recent comparable rounds. Work on that voice by itself at ${slowTempo} BPM, then bring the full groove back.`,
      evidence: `${weakest.clean} of ${weakest.total} ${weakest.instrument} targets were on time across ${weakest.rounds} rounds.`,
      confidence: reliableEvidence ? "Repeated signal across at least three clean rounds on the same setup." : `Early signal from ${attempts.length} clean comparable round${attempts.length === 1 ? "" : "s"}; repeat the same setup to confirm it.`,
      action: `Set up ${weakest.instrument} at ${slowTempo} BPM`,
      run: () => onIsolateVoice(weakest.instrument, slowTempo),
    };
    if (reliableEvidence && averageAccuracy >= 90 && round.bpm < pattern.tempoRange[1]) {
      const nextBpm = Math.min(pattern.tempoRange[1], round.bpm + 2);
      const targetCount = measured.reduce((sum, item) => sum + (item.hits ?? []).filter(hit => hit.rating !== "extra" && hit.transition !== "landing").length, 0);
      return { title: "Build the tempo gradually", description: `Your last ${measured.length} comparable rounds average ${Math.round(averageAccuracy)}% accuracy. Raise the pulse by 2 BPM and keep the same pattern.`, evidence: `${targetCount} scored targets across ${measured.length} rounds.`, confidence: "Consistent signal across several clean rounds; keep the tempo change small.", action: `Set up ${nextBpm} BPM`, run: () => onChangeTempo(nextBpm) };
    }
    if (!reliableEvidence) return {
      title: "Build a reliable baseline",
      description: `This round scored ${round.result.accuracy}%. Repeat at ${round.bpm} BPM with the same setup so the Trainer can compare several attempts before suggesting a bigger change.`,
      evidence: `${round.result.great + round.result.good} Great or Good hits · ${round.result.miss} missed · ${attempts.length} clean comparable round${attempts.length === 1 ? "" : "s"}.`,
      confidence: "Tempo changes and voice isolation become more useful after at least three comparable rounds.",
      action: `Repeat at ${round.bpm} BPM`, run: () => onChangeTempo(round.bpm),
    };
    const targetCount = measured.reduce((sum, item) => sum + (item.hits ?? []).filter(hit => hit.rating !== "extra" && hit.transition !== "landing").length, 0);
    return { title: "Repeat at a steadier tempo", description: `Your recent comparable rounds average ${Math.round(averageAccuracy)}%. Lower the tempo slightly and focus on even, relaxed strokes.`, evidence: `${targetCount} scored targets across ${measured.length} rounds.`, confidence: "Based on repeated clean attempts with the same input and pattern.", action: `Repeat at ${slowTempo} BPM`, run: () => onChangeTempo(slowTempo) };
  }, [onChangeTempo, onIsolateVoice, pattern.tempoRange, round, rounds]);

  if (!suggestion) return null;
  return <div className="trainer-next-drill"><span className="eyebrow">Try next</span><strong>{suggestion.title}</strong><p>{suggestion.description}</p>{"evidence" in suggestion && <p className="trainer-next-drill-evidence"><strong>Evidence:</strong> {suggestion.evidence}<br /><small>{suggestion.confidence}</small></p>}<button type="button" className="button-secondary" disabled={disabled} onClick={suggestion.run}>{suggestion.action}</button></div>;
}
