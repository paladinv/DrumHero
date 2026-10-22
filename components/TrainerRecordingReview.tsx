"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DynamicsMarker = { timeMs: number; velocity: number };
type ReferenceTake = { url: string; label: string; matching: boolean; reason?: string; legacySettings?: boolean; expected?: number[]; actual?: number[]; expectedDynamics?: DynamicsMarker[]; actualDynamics?: DynamicsMarker[] };

function summarizeTiming(expected: number[], actual: number[]) {
  const sortedActual = [...actual].sort((a, b) => a - b);
  const used = new Set<number>();
  const offsets: number[] = [];
  let missed = 0;
  for (const target of [...expected].sort((a, b) => a - b)) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    sortedActual.forEach((time, index) => {
      const distance = Math.abs(time - target);
      if (!used.has(index) && distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    });
    if (bestIndex < 0 || bestDistance > 100) missed += 1;
    else { used.add(bestIndex); offsets.push(sortedActual[bestIndex] - target); }
  }
  const averageOffsetMs = offsets.length ? Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length) : null;
  const typicalDistanceMs = offsets.length ? Math.round(offsets.reduce((sum, value) => sum + Math.abs(value), 0) / offsets.length) : null;
  return { matched: offsets.length, missed, extra: Math.max(0, actual.length - offsets.length), averageOffsetMs, typicalDistanceMs };
}

