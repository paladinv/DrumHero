"use client";

import { useEffect, useRef, useState } from "react";
import { TrainerNotationView } from "@/components/TrainerNotationView";
import { EAR_METERS, earMeterGroupings, type EarChallengeItem, type EarMeter } from "@/lib/ear-training";
import type { Instrument, PracticePattern } from "@/lib/types";
import { useLocalization } from "@/components/LocalizationProvider";
import styles from "@/components/RhythmEarTraining.module.css";

type Candidate = { pattern: PracticePattern; meter: EarMeter; bars: 1 | 2; grouping?: number[] };
type ClipEstimate = { bpm: number; tempoConfidence: number; meter: EarMeter | null; meterConfidence: number };
type AudioOnset = { id: string; timeMs: number };
const VOICES: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];

function detectTransients(samples: Float32Array, sampleRate: number) {
  const frameSize = Math.max(128, Math.floor(sampleRate * 0.01));
  const envelope: number[] = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(samples.length, start + frameSize);
    let energy = 0;
    for (let index = start; index < end; index += 1) energy += samples[index]! * samples[index]!;
    envelope.push(Math.sqrt(energy / Math.max(1, end - start)));
  }
  const flux = envelope.map((value, index) => Math.max(0, value - (envelope[index - 1] ?? 0) * 0.82));
  const peak = Math.max(...flux);
  if (peak < 0.006) return [];
  const threshold = Math.max(0.003, peak * 0.17);
  const hits: number[] = [];
  for (let index = 1; index < flux.length - 1; index += 1) {
    if (flux[index]! < threshold || flux[index]! < flux[index - 1]! || flux[index]! < flux[index + 1]!) continue;
    const timeMs = index * frameSize * 1000 / sampleRate;
    if (hits.length && timeMs - hits[hits.length - 1]! < 70) {
      const previous = Math.round(hits[hits.length - 1]! / (frameSize * 1000 / sampleRate));
      if (flux[index]! > flux[previous]!) hits[hits.length - 1] = timeMs;
      continue;
    }
    hits.push(timeMs);
  }
  return hits;
}

function estimateTempoAndMeter(onsets: number[]): ClipEstimate {
  const intervals: number[] = [];
  for (let index = 0; index < onsets.length; index += 1) {
    for (let next = index + 1; next < Math.min(onsets.length, index + 4); next += 1) {
      const interval = onsets[next]! - onsets[index]!;
      if (interval >= 120 && interval <= 5000) intervals.push(interval / (next - index));
    }
  }
  const votes = new Map<number, number>();
  for (const interval of intervals) {
    for (const factor of [0.5, 1, 2, 3, 4]) {
      const candidate = Math.round(60_000 * factor / interval);
      if (candidate >= 40 && candidate <= 200) votes.set(candidate, (votes.get(candidate) ?? 0) + 1 / Math.sqrt(factor));
    }
  }
  const rankedTempos = [...votes.entries()].map(([candidate, score]) => ({ bpm: candidate, score: score + Math.max(0, 8 - Math.abs(candidate - 90)) * 0.002 }))
    .map(item => ({ ...item, score: [...votes.entries()].reduce((sum, [candidate, score]) => sum + (Math.abs(candidate - item.bpm) <= 3 ? score : 0), 0) + item.score * 0.01 }))
    .sort((a, b) => b.score - a.score);
  const bestTempo = rankedTempos[0]?.bpm ?? 80;
  const secondTempo = rankedTempos.find(item => Math.abs(item.bpm - bestTempo) >= 8)?.score ?? 0;
  const tempoConfidence = intervals.length < 4 ? 0.25 : Math.max(0.2, Math.min(0.95, (rankedTempos[0]?.score ?? 0) / Math.max(0.01, (rankedTempos[0]?.score ?? 0) + secondTempo) + Math.min(0.2, intervals.length / 50)));

  const clipDuration = onsets.at(-1)! - onsets[0]!;
  const beatMs = 60_000 / bestTempo;
  const meterScores = EAR_METERS.flatMap(candidate => {
    const [numerator, denominator] = candidate.split("/").map(Number);
    const barMs = numerator! * 4 / denominator! * beatMs;
    const eligible = onsets.filter(time => time - onsets[0]! >= barMs * 0.82);
    if (eligible.length < 3 || clipDuration < barMs * 1.15) return [];
    const tolerance = Math.max(45, Math.min(110, beatMs * 0.12));
    const matched = eligible.filter(time => onsets.some(previous => Math.abs(previous - (time - barMs)) <= tolerance)).length;
    const coverage = Math.min(1, eligible.length / 6);
    return [{ meter: candidate, score: matched / eligible.length * coverage, observations: eligible.length }];
  }).sort((a, b) => b.score - a.score);
  const bestMeter = meterScores[0];
  const secondMeter = meterScores.find(item => item.meter !== bestMeter?.meter)?.score ?? 0;
  const meterConfidence = bestMeter ? Math.max(0.15, Math.min(0.95, bestMeter.score * 0.7 + Math.max(0, bestMeter.score - secondMeter) * 1.5)) : 0;
  return { bpm: bestTempo, tempoConfidence, meter: meterConfidence >= 0.25 ? bestMeter?.meter ?? null : null, meterConfidence };
}

