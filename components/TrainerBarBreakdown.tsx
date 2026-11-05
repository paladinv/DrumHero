"use client";

import { summarizeTrainerBars } from "@/lib/trainer-bar-analysis";
import type { PracticePattern, RatedHit } from "@/lib/types";

function signedMilliseconds(value: number | null) {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value} ms`;
}

export function TrainerBarBreakdown({ hits, pattern, hasDynamicsTargets, disabled = false, onPracticeBar }: {
  hits: RatedHit[];
  pattern: PracticePattern;
  hasDynamicsTargets: boolean;
  disabled?: boolean;
  onPracticeBar?: (bar: number) => void;
}) {
  const bars = summarizeTrainerBars(hits, pattern);
  if (!bars.length) return null;
  const repetitionCount = new Set(hits.filter(hit => hit.step !== undefined && hit.transition !== "landing" && hit.rating !== "extra").map(hit => hit.repetition ?? 0)).size;
  const barCount = getPatternBarCount(pattern);
  const positionalBars = new Map<number, { targets: number; onTime: number; missed: number }>();
  for (const item of bars) {
    const position = ((item.bar - 1) % barCount) + 1;
    const totals = positionalBars.get(position) ?? { targets: 0, onTime: 0, missed: 0 };
    totals.targets += item.targets;
    totals.onTime += item.onTime;
    totals.missed += item.missed;
    positionalBars.set(position, totals);
  }
  const weakestBar = [...positionalBars.entries()].filter(([, item]) => item.targets >= 2)
    .map(([bar, item]) => ({ bar, ...item }))
    .sort((a, b) => a.onTime / a.targets - b.onTime / b.targets || b.missed - a.missed || b.targets - a.targets)[0];

  return <details className="trainer-bar-breakdown">
    <summary>Bar-by-bar timing and dynamics</summary>
    <p>Compare each bar in order. Negative timing is early; positive timing is late. Dynamics error is the average distance from the target, when MIDI or calibrated audio measured strike strength.</p>
    {repetitionCount >= 2 && weakestBar && weakestBar.onTime < weakestBar.targets && onPracticeBar && <div className="trainer-weak-bar-action"><p>Bar {weakestBar.bar} was least consistent across the phrase repetitions: {weakestBar.onTime}/{weakestBar.targets} targets on time{weakestBar.missed ? ` · ${weakestBar.missed} missed` : ""}.</p><button type="button" className="button-secondary" disabled={disabled} onClick={() => onPracticeBar(weakestBar.bar)}>Loop bar {weakestBar.bar}</button></div>}
    <div className="trainer-bar-table-wrap">
      <table>
        <caption>Scored performance by bar</caption>
        <thead><tr><th scope="col">Bar</th><th scope="col">On time</th><th scope="col">Average offset</th><th scope="col">Typical distance</th>{hasDynamicsTargets && <th scope="col">Dynamics error</th>}</tr></thead>
        <tbody>{bars.map(item => <tr key={item.bar}>
          <th scope="row">{item.bar}</th>
          <td>{item.onTime}/{item.targets}{item.missed ? ` · ${item.missed} missed` : ""}</td>
          <td>{signedMilliseconds(item.averageOffsetMs)}</td>
          <td>{item.typicalOffsetMs === null ? "—" : `${item.typicalOffsetMs} ms`}</td>
          {hasDynamicsTargets && <td>{item.averageDynamicsError === null ? "Not measured" : `${item.averageDynamicsError} points · ${item.dynamicsSamples} hits`}</td>}
        </tr>)}</tbody>
      </table>
    </div>
  </details>;
}

function getPatternBarCount(pattern: PracticePattern) {
  if (pattern.id.startsWith("phrase:")) return Number(pattern.id.split(":").at(-1)) || 1;
  const explicitBars = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter.match(/^(\d+)\s+bars?\b/i) : null;
  return explicitBars ? Math.max(1, Number(explicitBars[1])) : 1;
}
