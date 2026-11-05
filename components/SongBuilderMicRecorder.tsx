"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DrumPart } from "@/lib/song-library";
import type { SongInstrument, SongPartHit } from "@/lib/types";
import { analyzeMicrophoneOnsets, type MicrophoneOnset } from "@/lib/song-builder-audio-analysis";
import { deleteBuilderMicRecording, readBuilderMicRecordings, saveBuilderMicRecording, type BuilderMicRecording } from "@/lib/song-builder-storage";

type DetectedStrike = { timeSeconds: number; confidence: number; step: number; velocity: number; selected: boolean };
const VOICES: Array<[SongInstrument, string]> = [["kick", "Kick"], ["snare", "Snare"], ["hihat", "Hi-hat"], ["openhat", "Open hi-hat"], ["tom", "Tom"], ["crash", "Crash"], ["ride", "Ride"], ["rimshot", "Rimshot"]];

function snapOnsetsToGrid(onsets: MicrophoneOnset[], part: DrumPart | null, bpm: number, offsetMs: number, loops: number): DetectedStrike[] {
  const stepMs = 60_000 / Math.max(40, Math.min(200, bpm)) * 4 / (part?.subdivision ?? 8);
  const stepCount = part ? Math.max(1, Math.round(part.beats * part.subdivision / 4)) : 1;
  const byStep = new Map<number, DetectedStrike>();
  for (const onset of onsets) {
    const absoluteStep = Math.round((onset.timeSeconds * 1000 + offsetMs) / stepMs);
    if (absoluteStep < 0 || absoluteStep >= stepCount * loops) continue;
    const step = absoluteStep % stepCount;
    const strike = { ...onset, step, velocity: Math.max(1, Math.min(127, Math.round(48 + onset.confidence * 78))), selected: true };
    if (!byStep.has(step) || byStep.get(step)!.confidence < strike.confidence) byStep.set(step, strike);
  }
  return [...byStep.values()].sort((a, b) => a.step - b.step);
}

