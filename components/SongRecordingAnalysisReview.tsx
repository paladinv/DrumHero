"use client";
import { useEffect, useMemo, useState } from "react";
import type { SongRecording, ReviewedRecordingHit } from "@/lib/song-recording";
import { SONG_INSTRUMENTS, type SongInstrument } from "@/lib/types";

const voices: SongInstrument[] = SONG_INSTRUMENTS;

function automaticMatches(take: SongRecording): ReviewedRecordingHit[] {
  const expected = take.expectedTimes ?? [];
  const onsets = take.onsetTimes ?? [];
  const used = new Set<number>();
  return onsets.map((onset, onsetIndex) => {
    const previous = take.reviewedMatches?.find(item => item.onsetIndex === onsetIndex);
    if (previous) {
      if (previous.expectedIndex !== null && previous.expectedIndex !== undefined) used.add(previous.expectedIndex);
      return previous;
    }
    let best: number | null = null, delta = 0.11;
    expected.forEach((time, index) => {
      const error = Math.abs(onset + (take.alignmentOffsetMs ?? 0) / 1000 - time);
      if (!used.has(index) && error < delta) { best = index; delta = error; }
    });
    if (best !== null) used.add(best);
    return { onsetIndex, expectedIndex: best };
  });
}

export function SongRecordingAnalysisReview({ take, onUpdate }: { take: SongRecording; onUpdate: (take: SongRecording) => void }) {
  const [matches, setMatches] = useState<ReviewedRecordingHit[]>(() => automaticMatches(take));
  const [alignmentOffsetMs, setAlignmentOffsetMs] = useState(take.alignmentOffsetMs ?? 0);
  const [message, setMessage] = useState("");
  const onsetTimes = take.onsetTimes ?? [];
  const expectedTimes = take.expectedTimes ?? [];
  useEffect(() => {
    setAlignmentOffsetMs(take.alignmentOffsetMs ?? 0);
    setMatches(automaticMatches(take));
  }, [take]);
  const matched = useMemo(() => {
    const used = new Set<number>();
    return matches.filter(item => item.expectedIndex !== null && item.expectedIndex !== undefined && item.expectedIndex < expectedTimes.length && !used.has(item.expectedIndex) && !!used.add(item.expectedIndex));
  }, [matches, expectedTimes.length]);
  const offsets = matched.flatMap(item => {
    const expected = item.expectedIndex === null || item.expectedIndex === undefined ? undefined : expectedTimes[item.expectedIndex];
    const onset = onsetTimes[item.onsetIndex];
    return Number.isFinite(expected) && Number.isFinite(onset) ? [Math.round((onset + alignmentOffsetMs / 1000 - expected!) * 1000)] : [];
  });
  const early = offsets.filter(value => value < -30).length;
  const late = offsets.filter(value => value > 30).length;
  const onBeat = offsets.length - early - late;
  const sortedOffsets = [...offsets].sort((a, b) => a - b);
  const medianOffsetMs = sortedOffsets.length ? sortedOffsets[Math.floor(sortedOffsets.length / 2)] : 0;
  const calibratedOffsetMs = Math.max(-5000, Math.min(5000, alignmentOffsetMs - medianOffsetMs));
  const canCalibrate = take.confidence === "reviewed" && offsets.length >= 4 && calibratedOffsetMs !== alignmentOffsetMs;
  const duration = Math.max(1, ...expectedTimes, ...onsetTimes);
  const xAt = (time: number) => 20 + Math.max(0, Math.min(1, time / duration)) * 960;
  const voiceCounts = voices.flatMap(voice => {
    const count = matches.filter(item => item.instrument === voice).length;
    return count ? [`${voice} ${count}`] : [];
  });
  const update = (item: ReviewedRecordingHit, change: Partial<ReviewedRecordingHit>) => setMatches(items => items.map(current => current.onsetIndex === item.onsetIndex ? { ...current, ...change } : current));
  const calibrate = () => {
    setAlignmentOffsetMs(calibratedOffsetMs);
    setMessage(`Suggested a ${calibratedOffsetMs} ms alignment from ${offsets.length} reviewed hits. Review the overlay, then save to keep it with this take.`);
  };
  const save = () => {
    const manual = matches.filter(item => item.onsetIndex < onsetTimes.length);
    const unique = new Set<number>();
    let sum = 0;
    for (const item of manual) {
      if (item.expectedIndex === null || item.expectedIndex === undefined || item.expectedIndex >= expectedTimes.length || unique.has(item.expectedIndex)) continue;
      unique.add(item.expectedIndex);
      sum += Math.abs(onsetTimes[item.onsetIndex] + alignmentOffsetMs / 1000 - expectedTimes[item.expectedIndex]);
    }
    const missed = Math.max(0, expectedTimes.length - unique.size);
    const extra = Math.max(0, onsetTimes.length - unique.size);
    const reviewed: SongRecording = {
      ...take,
      alignmentOffsetMs,
      reviewedMatches: manual,
      matchedHits: unique.size,
      missedTargets: missed,
      extraHits: extra,
      timingConsistency: expectedTimes.length ? Math.round(unique.size / expectedTimes.length * 100) : null,
      meanOffsetMs: unique.size ? Math.round(sum / unique.size * 1000) : null,
      confidence: "reviewed",
    };
    onUpdate(reviewed);
    setMessage("Your hit assignments, alignment correction, and corrected counts were saved with this take.");
  };

  if (!onsetTimes.length || !expectedTimes.length) return <p>Timing review is unavailable for this take because it has no saved onset or expected-hit timeline. Keep the recording for playback or trim it to a section with a saved drum part.</p>;

  return <details className="song-recording-review">
    <summary>{take.confidence === "reviewed" ? "Review corrected hit assignments" : "Review approximate hit analysis"}</summary>
    <p>Audio analysis finds loud transients. It cannot reliably identify which drum voice played. Review each hit against the nearby expected beats and set its voice yourself; saved voice labels are your annotations.</p>
    <div className="song-recording-timing">
      <svg viewBox="0 0 1000 100" role="img" aria-label="Expected beats and detected drum hits on a shared recording timeline">
        <line x1="20" x2="980" y1="50" y2="50" stroke="var(--theme-chart-muted, #9aa99e)" strokeWidth="2" />
        {expectedTimes.map((time, index) => <line key={`target:${index}`} x1={xAt(time)} x2={xAt(time)} y1="12" y2="88" stroke="var(--theme-chart-success, #227451)" strokeDasharray="4 3" strokeWidth="2" />)}
        {onsetTimes.map((time, index) => {
          const item = matches.find(match => match.onsetIndex === index);
          const matchedHit = item?.expectedIndex !== null && item?.expectedIndex !== undefined;
          return <line key={`onset:${index}`} x1={xAt(time + alignmentOffsetMs / 1000)} x2={xAt(time + alignmentOffsetMs / 1000)} y1="36" y2="68" stroke={matchedHit ? "var(--theme-chart-info, #2468aa)" : "var(--theme-chart-warning, #c56c12)"} strokeWidth="4" />;
        })}
      </svg>
      <p><span className="song-timing-key"><i className="target" /> Expected beat</span><span className="song-timing-key"><i className="matched" /> Assigned hit</span><span className="song-timing-key"><i className="extra" /> Extra or unassigned</span></p>
      <p>Of {offsets.length} assigned hits: {early} early (&gt;30 ms) · {onBeat} within ±30 ms · {late} late (&gt;30 ms). {voiceCounts.length ? `Reviewed voice labels: ${voiceCounts.join(", ")}.` : "Add voice labels below to see the voice breakdown."}</p>
    </div>
    <section className="song-recording-calibration">
      <h4>Recording timing alignment</h4>
      <p>The median difference across manually reviewed hits can estimate a consistent capture or start offset. This only aligns the take against its expected beats; it does not alter the audio or a previously saved practice score.</p>
      <p>Current correction: {alignmentOffsetMs} ms{offsets.length ? ` · median reviewed error: ${medianOffsetMs > 0 ? "+" : ""}${medianOffsetMs} ms` : ""}</p>
      <button type="button" disabled={!canCalibrate} onClick={calibrate}>Suggest correction from reviewed hits</button>
      {!canCalibrate && <small>Manually match and save at least four hits before calibrating. The correction is only a timing-alignment estimate.</small>}
    </section>
    {onsetTimes.map((onset, index) => {
      const item = matches.find(match => match.onsetIndex === index) ?? { onsetIndex: index, expectedIndex: null };
      const nearby = expectedTimes.map((time, expectedIndex) => ({ time, expectedIndex, delta: Math.abs(onset + alignmentOffsetMs / 1000 - time) })).sort((a, b) => a.delta - b.delta).slice(0, 12).sort((a, b) => a.expectedIndex - b.expectedIndex);
      if (item.expectedIndex !== null && item.expectedIndex !== undefined && !nearby.some(option => option.expectedIndex === item.expectedIndex)) {
        const time = expectedTimes[item.expectedIndex];
        if (Number.isFinite(time)) nearby.push({ time, expectedIndex: item.expectedIndex, delta: Math.abs(onset + alignmentOffsetMs / 1000 - time) });
      }
      return <div className="song-recording-hit-review" key={index}>
        <strong>Detected hit {index + 1} · {Math.round(onset * 1000)} ms</strong>
        <label>Expected beat<select value={item.expectedIndex ?? -1} onChange={event => update(item, { expectedIndex: Number(event.target.value) < 0 ? null : Number(event.target.value) })}><option value={-1}>Extra / not a drum hit</option>{nearby.sort((a, b) => a.expectedIndex - b.expectedIndex).map(option => <option key={option.expectedIndex} value={option.expectedIndex}>Beat {option.expectedIndex + 1} · {Math.round(option.time * 1000)} ms</option>)}</select></label>
        <label>Voice heard<select value={item.instrument ?? ""} onChange={event => update(item, { instrument: voices.find(voice => voice === event.target.value) })}><option value="">Not sure · leave voice unlabelled</option>{voices.map(voice => <option key={voice} value={voice}>{voice}</option>)}</select></label>
        <small>Automatic match: {item.expectedIndex === null || item.expectedIndex === undefined ? "none" : `beat ${item.expectedIndex + 1}`} · nearest expected difference {item.expectedIndex === null || item.expectedIndex === undefined ? "—" : `${Math.round(Math.abs(onset + alignmentOffsetMs / 1000 - expectedTimes[item.expectedIndex]) * 1000)} ms`}</small>
      </div>;
    })}
    <p>Current review: {matched.length} expected beats matched · {Math.max(0, expectedTimes.length - matched.length)} missing · {Math.max(0, onsetTimes.length - matched.length)} extra. The voice labels do not come from the audio model.</p>
    <button type="button" onClick={save}>Save reviewed analysis</button>
    <p role="status">{message}</p>
  </details>;
}
