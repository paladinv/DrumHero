"use client";

import { summarizeTimingZones } from "@/lib/trainer-next";
import type { RatedHit } from "@/lib/types";
import { summarizeDynamics } from "@/lib/trainer-dynamics";

const LABELS = { straight: "Straight pulse", offbeat: "Offbeats", backbeat: "Backbeat", fill: "Fill" } as const;

export function TrainerTimingBreakdown({ hits }: { hits: RatedHit[] }) {
  const zones = summarizeTimingZones(hits);
  return <><TrainerDriftBreakdown hits={hits} />{zones.length ? <div className="trainer-timing-breakdown"><h4>Timing by feel zone</h4><div>{zones.map(zone => <section key={zone.zone}><strong>{LABELS[zone.zone]}</strong><span>{zone.onTime}/{zone.total} on time{zone.missed ? ` · ${zone.missed} missed` : ""}</span><span>{zone.averageOffsetMs === null ? "No timed hits" : `${zone.averageOffsetMs > 0 ? "+" : ""}${zone.averageOffsetMs} ms avg · ${zone.typicalOffsetMs} ms typical distance`}</span></section>)}</div></div> : <p>Timing zones will appear for rounds with tagged groove, backbeat, offbeat, or fill targets.</p>}</>;
}

export function summarizeRepetitionDrift(hits: RatedHit[]) {
  const grouped = new Map<number, number[]>();
  hits.filter(hit => hit.repetition !== undefined && hit.offsetMs !== null && hit.rating !== "miss" && hit.rating !== "extra" && hit.transition !== "landing")
    .forEach(hit => grouped.set(hit.repetition!, [...(grouped.get(hit.repetition!) ?? []), hit.offsetMs!]));
  const points = [...grouped.entries()].sort(([a], [b]) => a - b).map(([repetition, offsets]) => ({
    repetition: repetition + 1,
    offsetMs: Math.round(offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length),
    hits: offsets.length,
  }));
  if (points.length < 2) return { points, driftPerPassMs: null, message: "Play at least two passes with timed hits to check for drift." };

  const meanX = points.reduce((sum, point) => sum + point.repetition, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.offsetMs, 0) / points.length;
  const variance = points.reduce((sum, point) => sum + (point.repetition - meanX) ** 2, 0);
  const slope = variance ? points.reduce((sum, point) => sum + (point.repetition - meanX) * (point.offsetMs - meanY), 0) / variance : 0;
  const driftPerPassMs = Math.round(slope);
  const message = driftPerPassMs >= 4
    ? `Your average timing moves later by about ${driftPerPassMs} ms per pass.`
    : driftPerPassMs <= -4
      ? `Your average timing moves earlier by about ${Math.abs(driftPerPassMs)} ms per pass.`
      : "No clear rushing or dragging trend across these passes.";
  return { points, driftPerPassMs, message };
}

export function TrainerDriftBreakdown({ hits }: { hits: RatedHit[] }) {
  const drift = summarizeRepetitionDrift(hits);
  const max = Math.max(20, Math.ceil(Math.max(...drift.points.map(point => Math.abs(point.offsetMs)), 0) / 20) * 20);
  const points = drift.points.map((point, index) => ({
    ...point,
    x: drift.points.length < 2 ? 160 : 12 + index / (drift.points.length - 1) * 296,
    y: 48 - point.offsetMs / max * 34,
  }));
  return <section className="trainer-drift-breakdown" aria-label="Timing drift across repetitions"><h4>Timing drift across passes</h4><p>{drift.message}</p>{points.length > 1 && <><svg viewBox="0 0 320 96" role="img" aria-label={`Average timing offset by repetition: ${points.map(point => `pass ${point.repetition}, ${point.offsetMs} milliseconds`).join("; ")}`}><line x1="10" x2="310" y1="48" y2="48" className="trainer-drift-zero" /><line x1="10" x2="310" y1="14" y2="14" className="trainer-drift-guide" /><line x1="10" x2="310" y1="82" y2="82" className="trainer-drift-guide" /><polyline points={points.map(point => `${point.x},${point.y}`).join(" ")} className="trainer-drift-line" />{points.map(point => <circle key={point.repetition} cx={point.x} cy={point.y} r="4" className="trainer-drift-point"><title>Pass {point.repetition}: {point.offsetMs > 0 ? "+" : ""}{point.offsetMs} ms average from {point.hits} hits</title></circle>)}</svg><small>Negative is early; positive is late. Each point is the average of that pass’s scored hits.</small></>}</section>;
}

export function TrainerDynamicsBreakdown({ hits, source }: { hits: RatedHit[]; source: string }) {
  const summary = summarizeDynamics(hits);
  const inputName = source.startsWith("audio-") ? "estimated audio strength" : "MIDI velocity";
  return <section className="trainer-dynamics-feedback"><h4>Dynamics target check</h4>{summary.count ? <p>{summary.count} measured hits · average target <strong>{summary.targetAverage}</strong> · average {inputName} <strong>{summary.playedAverage}</strong> · mean target difference <strong>{summary.meanError}</strong>.</p> : null}<p>{summary.message}</p></section>;
}