function averageDynamics(markers: DynamicsMarker[] | undefined, startMs: number, endMs: number) {
  const values = (markers ?? []).filter(marker => marker.timeMs >= startMs && marker.timeMs <= endMs && Number.isFinite(marker.velocity)).map(marker => marker.velocity);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function averageDynamicsTargetDistance(expected: DynamicsMarker[] | undefined, actual: DynamicsMarker[] | undefined, startMs: number, endMs: number) {
  const targets = (expected ?? []).filter(marker => marker.timeMs >= startMs && marker.timeMs <= endMs);
  const played = (actual ?? []).filter(marker => marker.timeMs >= startMs && marker.timeMs <= endMs);
  const distances = played.flatMap(hit => {
    const nearest = targets.reduce<DynamicsMarker | null>((best, target) => !best || Math.abs(target.timeMs - hit.timeMs) < Math.abs(best.timeMs - hit.timeMs) ? target : best, null);
    return nearest && Math.abs(nearest.timeMs - hit.timeMs) <= 100 ? [Math.abs(nearest.velocity - hit.velocity)] : [];
  });
  return distances.length ? Math.round(distances.reduce((sum, value) => sum + value, 0) / distances.length) : null;
}

export function TrainerRecordingReview({ url, expected, actual, expectedDynamics, actualDynamics, bookmarksMs = [], label, bpm, beatsPerBar, reference, onAddBookmark, onRemoveBookmark }: {
  url: string;
  expected: number[];
  actual: number[];
  expectedDynamics?: DynamicsMarker[];
  actualDynamics?: DynamicsMarker[];
  bookmarksMs?: number[];
  label: string;
  bpm: number;
  beatsPerBar: number;
  reference?: ReferenceTake;
  onAddBookmark?: (timeMs: number) => void;
  onRemoveBookmark?: (timeMs: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const referenceAudioRef = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [start, setStart] = useState(0);
  const [startBar, setStartBar] = useState(1);
  const [endBar, setEndBar] = useState(1);
  const [rangeLooping, setRangeLooping] = useState(false);
  const [peaks, setPeaks] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let context: AudioContext | undefined;
    void (async () => {
      try {
        const bytes = await (await fetch(url, { signal: controller.signal })).arrayBuffer();
        context = new AudioContext();
        const buffer = await context.decodeAudioData(bytes);
        const data = buffer.getChannelData(0);
        const bins = 2000;
        const values = Array.from({ length: bins }, (_, i) => {
          let peak = 0;
          const end = Math.floor((i + 1) * data.length / bins);
          for (let n = Math.floor(i * data.length / bins); n < end; n += Math.max(1, Math.floor(data.length / bins / 100))) peak = Math.max(peak, Math.abs(data[n]));
          return peak;
        });
        if (!cancelled) { setPeaks(values); setDuration(buffer.duration); }
      } catch { /* The audio player remains available. */ }
      finally { await context?.close(); }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [url]);

  const safeBeatsPerBar = Number.isFinite(beatsPerBar) && beatsPerBar > 0 ? beatsPerBar : 4;
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 80;
  const barSeconds = safeBeatsPerBar * 60 / safeBpm;
  const totalBars = Math.max(1, Math.ceil(duration / barSeconds));
  const selectedStartBar = Math.max(1, Math.min(totalBars, startBar));
  const selectedEndBar = Math.max(selectedStartBar, Math.min(totalBars, endBar));
  const rangeStartSeconds = (selectedStartBar - 1) * barSeconds;
  const rangeEndSeconds = Math.min(duration, selectedEndBar * barSeconds);
  const windowSeconds = duration / zoom || 1;
  const windowStart = Math.min(start, Math.max(0, duration - windowSeconds));
  const x = (seconds: number) => (seconds - windowStart) / windowSeconds * 1000;

  const replay = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    setRangeLooping(false);
    audio.currentTime = Math.max(0, seconds - 0.5);
    stopAt.current = Math.min(duration, seconds + 1);
    void audio.play().catch(() => {});
  };
  const playRange = (loop: boolean) => {
    const audio = audioRef.current;
    if (!audio || rangeEndSeconds <= rangeStartSeconds) return;
    setRangeLooping(loop);
    audio.currentTime = rangeStartSeconds;
    stopAt.current = rangeEndSeconds;
    void audio.play().catch(() => {});
  };
  const playAlignedRange = () => {
    const current = audioRef.current, prior = referenceAudioRef.current;
    if (!current || !prior || !reference?.matching || rangeEndSeconds <= rangeStartSeconds) return;
    setRangeLooping(false);
    current.currentTime = rangeStartSeconds; prior.currentTime = rangeStartSeconds;
    stopAt.current = rangeEndSeconds;
    void Promise.all([current.play(), prior.play()]).catch(() => { current.pause(); prior.pause(); });
  };
  const playAligned = () => {
    const current = audioRef.current, prior = referenceAudioRef.current;
    if (!current || !prior || !reference?.matching) return;
    setRangeLooping(false);
    stopAt.current = null;
    current.currentTime = 0; prior.currentTime = 0;
    void Promise.all([current.play(), prior.play()]).catch(() => { current.pause(); prior.pause(); });
  };
  const pauseAligned = (current: HTMLAudioElement | null) => {
    if (!current?.paused) return;
    const other = current === audioRef.current ? referenceAudioRef.current : audioRef.current;
    if (other && !other.paused) other.pause();
  };
  const missed = useMemo(() => {
    const sorted = [...actual].sort((a, b) => a - b);
    const result: number[] = [];
    let index = 0;
    for (const target of [...expected].sort((a, b) => a - b)) {
      while (index < sorted.length && sorted[index] < target - 50) index++;
      if (index >= sorted.length || Math.abs(sorted[index] - target) > 50) result.push(target);
      if (result.length === 30) break;
    }
    return result;
  }, [actual, expected]);
  const firstGridBeat = Math.max(0, Math.floor(windowStart * safeBpm / 60));
  const lastGridBeat = Math.min(Math.ceil(duration * safeBpm / 60), Math.ceil((windowStart + windowSeconds) * safeBpm / 60));
  const gridBeats = Array.from({ length: Math.min(100, Math.max(0, lastGridBeat - firstGridBeat + 1)) }, (_, index) => firstGridBeat + index);
  const selectedStartMs = rangeStartSeconds * 1000;
  const selectedEndMs = rangeEndSeconds * 1000;
  const selectedExpected = expected.filter(ms => ms >= selectedStartMs && ms <= selectedEndMs);
  const selectedActual = actual.filter(ms => ms >= selectedStartMs && ms <= selectedEndMs);
  const latestTiming = summarizeTiming(selectedExpected, selectedActual);
  const referenceTiming = reference?.matching && reference.expected && reference.actual
    ? summarizeTiming(reference.expected.filter(ms => ms >= selectedStartMs && ms <= selectedEndMs), reference.actual.filter(ms => ms >= selectedStartMs && ms <= selectedEndMs))
    : null;
  const latestDynamics = averageDynamics(actualDynamics, selectedStartMs, selectedEndMs);
  const referenceDynamics = reference?.matching ? averageDynamics(reference.actualDynamics, selectedStartMs, selectedEndMs) : null;
  const latestDynamicsDistance = averageDynamicsTargetDistance(expectedDynamics, actualDynamics, selectedStartMs, selectedEndMs);
  const referenceDynamicsDistance = reference?.matching ? averageDynamicsTargetDistance(reference.expectedDynamics, reference.actualDynamics, selectedStartMs, selectedEndMs) : null;

  return <div className="trainer-recording-review">
    {reference && <>
      <label>Reference take (A) · {reference.label}<audio aria-label="Reference performance recording" ref={referenceAudioRef} controls preload="metadata" src={reference.url} onPause={event => pauseAligned(event.currentTarget)} /></label>
      {reference.matching ? <button type="button" onClick={playAligned}>Play A and B from the start, aligned</button> : <p role="status">{reference.reason || "The practice settings differ."} A/B sync is unavailable; this take can still play on its own.</p>}
      {reference.matching && <button type="button" disabled={!duration} onClick={playAlignedRange}>Play selected bars A/B aligned</button>}
      {reference.legacySettings && reference.matching && <small>This saved take predates Trainer settings metadata; alignment matches its pattern and tempo.</small>}
    </>}
    <label>Latest take (B) · {label}<audio aria-label="Latest take with waveform review" ref={audioRef} controls src={url} onLoadedMetadata={event => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }} onPause={event => pauseAligned(event.currentTarget)} onTimeUpdate={event => {
      const audio = event.currentTarget;
      const time = audio.currentTime;
      setCursor(time);
      const prior = referenceAudioRef.current;
      if (reference?.matching && prior && !prior.paused && Math.abs(prior.currentTime - time) > 0.08) prior.currentTime = Math.min(time, Number.isFinite(prior.duration) ? prior.duration : time);
      if (stopAt.current !== null && time >= stopAt.current) {
        if (rangeLooping && rangeEndSeconds > rangeStartSeconds) { audio.currentTime = rangeStartSeconds; setCursor(rangeStartSeconds); }
        else { audio.pause(); stopAt.current = null; setRangeLooping(false); }
      }
    }} /></label>
    <div className="trainer-recording-range">
      <label>Start bar<select aria-label="Recording range start bar" value={selectedStartBar} onChange={event => { const next = Number(event.target.value); setRangeLooping(false); stopAt.current = null; setStartBar(next); if (selectedEndBar < next) setEndBar(next); }}>
        {Array.from({ length: totalBars }, (_, index) => index + 1).map(bar => <option key={bar} value={bar}>Bar {bar}</option>)}
      </select></label>
      <label>End bar<select aria-label="Recording range end bar" value={selectedEndBar} onChange={event => { setRangeLooping(false); stopAt.current = null; setEndBar(Number(event.target.value)); }}>
        {Array.from({ length: totalBars }, (_, index) => index + 1).filter(bar => bar >= selectedStartBar).map(bar => <option key={bar} value={bar}>Bar {bar}</option>)}
      </select></label>
      <button type="button" disabled={!duration} onClick={() => playRange(false)}>Play selected bars</button>
      <button type="button" disabled={!duration} aria-pressed={rangeLooping} onClick={() => { if (rangeLooping) { setRangeLooping(false); return; } playRange(true); }}>{rangeLooping ? "Stop selected-bar loop" : "Loop selected bars"}</button>
    </div>
    {reference?.matching && <section className="trainer-ab-summary" aria-label="Selected bar comparison">
      <h4>Selected bars · A/B comparison</h4>
      <div className="trainer-ab-summary-grid"><strong>Measure</strong><strong>Reference A</strong><strong>Latest B</strong>
        <span>Typical timing distance</span><span>{referenceTiming?.typicalDistanceMs === null || referenceTiming?.typicalDistanceMs === undefined ? "No matched hits" : `${referenceTiming.typicalDistanceMs} ms`}</span><span>{latestTiming.typicalDistanceMs === null ? "No matched hits" : `${latestTiming.typicalDistanceMs} ms`}</span>
        <span>Average timing direction</span><span>{referenceTiming?.averageOffsetMs === null || referenceTiming?.averageOffsetMs === undefined ? "—" : `${referenceTiming.averageOffsetMs > 0 ? "+" : ""}${referenceTiming.averageOffsetMs} ms`}</span><span>{latestTiming.averageOffsetMs === null ? "—" : `${latestTiming.averageOffsetMs > 0 ? "+" : ""}${latestTiming.averageOffsetMs} ms`}</span>
        <span>Missed / extra hits</span><span>{referenceTiming ? `${referenceTiming.missed} / ${referenceTiming.extra}` : "—"}</span><span>{latestTiming.missed} / {latestTiming.extra}</span>
        <span>Average recorded velocity</span><span>{referenceDynamics === null ? "Unavailable" : `${referenceDynamics}/127`}</span><span>{latestDynamics === null ? "Unavailable" : `${latestDynamics}/127`}</span>
        <span>Velocity distance from target</span><span>{referenceDynamicsDistance === null ? "Unavailable" : `${referenceDynamicsDistance}/127`}</span><span>{latestDynamicsDistance === null ? "Unavailable" : `${latestDynamicsDistance}/127`}</span>
      </div>
      <small>Velocity appears only when the saved take contains MIDI or calibrated audio strength data. Compare it on the same input profile; microphone gain can change the values.</small>
    </section>}
    <label>Waveform zoom<select value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[1, 2, 4, 8, 16].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
    <label>Visible start · {windowStart.toFixed(1)} s<input type="range" min={0} max={Math.max(0, duration - windowSeconds)} step="0.1" value={windowStart} onChange={event => setStart(Number(event.target.value))} /></label>
    <svg viewBox="0 0 1000 120" aria-label="Zoomable recording waveform with beat and bar markers, expected hits, played hits, and playback cursor" role="img" onClick={event => { const box = event.currentTarget.getBoundingClientRect(); replay(windowStart + (event.clientX - box.left) / box.width * windowSeconds); }}>
      {gridBeats.map(beat => {
        const bar = beat % safeBeatsPerBar === 0;
        const px = x(beat * 60 / safeBpm);
        if (px < 0 || px > 1000) return null;
        return <g key={beat}><line x1={px} x2={px} y1={bar ? 4 : 16} y2="116" className={bar ? "trainer-recording-bar-line" : "trainer-recording-beat-line"} />{bar && <text x={px + 3} y="13" className="trainer-recording-bar-label">{Math.floor(beat / safeBeatsPerBar) + 1}</text>}</g>;
      })}
      <path d={peaks.flatMap((peak, i) => { const px = x(i / peaks.length * duration); return px >= 0 && px <= 1000 ? [`M${px.toFixed(1)},${60 - peak * 50}v${peak * 100}`] : []; }).join(" ")} stroke="#78d3be" fill="none" />
      {expected.map((ms, i) => x(ms / 1000) >= 0 && x(ms / 1000) <= 1000 ? <line key={`e${i}`} x1={x(ms / 1000)} x2={x(ms / 1000)} y1="5" y2="115" stroke="#ff8b7e" /> : null)}
      {actual.map((ms, i) => x(ms / 1000) >= 0 && x(ms / 1000) <= 1000 ? <line key={`a${i}`} x1={x(ms / 1000)} x2={x(ms / 1000)} y1="40" y2="80" stroke="#f6ce66" /> : null)}
      {bookmarksMs.map((ms, i) => x(ms / 1000) >= 0 && x(ms / 1000) <= 1000 ? <line key={`b${i}`} x1={x(ms / 1000)} x2={x(ms / 1000)} y1="0" y2="120" stroke="#92b7ff" strokeWidth="2" strokeDasharray="4 3" /> : null)}
      <line x1={x(cursor)} x2={x(cursor)} y1="0" y2="120" stroke="white" strokeWidth="3" />
    </svg>
    <small>Bar numbers and beat lines use the take’s tempo and meter. Click the waveform or a target below to replay its surroundings. Red = expected; gold = recorded; blue = bookmark; white = playback.</small>
    <div className="transport">{missed.map((ms, i) => <button type="button" key={`${ms}-${i}`} onClick={() => replay(ms / 1000)}>Review target {(ms / 1000).toFixed(1)} s</button>)}</div>
    <label>Replay at time (seconds)<input type="number" min={0} max={duration} step="0.1" value={cursor.toFixed(1)} onChange={event => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, Math.min(duration, Number(event.target.value))); setCursor(Number(event.target.value)); }} /></label>
    <div className="transport"><button type="button" onClick={() => replay(cursor)}>Replay around cursor</button><button type="button" disabled={!duration || bookmarksMs.includes(Math.round(cursor * 1000))} onClick={() => onAddBookmark?.(Math.round(cursor * 1000))}>Bookmark {cursor.toFixed(1)} s</button></div>
    {bookmarksMs.length > 0 && <ol className="trainer-recording-bookmarks" aria-label="Recording bookmarks">{bookmarksMs.map((ms) => <li key={ms}><button type="button" onClick={() => replay(ms / 1000)}>Replay {((ms / 1000)).toFixed(1)} s</button><button type="button" aria-label={`Remove bookmark at ${(ms / 1000).toFixed(1)} seconds`} onClick={() => onRemoveBookmark?.(ms)}>Remove</button></li>)}</ol>}
  </div>;
}
