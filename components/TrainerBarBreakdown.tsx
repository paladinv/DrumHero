"use client";

import { summarizeTrainerBars } from "@/lib/trainer-bar-analysis";
import type { PracticePattern, RatedHit } from "@/lib/types";

function signedMilliseconds(value: number | null) {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value} ms`;
}

export function TrainerBarBreakdown({ hits, pattern, hasDynamicsTargets }: {
  hits: RatedHit[];
  pattern: PracticePattern;
  hasDynamicsTargets: boolean;
}) {
  const bars = summarizeTrainerBars(hits, pattern);
  if (!bars.length) return null;

  return <details className="trainer-bar-breakdown">
    <summary>Bar-by-bar timing and dynamics</summary>
    <p>Compare each bar in order. Negative timing is early; positive timing is late. Dynamics error is the average distance from the target, when MIDI or calibrated audio measured strike strength.</p>
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