function confidenceLabel(confidence: number) {
  return confidence >= 0.65 ? "high confidence" : confidence >= 0.4 ? "medium confidence" : "low confidence";
}

export function EarAudioImportPanel({ disabled, onSave }: { disabled?: boolean; onSave: (item: EarChallengeItem) => void }) {
  const { t } = useLocalization();
  const [bpm, setBpm] = useState(80);
  const [meter, setMeter] = useState<EarMeter>("4/4");
  const [bars, setBars] = useState<1 | 2>(1);
  const [subdivision, setSubdivision] = useState<8 | 12 | 16 | 20>(16);
  const [voice, setVoice] = useState<Instrument>("snare");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioOnsets, setAudioOnsets] = useState<AudioOnset[]>([]);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [clipDurationMs, setClipDurationMs] = useState(0);
  const [draggingOnsetId, setDraggingOnsetId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingStarted, setRecordingStarted] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [error, setError] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [estimate, setEstimate] = useState<ClipEstimate | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStream = useRef<MediaStream | null>(null);
  const recordingTicker = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingLimit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recordingTicker.current) clearInterval(recordingTicker.current);
      if (recordingLimit.current) clearTimeout(recordingLimit.current);
      if (recorder.current && recorder.current.state !== "inactive") { recorder.current.onstop = null; recorder.current.onerror = null; recorder.current.ondataavailable = null; recorder.current.stop(); }
      recordingStream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  function makeCandidate(onsets: number[], name: string, targetBpm: number, targetMeter: EarMeter, targetBars: 1 | 2, targetSubdivision: 8 | 12 | 16 | 20, targetVoice: Instrument) {
    const [numerator, denominator] = targetMeter.split("/").map(Number);
    const beatsPerBar = numerator! * 4 / denominator!;
    const stepMs = 60_000 / targetBpm * 4 / targetSubdivision;
    const durationMs = beatsPerBar * targetBars * 60_000 / targetBpm;
    const anchor = onsets[0] ?? 0;
    const hitsByStep = new Map<number, number>();
    for (const onset of onsets) {
      const elapsed = onset - anchor;
      if (elapsed < -stepMs / 2 || elapsed >= durationMs) continue;
      const step = Math.max(0, Math.min(Math.ceil(beatsPerBar * targetBars * targetSubdivision / 4) - 1, Math.round(elapsed / stepMs)));
      hitsByStep.set(step, (hitsByStep.get(step) ?? 0) + 1);
    }
    const hits = [...hitsByStep].map(([step, count]) => ({ step, instrument: targetVoice, ...(count > 1 ? { accent: true } : {}) }));
    if (!hits.length) { setCandidate(null); setError("No onsets fell within the selected tempo and bar range."); return; }
    const pattern: PracticePattern = { id: `ear-audio-${crypto.randomUUID()}`, name: name.replace(/\.[^.]+$/, "").slice(0, 70) || "Imported audio rhythm", level: "Intermediate", description: "Transient-detected rhythm from a local audio clip.", subdivision: targetSubdivision, beats: beatsPerBar * targetBars, defaultBpm: targetBpm, tempoRange: [40, 200], hits };
    setCandidate({ pattern, meter: targetMeter, bars: targetBars, grouping: earMeterGroupings(targetMeter)[0] });
    setError("");
  }

  const readAudio = async (file?: File) => {
    if (!file) return;
    setCandidate(null); setError(""); setSourceName(""); setAudioOnsets([]); setWaveform([]); setClipDurationMs(0); setAudioUrl(""); setEstimate(null);
    if (file.size > 24 * 1024 * 1024) { setError("Choose an audio clip smaller than 24 MB."); return; }
    if (!file.type.startsWith("audio/") && !/\.(wav|mp3|m4a|aac|ogg|webm|flac)$/i.test(file.name)) { setError("Choose a supported audio file such as WAV, MP3, M4A, OGG, or WebM."); return; }
    if (!window.AudioContext) { setError("Audio analysis is not available in this browser."); return; }
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      if (decoded.duration > 30) throw new Error("Clips are limited to 30 seconds. Trim the file and try again.");
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const samples = decoded.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1) mono[index] += samples[index]! / decoded.numberOfChannels;
      }
      const onsets = detectTransients(mono, decoded.sampleRate);
      if (onsets.length < 2) throw new Error("Fewer than two clear onsets were found. Try a louder, cleaner drum clip.");
      let peak = 0.001;
      for (const sample of mono) peak = Math.max(peak, Math.abs(sample));
      const bucketCount = 240;
      const envelope = Array.from({ length: bucketCount }, (_, bucket) => {
        const start = Math.floor(bucket * mono.length / bucketCount);
        const end = Math.max(start + 1, Math.floor((bucket + 1) * mono.length / bucketCount));
        let bucketPeak = 0;
        for (let index = start; index < Math.min(end, mono.length); index += 1) bucketPeak = Math.max(bucketPeak, Math.abs(mono[index]!));
        return bucketPeak / peak;
      });
      const detected = estimateTempoAndMeter(onsets);
      const detectedMeter = detected.meter ?? meter;
      const onsetMarkers = onsets.map(timeMs => ({ id: crypto.randomUUID(), timeMs }));
      setAudioOnsets(onsetMarkers); setWaveform(envelope); setClipDurationMs(decoded.duration * 1000);
      setEstimate(detected);
      setSourceName(file.name);
      setAudioUrl(URL.createObjectURL(file));
      const detectedVoice: Instrument = "snare";
      setVoice(detectedVoice);
      setBpm(detected.bpm); setMeter(detectedMeter);
      makeCandidate(onsets, file.name, detected.bpm, detectedMeter, bars, subdivision, detectedVoice);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This audio clip could not be analyzed.");
    } finally {
      await context?.close().catch(() => undefined);
    }
  };

  const updateSettings = (patch: Partial<{ bpm: number; meter: EarMeter; bars: 1 | 2; subdivision: 8 | 12 | 16 | 20; voice: Instrument }>) => {
    const next = { bpm, meter, bars, subdivision, voice, ...patch };
    setBpm(next.bpm); setMeter(next.meter); setBars(next.bars); setSubdivision(next.subdivision); setVoice(next.voice);
    if (candidate && audioOnsets.length) makeCandidate(audioOnsets.map(onset => onset.timeMs), sourceName, next.bpm, next.meter, next.bars, next.subdivision, next.voice);
  };

  const moveOnset = (id: string, timeMs: number) => {
    if (disabled) return;
    const next = audioOnsets.map(onset => onset.id === id ? { ...onset, timeMs: Math.max(0, Math.min(clipDurationMs, timeMs)) } : onset).sort((a, b) => a.timeMs - b.timeMs);
    setAudioOnsets(next);
    if (candidate && next.length) makeCandidate(next.map(onset => onset.timeMs), sourceName, bpm, meter, bars, subdivision, voice);
  };

  const stopRecording = () => {
    if (recordingTicker.current) clearInterval(recordingTicker.current);
    recordingTicker.current = null;
    if (recordingLimit.current) clearTimeout(recordingLimit.current);
    recordingLimit.current = null;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  };

  const startRecording = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Direct microphone recording is not available in this browser."); return; }
    setRecording(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      recordingStream.current = stream;
      setCandidate(null); setSourceName(""); setAudioOnsets([]); setWaveform([]); setClipDurationMs(0); setAudioUrl(""); setEstimate(null);
      const mimeType = typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : undefined;
      const activeRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.current = activeRecorder;
      activeRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      activeRecorder.onerror = () => { setError("The microphone recording stopped unexpectedly."); activeRecorder.onstop = null; stream.getTracks().forEach(track => track.stop()); recordingStream.current = null; recorder.current = null; if (recordingTicker.current) clearInterval(recordingTicker.current); recordingTicker.current = null; if (recordingLimit.current) clearTimeout(recordingLimit.current); recordingLimit.current = null; setRecording(false); setRecordingStarted(false); };
      activeRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); recordingStream.current = null; recorder.current = null;
        if (recordingTicker.current) clearInterval(recordingTicker.current);
        recordingTicker.current = null;
        if (recordingLimit.current) clearTimeout(recordingLimit.current);
        recordingLimit.current = null;
        setRecording(false); setRecordingStarted(false);
        if (!chunks.length) { setError("No microphone audio was captured. Try recording again."); return; }
        const file = new File(chunks, `microphone-rhythm-${Date.now()}.webm`, { type: activeRecorder.mimeType || chunks[0]?.type || "audio/webm" });
        void readAudio(file);
      };
      setRecordSeconds(0); activeRecorder.start(); setRecordingStarted(true);
      recordingTicker.current = setInterval(() => setRecordSeconds(seconds => Math.min(30, seconds + 1)), 1000);
      recordingLimit.current = setTimeout(() => activeRecorder.stop(), 30_000);
    } catch (cause) {
      recordingStream.current?.getTracks().forEach(track => track.stop()); recordingStream.current = null;
      setRecording(false); setRecordingStarted(false);
      setError(cause instanceof Error && cause.name === "NotAllowedError" ? "Microphone permission was denied. Allow microphone access and try again." : "The microphone could not be opened. Check that it is connected and try again.");
    }
  };

  const toggleStep = (step: number) => {
    setCandidate(current => {
      if (!current) return current;
      const exists = current.pattern.hits.some(hit => hit.instrument === voice && hit.step === step);
      const hits = exists ? current.pattern.hits.filter(hit => hit.instrument !== voice || hit.step !== step) : [...current.pattern.hits, { step, instrument: voice }];
      return { ...current, pattern: { ...current.pattern, hits: hits.sort((a, b) => a.step - b.step) } };
    });
  };

  return <section className={`card ${styles.builder}`} aria-label={t("Import a rhythm from an audio clip")}>
    <span className="eyebrow">{t("Local audio analysis")}</span><h3>{t("Turn an audio clip into a rhythm")}</h3>
    <p>{t("Upload a short local clip or record directly from your microphone. The browser finds likely drum transients, lets you adjust them against the waveform, then snaps them to a musical grid for notation review.")}</p>
    <label className={styles.packFile}>{t("Choose audio · maximum 24 MB and 30 seconds")}<input type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.webm,.flac" disabled={disabled || recording} onChange={event => { void readAudio(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
    <div className={styles.builderControls}><button type="button" className={recording ? "button" : "button-secondary"} disabled={disabled || recording} onClick={() => void startRecording()}>{t("Record with microphone · 30 second limit")}</button>{recordingStarted ? <button type="button" className="button" onClick={stopRecording}>{t("Stop and analyze")} · {recordSeconds}s</button> : recording ? <small role="status">{t("Waiting for microphone permission…")}</small> : null}<small>{t("Microphone access starts only when you press record. The captured audio stays in this browser.")}</small></div>
    {sourceName ? <><p><strong>{sourceName}</strong> · {t("Audio is analyzed locally and is not uploaded.")}</p>{audioUrl ? <audio controls preload="metadata" src={audioUrl} /> : null}</> : null}
    {waveform.length > 0 && clipDurationMs > 0 ? <section className={styles.waveformEditor} aria-label={t("Audio waveform and onset correction")}><strong>{t("Correct detected onsets")}</strong><p>{t("Drag an onset marker to the sound, or focus it and use the arrow keys. The notation preview updates as you adjust the waveform.")}</p><svg viewBox="0 0 1000 140" role="group" aria-label={t("Waveform with draggable detected onset markers")} onPointerMove={event => { if (!draggingOnsetId || disabled) return; const bounds = event.currentTarget.getBoundingClientRect(); const position = Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))); moveOnset(draggingOnsetId, position * clipDurationMs); }} onPointerUp={() => setDraggingOnsetId(null)} onPointerCancel={() => setDraggingOnsetId(null)}>
      <line x1="0" x2="1000" y1="70" y2="70" className={styles.waveformCenter} />
      {waveform.map((amplitude, index) => { const x = index * 1000 / waveform.length; const height = Math.max(2, amplitude * 62); return <rect key={index} x={x} y={70 - height / 2} width={Math.max(1, 1000 / waveform.length - 1)} height={height} rx="1" className={styles.waveformBar} />; })}
      {audioOnsets.map((onset, index) => <circle key={onset.id} cx={onset.timeMs / clipDurationMs * 1000} cy="70" r={draggingOnsetId === onset.id ? 9 : 7} className={styles.onsetMarker} role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-orientation="horizontal" aria-label={t("Onset {number} at {time} seconds", { number: index + 1, time: (onset.timeMs / 1000).toFixed(2) })} aria-valuemin={0} aria-valuemax={Math.round(clipDurationMs)} aria-valuenow={Math.round(onset.timeMs)} aria-valuetext={`${(onset.timeMs / 1000).toFixed(2)} seconds`} onPointerDown={event => { if (disabled) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDraggingOnsetId(onset.id); }} onKeyDown={event => { if (disabled) return; const amount = event.shiftKey ? 50 : 10; if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); moveOnset(onset.id, onset.timeMs + (event.key === "ArrowRight" ? amount : -amount)); } }} />)}
      </svg><small>{audioOnsets.length} {t("onsets detected")} · {t("Clip length")}: {(clipDurationMs / 1000).toFixed(1)}s</small></section> : null}
    {estimate ? <div className={styles.settingNote}><strong>{t("Automatic clip estimate")}</strong><span>{t("Tempo: {bpm} BPM · {confidence}", { bpm: estimate.bpm, confidence: t(confidenceLabel(estimate.tempoConfidence)) })}<br />{estimate.meter ? t("Meter: {meter} · {confidence}", { meter: t(estimate.meter), confidence: t(confidenceLabel(estimate.meterConfidence)) }) : t("Meter: no clear repeating bar detected. Choose the meter manually.")}</span><button type="button" className="button-secondary" disabled={disabled} onClick={() => updateSettings({ bpm: estimate.bpm, ...(estimate.meter ? { meter: estimate.meter } : {}) })}>{t("Use detected tempo and meter")}</button><small>{t("These are starting estimates. Review the notation and adjust the tempo or meter if needed.")}</small></div> : null}
    <div className={styles.builderControls}>
      <label>{t("Tempo")} · {bpm} BPM<input type="range" min={40} max={200} step={1} value={bpm} disabled={disabled || recording} onChange={event => updateSettings({ bpm: Number(event.target.value) })} /></label>
      <label>{t("Meter")}<select value={meter} disabled={disabled || recording} onChange={event => updateSettings({ meter: event.target.value as EarMeter })}>{EAR_METERS.map(value => <option value={value} key={value}>{t(value)}</option>)}</select></label>
      <label>{t("Bars to import")}<select value={bars} disabled={disabled || recording} onChange={event => updateSettings({ bars: Number(event.target.value) as 1 | 2 })}><option value={1}>{t("1 bar")}</option><option value={2}>{t("2 bars")}</option></select></label>
      <label>{t("Grid spacing")}<select value={subdivision} disabled={disabled || recording} onChange={event => updateSettings({ subdivision: Number(event.target.value) as 8 | 12 | 16 | 20 })}><option value={8}>{t("Eighth notes")}</option><option value={12}>{t("Triplets")}</option><option value={16}>{t("Sixteenth notes")}</option><option value={20}>{t("Quintuplets")}</option></select></label>
      <label>{t("Voice for detected hits")}<select value={voice} disabled={disabled || recording} onChange={event => updateSettings({ voice: event.target.value as Instrument })}>{VOICES.map(value => <option value={value} key={value}>{t(value)}</option>)}</select></label>
    </div>
    {candidate ? <section className={styles.packPreview}><h4>{t("Correct the imported rhythm in notation")}</h4><p>{t(candidate.meter)} · {candidate.bars} {t(candidate.bars === 1 ? "bar" : "bars")} · {candidate.pattern.hits.length} {t("snapped hits")}</p><p>{t("Detected onsets are anchored to the first clear transient. Drag markers on the waveform to correct timing; you can also click a staff position to add or remove a hit.")}</p><TrainerNotationView pattern={candidate.pattern} meter={candidate.meter} grouping={candidate.grouping} showRhythmStems editor={{ instrument: voice, onToggle: toggleStep, isActive: step => candidate.pattern.hits.some(hit => hit.instrument === voice && hit.step === step), isEnabled: () => true }} /><button className="button" type="button" disabled={disabled} onClick={() => onSave({ id: crypto.randomUUID(), level: "groove", meter: candidate.meter, feel: "straight", ...(candidate.grouping ? { grouping: candidate.grouping } : {}), bars: candidate.bars, style: "free", complexity: 2, pattern: candidate.pattern })}>{t("Save notation to a challenge pack")}</button></section> : null}
    {error ? <p role="status" aria-live="polite">{t(error)}</p> : null}
  </section>;
}
