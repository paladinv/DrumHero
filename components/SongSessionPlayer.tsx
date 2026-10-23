"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createDrumAudio, type DrumAudio } from "@/lib/audio";
import { BUILDER_VOICES, VOICE_LABEL } from "@/lib/song-builder";
import { buildSongTimeline, timingScore, type SongPracticeOptions, type SongTarget } from "@/lib/song-practice";
import type { AttemptEventTiming, DrumSong, SongNote, SongPracticeContext } from "@/lib/song-library";
import { normalizePlayerSettings,type PlayerSettings,type PracticePreset } from "@/lib/song-library-next";
import { readRecovery,recoveryStorageKey,timelineSignature,type RecoveryPoint } from "@/lib/song-practice-recovery";
import { SongLibraryNotation } from "./SongLibraryNotation";
import { SongMidiCalibration } from "./SongMidiCalibration";
import type { SongInstrument } from "@/lib/types";
import { classifyDrumAudio, classifyDrumFeatures, createDrumOnsetState, drumSpectrumFeatures, isFreshDrumOnset, rankDrumFeatureMatches, type AudioTemplates } from "@/lib/trainer-audio";

type Status = "idle" | "loading" | "count-in" | "playing" | "paused" | "rating" | "complete";
type Mode = "keyboard" | "audio" | "self" | "preview";
export type SongRunResult = SongPracticeContext & { songId: string; sectionId: string; score: number; stickingCorrect?: number; stickingChecked?: number };
type Run = { countInBpm?:number; resumeAt?:number; referenceSectionId?:string; referenceOffsetMs?:number; startAt: number; pauseAt: number; elapsed: number; cursor: number; guideCursor: number; lastBeat: string; targets: SongTarget[]; guideTargets: SongTarget[]; extras: Record<string, number>; restored?: boolean; inputUsed: boolean; touchOnly: boolean; midiUsed: boolean; audioUsed: boolean; lastView: number };
const audioVoices: SongInstrument[] = ["kick", "snare", "hihat", "openhat", "ride", "rimshot", "tom", "crash", "cowbell", "shaker", "tambourine"];
const SONG_AUDIO_KEY = "drum-hero:song-audio-templates:v2";
const LEGACY_SONG_AUDIO_KEY = "drum-hero:song-audio-templates:v1";
const calibrationRepeatability = (samples: number[][]) => {
  if (samples.length < 2 || !samples[0]?.length) return 0;
  const mean = samples[0].map((_, index) => samples.reduce((sum, sample) => sum + (sample[index] ?? 0), 0) / samples.length);
  const cosine = (left: number[], right: number[]) => {
    const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
    const magnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0) * right.reduce((sum, value) => sum + value * value, 0));
    return magnitude ? Math.max(0, Math.min(1, dot / magnitude)) : 0;
  };
  return Math.round(samples.reduce((sum, sample) => sum + cosine(sample, mean), 0) / samples.length * 100);
};
const keyVoices: Record<string, SongInstrument> = { Space: "kick", KeyF: "snare", KeyJ: "hihat", KeyK: "tom", KeyL: "crash", KeyH: "openhat", KeyR: "ride", KeyG: "rimshot", KeyY: "cowbell", KeyU: "shaker", KeyI: "tambourine", Digit1: "custom1", Digit2: "custom2", Digit3: "custom3", Digit4: "custom4", Digit5: "custom5", Digit6: "custom6", Digit7: "custom7", Digit8: "custom8" };
const voiceKeys: Record<SongInstrument, string> = { kick: "Space", snare: "F", hihat: "J", tom: "K", crash: "L", openhat: "H", ride: "R", rimshot: "G", cowbell: "Y", shaker: "U", tambourine: "I", custom1: "1", custom2: "2", custom3: "3", custom4: "4", custom5: "5", custom6: "6", custom7: "7", custom8: "8" };
export function SongSessionPlayer({ song, sectionId, partId, repetitions = 1, targetBpm, startBar, endBar, practiceLayer = "all", leadHand = "R", footVoices = ["kick"], countInBeats: initialCountInBeats = 4, preview = false, stage = false, autoStart = false, soloPartId, guideOtherParts = false, cues = [], onResults, onComplete, initialSettings, onSettingsChange, recoveryKey, recoveryPreset }: SongPracticeOptions & { song: DrumSong; initialSettings?:PlayerSettings;onSettingsChange?:(settings:PlayerSettings)=>void;recoveryKey?:string;recoveryPreset?:PracticePreset;countInBeats?: number; soloPartId?: string; guideOtherParts?: boolean; preview?: boolean; stage?: boolean; autoStart?: boolean; cues?: SongNote[]; onResults?: (results: SongRunResult[]) => void; onComplete?: () => void }) {
  const playerId = useId();
  const timeline = useMemo(() => buildSongTimeline(song, { sectionId, partId: soloPartId ?? partId, repetitions, targetBpm, startBar, endBar, allowUnclippedPart: !stage }), [song, sectionId, partId, soloPartId, repetitions, targetBpm, startBar, endBar, stage]);
  const roleGuides = useMemo(() => {
    if (!soloPartId || !guideOtherParts || !sectionId) return [];
    const section = song.sections.find((item) => item.id === sectionId);
    if (!section) return [];
    return section.parts.filter((part) => part.id !== soloPartId && (!stage || !section.clips || section.clips.some(clip => clip.partId === part.id))).flatMap((part) => buildSongTimeline(song, { sectionId, partId: part.id, repetitions, targetBpm, startBar, endBar, allowUnclippedPart: !stage }).targets);
  }, [song, sectionId, soloPartId, guideOtherParts, repetitions, targetBpm, startBar, endBar, stage]);
  const sessionTargets = useMemo(() => timeline.targets.filter(target => practiceLayer === "all" || (practiceLayer === "feet" ? footVoices.includes(target.instrument) : !footVoices.includes(target.instrument))).map(target => leadHand !== "L" || !target.sticking ? target : { ...target, sticking: target.sticking === "R" ? "L" as const : "R" as const }), [timeline.targets, practiceLayer, leadHand, footVoices]);
  const settings=normalizePlayerSettings(initialSettings);
  const kitType = song.kitSetup?.kitType ?? "acoustic";
  const kitProfile = (() => {
    const setup = JSON.stringify([kitType, song.kitSetup?.tuning?.trim() ?? "", song.kitSetup?.cymbals?.trim() ?? "", song.kitSetup?.pedal?.trim() ?? ""]);
    let hash = 2166136261;
    for (let index = 0; index < setup.length; index++) hash = Math.imul(hash ^ setup.charCodeAt(index), 16777619);
    return `${kitType}:${(hash >>> 0).toString(36)}`;
  })();
  const kitProfileLabel = `${kitType}${song.kitSetup && [song.kitSetup.tuning, song.kitSetup.cymbals, song.kitSetup.pedal].some(value => value?.trim()) ? " · saved kit setup" : " · default setup"}`;
  const [notation,setNotation]=useState(settings.notation);
  const [countInBeats,setCountInBeats]=useState(initialSettings?settings.countInBeats??4:Math.max(0,Math.min(16,Math.round(initialCountInBeats))));
  const [countInSubdivision,setCountInSubdivision]=useState(settings.countInSubdivision??1);
  const [countInVoice,setCountInVoice]=useState(settings.countInVoice??"click");
  const [playedHand,setPlayedHand]=useState<"R"|"L">("R");
  const [recovery,setRecovery]=useState<RecoveryPoint|null>(null);
  const [beatFraction,setBeatFraction]=useState(0);
  const [announceBeats,setAnnounceBeats]=useState(false);
  const [haptic,setHaptic]=useState(false);
  const [beatCue,setBeatCue]=useState("");
  const [mode, setMode] = useState<Mode>(preview || stage ? "preview" : settings.mode);
  const [status, setStatusState] = useState<Status>("idle");
  const statusRef = useRef<Status>("idle");
  const setStatus = useCallback((next: Status) => { statusRef.current = next; setStatusState(next); }, []);
  const [elapsed, setElapsed] = useState(0);
  const [barIndex, setBarIndex] = useState(0);
  const [guide, setGuide] = useState(preview || stage || settings.guide);
  const [click, setClick] = useState(settings.click);
  const [message, setMessage] = useState("");
  const [micConnected, setMicConnected] = useState(false);
  const [micMessage, setMicMessage] = useState("");
  const [micConfidence, setMicConfidence] = useState("");
  const [templates, setTemplates] = useState<AudioTemplates<SongInstrument>>({});
  const [templateQuality, setTemplateQuality] = useState<Partial<Record<SongInstrument, number>>>({});
  const [calibrationVoiceSelection, setCalibrationVoiceSelection] = useState<SongInstrument>("kick");
  const [calibratingVoice, setCalibratingVoice] = useState<SongInstrument | "">("");
  const [calibrationCount, setCalibrationCount] = useState(0);
  const [recap, setRecap] = useState<{ score: number; transitionScore?: number } | null>(null);
  const [feedback, setFeedback] = useState("");
  const audio = useRef<DrumAudio | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const micContext = useRef<AudioContext | null>(null);
  const micAnalyser = useRef<AnalyserNode | null>(null);
  const micFrame = useRef(0);
  const micOnset = useRef(createDrumOnsetState());
  const templatesRef = useRef<AudioTemplates<SongInstrument>>({});
  const calibrationRef = useRef<{ voice: SongInstrument; samples: number[][] } | null>(null);
  const hitRef = useRef<(instrument: SongInstrument, input: "keyboard" | "touch" | "midi" | "audio", occurredAt?: number, confidence?: number) => void>(() => {});
  const disconnectMicrophoneRef = useRef<() => void>(() => {});
  const run = useRef<Run | null>(null);
  const startRequest = useRef(0);
  const recoveryId=recoveryKey??`practice:${song.id}`;
  const signature=useMemo(()=>`${timelineSignature(timeline)}:${practiceLayer}:${leadHand}:${footVoices.join(",")}`,[timeline,practiceLayer,leadHand,footVoices]);
  useEffect(()=>{if(preview||stage)return;const timer=setTimeout(()=>setRecovery(readRecovery(recoveryId)),0);return()=>clearTimeout(timer);},[recoveryId,preview,stage]);
  useEffect(()=>{onSettingsChange?.({mode,guide,click,notation,countInBeats,countInSubdivision,countInVoice});},[mode,guide,click,notation,countInBeats,countInSubdivision,countInVoice,onSettingsChange]);
  const callbacks = useRef({ onResults, onComplete });
  useEffect(() => { callbacks.current = { onResults, onComplete }; }, [onResults, onComplete]);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(()=>{if(preview||stage)return;const save=()=>{const active=run.current;if(!active||!['count-in','playing','paused'].includes(statusRef.current))return;const time=Math.max(0,active.elapsed,active.resumeAt??0);const index=Math.max(0,timeline.bars.findIndex(bar=>time>=bar.startsAtMs&&time<bar.startsAtMs+bar.durationMs));try{localStorage.setItem(recoveryStorageKey(recoveryId),JSON.stringify({version:1,signature,barIndex:index,savedAt:new Date().toISOString(),settings:{mode,guide,click,notation},preset:recoveryPreset}));}catch{/* Existing progress remains usable. */}};const timer=setInterval(save,1000);window.addEventListener('pagehide',save);return()=>{save();clearInterval(timer);window.removeEventListener('pagehide',save);};},[preview,stage,recoveryId,signature,timeline,recoveryPreset,mode,guide,click,notation]);
  const clearRecovery=useCallback(()=>{if(!preview&&!stage)try{localStorage.removeItem(recoveryStorageKey(recoveryId));}catch{}setRecovery(null);},[preview,stage,recoveryId]);
  templatesRef.current = templates;
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SONG_AUDIO_KEY) || "null");
      const legacy = stored?.version === 1 ? stored : JSON.parse(localStorage.getItem(LEGACY_SONG_AUDIO_KEY) || "null");
      const profile = stored?.version === 2 ? stored.profiles?.[kitProfile] ?? stored.profiles?.[kitType] : kitType === "acoustic" ? legacy : undefined;
      if (profile?.templates && typeof profile.templates === "object") {
        const valid = Object.fromEntries(audioVoices.flatMap(voice => {
          const value = profile.templates[voice];
          return Array.isArray(value) && value.length === 5 && value.every((item: unknown) => typeof item === "number" && Number.isFinite(item)) ? [[voice, value]] : [];
        })) as AudioTemplates<SongInstrument>;
        const quality: Partial<Record<SongInstrument, number>> = {};
        for (const voice of audioVoices) {
          const score = profile.quality?.[voice];
          if (typeof score === "number" && Number.isFinite(score)) quality[voice] = Math.max(0, Math.min(100, Math.round(score)));
        }
        templatesRef.current = valid; setTemplates(valid); setTemplateQuality(quality);
      } else { templatesRef.current = {}; setTemplates({}); setTemplateQuality({}); }
    } catch { templatesRef.current = {}; setTemplates({}); setTemplateQuality({}); /* A malformed local calibration does not affect the library. */ }
  }, [kitProfile, kitType]);
  const active = ["loading", "count-in", "playing", "paused"].includes(status);
  const calibratedVoiceCount = audioVoices.filter(voice => templates[voice]).length;
  const selectedCalibrationQuality = templateQuality[calibrationVoiceSelection];
  const current = timeline.bars[barIndex];
  const nextSection = timeline.bars.slice(barIndex + 1).find((bar) => bar.sectionId !== current?.sectionId);
  const scopeKey = (section: string, part: string) => JSON.stringify([section, part]);
  const resultsForRun = useCallback((selfScore?: number): SongRunResult[] => {
    const currentRun = run.current;
    if (!currentRun) return [];
    const groups = new Map<string, SongTarget[]>();
    currentRun.targets.forEach((target) => { const key = scopeKey(target.sectionId, target.partId); groups.set(key, [...(groups.get(key) ?? []), target]); });
    return [...groups.entries()].map(([key, targets]) => {
      const first = targets[0], bars = timeline.bars.filter((bar) => bar.sectionId === first.sectionId && bar.partId === first.partId);
      const great = targets.filter((target) => target.rating === "great").length, good = targets.filter((target) => target.rating === "good").length;
      const stickingTargets = selfScore === undefined ? targets.filter((target) => target.sticking) : [];
      const stickingCorrect = stickingTargets.filter((target) => target.matched && target.playedSticking === target.sticking).length;
      const barTimings = bars.flatMap((bar, index) => audioVoices.flatMap(instrument => {
        const hits = targets.filter(target => target.barIndex === bar.index && target.instrument === instrument);
        if (!hits.length) return [];
        const timed = hits.filter(target => target.offsetMs !== undefined);
        return [{ bar: index + 1, instrument, targets: hits.length, missed: hits.filter(target => !target.matched).length, meanOffsetMs: timed.length ? Math.round(timed.reduce((sum, target) => sum + (target.offsetMs ?? 0), 0) / timed.length) : null }];
      }));
      const events: AttemptEventTiming[] = targets.map(target => {
        const bar = timeline.bars[target.barIndex];
        const partBar = bars.findIndex(item => item.index === target.barIndex) + 1;
        return { bar: Math.max(1, partBar), beat: bar ? Math.max(0, (target.atMs - bar.startsAtMs) / (60000 / bar.bpm)) : 0, instrument: target.instrument, offsetMs: target.offsetMs ?? null, confidence: target.confidence, sticking: target.sticking, playedSticking: target.playedSticking };
      }).slice(0, 1000);
      return { songId: song.id, sectionId: first.sectionId, partId: first.partId, engine: "song", tempoScale: (targetBpm ?? song.bpm) / song.bpm, bpm: Math.round(Math.min(...bars.map((bar) => bar.bpm))), completePart: !currentRun.restored && !(startBar || endBar) && practiceLayer === "all" && leadHand === "R", stickingCorrect, stickingChecked: stickingTargets.length,
        timing: selfScore===undefined?{meanOffsetMs:Math.round(targets.filter(target=>target.offsetMs!==undefined).reduce((sum,target)=>sum+(target.offsetMs??0),0)/Math.max(1,targets.filter(target=>target.offsetMs!==undefined).length)),missed:targets.length-great-good,extra:currentRun.extras[key]??0,voices:audioVoices.map(instrument=>({instrument,missed:targets.filter(target=>target.instrument===instrument&&!target.matched).length})),bars:barTimings,events}:undefined,
        inputMode: selfScore !== undefined ? "self" : currentRun.audioUsed ? "audio" : currentRun.midiUsed ? "midi" : currentRun.touchOnly && currentRun.inputUsed ? "touch" : "keyboard", score: selfScore ?? timingScore(great, good, targets.length - great - good, currentRun.extras[key] ?? 0) };
    });
  }, [song, partId, repetitions, startBar, endBar, targetBpm, timeline.bars, practiceLayer, leadHand]);
  const finish = useCallback(() => {
    if (!["playing", "count-in"].includes(statusRef.current) || !run.current) return;
    window.dispatchEvent(new CustomEvent("drum-hero:song-reference-control", { detail: { action: "stop", songId: song.id, sectionId: run.current.referenceSectionId } }));
    if (mode === "audio") disconnectMicrophoneRef.current();
    run.current.targets.forEach((target) => { if (!target.matched) target.rating = "miss"; });
    clearRecovery();
    setElapsed(timeline.durationMs);
    if (mode === "self") { setStatus("rating"); return; }
    if (mode !== "preview") {
      const results = resultsForRun();
      callbacks.current.onResults?.(results);
      const transitions = run.current.targets.filter((target) => { const bar = timeline.bars[target.barIndex], previous = timeline.bars[target.barIndex - 1]; return previous && previous.sectionId !== bar.sectionId && target.atMs - bar.startsAtMs <= 60000 / bar.bpm; });
      const goodTransitions = transitions.filter((target) => target.rating === "great" || target.rating === "good").length;
      setRecap({ score: results.length ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length) : 0, transitionScore: transitions.length ? Math.round(100 * goodTransitions / transitions.length) : undefined });
    }
    setStatus("complete"); callbacks.current.onComplete?.();
  }, [clearRecovery, mode, resultsForRun, setStatus, song.id, timeline]);
  const tick = useCallback(() => {
    const currentRun = run.current;
    if (!currentRun || !["count-in", "playing"].includes(statusRef.current)) return;
    const now = performance.now(), time = now - currentRun.startAt;
    currentRun.elapsed = time;
    if (time < (currentRun.resumeAt??0)) {
      const beatMs = 60000 / (currentRun.countInBpm ?? timeline.bars[0]?.bpm ?? song.bpm), remainingMs = (currentRun.resumeAt??0)-time, remaining = Math.ceil(remainingMs / beatMs);
      const elapsedCount = Math.max(0, countInBeats * beatMs - remainingMs);
      const completedSubdivisions = Math.floor(elapsedCount / beatMs * countInSubdivision + 0.0001);
      const key = `count:${completedSubdivisions}`;
      if (currentRun.lastBeat !== key) { currentRun.lastBeat = key; const spoken = Math.max(1,remaining); setFeedback(`Count in: ${spoken}`); if (countInVoice === "spoken" && typeof speechSynthesis !== "undefined") { if(completedSubdivisions%countInSubdivision===0){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(String(spoken)));} } else if (click) audio.current?.click(completedSubdivisions === 0 || completedSubdivisions % countInSubdivision === 0 && Math.floor(completedSubdivisions / countInSubdivision) % 4 === 0); }
      return;
    }
    if (statusRef.current === "count-in") { setStatus("playing"); setFeedback("Play"); }
    const index = Math.max(0, timeline.bars.findIndex((bar) => time >= bar.startsAtMs && time < bar.startsAtMs + bar.durationMs));
    const bar = timeline.bars[index];
    if (bar) {
      const beat = Math.floor((time - bar.startsAtMs) / (60000 / bar.bpm)), key = `${index}:${beat}`;
      if (key !== currentRun.lastBeat) { currentRun.lastBeat = key; if(time < timeline.durationMs){setBeatCue(`${bar.sectionName}, bar ${index+1}, beat ${beat+1}`);if(click) audio.current?.click(beat===0);if(haptic)navigator.vibrate?.(beat===0?40:15);} }
    }
    while (currentRun.guideCursor < currentRun.guideTargets.length && currentRun.guideTargets[currentRun.guideCursor].atMs <= time) {
      const target = currentRun.guideTargets[currentRun.guideCursor++];
      if (guideOtherParts) audio.current?.hit(target.instrument, target.accent, target.velocity);
    }
    while (currentRun.cursor < currentRun.targets.length && currentRun.targets[currentRun.cursor].atMs <= time) {
      const target = currentRun.targets[currentRun.cursor++];
      if ((guide || mode === "preview") && time - target.atMs < 120) audio.current?.hit(target.instrument, target.accent, target.velocity);
    }
    currentRun.targets.forEach((target) => { if (!target.matched && time - target.atMs > 100) target.rating = "miss"; });
    if (now - currentRun.lastView > 80) { currentRun.lastView = now; setElapsed(Math.min(time, timeline.durationMs)); if(bar)setBeatFraction(Math.max(0,Math.min(1,(time-bar.startsAtMs)/bar.durationMs))); setBarIndex(time >= timeline.durationMs ? Math.max(0, timeline.bars.length - 1) : index); }
    if (time >= timeline.durationMs + 125) finish();
  }, [click, countInBeats, countInSubdivision, countInVoice, finish, guide, guideOtherParts, haptic, mode, setStatus, song.bpm, timeline]);
  useEffect(() => { if (!["playing", "count-in"].includes(status)) return; const timer = window.setInterval(tick, 20); return () => window.clearInterval(timer); }, [status, tick]);
  const hit = useCallback((instrument: SongInstrument, input: "keyboard" | "touch" | "midi" | "audio", occurredAt = performance.now(), confidence?: number) => {
    const currentRun = run.current;
    if (statusRef.current !== "playing" || (mode !== "keyboard" && !(mode === "audio" && input === "audio")) || !currentRun) return;
    currentRun.inputUsed = true;
    currentRun.touchOnly = currentRun.touchOnly && input === "touch";
    if (input === "midi") currentRun.midiUsed = true;
    if (input === "audio") currentRun.audioUsed = true;
    const time = occurredAt - currentRun.startAt;
    let candidate: SongTarget | undefined, nearest = 101;
    for (const target of currentRun.targets) { const delta = Math.abs(time - target.atMs); if (!target.matched && target.instrument === instrument && delta < nearest) { candidate = target; nearest = delta; } }
    if (candidate) { const offsetMs = Math.round(time - candidate.atMs); const rating = nearest <= 50 ? "great" as const : "good" as const; currentRun.targets = currentRun.targets.map((target) => target === candidate ? { ...target, matched: true, offsetMs, confidence, rating, playedSticking: target.sticking ? playedHand : undefined } : target); const stickingFeedback=candidate.sticking?` · ${playedHand===candidate.sticking?"sticking correct":`target ${candidate.sticking}, played ${playedHand}`}`:""; setFeedback(`${rating} · ${offsetMs > 0 ? "+" : ""}${offsetMs} ms · ${VOICE_LABEL[instrument]}${stickingFeedback}`); }
    else { const bar = timeline.bars.find((bar) => time >= bar.startsAtMs && time < bar.startsAtMs + bar.durationMs) ?? timeline.bars.at(-1); if (bar) { const key = scopeKey(bar.sectionId, bar.partId); currentRun.extras[key] = (currentRun.extras[key] ?? 0) + 1; } setFeedback(`Extra · ${VOICE_LABEL[instrument]}`); }
    audio.current?.hit(instrument);
  }, [mode, playedHand, timeline.bars]);
  hitRef.current = hit;
  const disconnectMicrophone = useCallback(() => {
    if (micFrame.current) cancelAnimationFrame(micFrame.current);
    micFrame.current = 0;
    micStream.current?.getTracks().forEach(track => track.stop());
    micStream.current = null;
    const context = micContext.current;
    micContext.current = null;
    micAnalyser.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => {});
    calibrationRef.current = null;
    setMicConnected(false); setCalibratingVoice(""); setCalibrationCount(0);
  }, []);
  disconnectMicrophoneRef.current = disconnectMicrophone;
  const connectMicrophone = async () => {
    if (micConnected || !navigator.mediaDevices?.getUserMedia) { setMicMessage("Microphone input is not available in this browser or page context."); return; }
    try {
      setMicMessage("Requesting microphone access…");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      micStream.current = stream;
      const context = new AudioContext(); micContext.current = context;
      await context.resume();
      const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
      context.createMediaStreamSource(stream).connect(analyser);
      micAnalyser.current = analyser; micOnset.current = createDrumOnsetState(); setMicConnected(true); setMicMessage("Microphone connected. Calibrate at least two voices to identify hits; calibrating all eight improves coverage.");
      const timeData = new Float32Array(analyser.fftSize), spectrum = new Float32Array(analyser.frequencyBinCount);
      const sample = () => {
        const activeAnalyser = micAnalyser.current, activeContext = micContext.current;
        if (!activeAnalyser || !activeContext) return;
        activeAnalyser.getFloatTimeDomainData(timeData);
        const detection = classifyDrumAudio(timeData, activeContext.sampleRate), now = performance.now();
        if (isFreshDrumOnset(micOnset.current, detection.peak, detection.rms, 0.012, now)) {
          activeAnalyser.getFloatFrequencyData(spectrum);
          const features = drumSpectrumFeatures(spectrum, activeContext.sampleRate, activeAnalyser.fftSize);
          const calibration = calibrationRef.current;
          if (calibration) {
            calibration.samples.push([...features]);
            setCalibrationCount(calibration.samples.length);
            if (calibration.samples.length >= 5) {
              const template = features.map((_, index) => calibration.samples.reduce((sum, row) => sum + row[index], 0) / calibration.samples.length);
              const next = { ...templatesRef.current, [calibration.voice]: template };
              const qualityScore = calibrationRepeatability(calibration.samples);
              const nextQuality = { ...templateQuality, [calibration.voice]: qualityScore };
              templatesRef.current = next; setTemplates(next); setTemplateQuality(nextQuality); calibrationRef.current = null; setCalibratingVoice(""); setCalibrationCount(0);
              try {
                const stored = JSON.parse(localStorage.getItem(SONG_AUDIO_KEY) || "null");
                const legacy = JSON.parse(localStorage.getItem(LEGACY_SONG_AUDIO_KEY) || "null");
                const profiles = stored?.version === 2 && stored.profiles && typeof stored.profiles === "object" ? stored.profiles : legacy?.version === 1 && legacy.templates && typeof legacy.templates === "object" ? { acoustic: { templates: legacy.templates, quality: {} } } : {};
                localStorage.setItem(SONG_AUDIO_KEY, JSON.stringify({ version: 2, profiles: { ...profiles, [kitProfile]: { templates: next, quality: nextQuality, updatedAt: new Date().toISOString() } } }));
              } catch { setMicMessage("Voice calibrated for this session; browser storage could not save it for next time."); }
              setMicMessage(`${calibration.voice} calibrated for the ${kitProfile} kit profile from five strikes. Repeatability: ${qualityScore}%. Calibration stays on this device.`);
            }
          } else {
            const ranked = rankDrumFeatureMatches(features, templatesRef.current), result = classifyDrumFeatures(features, templatesRef.current);
            const top = ranked[0], margin = top ? top.similarity - (ranked[1]?.similarity ?? 0) : 0;
            setMicConfidence(top ? `${Math.round(top.similarity * 100)}% ${top.instrument} match · ${Math.round(margin * 100)} point margin` : "No calibrated voices");
            if (result.instrument) hitRef.current(result.instrument, "audio", now, result.instrument === top?.instrument ? top.similarity : undefined);
            else setFeedback(`Uncertain microphone hit${top ? ` · closest to ${top.instrument}` : ""} · not scored`);
          }
        }
        micFrame.current = requestAnimationFrame(sample);
      };
      sample();
    } catch (error) {
      disconnectMicrophone();
      setMicMessage(error instanceof Error && error.name === "NotAllowedError" ? "Microphone permission was denied. Allow microphone access in the browser settings and reconnect." : "Microphone could not connect. Check the input device and try again.");
    }
  };
  const beginVoiceCalibration = (voice: SongInstrument) => {
    calibrationRef.current = { voice, samples: [] };
    setCalibratingVoice(voice); setCalibrationCount(0); setMicMessage(`Play five clear ${voice} strikes, leaving a short gap between each one.`);
  };
  useEffect(() => () => { disconnectMicrophone(); }, [disconnectMicrophone]);
  useEffect(() => { const listener = (event: Event) => { const detail = (event as CustomEvent<{ targetId?: string; voice?: SongInstrument; at?: number }>).detail; if (detail?.targetId === playerId && detail.voice && Number.isFinite(detail.at)) hit(detail.voice, "midi", detail.at); }; window.addEventListener("drum-hero:song-midi-hit", listener); return () => window.removeEventListener("drum-hero:song-midi-hit", listener); }, [hit, playerId]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLElement && event.target.closest("input,textarea,select,button,[contenteditable]")) return; if(event.code==='KeyP' && run.current && ['playing','count-in','paused'].includes(statusRef.current)){event.preventDefault();if(statusRef.current==='paused'){run.current.startAt+=performance.now()-run.current.pauseAt;const remainingMs=run.current.elapsed<(run.current.resumeAt??0)?Math.max(0,(run.current.resumeAt??0)-run.current.elapsed):0;window.dispatchEvent(new CustomEvent('drum-hero:song-reference-control',{detail:{action:'resume',songId:song.id,sectionId:run.current.referenceSectionId,offsetMs:run.current.referenceOffsetMs,delayMs:remainingMs}}));setStatus(remainingMs>0?'count-in':'playing');}else{run.current.pauseAt=performance.now();window.dispatchEvent(new CustomEvent('drum-hero:song-reference-control',{detail:{action:'pause',songId:song.id,sectionId:run.current.referenceSectionId}}));setStatus('paused');}return;}if(event.code==="KeyA"){setPlayedHand("L");return;}if(event.code==="KeyD"){setPlayedHand("R");return;}const voice = keyVoices[event.code]; if (voice && statusRef.current === "playing" && mode === "keyboard") { event.preventDefault(); hit(voice, "keyboard"); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [hit, mode, setStatus, song.id]);
  useEffect(() => { const stopOther = (event: Event) => { if ((event as CustomEvent<string>).detail === playerId) return; window.dispatchEvent(new CustomEvent("drum-hero:song-reference-control", { detail: { action: "stop", songId: song.id, sectionId: run.current?.referenceSectionId } })); disconnectMicrophone(); startRequest.current++; run.current = null; audio.current?.close(); audio.current = null; setStatus("idle"); setElapsed(0); setBarIndex(0); setFeedback(""); }; window.addEventListener("drum-hero:song-player-start", stopOther); return () => window.removeEventListener("drum-hero:song-player-start", stopOther); }, [playerId, setStatus, song.id, disconnectMicrophone]);
  useEffect(() => () => { window.dispatchEvent(new CustomEvent("drum-hero:song-reference-control", { detail: { action: "stop", songId: song.id, sectionId: run.current?.referenceSectionId } })); startRequest.current++; audio.current?.close(); }, [song.id]);
  const start = async (resumeBar?:number) => {
    if (!timeline.bars.length || !["idle", "complete"].includes(statusRef.current)) return;
    if (mode === "audio" && (!micConnected || calibratedVoiceCount < 2)) { setMicMessage("Connect the microphone and calibrate at least two drum voices before starting scored practice."); return; }
    const resumeAt=resumeBar!==undefined?timeline.bars[resumeBar]?.startsAtMs??0:0;
    const countInBpm=timeline.bars[resumeBar??0]?.bpm??song.bpm;
    const countInMs = Math.max(0,Math.min(16,countInBeats)) * 60000 / countInBpm;
    const referenceSectionId = timeline.bars[resumeBar ?? 0]?.sectionId;
    const referenceOffsetMs = referenceSectionId ? timeline.bars.slice(0, resumeBar ?? 0).filter(bar => bar.sectionId === referenceSectionId).reduce((sum, bar) => sum + bar.durationMs, 0) : 0;
    window.dispatchEvent(new CustomEvent("drum-hero:song-player-start", { detail: playerId }));
    window.dispatchEvent(new CustomEvent("drum-hero:song-reference-control", { detail: { action: "prime", songId: song.id, sectionId: referenceSectionId, offsetMs: referenceOffsetMs } }));
    const request = ++startRequest.current;
    setStatus("loading"); setRecap(null); setElapsed(0); setBarIndex(0);
    try { if (!audio.current) audio.current = createDrumAudio(); if (audio.current) await audio.current.ready; } catch { setMessage("Audio unavailable. Visual practice remains available."); }
    if (request !== startRequest.current) return;
    if (!audio.current) setMessage("Audio unavailable. Visual practice remains available.");
    setBarIndex(resumeBar??0);setElapsed(resumeAt);
    const upcoming=sessionTargets.filter(target=>target.atMs>=resumeAt).map(target=>({...target})),scoredTargets=upcoming,guideTargets=roleGuides.filter(target=>target.atMs>=resumeAt).map(target=>({...target})).sort((a,b)=>a.atMs-b.atMs);
    run.current = { startAt: performance.now() + countInMs - resumeAt, countInBpm, resumeAt, pauseAt: 0, elapsed: resumeAt-countInMs, cursor: 0, guideCursor: 0, lastBeat: "", targets: scoredTargets, guideTargets, restored: resumeBar!==undefined, extras: {}, inputUsed: false, touchOnly: true, midiUsed:false, audioUsed: mode === "audio", lastView: 0 };
    run.current.referenceSectionId = referenceSectionId;
    run.current.referenceOffsetMs = referenceOffsetMs;
    window.dispatchEvent(new CustomEvent("drum-hero:song-reference-control", { detail: { action: "start", songId: song.id, sectionId: referenceSectionId, delayMs: countInMs, offsetMs: referenceOffsetMs } }));
    setStatus("count-in");
  };
  const startRef = useRef(start); startRef.current = start;
  useEffect(() => {
    if (!autoStart || !stage || !timeline.bars.length) return;
    const timer = window.setTimeout(() => { void startRef.current(); }, 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, stage, song.id, timeline.bars.length]);
  const reset = () => { window.dispatchEvent(new CustomEvent("drum-hero:song-reference-control", { detail: { action: "stop", songId: song.id, sectionId: run.current?.referenceSectionId } })); clearRecovery(); startRequest.current++; audio.current?.close(); audio.current = null; run.current = null; setStatus("idle"); setElapsed(0); setBarIndex(0); setFeedback(""); setRecap(null); };
  return <div ref={panel} className={`song-session-player${stage ? " song-stage-view" : ""}`}>
    <div className="song-session-heading"><h3>{stage ? "Performance" : mode === "preview" ? "Listen" : "Song practice"} · {song.title}</h3><span>{status}</span></div>
    {!preview&&!stage&&recovery&&<div className="song-recovery"><p>Interrupted round at bar {recovery.barIndex+1}. Resume restarts that bar and scores only the remaining portion.</p><button type="button" disabled={active||recovery.signature!==signature||recovery.barIndex>=timeline.bars.length} onClick={()=>void start(recovery.barIndex)}>Resume interrupted round</button><button type="button" onClick={clearRecovery}>Discard interrupted round</button>{recovery.signature!==signature&&<p>Restore the saved settings first. Edited arrangements require a new round.</p>}</div>}
    {!preview && !stage && <label>Practice mode<select value={mode} disabled={active || status === "rating"} onChange={(event) => { const nextMode = event.target.value as Mode; reset(); if (nextMode !== "audio") disconnectMicrophone(); setMode(nextMode); }}><option value="keyboard">Score keyboard, MIDI, and pads</option><option value="audio">Score acoustic drums · microphone</option><option value="self">Play acoustic drums · self rating</option><option value="preview">Listen to arrangement</option></select></label>}
    {current ? <div className="song-current-cue"><span>Bar {barIndex + 1} / {timeline.bars.length} · {Math.round(current.bpm)} BPM · {current.meter}</span><strong>{current.sectionName}</strong><span>{current.partName}{current.marker ? ` · ${current.marker}` : ""}{current.feel&&current.feel.kind!=="straight"?` · ${current.feel.kind} ${current.feel.amount}%`:""}</span><p>Next: {nextSection?.sectionName ?? "Ending"}</p>{cues.filter((cue) => cue.kind === "stage-cue" && (!cue.sectionId || cue.sectionId === current.sectionId)).map((cue) => <p key={cue.id}>{cue.text}</p>)}{(()=>{const sectionBar=timeline.bars.slice(0,barIndex+1).filter(bar=>bar.sectionId===current.sectionId).length,beatNow=Math.floor((elapsed-current.startsAtMs)/(60000/current.bpm))+1;return cues.filter(cue=>cue.kind==="annotation"&&cue.sectionId===current.sectionId&&cue.bar===sectionBar&&(!cue.beat||cue.beat===beatNow)).map(cue=><p key={cue.id}>Annotation: {cue.text}</p>)})()}</div> : <p>Add a playable arrangement to begin.</p>}
    <progress aria-label="Song progress" max={Math.max(1, timeline.durationMs)} value={Math.max(0, elapsed)} />
    <div className="song-actions"><button type="button" className="button" disabled={active || status === "rating" || !timeline.bars.length || !sessionTargets.length || mode === "audio" && (!micConnected || calibratedVoiceCount < 2)} title={!sessionTargets.length ? "This practice layer has no targets in the selected scope." : mode === "audio" && (!micConnected || calibratedVoiceCount < 2) ? "Connect a microphone and calibrate at least two kit voices." : undefined} onClick={(event) => { event.currentTarget.blur(); void start(); }}>{mode === "audio" && (!micConnected || calibratedVoiceCount < 2) ? "Connect and calibrate 2 voices" : status === "complete" ? "Play again" : (countInBeats===0?"Start now":countInBeats===4?"Start four-count":`Start ${countInBeats}-beat count-in`)}</button><button type="button" disabled={!["count-in", "playing", "paused"].includes(status)} onClick={() => { if (!run.current) return; if (status === "paused") { run.current.startAt += performance.now() - run.current.pauseAt; const remainingMs = run.current.elapsed < (run.current.resumeAt ?? 0) ? Math.max(0, (run.current.resumeAt ?? 0) - run.current.elapsed) : 0; window.dispatchEvent(new CustomEvent("drum-hero:song-reference-control", { detail: { action: "resume", songId: song.id, sectionId: run.current.referenceSectionId, offsetMs: run.current.referenceOffsetMs, delayMs: remainingMs } })); setStatus(remainingMs > 0 ? "count-in" : "playing"); } else { run.current.pauseAt = performance.now(); window.dispatchEvent(new CustomEvent("drum-hero:song-reference-control", { detail: { action: "pause", songId: song.id, sectionId: run.current.referenceSectionId } })); setStatus("paused"); } }}>{status === "paused" ? "Resume" : "Pause"}</button><button type="button" onClick={reset}>Reset</button>{stage && <button type="button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void panel.current?.requestFullscreen().catch(() => setMessage("Fullscreen is unavailable in this browser.")); }}>Fullscreen</button>}</div>
    <details className="song-player-options"><summary>Sound and accessibility options</summary><label><input type="checkbox" checked={click} onChange={(event) => setClick(event.target.checked)} /> Metronome</label>{mode !== "preview" && <label><input type="checkbox" checked={guide} onChange={(event) => setGuide(event.target.checked)} /> Drum guide</label>}<label>Count-in beats<select value={countInBeats} disabled={active} onChange={event=>setCountInBeats(Number(event.target.value))}>{[0,1,2,3,4,8].map(value=><option key={value} value={value}>{value===0?"No count-in":`${value} beats`}</option>)}</select></label><label>Count-in subdivision<select value={countInSubdivision} disabled={active} onChange={event=>setCountInSubdivision(Number(event.target.value) as 1|2|3|4)}><option value={1}>Quarter notes</option><option value={2}>Eighth notes</option><option value={3}>Triplets</option><option value={4}>Sixteenth notes</option></select></label><label>Count-in sound<select value={countInVoice} disabled={active} onChange={event=>setCountInVoice(event.target.value as "click"|"spoken")}><option value="click">Drum click</option><option value="spoken">Spoken numbers</option></select></label>
    {!preview&&!stage&&mode==="keyboard"&&<SongMidiCalibration targetId={playerId}/>}
    {!preview&&!stage&&mode==="audio"&&<section className="song-microphone-calibration" aria-label="Song practice microphone scoring"><h3>Microphone scoring</h3><p>Five clear strikes per voice train the local kit profile. Similar sounding hits may be uncertain; those hits stay unscored. Use headphones to reduce guide or reference-audio bleed. Calibration data remains on this device.</p><button type="button" disabled={micConnected||active} onClick={()=>void connectMicrophone()}>Connect microphone</button>{micConnected&&<button type="button" onClick={()=>{disconnectMicrophone();setMicMessage("Microphone disconnected.");}}>Disconnect microphone</button>}<p>Active profile: {kitProfileLabel} · {calibratedVoiceCount}/8 voices calibrated</p>{micConnected&&<><label>Voice to calibrate<select value={calibrationVoiceSelection} disabled={!!calibratingVoice||active} onChange={event=>setCalibrationVoiceSelection(event.target.value as SongInstrument)}>{audioVoices.map(voice=><option key={voice} value={voice}>{voice}{templates[voice]?` · ${templateQuality[voice]===undefined?"calibrated":`${templateQuality[voice]}% repeatability`}`:""}</option>)}</select></label><button type="button" disabled={!!calibratingVoice||active} onClick={()=>beginVoiceCalibration(calibrationVoiceSelection)}>{calibratingVoice?`Calibrating ${calibratingVoice} · ${calibrationCount}/5 strikes`:`Calibrate ${calibrationVoiceSelection} · play five strikes`}</button><p>Input confidence: {micConfidence || "Waiting for a clear strike."}</p>{selectedCalibrationQuality !== undefined && selectedCalibrationQuality < 75 && <p>These strikes varied more than expected. Recalibrate with a short pause between similar playing dynamics.</p>}</>}<p role="status" aria-live="polite">{micMessage}</p></section>}
    {!stage&&<><label><input type="checkbox" checked={notation} onChange={event=>setNotation(event.target.checked)}/> Show notation while practicing</label><label><input type="checkbox" checked={announceBeats} onChange={event=>setAnnounceBeats(event.target.checked)}/> Announce beat cues to assistive technology</label><label><input type="checkbox" checked={haptic} onChange={event=>setHaptic(event.target.checked)}/> Haptic beat cues (supported devices)</label><p>Press P to pause or resume when focus is outside the controls. When the part has R/L sticking, press A for left hand and D for right hand to record sticking accuracy.</p></>}
    </details>{announceBeats&&<p role="status" aria-live="polite">{beatCue}</p>}{notation&&<SongLibraryNotation song={song} barsOverride={timeline.bars} activeBar={barIndex} activeFraction={beatFraction}/>}
    {mode==="keyboard"&&sessionTargets.some(target=>target.sticking)&&<div className="song-actions song-sticking-input" aria-label="Sticking input hand"><span>Hand for next hit</span><button type="button" aria-pressed={playedHand==="L"} onClick={()=>setPlayedHand("L")}>Left hand · A</button><button type="button" aria-pressed={playedHand==="R"} onClick={()=>setPlayedHand("R")}>Right hand · D</button><small>Sticking score compares annotated R/L hits; missing hits count against accuracy.</small></div>}
    <p role="status">{feedback || message || "Audio starts when you press Start."}</p>
    {mode === "keyboard" && <div className="song-session-pads">{BUILDER_VOICES.map((voice) => <button type="button" key={voice} disabled={status !== "playing"} onPointerDown={() => hit(voice, "touch")} onClick={(event) => { if (event.detail === 0) hit(voice, "touch"); }}><span>{VOICE_LABEL[voice]}</span><kbd>{voiceKeys[voice]}</kbd></button>)}</div>}
    {status === "rating" && <div><p>How did the complete arrangement feel?</p>{[{ label: "Clean", score: 100 }, { label: "Needs work", score: 50 }, { label: "Missed", score: 0 }].map((rating) => <button key={rating.label} type="button" onClick={() => { if (statusRef.current !== "rating") return; callbacks.current.onResults?.(resultsForRun(rating.score)); setRecap({ score: rating.score }); setStatus("complete"); callbacks.current.onComplete?.(); }}>{rating.label}</button>)}</div>}
    {recap && <p><strong>{recap.score}%</strong> {mode === "self" ? "self rating" : "average part score"}{recap.transitionScore === undefined ? "" : ` · ${recap.transitionScore}% accuracy on section entries`}</p>}
  </div>;
}
