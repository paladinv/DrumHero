"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { alignedOnsets } from "@/lib/song-library-tools";
import { loadTake, type SongRecording } from "@/lib/song-recording";
export function SongRecordingPlayback({ take, onAlign, focus }: { take: SongRecording; onAlign?: (offsetMs:number)=>void; focus?: { timeSeconds:number; token:number; label?:string } }) {
  const [offset,setOffset]=useState(take.alignmentOffsetMs??0);
  const [source, setSource] = useState("");
  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(take.durationMs / 1000);
  const [position, setPosition] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const request = useRef(0);
  const pendingFocus = useRef<typeof focus>(undefined);
  useEffect(() => () => { request.current++; }, []);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  const load = useCallback(async () => {
    const token = ++request.current; setBusy(true); setMessage("");
    try {
      const blob = await loadTake(take.id); if (!blob) throw new Error("The audio for this take is not stored on this device.");
      if (token !== request.current) return;
      setSource(URL.createObjectURL(blob));
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(await blob.arrayBuffer()); if (token !== request.current) return;
        const channel = decoded.getChannelData(0), bucket = Math.max(1, Math.ceil(channel.length / 160));
        const values = Array.from({ length: 160 }, (_, index) => { let peak = 0; for (let i = index * bucket; i < Math.min(channel.length, (index + 1) * bucket); i++) peak = Math.max(peak, Math.abs(channel[i])); return peak; });
        const max = Math.max(...values, 0.001); setPeaks(values.map((value) => value / max)); setDuration(decoded.duration);
      } catch { if (token === request.current) setMessage("Audio is ready. The waveform could not be decoded in this browser."); } finally { await context.close(); }
    } catch (error) { if (token === request.current) setMessage(error instanceof Error ? error.message : "Audio could not be loaded."); }
    finally { if (token === request.current) setBusy(false); }
  }, [take.id]);
  useEffect(() => { pendingFocus.current = focus; }, [focus]);
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target || !source) { if (target && !source) void load(); return; }
    const player = audio.current;
    if (!player) return;
    const playTarget = () => {
      if (pendingFocus.current?.token !== target.token) return;
      const time = Math.max(0, Math.min(duration, target.timeSeconds));
      player.currentTime = time; player.playbackRate = playbackRate; setPosition(time); setMessage(target.label ? `Playing near ${target.label}.` : "Playing the selected score moment.");
      pendingFocus.current = undefined;
      void player.play().catch(() => setMessage("The recording is positioned. Press Play in the audio controls to listen."));
    };
    if (player.readyState >= 1) playTarget();
    else { player.addEventListener("loadedmetadata", playTarget, { once: true }); return () => player.removeEventListener("loadedmetadata", playTarget); }
  }, [focus?.token, source, duration, playbackRate, load]);
  useEffect(() => { if (audio.current) audio.current.playbackRate = playbackRate; }, [playbackRate, source]);
  const expected = take.expectedTimes ?? [];
  const actual = alignedOnsets(take.onsetTimes??[],offset);
  const problems = expected.length ? actual.filter((time) => !expected.some((target) => Math.abs(target - time) <= 0.1)) : [];
  const seek = (time: number) => { const next = Math.max(0, Math.min(duration, time)); setPosition(next); if (audio.current) audio.current.currentTime = next; };
  return <div className="song-recording-playback">{!source ? <button type="button" disabled={busy} onClick={() => void load()}>{busy ? "Loading audio…" : focus ? "Load audio and play selected moment" : "Load audio and waveform"}</button> : <><audio ref={audio} src={source} controls preload="metadata" aria-label="Recorded take audio" onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)} /><div className="song-form-row"><label>Playback speed<select value={playbackRate} onChange={event=>setPlaybackRate(Number(event.target.value))}><option value={0.5}>0.5×</option><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option></select></label></div><svg viewBox="0 0 1000 140" role="img" aria-label="Recorded waveform with expected hit and detected onset markers"><title>Green dashed markers are expected hits; orange markers are detected onsets.</title>{peaks.map((peak, index) => <line key={index} x1={(index / peaks.length + offset / 1000 / Math.max(duration,.01)) * 1000} x2={(index / peaks.length + offset / 1000 / Math.max(duration,.01)) * 1000} y1={70 - peak * 55} y2={70 + peak * 55} stroke="var(--theme-chart-muted, #75877c)" strokeWidth="4" />)}{expected.map((time, index) => <line key={`expected-${index}`} x1={time / Math.max(duration, 0.01) * 1000} x2={time / Math.max(duration, 0.01) * 1000} y1="2" y2="138" stroke="var(--theme-chart-success, #117653)" strokeDasharray="5 4" />)}{actual.map((time, index) => <line key={`actual-${index}`} x1={time / Math.max(duration, 0.01) * 1000} x2={time / Math.max(duration, 0.01) * 1000} y1="20" y2="120" stroke="var(--theme-chart-warning, #c15d19)" />)}<line x1={(position + offset/1000) / Math.max(duration, 0.01) * 1000} x2={(position + offset/1000) / Math.max(duration, 0.01) * 1000} y1="0" y2="140" stroke="var(--theme-chart-success-strong, #152f27)" strokeWidth="3" /></svg><label>Seek recording<input type="range" min="0" max={duration || 1} step="0.01" value={position} onChange={(event) => seek(Number(event.target.value))} /></label><label>Recording alignment (ms)<input type="number" min={-5000} max={5000} step={10} value={offset} onChange={event=>setOffset(Math.max(-5000,Math.min(5000,Number(event.target.value)||0)))}/></label><p>Positive offset moves this take later on the reference timeline. This changes the visual alignment, not the original timing score or audio file.</p>{focus&&<p role="status">Score-linked location is approximate; take tempo and start alignment may differ from the attempt.</p>}{onAlign&&<button type="button" onClick={()=>onAlign(offset)}>Save recording alignment</button>}<p>Expected hits: green dashed lines. Detected onsets: orange lines.</p>{!expected.length && <p>This older take has no saved expected-hit timeline. Record again to see the overlay.</p>}{problems.length > 0 && <div className="song-actions"><span>Review unmatched onsets:</span>{problems.slice(0, 12).map((time) => <button type="button" key={time} onClick={() => { seek(time - offset/1000 - 0.3); void audio.current?.play().catch(() => setMessage("Press Play in the audio controls to listen.")); }}>{time.toFixed(2)}s</button>)}</div>}</>}<p role="status">{message}</p></div>;
}