export function SongBuilderMicRecorder({ songId, part, bpm, disabled, onApply }: {
  songId: string;
  part: DrumPart | null;
  bpm: number;
  disabled?: boolean;
  onApply: (hits: SongPartHit[], replaceVoice: boolean, voice: SongInstrument) => void;
}) {
  const [recordings, setRecordings] = useState<BuilderMicRecording[]>([]);
  const [voice, setVoice] = useState<SongInstrument>("snare");
  const [loops, setLoops] = useState(1);
  const [offsetMs, setOffsetMs] = useState(0);
  const [replaceVoice, setReplaceVoice] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [recording, setRecording] = useState(false);
  const [detected, setDetected] = useState<DetectedStrike[]>([]);
  const [sourceOnsets, setSourceOnsets] = useState<MicrophoneOnset[]>([]);
  const [message, setMessage] = useState("Record one acoustic voice at a time. The browser asks for microphone access only when you start a take.");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timersRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const cancelledRef = useRef(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const releaseResources = useCallback(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  useEffect(() => {
    let mounted = true;
    void readBuilderMicRecordings(songId).then(items => { if (mounted) setRecordings(items); }).catch(() => { if (mounted) setMessage("Saved microphone takes are unavailable in this browser."); });
    return () => {
      mounted = false;
      cancelledRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.onerror = null;
        recorder.stop();
      }
      releaseResources();
    };
  }, [songId, releaseResources]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of recordings) next[item.id] = URL.createObjectURL(item.blob);
    setUrls(next);
    return () => Object.values(next).forEach(URL.revokeObjectURL);
  }, [recordings]);

  useEffect(() => {
    if (sourceOnsets.length) setDetected(snapOnsetsToGrid(sourceOnsets, part, bpm, offsetMs, loops));
  }, [sourceOnsets, part?.beats, part?.subdivision, bpm, offsetMs, loops]);

  const finishCapture = async (blob: Blob, durationMs: number) => {
    releaseResources();
    setRecording(false);
    setCountdown(0);
    if (!blob.size) { setMessage("No microphone audio was captured. Check the input device and try again."); return; }
    setMessage("Detecting likely strikes. Review them before adding notes to the pattern.");
    try {
      const onsets = await analyzeMicrophoneOnsets(blob);
      const strikes = snapOnsetsToGrid(onsets, part, bpm, offsetMs, loops);
      setSourceOnsets(onsets);
      setDetected(strikes);
      const item: BuilderMicRecording = { id: crypto.randomUUID(), songId, name: `Mic take · ${new Date().toLocaleString()}`, blob, mimeType: blob.type || "audio/webm", durationMs, createdAt: new Date().toISOString() };
      await saveBuilderMicRecording(item);
      const next = await readBuilderMicRecordings(songId);
      setRecordings(next);
      setMessage(`${strikes.length} likely strikes mapped to the ${part?.subdivision ?? 8}-step pattern grid. Adjust the voice or timing offset, then review the selected notes before adding them.`);
    } catch (error) {
      setDetected([]);
      setMessage(error instanceof Error ? error.message : "Could not analyze this microphone take.");
    }
  };

  const begin = async () => {
    if (!part || recording || countdown || disabled) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setMessage("Microphone recording is not supported in this browser. Use a recent browser over HTTPS or localhost."); return; }
    cancelledRef.current = false;
    setSourceOnsets([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (cancelledRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      const context = new AudioContext();
      audioContextRef.current = context;
      await context.resume();
      const interval = 60 / Math.max(40, Math.min(200, bpm));
      const countInBeats = Math.max(1, Math.min(8, Math.round(part.beats)));
      const startAt = context.currentTime + 0.12;
      setCountdown(countInBeats);
      for (let beat = 0; beat < countInBeats; beat += 1) {
        const oscillator = context.createOscillator(), gain = context.createGain(), at = startAt + beat * interval;
        oscillator.frequency.value = beat === 0 ? 1320 : 880;
        gain.gain.setValueAtTime(0.0001, at); gain.gain.linearRampToValueAtTime(0.18, at + 0.004); gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
        oscillator.connect(gain).connect(context.destination); oscillator.start(at); oscillator.stop(at + 0.06);
        timersRef.current.push(window.setTimeout(() => setCountdown(Math.max(0, countInBeats - beat - 1)), Math.max(0, (at - context.currentTime) * 1000)));
      }
      const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? { mimeType: "audio/webm;codecs=opus" } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => { releaseResources(); setRecording(false); setMessage("The microphone take was interrupted. Check the input permission and try again."); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void finishCapture(blob, Math.round(part.beats * 60_000 / Math.max(40, Math.min(200, bpm)) * loops));
      };
      const startDelay = Math.max(0, (startAt - context.currentTime + countInBeats * interval) * 1000);
      timersRef.current.push(window.setTimeout(() => {
        if (cancelledRef.current || recorder.state !== "inactive") return;
        chunksRef.current = [];
        recorder.start(100);
        setCountdown(0);
        setRecording(true);
        setMessage(`Recording ${loops} pattern pass${loops === 1 ? "" : "es"}. Keep one drum voice in focus for cleaner detection.`);
        timersRef.current.push(window.setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, Math.round(part.beats * 60_000 / Math.max(40, Math.min(200, bpm)) * loops)));
      }, startDelay));
    } catch (error) {
      releaseResources();
      setMessage(error instanceof Error && error.name === "NotAllowedError" ? "Microphone access was denied. Allow microphone access in the browser, then start a take again." : "Could not start microphone capture. Check the selected input and try again.");
    }
  };

  const stop = () => {
    cancelledRef.current = true;
    timersRef.current.forEach(window.clearTimeout); timersRef.current = [];
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else { releaseResources(); setCountdown(0); setRecording(false); setMessage("Count-in cancelled."); }
  };

  const selectedHits = detected.filter(hit => hit.selected).map(hit => ({ step: hit.step, instrument: voice, velocity: hit.velocity, accent: hit.velocity >= 105 }));

  return <section className="song-builder-mic-recorder" aria-label="Acoustic microphone recording">
    <h4>Acoustic mic overdub</h4>
    <p>Record a short pass with a count-in, preview detected strikes, then add a chosen drum voice to the active pattern. Microphone audio stays on this device.</p>
    <div className="song-builder-tool-fields">
      <label>Map detected strikes to<select value={voice} disabled={recording || countdown > 0} onChange={event => setVoice(event.target.value as SongInstrument)}>{VOICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Pattern passes<select value={loops} disabled={recording || countdown > 0} onChange={event => setLoops(Number(event.target.value))}>{[1, 2, 4, 8].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Grid alignment · ms<input type="number" min={-500} max={500} step={5} disabled={recording || countdown > 0} value={offsetMs} onChange={event => setOffsetMs(Math.max(-500, Math.min(500, Number(event.target.value) || 0)))}/></label>
    </div>
    <div className="song-builder-actions">
      {!recording && !countdown ? <button type="button" disabled={!part || disabled} onClick={() => void begin()}>Count in and record mic take</button> : <button type="button" className="recording" onClick={stop}>{countdown ? `Cancel · count-in ${countdown}` : "Stop take"}</button>}
      <label><input type="checkbox" checked={replaceVoice} disabled={recording || countdown > 0} onChange={event => setReplaceVoice(event.target.checked)}/>Replace this voice lane when applying</label>
      <button type="button" disabled={!selectedHits.length || disabled || recording || countdown > 0} onClick={() => { if (!selectedHits.length) return; onApply(selectedHits, replaceVoice, voice); setMessage(`${selectedHits.length} microphone-detected hits added. Review and correct them in the pattern grid.`); }}>Add selected hits to pattern</button>
    </div>
    {detected.length > 0 && <div className="song-builder-mic-review"><strong>Review {detected.length} detected grid positions</strong><div className="song-builder-mic-hit-list">{detected.slice(0, 64).map((hit, index) => <label key={`${hit.step}:${index}`}><input type="checkbox" checked={hit.selected} onChange={event => setDetected(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, selected: event.target.checked } : item))}/><span>Step {hit.step + 1}</span><small>{hit.timeSeconds.toFixed(2)} s · {hit.confidence >= 0.65 ? "clear" : "check"} · velocity {hit.velocity}</small></label>)}</div>{detected.length > 64 && <small>Showing the first 64; {detected.length} positions can be added.</small>}<button type="button" className="button-secondary" onClick={() => setDetected(current => current.map(hit => ({ ...hit, selected: !current.every(item => item.selected) })))}>{detected.every(hit => hit.selected) ? "Clear selection" : "Select all"}</button></div>}
    {recordings.map(item => <details key={item.id} className="song-builder-mic-saved"><summary>{item.name} · {(item.durationMs / 1000).toFixed(1)} s · {(item.blob.size / 1024).toFixed(0)} KB</summary><audio controls preload="none" src={urls[item.id]} aria-label={`Play ${item.name}`}/><div className="song-builder-actions"><a className="button-secondary" href={urls[item.id]} download={`${item.name.replace(/[^a-z0-9]+/gi, "-")}.${item.mimeType.includes("mp4") ? "m4a" : "webm"}`}>Download take</a><button type="button" onClick={() => void deleteBuilderMicRecording(item.id).then(() => setRecordings(current => current.filter(recording => recording.id !== item.id)))}>Delete take</button></div></details>)}
    <p role="status">{message}</p>
  </section>;
}
