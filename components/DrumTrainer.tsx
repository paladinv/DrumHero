"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDrumAudio, type DrumAudio } from "@/lib/audio";
import { patterns } from "@/lib/curriculum";
import { allSongs, readSongLibrary, recordSongScore, songPartPattern, writeSongLibrary, type Setlist } from "@/lib/song-library";
import { stepDurationMs } from "@/lib/scoring";
import { classifyDrumAudio, classifyDrumFeatures, drumSpectrumFeatures, estimateAudioVelocity } from "@/lib/trainer-audio";
import { TRAINER_KEY, expectedRoundHits, getTrainerDeviceProfile, midiNoteFromMessage, midiVelocityFromMessage, parseTrainerState, roundDurationMs, scoreTrainerHit, summarizeTrainerRound, type TrainerDeviceProfile, type TrainerFeel, type TrainerLimbFocus, type TrainerMode, type TrainerRating, type TrainerRound, type TrainerSource } from "@/lib/trainer";
import { CUSTOM_GROOVES_EVENT, readCustomGrooves, writeCustomGrooves } from "@/lib/custom-grooves";
import { canUseFillPractice, compatibleFillPatterns, createGrooveFillTransition, isGroovePattern } from "@/lib/fill-practice";
import { createTrainerLoopPattern, createTrainerSetupTransfer, parseSavedTrainerRoutine, parseTrainerSetupTransfer, TRAINER_PRACTICE_PATHS, type TrainerRoutine, type TrainerRoutineStep, type TrainerSetupTransfer } from "@/lib/trainer-enhancements";
import type { Groove, Instrument, PatternHit, PracticePattern, RatedHit } from "@/lib/types";
import { DrumKitCanvas, type DrumKitCanvasHandle } from "./DrumKitCanvas";
import { useProgress } from "./ProgressProvider";

type Phase = "idle" | "loading" | "count-in" | "running" | "rating" | "paused" | "calibrating" | "complete";
type Expected = ReturnType<typeof expectedRoundHits>[number];
type PracticePlan = { patternIds: string[]; currentIndex: number; minutes: number; name?: string; gated?: boolean; startedAt?: string; customSteps?: TrainerRoutineStep[] };
type HandPattern = "alternating" | "paradiddle" | "double-strokes";
type SpokenCount = "off" | "beats" | "subdivisions";
type LoopUnit = "beats" | "bars";
type TimingDrillFocus = { sourcePatternId: string; instrument: Instrument; beat: number; stepOffset: number };
type MemoryRecording = { blob: Blob; url: string; expectedMarkersMs: number[]; actualMarkersMs: number[] };
type AudioDynamicsCapture = { voice: Instrument; kind: "ghost" | "accent"; rms: number[] };
const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
const keys: Record<string, Instrument> = { Space: "kick", KeyF: "snare", KeyJ: "hihat", KeyK: "tom", KeyL: "crash" };
const REPETITIONS = [4, 8, 10, 16];
const CALIBRATION_BEATS = 8;
const CUSTOM_TRAINER_ROUTINE_KEY = "drum-hero:trainer-routine:v1";

export function DrumTrainer({ initialPatternId }: { initialPatternId?: string }) {
  const [libraryPatterns, setLibraryPatterns] = useState<PracticePattern[]>([]);
  const [customGrooves, setCustomGrooves] = useState<Groove[]>([]);
  const [librarySongs, setLibrarySongs] = useState(() => allSongs(readSongLibrary()));
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [activeSetlistId, setActiveSetlistId] = useState("");
  const [setlistIndex, setSetlistIndex] = useState(0);
  const availablePatterns = useMemo(() => [...patterns, ...libraryPatterns, ...customGrooves], [customGrooves, libraryPatterns]);
  const [patternId, setPatternId] = useState(initialPatternId ?? patterns[0].id);
  const selectedPattern = availablePatterns.find((item) => item.id === patternId) ?? patterns[0];
  const [fillPractice, setFillPractice] = useState(false);
  const [fillPatternId, setFillPatternId] = useState("");
  const [fillAfterBars, setFillAfterBars] = useState(2);
  const [timingDrillFocus, setTimingDrillFocus] = useState<TimingDrillFocus | null>(null);
  const [feel, setFeel] = useState<TrainerFeel>("straight");
  const [clickMode, setClickMode] = useState<"all" | "backbeat" | "subdivisions" | "sparse-bars">("all");
  const [limbFocus, setLimbFocus] = useState<TrainerLimbFocus>("all");
  const [handPattern, setHandPattern] = useState<HandPattern>("alternating");
  const [leadHand, setLeadHand] = useState<"R" | "L">("R");
  const fillChoices = compatibleFillPatterns(selectedPattern, availablePatterns);
  const selectedFill = fillChoices.find((item) => item.id === fillPatternId) ?? fillChoices[0];
  const canAddFillPractice = canUseFillPractice(selectedPattern) && fillChoices.length > 0;
  const phrase = useMemo(() => {
    const base = availablePatterns.find((item) => item.id === patternId) ?? patterns[0];
    if (!fillPractice || !canUseFillPractice(base)) return base;
    const choices = compatibleFillPatterns(base, availablePatterns);
    const fill = choices.find((item) => item.id === fillPatternId) ?? choices[0];
    return fill ? createGrooveFillTransition(base, fill, fillAfterBars, `fill-round:${encodeURIComponent(base.id)}:${encodeURIComponent(fill.id)}:${fillAfterBars}`) ?? base : base;
  }, [availablePatterns, fillAfterBars, fillPatternId, fillPractice, patternId]);
  const hasFocusedTimingDrill = timingDrillFocus?.sourcePatternId === phrase.id;
  const focusedStepOffset = hasFocusedTimingDrill ? timingDrillFocus.stepOffset : 0;
  const timingPracticePhrase = useMemo(() => hasFocusedTimingDrill && timingDrillFocus
    ? createTargetedTimingPattern(phrase, timingDrillFocus.instrument, timingDrillFocus.beat)
    : phrase, [hasFocusedTimingDrill, phrase, timingDrillFocus]);
  const trainingPhrase = useMemo(() => {
    if (limbFocus === "all") return timingPracticePhrase;
    const hits = timingPracticePhrase.hits.filter((hit) => limbFocus === "feet" ? hit.instrument === "kick" : hit.instrument !== "kick");
    return { ...timingPracticePhrase, name: `${timingPracticePhrase.name} · ${limbFocus} only`, description: `Practice the ${limbFocus} part alone. Other limb hits count as extras.`, hits };
  }, [limbFocus, timingPracticePhrase]);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopUnit, setLoopUnit] = useState<LoopUnit>("beats");
  const [loopStartBeat, setLoopStartBeat] = useState(1);
  const [loopEndBeat, setLoopEndBeat] = useState(4);
  const [loopStartBar, setLoopStartBar] = useState(1);
  const [loopEndBar, setLoopEndBar] = useState(1);
  const phraseBarCount = getPatternBarCount(phrase);
  const phraseBeatsPerBar = phrase.beats / phraseBarCount;
  const activeLoopStartBeat = loopUnit === "bars" ? (loopStartBar - 1) * phraseBeatsPerBar + 1 : loopStartBeat;
  const activeLoopEndBeat = loopUnit === "bars" ? loopEndBar * phraseBeatsPerBar : loopEndBeat;
  const pattern = useMemo(() => loopEnabled ? createTrainerLoopPattern(trainingPhrase, activeLoopStartBeat, activeLoopEndBeat) : trainingPhrase, [activeLoopEndBeat, activeLoopStartBeat, loopEnabled, trainingPhrase]);
  const showStickingCues = fillPractice || (isGroovePattern(selectedPattern) && (selectedPattern.style === "Fill study" || selectedPattern.style === "Groove + fill"));
  const handCues = useMemo(() => getStickingCues(pattern.hits, handPattern, leadHand), [handPattern, leadHand, pattern.hits]);
  const availableVoices = [...new Set(pattern.hits.map((hit) => hit.instrument))];
  const [requestedBpm, setRequestedBpm] = useState(pattern.defaultBpm);
  const bpm = fillPractice && selectedFill
    ? Math.max(Math.max(selectedPattern.tempoRange[0], selectedFill.tempoRange[0]), Math.min(Math.min(selectedPattern.tempoRange[1], selectedFill.tempoRange[1]), requestedBpm))
    : requestedBpm;
  const setBpm = setRequestedBpm;
  useEffect(() => {
    const load = () => {
      const state = readSongLibrary(), songs = allSongs(state);
      setLibrarySongs(songs); setSetlists(state.setlists);
      const next = songs.flatMap((song) => song.sections.flatMap((section) => section.parts.map((part) => songPartPattern(song, section, part))));
      setLibraryPatterns(next);
      const match = next.find((item) => item.id === initialPatternId);
      if (match) setBpm(match.defaultBpm);
    };
    const timer = window.setTimeout(load, 0);
    window.addEventListener("drum-hero:song-library-change", load);
    return () => { window.clearTimeout(timer); window.removeEventListener("drum-hero:song-library-change", load); };
  }, [initialPatternId, setBpm]);
  useEffect(() => {
    const load = () => {
      const next = readCustomGrooves();
      setCustomGrooves(next);
      const selected = next.find((item) => item.id === initialPatternId);
      if (selected) setBpm(selected.defaultBpm);
    };
    const timer = window.setTimeout(load, 0);
    window.addEventListener(CUSTOM_GROOVES_EVENT, load);
    return () => { window.clearTimeout(timer); window.removeEventListener(CUSTOM_GROOVES_EVENT, load); };
  }, [initialPatternId, setBpm]);
  const [trainerMode, setTrainerMode] = useState<TrainerMode>("self");
  const [source, setSource] = useState<TrainerSource>("keyboard");
  const [phase, setPhaseState] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const setPhase = (next: Phase) => { phaseRef.current = next; setPhaseState(next); };
  const [pausedFrom, setPausedFrom] = useState<Phase>("running");
  const [repetition, setRepetition] = useState(0);
  const repetitionRef = useRef(0);
  const [step, setStep] = useState(-1);
  const [countIn, setCountIn] = useState(4);
  const [repetitions, setRepetitions] = useState(10);
  const [countInBeats, setCountInBeats] = useState(4);
  const [tempoBuild, setTempoBuild] = useState(false);
  const [tempoLadder, setTempoLadder] = useState(false);
  const [tempoLadderStep, setTempoLadderStep] = useState<2 | 5 | 10>(5);
  const [tempoLadderTarget, setTempoLadderTarget] = useState<70 | 80 | 90 | 95>(90);
  const [tempoLadderFailure, setTempoLadderFailure] = useState<"repeat" | "lower">("repeat");
  const [tempoLadderMessage, setTempoLadderMessage] = useState("");
  const [practicePlan, setPracticePlan] = useState<PracticePlan | null>(null);
  const [planMinutes, setPlanMinutes] = useState(10);
  const [practicePathId, setPracticePathId] = useState<(typeof TRAINER_PRACTICE_PATHS)[number]["id"]>("backbeat");
  const [pathAccuracyTarget, setPathAccuracyTarget] = useState<70 | 80 | 85 | 90 | 95>(85);
  const [pathTimingTarget, setPathTimingTarget] = useState<25 | 35 | 50 | 75>(35);
  const [customRoutineName, setCustomRoutineName] = useState("My practice routine");
  const [customRoutineSteps, setCustomRoutineSteps] = useState<TrainerRoutineStep[]>([]);
  const [customRoutineGated, setCustomRoutineGated] = useState(true);
  const [customRoutineAccuracyTarget, setCustomRoutineAccuracyTarget] = useState<70 | 80 | 85 | 90 | 95>(85);
  const [customRoutineTimingTarget, setCustomRoutineTimingTarget] = useState<25 | 35 | 50 | 75>(35);
  const [customRoutineLoaded, setCustomRoutineLoaded] = useState(false);
  const [dynamicsPractice, setDynamicsPractice] = useState(false);
  const [ratings, setRatings] = useState<TrainerRating[]>([]);
  const ratingsRef = useRef<TrainerRating[]>([]);
  const [hits, setHits] = useState<RatedHit[]>([]);
  const hitsRef = useRef<RatedHit[]>([]);
  const [lastHit, setLastHit] = useState<RatedHit | null>(null);
  const [lastVelocity, setLastVelocity] = useState<number | null>(null);
  const [round, setRound] = useState<TrainerRound | null>(null);
  const [saved, setSaved] = useState(() => parseTrainerState(null));
  const [hydrated, setHydrated] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState("Choose an input to test it.");
  const [audioMessage, setAudioMessage] = useState("Recorded drum sounds load when you start a round.");
  const [lastMidiNote, setLastMidiNote] = useState<number | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioPeak, setAudioPeak] = useState(0);
  const [audioClipping, setAudioClipping] = useState(false);
  const [noiseFloor, setNoiseFloor] = useState<number | null>(null);
  const [measuringNoise, setMeasuringNoise] = useState(false);
  const [audioConnected, setAudioConnected] = useState(false);
  const [audioThreshold, setAudioThreshold] = useState(0.07);
  const [audioVoice, setAudioVoice] = useState<Instrument>("snare");
  const [calibrationVoice, setCalibrationVoice] = useState<Instrument>("snare");
  const [audioCalibrationHits, setAudioCalibrationHits] = useState(0);
  const [audioDynamicsCalibrationHits, setAudioDynamicsCalibrationHits] = useState(0);
  const [audioDynamicsKind, setAudioDynamicsKind] = useState<"ghost" | "accent" | "dynamics">("dynamics");
  const [deviceId, setDeviceId] = useState("");
  const [audioDevices, setAudioDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [midiInputs, setMidiInputs] = useState<Array<{ id: string; name: string }>>([]);
  const [profileKey, setProfileKey] = useState("keyboard");
  const [latencyTaps, setLatencyTaps] = useState(0);
  const [latencyMessage, setLatencyMessage] = useState("");
  const [spokenCount, setSpokenCount] = useState<SpokenCount>("off");
  const [recordAudio, setRecordAudio] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [recordingMessage, setRecordingMessage] = useState("");
  const [recordedClip, setRecordedClip] = useState<MemoryRecording | null>(null);
  const [referenceClip, setReferenceClip] = useState<MemoryRecording | null>(null);
  const recordedClipUrl = recordedClip?.url ?? "";
  const referenceClipUrl = referenceClip?.url ?? "";
  const [setupMessage, setSetupMessage] = useState("");
  const setupFileRef = useRef<HTMLInputElement>(null);
  const startAtRef = useRef(0), pauseAtRef = useRef(0), lastStepRef = useRef(-1), lastCountBeatRef = useRef(-1), lastAudioHitRef = useRef(0), lastAudioLevelRef = useRef(0);
  const audioThresholdRef = useRef(audioThreshold), audioVoiceRef = useRef(audioVoice), latencyRef = useRef(saved.latencyMs);
  const profileKeyRef = useRef(profileKey), savedRef = useRef(saved), repetitionsRef = useRef(repetitions), countInBeatsRef = useRef(countInBeats);
  const calibrationBeatRef = useRef(-1), calibrationTapsRef = useRef<Set<number>>(new Set()), calibrationOffsetsRef = useRef<number[]>([]);
  const audioCalibrationRef = useRef<{ voice: Instrument; features: number[][] } | null>(null);
  const audioDynamicsCalibrationRef = useRef<AudioDynamicsCapture | null>(null);
  const noiseRmsRef = useRef(0);
  const noiseMeasurementRef = useRef<{ until: number; values: number[] } | null>(null);
  const expectedRef = useRef<Expected[]>([]), audioRef = useRef<DrumAudio | null>(null), kitRef = useRef<DrumKitCanvasHandle>(null);
  const startRequestRef = useRef(0);
  const clippingStreakRef = useRef(0);
  const actualRecordingMarkersRef = useRef<number[]>([]);
  const midiRef = useRef<MIDIAccess | null>(null), streamRef = useRef<MediaStream | null>(null), contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null), frameRef = useRef<number | null>(null), sourceRef = useRef(source);
  const recorderRef = useRef<MediaRecorder | null>(null), recordingStreamRef = useRef<MediaStream | null>(null);
  const ownsRecordingStreamRef = useRef(false), discardedRecordersRef = useRef(new WeakSet<MediaRecorder>());
  const { progress, recordTrainerRound, setSound } = useProgress();
  const duration = roundDurationMs(pattern, bpm);
  const activeProfile = getTrainerDeviceProfile(saved, profileKey);
  const audioDynamicsVoice = source === "audio-timing" ? audioVoice : calibrationVoice;
  const audioDynamicsLevels = activeProfile.audioDynamics?.[audioDynamicsVoice];

  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { repetitionsRef.current = repetitions; }, [repetitions]);
  useEffect(() => { countInBeatsRef.current = countInBeats; }, [countInBeats]);
  useEffect(() => { profileKeyRef.current = profileKey; latencyRef.current = activeProfile.latencyMs; }, [activeProfile.latencyMs, profileKey]);
  useEffect(() => { const id = window.setTimeout(() => { const state = parseTrainerState(localStorage.getItem(TRAINER_KEY)); savedRef.current = state; setSaved(state); setHydrated(true); }, 0); return () => clearTimeout(id); }, []);
  useEffect(() => { if (hydrated) { try { localStorage.setItem(TRAINER_KEY, JSON.stringify(saved)); } catch { /* Training still works without storage. */ } } }, [hydrated, saved]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const routine = parseSavedTrainerRoutine(localStorage.getItem(CUSTOM_TRAINER_ROUTINE_KEY));
      if (routine) { setCustomRoutineName(routine.name); setCustomRoutineSteps(routine.steps); setCustomRoutineGated(routine.gated); setCustomRoutineAccuracyTarget(routine.accuracyTarget); setCustomRoutineTimingTarget(routine.timingTarget); }
      setCustomRoutineLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!customRoutineLoaded) return;
    const routine: TrainerRoutine = { name: customRoutineName, steps: customRoutineSteps, gated: customRoutineGated, accuracyTarget: customRoutineAccuracyTarget, timingTarget: customRoutineTimingTarget };
    try { localStorage.setItem(CUSTOM_TRAINER_ROUTINE_KEY, JSON.stringify(routine)); } catch { /* The routine can still be used during this visit. */ }
  }, [customRoutineAccuracyTarget, customRoutineGated, customRoutineLoaded, customRoutineName, customRoutineSteps, customRoutineTimingTarget]);
  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => { const url = recordedClip?.url; return () => { if (url) URL.revokeObjectURL(url); }; }, [recordedClip?.url]);
  useEffect(() => { const url = referenceClip?.url; return () => { if (url) URL.revokeObjectURL(url); }; }, [referenceClip?.url]);
  useEffect(() => {
    if (spokenCount === "off" && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    return () => { if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); };
  }, [spokenCount]);

  const updateProfile = useCallback((key: string, update: (profile: TrainerDeviceProfile) => TrainerDeviceProfile) => {
    setSaved((state) => ({ ...state, deviceProfiles: { ...state.deviceProfiles, [key]: update(getTrainerDeviceProfile(state, key)) } }));
  }, []);
  const chooseProfile = useCallback((key: string) => {
    profileKeyRef.current = key; setProfileKey(key);
    latencyRef.current = getTrainerDeviceProfile(savedRef.current, key).latencyMs;
  }, []);

  const stopAudioInput = useCallback(() => {
    audioCalibrationRef.current = null;
    audioDynamicsCalibrationRef.current = null;
    noiseMeasurementRef.current = null;
    noiseRmsRef.current = 0;
    setAudioCalibrationHits(0);
    setAudioDynamicsCalibrationHits(0);
    setAudioDynamicsKind("dynamics");
    clippingStreakRef.current = 0; setAudioClipping(false);
    setMeasuringNoise(false);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null; analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    setAudioConnected(false);
    if (contextRef.current) void contextRef.current.close(); contextRef.current = null;
    setAudioLevel(0); setAudioPeak(0); setNoiseFloor(null);
  }, []);
  const disconnectMidi = useCallback(() => {
    midiRef.current?.inputs.forEach((input) => { input.onmidimessage = null; });
    if (midiRef.current) midiRef.current.onstatechange = null;
    midiRef.current = null; setMidiInputs([]);
  }, []);
  const stopPerformanceRecording = useCallback((discard = false) => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      if (discard) discardedRecordersRef.current.add(recorder);
      recorder.stop();
    }
    else {
      if (ownsRecordingStreamRef.current) recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null; ownsRecordingStreamRef.current = false; recorderRef.current = null;
    }
    setRecordingActive(false);
  }, []);
  const reset = useCallback(() => {
    startRequestRef.current += 1;
    if (recorderRef.current && recorderRef.current.state !== "inactive") stopPerformanceRecording(true);
    setPhase("idle"); setRepetition(0); repetitionRef.current = 0; setStep(-1); setCountIn(countInBeatsRef.current);
    ratingsRef.current = []; setRatings([]); hitsRef.current = []; setHits([]); setLastHit(null); setLastVelocity(null); setRound(null);
    expectedRef.current = []; lastStepRef.current = -1; lastCountBeatRef.current = -1;
  }, [stopPerformanceRecording]);
  const finish = useCallback(() => {
    if (phaseRef.current === "complete") return;
    if (trainerMode === "scored") expectedRef.current.forEach((target) => { if (!target.matched) { target.matched = true; hitsRef.current.push({ instrument: target.instrument, rating: "miss", offsetMs: null, accentTarget: Boolean(target.accent), articulation: target.articulation, step: target.step, repetition: target.repetition }); } });
    const result = summarizeTrainerRound(pattern, bpm, trainerMode, trainerMode === "self" ? "self" : sourceRef.current, ratingsRef.current, hitsRef.current, repetitionsRef.current);
    if (hasFocusedTimingDrill && timingDrillFocus) result.focusedDrill = { instrument: timingDrillFocus.instrument, beat: timingDrillFocus.beat };
    result.feel = feel; result.limbFocus = limbFocus;
    if (tempoLadder) {
      const scoredReady = result.result ? isTempoLadderReady(result.result.accuracy, result.result.miss, result.result.great + result.result.good + result.result.miss, hitsRef.current, tempoLadderTarget) : null;
      const selfClean = result.ratings.filter((rating) => rating === "clean").length;
      const selfMissed = result.ratings.filter((rating) => rating === "missed").length;
      const selfReady = result.ratings.length > 0 && selfMissed === 0 && selfClean / result.ratings.length >= tempoLadderTarget / 100;
      const ready = scoredReady ?? selfReady;
      const nextBpm = ready ? Math.min(pattern.tempoRange[1], bpm + tempoLadderStep) : tempoLadderFailure === "lower" ? Math.max(pattern.tempoRange[0], bpm - tempoLadderStep) : bpm;
      setTempoLadderMessage(ready
        ? nextBpm === bpm ? `Top tempo reached at ${bpm} BPM. Keep it steady or choose a harder pattern.` : `Target met. Next round: ${nextBpm} BPM.`
        : `Target missed. ${nextBpm === bpm ? `Repeat ${bpm}` : `Lower to ${nextBpm}`} BPM and try again.`);
      if (nextBpm !== bpm) setBpm(nextBpm);
    } else if (tempoBuild && trainerMode === "scored") {
      const score = result.result;
      const adjustment = score ? getScoredTempoAdjustment(score.accuracy, score.miss, score.great + score.good + score.miss, hitsRef.current) : 0;
      const nextBpm = Math.max(pattern.tempoRange[0], Math.min(pattern.tempoRange[1], bpm + adjustment));
      if (nextBpm !== bpm) setBpm(nextBpm);
    }
    actualRecordingMarkersRef.current = getActualHitMarkerTimes(hitsRef.current, countInBeatsRef.current, bpm);
    stopPerformanceRecording();
    setHits([...hitsRef.current]); setRound(result); setPhase("complete"); setRepetition(repetitionsRef.current);
    setSaved((state) => ({ ...state, rounds: [result, ...state.rounds].slice(0, 50) }));
    recordTrainerRound(result.playedAt.slice(0, 10));
    if (pattern.id.startsWith("song:")) { const [, songId, sectionId] = pattern.id.split(":"); const score = result.result?.score ?? Math.round(result.ratings.reduce((sum, rating) => sum + (rating === "clean" ? 100 : rating === "needsWork" ? 50 : 0), 0) / Math.max(1, result.ratings.length)); writeSongLibrary(recordSongScore(readSongLibrary(), songId, sectionId, score)); }
  }, [bpm, feel, hasFocusedTimingDrill, limbFocus, pattern, recordTrainerRound, setBpm, stopPerformanceRecording, tempoBuild, tempoLadder, tempoLadderFailure, tempoLadderStep, tempoLadderTarget, timingDrillFocus, trainerMode]);
  const tick = useCallback((now = performance.now()) => {
    if (phaseRef.current !== "count-in" && phaseRef.current !== "running" && phaseRef.current !== "calibrating") return;
    const beatMs = 60000 / bpm;
    if (now < startAtRef.current) {
      const remaining = Math.max(1, Math.ceil((startAtRef.current - now) / beatMs));
      setCountIn(remaining);
      if (remaining !== lastCountBeatRef.current) { lastCountBeatRef.current = remaining; if (phaseRef.current === "calibrating" || progress.settings.sound) audioRef.current?.click(remaining === countInBeatsRef.current); }
      return;
    }
    if (phaseRef.current === "calibrating") {
      const elapsed = now - startAtRef.current, beat = Math.floor(elapsed / beatMs);
      if (beat !== calibrationBeatRef.current && beat < CALIBRATION_BEATS) {
        calibrationBeatRef.current = beat; setCountIn(CALIBRATION_BEATS - beat);
        audioRef.current?.click(beat === 0);
      }
      if (elapsed >= CALIBRATION_BEATS * beatMs) {
        const offsets = calibrationOffsetsRef.current;
        if (offsets.length >= 4) {
          const sorted = [...offsets].sort((a, b) => a - b);
          const latency = Math.max(-200, Math.min(200, Math.round(sorted[Math.floor(sorted.length / 2)])));
          const key = profileKeyRef.current;
          updateProfile(key, (profile) => ({ ...profile, latencyMs: latency }));
          latencyRef.current = latency;
          setLatencyMessage("Calibration saved for this device: " + (latency > 0 ? "+" : "") + latency + " ms.");
        } else setLatencyMessage("Only " + offsets.length + " taps were captured. Try again and tap with the click.");
        setPhase("idle"); setLatencyTaps(offsets.length);
      }
      return;
    }
    if (phaseRef.current === "count-in") setPhase("running");
    const elapsed = now - startAtRef.current;
    const index = trainerMode === "self" ? repetitionRef.current : Math.min(repetitionsRef.current - 1, Math.floor(elapsed / duration));
    if (index !== repetitionRef.current) { repetitionRef.current = index; setRepetition(index); }
    const nextStep = Math.floor((elapsed % duration) / stepDurationMs(bpm, pattern.subdivision));
    if (nextStep !== lastStepRef.current) {
      lastStepRef.current = nextStep; setStep(nextStep);
      const stepMs = stepDurationMs(bpm, pattern.subdivision);
      const beatBoundary = nextStep % (pattern.subdivision / 4) === 0;
      const speakGrid = spokenCount === "subdivisions" && stepMs >= 230;
      const speakBeats = spokenCount === "beats" || (spokenCount === "subdivisions" && stepMs < 230);
      const hasSpeech = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
      if (hasSpeech && !window.speechSynthesis.speaking && !window.speechSynthesis.pending && (speakGrid || (speakBeats && beatBoundary))) {
        const token = getSpokenCount(pattern, nextStep, speakBeats);
        if (token && "speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(token);
          utterance.rate = 1.6;
          window.speechSynthesis.speak(utterance);
        }
      }
      if (progress.settings.sound) {
        if (shouldClickStep(pattern, nextStep, clickMode)) audioRef.current?.click(nextStep === 0);
        if (trainerMode === "self") pattern.hits.filter((hit) => hit.step === nextStep).forEach((hit) => audioRef.current?.hit(hit.instrument));
      }
    }
    if (trainerMode === "scored") expectedRef.current.forEach((target) => {
      if (!target.matched && now - target.at > 100) { target.matched = true; hitsRef.current.push({ instrument: target.instrument, rating: "miss", offsetMs: null, accentTarget: Boolean(target.accent), articulation: target.articulation, step: target.step, repetition: target.repetition }); setHits([...hitsRef.current]); }
    });
    if (trainerMode === "self" && elapsed >= (repetitionRef.current + 1) * duration) { pauseAtRef.current = now; setPhase("rating"); setStep(pattern.beats * (pattern.subdivision / 4) - 1); }
    if (trainerMode === "scored" && elapsed >= repetitionsRef.current * duration + 125) finish();
  }, [bpm, clickMode, duration, finish, pattern, progress.settings.sound, spokenCount, trainerMode, updateProfile]);
  useEffect(() => { if (phase !== "count-in" && phase !== "running" && phase !== "calibrating") return; const id = window.setInterval(() => tick(), 20); return () => clearInterval(id); }, [phase, tick]);
  const beginPerformanceRecording = async (request: number) => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordingMessage("Audio recording is unavailable in this browser; the practice round will still run."); return;
    }
    let stream = streamRef.current, ownsStream = false;
    try {
      if (!stream) { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); ownsStream = true; }
      if (request !== startRequestRef.current) { if (ownsStream) stream.getTracks().forEach((track) => track.stop()); return; }
      if (!stream) throw new Error("No recording stream is available.");
      const recordingStream = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(recordingStream, { mimeType }) : new MediaRecorder(recordingStream);
      const chunks: BlobPart[] = [];
      recordingStreamRef.current = recordingStream; ownsRecordingStreamRef.current = ownsStream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onerror = () => setRecordingMessage("The microphone recording stopped unexpectedly.");
      recorder.onstop = () => {
        const discarded = discardedRecordersRef.current.has(recorder);
        const isCurrentRecorder = recorderRef.current === recorder;
        if (!discarded && chunks.length) {
          const clip = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (clip.size > 0) { setRecordedClip({ blob: clip, url: URL.createObjectURL(clip), expectedMarkersMs: getExpectedHitMarkerTimes(pattern, bpm, repetitions, countInBeats, feel, source === "audio-timing" ? audioVoice : undefined), actualMarkersMs: actualRecordingMarkersRef.current }); if (isCurrentRecorder) setRecordingMessage("Recording ready. Play it back below to review your performance."); }
        } else if (discarded && isCurrentRecorder) setRecordingMessage("The in-progress recording was cleared.");
        if (ownsStream) recordingStream.getTracks().forEach((track) => track.stop());
        if (isCurrentRecorder) { recordingStreamRef.current = null; ownsRecordingStreamRef.current = false; recorderRef.current = null; setRecordingActive(false); }
      };
      recorder.start(250); setRecordingActive(true); setRecordingMessage("Microphone recording is active for this round and stays in this page until you leave.");
    } catch {
      if (ownsStream) stream?.getTracks().forEach((track) => track.stop());
      if (request === startRequestRef.current) setRecordingMessage("Microphone access was denied or recording could not start; the practice round will still run.");
    }
  };
  const start = async () => {
    reset(); const request = startRequestRef.current; if (!audioRef.current) audioRef.current = createDrumAudio();
    const audio = audioRef.current;
    if (!audio) setAudioMessage("Web Audio is unavailable; visual timing remains active.");
    else if (progress.settings.sound) {
      setAudioMessage("Loading recorded drum sounds…");
      setPhase("loading");
      const complete = await audio.ready;
      if (startRequestRef.current !== request) return;
      setAudioMessage(complete ? "Recorded drum sounds and metronome are ready." : "Some recorded samples failed to load; unavailable drum voices will be silent.");
    } else setAudioMessage("Sound is muted; visual timing remains active.");
    if (startRequestRef.current !== request) return;
    if (recordAudio) await beginPerformanceRecording(request);
    if (startRequestRef.current !== request) return;
    const startAt = performance.now() + countInBeats * 60000 / bpm;
    actualRecordingMarkersRef.current = [];
    startAtRef.current = startAt; expectedRef.current = expectedRoundHits(pattern, bpm, startAt, repetitions, feel)
      .map((hit) => focusedStepOffset ? { ...hit, step: hit.step + focusedStepOffset } : hit)
      .filter((hit) => source !== "audio-timing" || hit.instrument === audioVoice);
    setCountIn(countInBeats);
    setPhase("count-in");
  };
  const rate = (rating: TrainerRating, at: number) => {
    if (phaseRef.current !== "rating") return;
    ratingsRef.current = [...ratingsRef.current, rating]; setRatings(ratingsRef.current);
    let nextBpm = bpm;
    if (trainerMode === "self" && tempoBuild && !tempoLadder) nextBpm = Math.max(pattern.tempoRange[0], Math.min(pattern.tempoRange[1], bpm + (rating === "clean" ? 2 : rating === "missed" ? -2 : 0)));
    if (ratingsRef.current.length >= repetitionsRef.current) { if (nextBpm !== bpm) setBpm(nextBpm); finish(); return; }
    repetitionRef.current = ratingsRef.current.length; setRepetition(repetitionRef.current);
    const nextDuration = roundDurationMs(pattern, nextBpm);
    if (nextBpm !== bpm) setBpm(nextBpm);
    startAtRef.current = at - repetitionRef.current * nextDuration;
    lastStepRef.current = -1; setStep(0); setPhase("running");
  };
  const pause = () => { if (phaseRef.current !== "running" && phaseRef.current !== "count-in") return; setPausedFrom(phaseRef.current); pauseAtRef.current = performance.now(); if (recorderRef.current?.state === "recording") recorderRef.current.pause(); setPhase("paused"); };
  const resume = () => { if (phaseRef.current !== "paused") return; const shift = performance.now() - pauseAtRef.current; startAtRef.current += shift; expectedRef.current.forEach((target) => { target.at += shift; }); if (recorderRef.current?.state === "paused") recorderRef.current.resume(); setPhase(pausedFrom); };
  const startLatencyCalibration = async () => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "complete") return;
    if (!audioRef.current) audioRef.current = createDrumAudio();
    const request = ++startRequestRef.current;
    setLatencyMessage("Preparing the count-in sound…"); setPhase("loading");
    if (audioRef.current) await audioRef.current.ready;
    if (startRequestRef.current !== request) return;
    calibrationOffsetsRef.current = []; calibrationTapsRef.current = new Set(); calibrationBeatRef.current = -1;
    setLatencyTaps(0); setLatencyMessage("Tap with the click for eight beats after the count-in.");
    startAtRef.current = performance.now() + countInBeats * 60000 / bpm;
    lastCountBeatRef.current = -1; setCountIn(countInBeats); setPhase("calibrating");
  };
  const receiveHit = useCallback((instrument: Instrument, input: TrainerSource, velocity?: number) => {
    kitRef.current?.hit(instrument);
    if (phaseRef.current === "calibrating") {
      const now = performance.now();
      if (now >= startAtRef.current) {
        const beatMs = 60000 / bpm;
        const beat = Math.round((now - startAtRef.current) / beatMs);
        const offset = now - (startAtRef.current + beat * beatMs);
        if (beat >= 0 && beat < CALIBRATION_BEATS && Math.abs(offset) <= beatMs * 0.45 && !calibrationTapsRef.current.has(beat)) {
          calibrationTapsRef.current.add(beat); calibrationOffsetsRef.current.push(offset); setLatencyTaps(calibrationOffsetsRef.current.length);
        }
      }
      return;
    }
    setLastVelocity(velocity ?? null);
    const now = performance.now();
    const graceDuringCountIn = phaseRef.current === "count-in" && expectedRef.current.some((target) => !target.matched && Math.abs(now - target.at) <= 100);
    if ((phaseRef.current !== "running" && !graceDuringCountIn) || trainerMode !== "scored" || sourceRef.current !== input) return;
    const value = scoreTrainerHit(now, expectedRef.current, instrument, latencyRef.current);
    value.atMs = Math.round(now - latencyRef.current - startAtRef.current);
    if (typeof velocity === "number") value.velocity = velocity;
    hitsRef.current = [...hitsRef.current, value]; setHits(hitsRef.current); setLastHit(value);
    if (progress.settings.sound && input !== "audio-timing" && input !== "audio-voices") audioRef.current?.hit(instrument);
  }, [bpm, progress.settings.sound, trainerMode]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (phaseRef.current === "calibrating" && (event.code === "Space" || event.code === "Enter")) { event.preventDefault(); receiveHit("snare", sourceRef.current); return; }
    const voice = keys[event.code]; if (voice && trainerMode === "scored" && sourceRef.current === "keyboard") { event.preventDefault(); receiveHit(voice, "keyboard"); }
  }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [receiveHit, trainerMode]);

  const connectMidi = async () => {
    if (!navigator.requestMIDIAccess) { setDeviceMessage("Web MIDI is unavailable in this browser. Use touch, keyboard, or audio input."); return; }
    try {
      disconnectMidi(); const access = await navigator.requestMIDIAccess({ sysex: false }); midiRef.current = access;
      const bind = () => {
        const inputs = [...access.inputs.values()]; setMidiInputs(inputs.map((input) => ({ id: input.id, name: input.name ?? "MIDI input" })));
        inputs.forEach((input) => { input.onmidimessage = (event) => {
          const data = event.data, note = data ? midiNoteFromMessage(data) : null; if (note === null) return;
          const key = "midi:" + input.id; chooseProfile(key);
          const instrument = getTrainerDeviceProfile(savedRef.current, key).midiMap[note] ?? null;
          const velocity = data ? midiVelocityFromMessage(data) : null;
          setLastMidiNote(note);
          setLastVelocity(velocity);
          setDeviceMessage(instrument ? "MIDI note " + note + " → " + instrument + " · velocity " + (velocity ?? 0) : "MIDI note " + note + " is unmapped. Assign a voice below.");
          if (instrument) receiveHit(instrument, "midi", velocity ?? undefined);
        }; });
      }; bind(); access.onstatechange = bind;
      setDeviceMessage(access.inputs.size ? "MIDI connected. Strike a pad to test its mapping." : "MIDI access granted; connect and power on your kit.");
    } catch { setDeviceMessage("MIDI access was denied or failed. Keyboard and touch remain available."); }
  };
  // Rebind when mapping or scoring callback changes, without requesting permission again.
  useEffect(() => { midiRef.current?.inputs.forEach((input) => { input.onmidimessage = (event) => {
    const data = event.data, note = data ? midiNoteFromMessage(data) : null; if (note === null) return;
    const key = "midi:" + input.id; chooseProfile(key);
    const instrument = getTrainerDeviceProfile(savedRef.current, key).midiMap[note] ?? null;
    const velocity = data ? midiVelocityFromMessage(data) : null;
    setLastMidiNote(note); setLastVelocity(velocity);
    setDeviceMessage(instrument ? "MIDI note " + note + " → " + instrument + " · velocity " + (velocity ?? 0) : "MIDI note " + note + " is unmapped. Assign a voice below.");
    if (instrument) receiveHit(instrument, "midi", velocity ?? undefined);
  }; }); }, [chooseProfile, receiveHit, saved.deviceProfiles]);

  const measureBackgroundNoise = () => {
    if (!audioConnected) { setDeviceMessage("Connect the audio input before measuring the room noise."); return; }
    noiseMeasurementRef.current = { until: performance.now() + 2000, values: [] };
    setNoiseFloor(null); setMeasuringNoise(true);
    setDeviceMessage("Measuring the room. Keep the kit quiet for two seconds.");
  };
  const connectAudio = async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setDeviceMessage("Audio input is unavailable in this browser."); return; }
    try {
      stopAudioInput();
      clippingStreakRef.current = 0; setAudioClipping(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { ideal: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      setAudioConnected(true);
      setNoiseFloor(null);
      const context = new AudioContext(); contextRef.current = context;
      const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0; analyserRef.current = analyser;
      context.createMediaStreamSource(stream).connect(analyser);
      const connectedId = stream.getAudioTracks()[0]?.getSettings().deviceId || deviceId || "default";
      const audioProfileKey = "audio:" + connectedId; chooseProfile(audioProfileKey);
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(list.filter((item) => item.kind === "audioinput").map((item) => ({ id: item.deviceId, label: item.label || "Audio input" })));
      const buffer = new Float32Array(analyser.fftSize), spectrum = new Float32Array(analyser.frequencyBinCount);
      const sample = () => {
        if (!analyserRef.current) return;
        analyser.getFloatTimeDomainData(buffer);
        const detected = classifyDrumAudio(buffer, context.sampleRate);
        clippingStreakRef.current = detected.peak >= 0.985 ? clippingStreakRef.current + 1 : 0;
        if (clippingStreakRef.current >= 2) setAudioClipping(true);
        const now = performance.now();
        if (now - lastAudioLevelRef.current > 100) {
          lastAudioLevelRef.current = now;
          setAudioLevel(Math.round(Math.min(100, detected.rms * 1000)));
          setAudioPeak(Math.round(Math.min(100, detected.peak * 100)));
        }
        const noiseMeasurement = noiseMeasurementRef.current;
        if (noiseMeasurement) {
          if (now < noiseMeasurement.until && !detected.peak) noiseMeasurement.values.push(detected.rms);
          if (now >= noiseMeasurement.until) {
            noiseMeasurementRef.current = null;
            setMeasuringNoise(false);
            const sorted = noiseMeasurement.values.slice().sort((a, b) => a - b);
            const measuredRms = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
            noiseRmsRef.current = measuredRms;
            const nextThreshold = Math.max(0.03, Math.min(0.4, measuredRms * 5 + 0.02));
            setNoiseFloor(Math.round(measuredRms * 1000));
            audioThresholdRef.current = nextThreshold; setAudioThreshold(nextThreshold);
            setDeviceMessage(sorted.length ? `Room noise measured at ${Math.round(measuredRms * 1000)}%. Detection threshold adjusted to ${Math.round(nextThreshold * 100)}%.` : "No quiet samples were captured. Keep still and measure the room again.");
          }
        }
        const calibrationNoise = noiseRmsRef.current || 0.005;
        const activeDetectionThreshold = audioDynamicsCalibrationRef.current
          ? Math.max(0.035, Math.min(audioThresholdRef.current, calibrationNoise * 3))
          : audioThresholdRef.current;
        const hitDebounceMs = pattern.hits.some((hit) => hit.articulation) ? 25 : 90;
        if (detected.peak >= activeDetectionThreshold && performance.now() - lastAudioHitRef.current > hitDebounceMs) {
          lastAudioHitRef.current = performance.now();
          analyser.getFloatFrequencyData(spectrum);
          const features = drumSpectrumFeatures(spectrum, context.sampleRate, analyser.fftSize);
          const dynamicsCalibration = audioDynamicsCalibrationRef.current;
          const calibration = audioCalibrationRef.current;
          if (dynamicsCalibration) {
            dynamicsCalibration.rms.push(detected.rms);
            setAudioDynamicsCalibrationHits(dynamicsCalibration.rms.length);
            if (dynamicsCalibration.rms.length >= 5) {
              const sorted = [...dynamicsCalibration.rms].sort((a, b) => a - b);
              const measuredRms = sorted[Math.floor(sorted.length / 2)];
              const profile = getTrainerDeviceProfile(savedRef.current, audioProfileKey);
              const previous = profile.audioDynamics?.[dynamicsCalibration.voice] ?? {};
              const noiseRms = noiseRmsRef.current || previous.noiseRms || 0;
              if (noiseRms <= 0 || measuredRms <= noiseRms * 1.2) {
                setDeviceMessage("The taps were too close to the room-noise level. Measure room noise and try again.");
              } else if (dynamicsCalibration.kind === "accent" && (!previous.ghostRms || measuredRms <= previous.ghostRms * 1.15)) {
                setDeviceMessage("Accent calibration needs to be clearly stronger than ghost taps. Repeat the ghost calibration or strike the accent harder.");
              } else {
                const nextLevels = { ...previous, noiseRms, [`${dynamicsCalibration.kind}Rms`]: measuredRms };
                updateProfile(audioProfileKey, (current) => ({ ...current, audioDynamics: { ...current.audioDynamics, [dynamicsCalibration.voice]: nextLevels } }));
                setDeviceMessage(`${dynamicsCalibration.kind === "ghost" ? "Ghost-note" : "Accent"} strength saved for ${dynamicsCalibration.voice}. Calibrate both levels for dynamics feedback.`);
              }
              audioDynamicsCalibrationRef.current = null; setAudioDynamicsCalibrationHits(0);
            }
          } else if (calibration) {
            calibration.features.push(features); setAudioCalibrationHits(calibration.features.length);
            if (calibration.features.length >= 5) {
              const average = features.map((_, i) => calibration.features.reduce((sum, item) => sum + item[i], 0) / calibration.features.length);
              updateProfile(audioProfileKey, (profile) => ({ ...profile, audioTemplates: { ...profile.audioTemplates, [calibration.voice]: average } }));
              setDeviceMessage(calibration.voice + " calibration saved from five hits.");
              audioCalibrationRef.current = null; setAudioCalibrationHits(0);
            }
          } else {
            const result = classifyDrumFeatures(features, savedRef.current.deviceProfiles[audioProfileKey]?.audioTemplates ?? {});
            const input = sourceRef.current;
            const voice = input === "audio-timing" ? audioVoiceRef.current : result.instrument;
            const confidence = input === "audio-voices" ? " (" + Math.round(result.confidence * 100) + "% confidence)" : "";
            setDeviceMessage(voice ? "Audio hit: " + voice + confidence : "Audio hit detected; voice uncertain. Calibrate this device before scoring voices.");
            const levels = voice ? savedRef.current.deviceProfiles[audioProfileKey]?.audioDynamics?.[voice] : undefined;
            const estimatedVelocity = voice ? estimateAudioVelocity(detected.rms, levels) : null;
            if (voice) receiveHit(voice, input, estimatedVelocity ?? undefined);
          }
        }
        frameRef.current = requestAnimationFrame(sample);
      }; sample(); setDeviceMessage("Audio input connected. Strike a drum to test the signal.");
    } catch { stopAudioInput(); setDeviceMessage("Audio permission was denied or the input could not start."); }
  };
  const beginAudioCalibration = () => {
    if (!audioConnected) { setDeviceMessage("Connect the audio input first."); return; }
    if (audioDynamicsCalibrationRef.current) { setDeviceMessage("Finish the dynamics calibration before calibrating drum voices."); return; }
    audioCalibrationRef.current = { voice: calibrationVoice, features: [] };
    setAudioCalibrationHits(0); setDeviceMessage("Strike the " + calibrationVoice + " five times, with a short pause between hits.");
  };
  const beginAudioDynamicsCalibration = (kind: "ghost" | "accent") => {
    if (!audioConnected) { setDeviceMessage("Connect the audio input before calibrating dynamics."); return; }
    if (audioCalibrationRef.current) { setDeviceMessage("Finish the drum-voice calibration before calibrating dynamics."); return; }
    const voice = source === "audio-timing" ? audioVoice : calibrationVoice;
    const current = getTrainerDeviceProfile(savedRef.current, profileKey.startsWith("audio:") ? profileKey : "audio:default").audioDynamics?.[voice];
    if (!noiseRmsRef.current && !current?.noiseRms) { setDeviceMessage("Measure background noise before calibrating dynamics."); return; }
    if (kind === "accent" && !current?.ghostRms) { setDeviceMessage("Calibrate five soft ghost-note taps for this voice first."); return; }
    audioDynamicsCalibrationRef.current = { voice, kind, rms: [] };
    setAudioDynamicsKind(kind);
    setAudioDynamicsCalibrationHits(0);
    setDeviceMessage(`Play five ${kind === "ghost" ? "very soft ghost-note" : "strong accent"} taps on the ${voice}; leave a short gap between hits.`);
  };
  useEffect(() => () => { startRequestRef.current += 1; stopPerformanceRecording(true); stopAudioInput(); disconnectMidi(); audioRef.current?.close(); }, [stopAudioInput, stopPerformanceRecording, disconnectMidi]);
  useEffect(() => { window.render_game_to_text = () => { const nextTarget = expectedRef.current.find((target) => !target.matched); return JSON.stringify({ mode: phaseRef.current, pattern: pattern.name, bpm, input: trainerMode === "self" ? "self" : sourceRef.current, repetition: repetitionRef.current + 1, total: repetitions, step, countIn, ratings: ratingsRef.current.length, hits: hitsRef.current.length, lastHit, nextTargetInMs: nextTarget ? Math.round(nextTarget.at - performance.now()) : null }); };
    window.advanceTime = (ms) => { const shift = Math.max(0, ms); startAtRef.current -= shift; expectedRef.current.forEach((target) => { target.at -= shift; }); tick(performance.now()); };
    return () => { delete window.render_game_to_text; delete window.advanceTime; };
  }, [bpm, countIn, lastHit, pattern.name, repetitions, step, tick, trainerMode]);

  const settingsLocked = phase !== "idle" && phase !== "complete";
  const activeSetlist = setlists.find((item) => item.id === activeSetlistId);
  const setlistPatterns = activeSetlist ? getSetlistPatterns(activeSetlist, librarySongs) : [];
  const nextSetlistPattern = setlistPatterns[setlistIndex + 1];
  const applyRoutineStep = (step: TrainerRoutineStep) => {
    const item = availablePatterns.find((candidate) => candidate.id === step.patternId);
    if (!item) return;
    const fills = compatibleFillPatterns(item, availablePatterns);
    const fill = fills.find((candidate) => candidate.id === step.fillPatternId);
    const minBpm = fill ? Math.max(item.tempoRange[0], fill.tempoRange[0]) : item.tempoRange[0];
    const maxBpm = fill ? Math.min(item.tempoRange[1], fill.tempoRange[1]) : item.tempoRange[1];
    setPatternId(item.id); setBpm(Math.max(minBpm, Math.min(maxBpm, step.bpm))); setRepetitions(step.repetitions);
    setFillPractice(Boolean(fill)); setFillPatternId(fill?.id ?? fills[0]?.id ?? ""); setFillAfterBars(step.fillAfterBars); setLoopEnabled(false);
  };
  const addCurrentToRoutine = () => {
    if (customRoutineSteps.length >= 20) { setSetupMessage("A personal routine can contain up to 20 patterns."); return; }
    const step: TrainerRoutineStep = { patternId, bpm, repetitions: repetitions as TrainerRoutineStep["repetitions"], fillPatternId: fillPractice ? selectedFill?.id ?? "" : "", fillAfterBars: fillAfterBars as TrainerRoutineStep["fillAfterBars"] };
    setCustomRoutineSteps((items) => [...items, step]);
    setSetupMessage(`${selectedPattern.name} added to ${customRoutineName || "your routine"}.`);
  };
  const updateRoutineStep = (index: number, update: Partial<TrainerRoutineStep>) => setCustomRoutineSteps((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  const moveRoutineStep = (index: number, offset: -1 | 1) => setCustomRoutineSteps((items) => {
    const destination = index + offset;
    if (destination < 0 || destination >= items.length) return items;
    const next = [...items]; [next[index], next[destination]] = [next[destination], next[index]]; return next;
  });
  const startCustomRoutine = () => {
    const steps = customRoutineSteps.flatMap((step) => {
      const item = availablePatterns.find((candidate) => candidate.id === step.patternId);
      if (!item) return [];
      const fill = compatibleFillPatterns(item, availablePatterns).find((candidate) => candidate.id === step.fillPatternId);
      const minBpm = fill ? Math.max(item.tempoRange[0], fill.tempoRange[0]) : item.tempoRange[0];
      const maxBpm = fill ? Math.min(item.tempoRange[1], fill.tempoRange[1]) : item.tempoRange[1];
      return [{ ...step, fillPatternId: fill?.id ?? "", bpm: Math.max(minBpm, Math.min(maxBpm, step.bpm)) }];
    });
    if (!steps.length) { setSetupMessage("Add a pattern from your library before starting the routine."); return; }
    const name = customRoutineName.trim() || "My practice routine";
    setPracticePlan({ patternIds: steps.map((step) => step.patternId), currentIndex: 0, minutes: Math.max(2, steps.length * 2), name, gated: customRoutineGated, startedAt: new Date().toISOString(), customSteps: steps });
    setPathAccuracyTarget(customRoutineAccuracyTarget); setPathTimingTarget(customRoutineTimingTarget);
    setTimingDrillFocus(null); setActiveSetlistId(""); applyRoutineStep(steps[0]); reset();
  };
  const loadSetlist = (id: string) => {
    setTimingDrillFocus(null); setPracticePlan(null);
    setActiveSetlistId(id); setSetlistIndex(0);
    const selected = setlists.find((item) => item.id === id);
    const first = selected ? getSetlistPatterns(selected, librarySongs)[0] : null;
    if (first) { setPatternId(first.id); setBpm(first.defaultBpm); reset(); }
  };
  const advanceSetlist = () => {
    if (!nextSetlistPattern) return;
    setTimingDrillFocus(null); setPracticePlan(null);
    reset(); setSetlistIndex((index) => index + 1);
    setPatternId(nextSetlistPattern.id); setBpm(nextSetlistPattern.defaultBpm);
  };
  const startPracticePlan = () => {
    const slots = getPracticePlanSlotCount(availablePatterns, planMinutes, repetitions, countInBeats);
    const selected = getPracticePlanPatterns(saved.rounds, availablePatterns, patternId, slots);
    if (!selected.length) return;
    setPracticePlan({ patternIds: selected.map((item) => item.id), currentIndex: 0, minutes: planMinutes, name: "Adaptive focus plan" });
    setTimingDrillFocus(null); setActiveSetlistId(""); setPatternId(selected[0].id); setBpm(selected[0].defaultBpm); reset();
  };
  const startPracticePath = () => {
    const selectedPath = TRAINER_PRACTICE_PATHS.find((item) => item.id === practicePathId);
    const selected = selectedPath?.patternIds.map((id) => availablePatterns.find((item) => item.id === id)).filter((item): item is PracticePattern => Boolean(item)) ?? [];
    if (!selected.length || !selectedPath) { setSetupMessage("This practice path has no available patterns in your library."); return; }
    setPracticePlan({ patternIds: selected.map((item) => item.id), currentIndex: 0, minutes: Math.max(5, selected.length * 2), name: selectedPath.name, gated: true, startedAt: new Date().toISOString() });
    setTimingDrillFocus(null); setActiveSetlistId(""); setFillPractice(false); setLoopEnabled(false); setPatternId(selected[0].id); setBpm(selected[0].defaultBpm); reset(); setSetupMessage("");
  };
  const advancePracticePlan = () => {
    if (!practicePlan) return;
    if (practicePlan.gated && (!round || !isPathCheckpointPassed(round, pathAccuracyTarget, pathTimingTarget))) return;
    const nextIndex = practicePlan.currentIndex + 1;
    const nextPattern = availablePatterns.find((item) => item.id === practicePlan.patternIds[nextIndex]);
    if (!nextPattern) return;
    setPracticePlan({ ...practicePlan, currentIndex: nextIndex });
    setTimingDrillFocus(null);
    const routineStep = practicePlan.customSteps?.[nextIndex];
    if (routineStep) applyRoutineStep(routineStep);
    else { setPatternId(nextPattern.id); setBpm(nextPattern.defaultBpm); setFillPractice(false); setLoopEnabled(false); }
    reset();
  };
  const revisitPreviousPathStep = () => {
    if (!practicePlan || practicePlan.currentIndex < 1) return;
    const previousIndex = practicePlan.currentIndex - 1;
    const previousPattern = availablePatterns.find((item) => item.id === practicePlan.patternIds[previousIndex]);
    if (!previousPattern) return;
    setPracticePlan({ ...practicePlan, currentIndex: previousIndex }); setTimingDrillFocus(null);
    const routineStep = practicePlan.customSteps?.[previousIndex];
    if (routineStep) applyRoutineStep(routineStep);
    else { setPatternId(previousPattern.id); setBpm(previousPattern.defaultBpm); setFillPractice(false); setLoopEnabled(false); }
    reset();
  };
  const cancelPracticePlan = () => setPracticePlan(null);
  const exportSetup = () => {
    const exportableRoutineSteps = customRoutineSteps.flatMap((item) => {
      if (!availablePatterns.some((pattern) => pattern.id === item.patternId)) return [];
      const fillPatternId = item.fillPatternId && availablePatterns.some((pattern) => pattern.id === item.fillPatternId) ? item.fillPatternId : "";
      return [{ ...item, fillPatternId }];
    });
    const routinePatternIds = exportableRoutineSteps.flatMap((item) => [item.patternId, item.fillPatternId]).filter(Boolean);
    const packaged = getPortableTrainerPatterns([patternId, fillPatternId, ...routinePatternIds], availablePatterns, customGrooves);
    const remapId = (id: string) => packaged.idMap.get(id) ?? id;
    const customRoutine: TrainerRoutine = {
      name: customRoutineName.trim() || "My practice routine",
      steps: exportableRoutineSteps.map((item) => ({ ...item, patternId: remapId(item.patternId), fillPatternId: item.fillPatternId ? remapId(item.fillPatternId) : "" })),
      gated: customRoutineGated,
      accuracyTarget: customRoutineAccuracyTarget,
      timingTarget: customRoutineTimingTarget
    };
    const transfer: TrainerSetupTransfer = { version: 1, patternId: remapId(patternId), bpm, repetitions: repetitions as TrainerSetupTransfer["repetitions"], countInBeats: countInBeats as TrainerSetupTransfer["countInBeats"], trainerMode, source, audioVoice, tempoBuild, tempoLadder, tempoStep: tempoLadderStep, tempoTarget: tempoLadderTarget, tempoFailure: tempoLadderFailure, pathAccuracyTarget, pathTimingTarget, loopEnabled, loopStartBeat: activeLoopStartBeat, loopEndBeat: activeLoopEndBeat, fillPractice, fillPatternId: remapId(fillPatternId), fillAfterBars: fillAfterBars as TrainerSetupTransfer["fillAfterBars"], handPattern, leadHand, spokenCount, dynamicsPractice, practicePathId, customPatterns: packaged.patterns, feel, clickMode, limbFocus, customRoutine };
    const blob = new Blob([createTrainerSetupTransfer(transfer)], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "drum-hero-trainer-setup.json"; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    const omitted = customRoutineSteps.length - exportableRoutineSteps.length;
    setSetupMessage(`Trainer setup exported${omitted ? `; ${omitted} unavailable routine step${omitted === 1 ? " was" : "s were"} left out` : ""}. Share the JSON file with another Drum Hero player.`);
  };
  const importSetup = async (file?: File) => {
    if (!file) return;
    try {
      const transfer = parseTrainerSetupTransfer(await file.text(), new Set(availablePatterns.map((item) => item.id)));
      const incomingPatterns = transfer.customPatterns ?? [];
      const incomingIds = new Set(incomingPatterns.map((item) => item.id));
      const additions = incomingPatterns.filter((item) => !customGrooves.some((local) => local.id === item.id));
      const mergedCustomGrooves = [...customGrooves, ...additions];
      if (mergedCustomGrooves.length > 100) throw new Error("Your custom groove library is full. Remove a custom groove, then import this setup again.");
      const allAvailablePatterns = [...availablePatterns, ...incomingPatterns.filter((item) => !availablePatterns.some((local) => local.id === item.id))];
      const nextPattern = allAvailablePatterns.find((item) => item.id === transfer.patternId);
      if (!nextPattern) throw new Error("The setup pattern could not be found in the file or your library.");
      const nextFills = compatibleFillPatterns(nextPattern, allAvailablePatterns);
      const nextFill = nextFills.find((item) => item.id === transfer.fillPatternId);
      if (additions.length && !writeCustomGrooves(mergedCustomGrooves)) throw new Error("The custom patterns could not be saved. Check browser storage and try again.");
      stopAudioInput(); disconnectMidi(); reset();
      if (additions.length) setCustomGrooves(mergedCustomGrooves);
      setPatternId(transfer.patternId); setTrainerMode(transfer.trainerMode); setSource(transfer.source); audioVoiceRef.current = transfer.audioVoice; setAudioVoice(transfer.audioVoice);
      setFeel(transfer.feel); setClickMode(transfer.clickMode); setLimbFocus(transfer.limbFocus);
      if (transfer.customRoutine) {
        setCustomRoutineName(transfer.customRoutine.name); setCustomRoutineSteps(transfer.customRoutine.steps);
        setCustomRoutineGated(transfer.customRoutine.gated); setCustomRoutineAccuracyTarget(transfer.customRoutine.accuracyTarget); setCustomRoutineTimingTarget(transfer.customRoutine.timingTarget);
      }
      setRepetitions(transfer.repetitions); setCountInBeats(transfer.countInBeats); setTempoBuild(transfer.tempoBuild && !transfer.tempoLadder); setTempoLadder(transfer.tempoLadder); setTempoLadderStep(transfer.tempoStep); setTempoLadderTarget(transfer.tempoTarget); setTempoLadderFailure(transfer.tempoFailure);
      setPathAccuracyTarget(transfer.pathAccuracyTarget); setPathTimingTarget(transfer.pathTimingTarget);
      setLoopEnabled(transfer.loopEnabled); setLoopUnit("beats"); setLoopStartBeat(transfer.loopStartBeat); setLoopEndBeat(transfer.loopEndBeat);
      setFillPractice(transfer.fillPractice && Boolean(nextFill)); setFillPatternId(nextFill?.id ?? nextFills[0]?.id ?? ""); setFillAfterBars(transfer.fillAfterBars);
      setHandPattern(transfer.handPattern); setLeadHand(transfer.leadHand); setSpokenCount(transfer.spokenCount); setDynamicsPractice(transfer.dynamicsPractice);
      const fillMin = nextFill ? Math.max(nextPattern.tempoRange[0], nextFill.tempoRange[0]) : nextPattern.tempoRange[0];
      const fillMax = nextFill ? Math.min(nextPattern.tempoRange[1], nextFill.tempoRange[1]) : nextPattern.tempoRange[1];
      setBpm(Math.max(fillMin, Math.min(fillMax, transfer.bpm)));
      setPracticePathId(TRAINER_PRACTICE_PATHS.some((item) => item.id === transfer.practicePathId) ? transfer.practicePathId as typeof practicePathId : "backbeat");
      setPracticePlan(null); setActiveSetlistId(""); setTempoLadderMessage("");
      setSetupMessage(additions.length ? `Setup imported. Added ${additions.length} bundled custom pattern${additions.length === 1 ? "" : "s"} to your library.` : incomingIds.size ? "Setup imported. Matching custom patterns already existed in your library." : "Trainer setup imported.");
    } catch (error) {
      setSetupMessage(error instanceof Error ? error.message : "Could not read this Trainer setup file.");
    } finally {
      if (setupFileRef.current) setupFileRef.current.value = "";
    }
  };
  const recommendation = getPracticeRecommendation(saved.rounds, [...availablePatterns, pattern]);
  const nextPlanPattern = practicePlan ? availablePatterns.find((item) => item.id === practicePlan.patternIds[practicePlan.currentIndex + 1]) : null;
  const patternHistory = getPatternPracticeHistory(saved.rounds, pattern.id);
  const voiceTiming = summarizeVoiceTiming(round?.hits ?? []);
  const velocityFeedback = summarizeVelocityControl(round?.hits ?? [], dynamicsPractice);
  const roundsWithCurrent = round && !saved.rounds.some((item) => item.id === round.id) ? [round, ...saved.rounds] : saved.rounds;
  const trainerProgress = getTrainerProgress(roundsWithCurrent);
  const limbFeedback = summarizeLimbFeedback(round?.hits ?? []);
  const currentPathPatternId = practicePlan?.patternIds[practicePlan.currentIndex];
  const pathCheckpointPassed = Boolean(practicePlan?.gated && round && round.patternId === currentPathPatternId && isPathCheckpointPassed(round, pathAccuracyTarget, pathTimingTarget));
  const recentPathAttempts = practicePlan?.gated && currentPathPatternId
    ? roundsWithCurrent.filter((item) => item.patternId === currentPathPatternId && (!practicePlan.startedAt || item.playedAt >= practicePlan.startedAt)).sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 2)
    : [];
  const previousPathPattern = practicePlan?.gated && practicePlan.currentIndex > 0 ? availablePatterns.find((item) => item.id === practicePlan.patternIds[practicePlan.currentIndex - 1]) : null;
  const canRevisitPathStep = Boolean(previousPathPattern && recentPathAttempts.length >= 2 && recentPathAttempts.every((attempt) => !isPathCheckpointPassed(attempt, pathAccuracyTarget, pathTimingTarget)));
  const timingWeakSpot = getTimingWeakSpot(roundsWithCurrent, phrase);
  const masterySummaries = getPracticeMastery(roundsWithCurrent, availablePatterns);
  const masteryCounts = {
    due: masterySummaries.filter((item) => item.status === "due").length,
    ready: masterySummaries.filter((item) => item.status === "ready").length,
    building: masterySummaries.filter((item) => item.status === "building").length,
    new: masterySummaries.filter((item) => item.status === "new").length
  };
  const reviewSuggestions = masterySummaries.filter((item) => item.status === "due" || item.status === "building").slice(0, 5);
  const audioGuide = audioClipping
    ? "The input is clipping. Lower the interface gain or move the microphone farther from the drums, then check another strike."
    : noiseFloor === null
    ? "Measure the room with the kit quiet to set a useful detection threshold."
    : noiseFloor > 6
      ? "Room noise is high. Move closer to the kit or reduce background sound, then measure again."
      : audioLevel < 2
        ? "Input is very quiet. Move the mic closer or raise its input gain."
        : audioLevel > 80
          ? "Input is very strong. Reduce gain or move the mic farther away to avoid clipping."
          : "Input level looks usable. Strike each voice once to confirm the meter responds.";
  const totalSteps = pattern.beats * (pattern.subdivision / 4);
  const stepsPerBar = totalSteps / getPatternBarCount(pattern);
  const loopBeatChoices = getLoopBeatChoices(phrase.beats);
  const visibleLoopStartBeat = closestNumber(loopBeatChoices, loopStartBeat);
  const visibleLoopEndBeat = Math.max(visibleLoopStartBeat, closestNumber(loopBeatChoices, loopEndBeat));
  const visibleLoopStartBar = Math.min(phraseBarCount, loopStartBar);
  const visibleLoopEndBar = Math.max(visibleLoopStartBar, Math.min(phraseBarCount, loopEndBar));
  const visibleHits = pattern.hits.filter((hit) => hit.step === step);
  const visibleCue = visibleHits.map((hit) => `${hit.instrument}${hit.articulation ? ` ${articulationAbbreviation(hit.articulation)}` : ""}${showStickingCues && hit.instrument !== "kick" && handCues.get(hit) ? ` ${handCues.get(hit)}` : ""}`).join(" + ");
  const currentCount = trainerMode === "scored" ? hits.filter((hit) => hit.rating === "great" || hit.rating === "good").length : ratings.filter((rating) => rating === "clean").length;
  const midiMapKey = profileKey.startsWith("midi:") ? profileKey : (midiInputs[0] ? "midi:" + midiInputs[0].id : "midi:default");
  const midiMap = getTrainerDeviceProfile(saved, midiMapKey).midiMap;
  const gridLabel = pattern.subdivision === 4 ? "quarter-note grid" : pattern.subdivision === 8 ? "eighth-note grid" : pattern.subdivision === 12 ? "triplet grid" : "sixteenth-note grid";
  return <div className="trainer-layout">
    <section className="card trainer-setup" aria-label="Trainer setup">
      <span className="eyebrow">Round setup</span><h2>Choose your focus.</h2>
      <label>Pattern<select value={patternId} disabled={settingsLocked} onChange={(event) => { const next = availablePatterns.find((item) => item.id === event.target.value) ?? patterns[0]; const nextFills = compatibleFillPatterns(next, availablePatterns); setPracticePlan(null); setActiveSetlistId(""); setTimingDrillFocus(null); setPatternId(next.id); setFillPatternId(nextFills[0]?.id ?? ""); if (!canUseFillPractice(next)) setFillPractice(false); setBpm(next.defaultBpm); audioVoiceRef.current = next.hits[0]?.instrument ?? "snare"; setAudioVoice(audioVoiceRef.current); reset(); }}>{availablePatterns.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select></label>
      <p>{pattern.description}{"sticking" in pattern ? ` Sticking: ${String(pattern.sticking)}.` : ""}</p>
      <label>Tempo <strong>{bpm} BPM</strong><input type="range" min={pattern.tempoRange[0]} max={pattern.tempoRange[1]} value={bpm} disabled={settingsLocked} onChange={(event) => setBpm(Number(event.target.value))} /></label>
      {canAddFillPractice && <fieldset disabled={settingsLocked}><legend>Groove into a fill</legend><label><input type="checkbox" checked={fillPractice} onChange={(event) => { setTimingDrillFocus(null); setFillPractice(event.target.checked); }} /> Add a fill to this groove round</label>{fillPractice && <><label>Fill<select value={selectedFill?.id ?? ""} onChange={(event) => setFillPatternId(event.target.value)}>{fillChoices.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select></label><label>Play groove for<select value={fillAfterBars} onChange={(event) => setFillAfterBars(Number(event.target.value))}><option value={1}>1 bar, then fill</option><option value={2}>2 bars, then fill</option><option value={4}>4 bars, then fill</option></select></label><small>Each repetition is {fillAfterBars + 1} bars: groove, then fill and return to beat one.</small></>}</fieldset>}
      <fieldset disabled={settingsLocked}><legend>Loop a section</legend><label><input type="checkbox" checked={loopEnabled} disabled={settingsLocked || hasFocusedTimingDrill} onChange={(event) => setLoopEnabled(event.target.checked)} /> Repeat only a selected part of this pattern</label>{loopEnabled && <><label>Choose range by<select value={loopUnit} onChange={(event) => setLoopUnit(event.target.value as LoopUnit)}><option value="beats">Beats</option><option value="bars">Bars</option></select></label>{loopUnit === "beats" ? <div className="trainer-loop-range"><label>Start on beat<select value={visibleLoopStartBeat} onChange={(event) => { const next = Number(event.target.value); setLoopStartBeat(next); if (visibleLoopEndBeat < next) setLoopEndBeat(next); }}>{loopBeatChoices.map((beat) => <option key={beat} value={beat}>{beat}</option>)}</select></label><label>End on beat<select value={visibleLoopEndBeat} onChange={(event) => setLoopEndBeat(Number(event.target.value))}>{loopBeatChoices.filter((beat) => beat >= visibleLoopStartBeat).map((beat) => <option key={beat} value={beat}>{beat}</option>)}</select></label></div> : <div className="trainer-loop-range"><label>First bar<select value={visibleLoopStartBar} onChange={(event) => { const next = Number(event.target.value); setLoopStartBar(next); if (visibleLoopEndBar < next) setLoopEndBar(next); }}>{Array.from({ length: phraseBarCount }, (_, index) => index + 1).map((bar) => <option key={bar} value={bar}>{bar}</option>)}</select></label><label>Last bar<select value={visibleLoopEndBar} onChange={(event) => setLoopEndBar(Number(event.target.value))}>{Array.from({ length: phraseBarCount }, (_, index) => index + 1).filter((bar) => bar >= visibleLoopStartBar).map((bar) => <option key={bar} value={bar}>{bar}</option>)}</select></label></div>}<small>The selected section becomes a complete round and loops back to its own first beat.</small></>}</fieldset>
      {showStickingCues && <fieldset disabled={settingsLocked}><legend>Sticking cues</legend><label>Hand pattern<select value={handPattern} onChange={(event) => setHandPattern(event.target.value as HandPattern)}><option value="alternating">Alternating singles</option><option value="paradiddle">Single paradiddle · RLRR LRLL</option><option value="double-strokes">Double strokes · RRLL</option></select></label><label>Lead hand<select value={leadHand} onChange={(event) => setLeadHand(event.target.value as "R" | "L")}><option value="R">Right hand</option><option value="L">Left hand</option></select></label><small>R and L appear beside hand hits in the step grid. Kick notes stay assigned to the foot.</small></fieldset>}
      <fieldset disabled={settingsLocked}><legend>Spoken count</legend><label>Count style<select value={spokenCount} onChange={(event) => setSpokenCount(event.target.value as SpokenCount)}><option value="off">Off</option><option value="beats">Beat numbers</option><option value="subdivisions">Subdivisions when the pace allows</option></select></label><small>Uses browser speech when available. At fast tempos, it switches to beat numbers; the metronome stays on time.</small></fieldset>
      <fieldset disabled={settingsLocked}><legend>Feel target</legend><label>Timing profile<select value={feel} onChange={(event) => setFeel(event.target.value as TrainerFeel)}><option value="straight">Straight · on the grid</option><option value="shuffle">Swing eighth-note offbeats</option><option value="laid-back">Laid-back snare</option><option value="shuffle-laid-back">Swing with a laid-back snare</option></select></label><small>Timing scores compare against this feel. Shuffle changes eighth-note offbeats; laid-back shifts snare targets slightly behind the pulse.</small></fieldset>
      <fieldset disabled={settingsLocked}><legend>Click pattern</legend><label>Metronome<select value={clickMode} onChange={(event) => setClickMode(event.target.value as typeof clickMode)}><option value="all">Every beat</option><option value="backbeat">Beats 2 and 4</option><option value="subdivisions">Subdivisions only</option><option value="sparse-bars">Odd-numbered bars only</option></select></label><small>The count-in and latency calibration keep a full beat click.</small></fieldset>
      <fieldset disabled={settingsLocked}><legend>Limb focus</legend><label>Practice<select value={limbFocus} onChange={(event) => { setTimingDrillFocus(null); setLimbFocus(event.target.value as TrainerLimbFocus); reset(); }}><option value="all">Full pattern · hands and feet</option><option value="hands">Hands only · kick hits count extra</option><option value="feet">Feet only · hand hits count extra</option></select></label><small>Isolate one part of the groove, then return to the full pattern and coordinate both limbs.</small></fieldset>
      <div className="trainer-round-options"><label>Repetitions<select value={repetitions} disabled={settingsLocked} onChange={(event) => setRepetitions(Number(event.target.value))}>{REPETITIONS.map((count) => <option key={count} value={count}>{count}</option>)}</select></label><label>Count-in<select value={countInBeats} disabled={settingsLocked} onChange={(event) => setCountInBeats(Number(event.target.value))}>{[1, 2, 4].map((count) => <option key={count} value={count}>{count} beat{count === 1 ? "" : "s"}</option>)}</select></label></div>
      <label className="trainer-tempo-build"><input type="checkbox" checked={tempoBuild} disabled={settingsLocked} onChange={(event) => { setTempoBuild(event.target.checked); if (event.target.checked) { setTempoLadder(false); setTempoLadderMessage(""); } }} /> Build tempo automatically: self ratings adjust each pass; scored rounds use accuracy, misses, and timing steadiness</label>
      <fieldset disabled={settingsLocked}><legend>Tempo ladder</legend><label><input type="checkbox" checked={tempoLadder} onChange={(event) => { setTempoLadder(event.target.checked); if (event.target.checked) setTempoBuild(false); setTempoLadderMessage(""); }} /> Raise the target after a successful full round</label>{tempoLadder && <><label>Increase by<select value={tempoLadderStep} onChange={(event) => setTempoLadderStep(Number(event.target.value) as 2 | 5 | 10)}><option value={2}>2 BPM</option><option value={5}>5 BPM</option><option value={10}>10 BPM</option></select></label><label>Pass target<select value={tempoLadderTarget} onChange={(event) => setTempoLadderTarget(Number(event.target.value) as 70 | 80 | 90 | 95)}>{[70, 80, 90, 95].map((target) => <option key={target} value={target}>{target}%</option>)}</select></label><label>If a round misses the target<select value={tempoLadderFailure} onChange={(event) => setTempoLadderFailure(event.target.value as "repeat" | "lower")}><option value="repeat">Repeat this tempo</option><option value="lower">Lower by one step</option></select></label><small>{trainerMode === "scored" ? `Advance at ${tempoLadderTarget}% accuracy with at most 5% misses and steady timing (35 ms average offset, 25 ms spread).` : `Advance when at least ${tempoLadderTarget}% of passes are clean with no missed pass.`}</small></>}</fieldset>
      <fieldset disabled={settingsLocked}><legend>Dynamics practice</legend><label><input type="checkbox" checked={dynamicsPractice} onChange={(event) => setDynamicsPractice(event.target.checked)} /> Coach accents against softer ghost-note taps</label><small>Accent marks set stronger targets; unaccented snare notes are treated as ghost-note targets. MIDI velocity gives the clearest feedback. Choose a pattern with both marked and unmarked snare hits.</small></fieldset>
      <fieldset disabled={settingsLocked}><legend>Round method</legend><label><input type="radio" name="round-method" checked={trainerMode === "self"} onChange={() => { stopAudioInput(); disconnectMidi(); setTrainerMode("self"); }} /> Self rate each repetition</label><label><input type="radio" name="round-method" checked={trainerMode === "scored"} onChange={() => setTrainerMode("scored")} /> Score played hits</label></fieldset>
      {trainerMode === "scored" && <label>Scored input<select value={source} disabled={settingsLocked} onChange={(event) => { stopAudioInput(); disconnectMidi(); const next = event.target.value as TrainerSource; setSource(next); chooseProfile(next); reset(); }}><option value="keyboard">Keyboard</option><option value="touch">Touch pads</option><option value="midi">USB MIDI kit</option><option value="audio-timing">Audio: timing only</option><option value="audio-voices">Audio: calibrated voices</option></select></label>}
      <p className="trainer-note">{repetitions} repetitions · {countInBeats}-beat count-in · {Math.round(duration / 1000)} seconds per repetition. {trainerMode === "self" ? "Rate each pass before moving on." : "Great within 50 ms; Good within 100 ms."}</p>
      <label><input type="checkbox" checked={progress.settings.sound} onChange={(event) => setSound(event.target.checked)} /> Metronome and drum sound</label>
      <label><input type="checkbox" checked={recordAudio} disabled={settingsLocked} onChange={(event) => setRecordAudio(event.target.checked)} /> Record microphone audio for playback comparison</label>
      <small>Recording asks for microphone access when the round starts, stays in page memory, and is not uploaded. MIDI and keyboard hits are captured only if they make sound in the room.</small>
      {setlists.length > 0 && <div className="trainer-setlist"><span className="eyebrow">Setlist rehearsal</span><label>Follow a setlist<select value={activeSetlistId} disabled={settingsLocked} onChange={(event) => loadSetlist(event.target.value)}><option value="">Choose a setlist…</option>{setlists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{activeSetlist && <p>{setlistPatterns.length ? activeSetlist.name + ": part " + Math.min(setlistIndex + 1, setlistPatterns.length) + " of " + setlistPatterns.length : "This setlist has no playable parts yet."}</p>}</div>}
      <div className="trainer-practice-plan"><span className="eyebrow">Guided skill path</span><label>Choose a path<select value={practicePathId} disabled={settingsLocked} onChange={(event) => setPracticePathId(event.target.value as typeof practicePathId)}>{TRAINER_PRACTICE_PATHS.map((path) => <option key={path.id} value={path.id}>{path.name}</option>)}</select></label><div className="trainer-round-options"><label>Accuracy goal<select value={pathAccuracyTarget} disabled={settingsLocked} onChange={(event) => setPathAccuracyTarget(Number(event.target.value) as 70 | 80 | 85 | 90 | 95)}>{[70, 80, 85, 90, 95].map((target) => <option key={target} value={target}>{target}%</option>)}</select></label><label>Timing goal<select value={pathTimingTarget} disabled={settingsLocked} onChange={(event) => setPathTimingTarget(Number(event.target.value) as 25 | 35 | 50 | 75)}>{[25, 35, 50, 75].map((target) => <option key={target} value={target}>{target} ms average</option>)}</select></label></div><p>Pass each checkpoint by meeting your accuracy goal and timing goal when hit timing is available. A missed checkpoint stays in the path until you repeat it.</p><button type="button" className="button-secondary" disabled={settingsLocked} onClick={startPracticePath}>Start skill path</button></div>
      <div className="trainer-practice-plan"><span className="eyebrow">Adaptive focus</span><label>Plan length<select value={planMinutes} disabled={settingsLocked || Boolean(practicePlan)} onChange={(event) => setPlanMinutes(Number(event.target.value))}><option value={5}>About 5 minutes · {getPracticePlanSlotCount(availablePatterns, 5, repetitions, countInBeats)} rounds</option><option value={10}>About 10 minutes · {getPracticePlanSlotCount(availablePatterns, 10, repetitions, countInBeats)} rounds</option><option value={20}>About 20 minutes · {getPracticePlanSlotCount(availablePatterns, 20, repetitions, countInBeats)} rounds</option></select></label><button type="button" className="button-secondary" disabled={settingsLocked} onClick={startPracticePlan}>{practicePlan?.name === "Adaptive focus plan" ? "Restart plan" : "Build an adaptive plan"}</button>{practicePlan && <><p>{practicePlan.name ?? "Adaptive focus plan"} · About {practicePlan.minutes} minutes · Pattern {practicePlan.currentIndex + 1} of {practicePlan.patternIds.length}. {practicePlan.name === "Adaptive focus plan" ? "Starts with your weakest recent patterns, then adds patterns you have practiced less often." : "Move through the path one pattern at a time."} Each round uses your current repetition setting.</p><button type="button" className="button-secondary" onClick={cancelPracticePlan}>End plan</button></>}</div>
      <div className="trainer-practice-plan trainer-routine-builder"><span className="eyebrow">Build a personal routine</span><label>Routine name<input value={customRoutineName} maxLength={50} disabled={settingsLocked} onChange={(event) => setCustomRoutineName(event.target.value)} /></label><div className="trainer-round-options"><label>Accuracy checkpoint<select value={customRoutineAccuracyTarget} disabled={settingsLocked} onChange={(event) => setCustomRoutineAccuracyTarget(Number(event.target.value) as typeof customRoutineAccuracyTarget)}>{[70, 80, 85, 90, 95].map((target) => <option key={target} value={target}>{target}%</option>)}</select></label><label>Timing checkpoint<select value={customRoutineTimingTarget} disabled={settingsLocked} onChange={(event) => setCustomRoutineTimingTarget(Number(event.target.value) as typeof customRoutineTimingTarget)}>{[25, 35, 50, 75].map((target) => <option key={target} value={target}>{target} ms</option>)}</select></label></div><label className="trainer-routine-gate"><input type="checkbox" checked={customRoutineGated} disabled={settingsLocked} onChange={(event) => setCustomRoutineGated(event.target.checked)} /> Require a checkpoint before each next pattern</label><div className="transport"><button type="button" className="button-secondary" disabled={settingsLocked || customRoutineSteps.length >= 20} onClick={addCurrentToRoutine}>Add selected pattern</button><button type="button" className="button-secondary" disabled={settingsLocked || customRoutineSteps.length === 0} onClick={startCustomRoutine}>Start personal routine</button></div><ol className="trainer-routine-steps">{customRoutineSteps.map((step, index) => { const routinePattern = availablePatterns.find((item) => item.id === step.patternId); const routineFills = routinePattern ? compatibleFillPatterns(routinePattern, availablePatterns) : []; const routineFill = routineFills.find((item) => item.id === step.fillPatternId); const minTempo = routineFill && routinePattern ? Math.max(routinePattern.tempoRange[0], routineFill.tempoRange[0]) : routinePattern?.tempoRange[0] ?? 40; const maxTempo = routineFill && routinePattern ? Math.min(routinePattern.tempoRange[1], routineFill.tempoRange[1]) : routinePattern?.tempoRange[1] ?? 220; return <li key={`${step.patternId}-${index}`}><span className="trainer-routine-number">{index + 1}</span><label>Pattern<select value={step.patternId} disabled={settingsLocked} onChange={(event) => { const next = availablePatterns.find((item) => item.id === event.target.value); updateRoutineStep(index, { patternId: event.target.value, bpm: next?.defaultBpm ?? step.bpm, fillPatternId: "" }); }}>{!routinePattern && <option value={step.patternId}>Unavailable · {step.patternId}</option>}{availablePatterns.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select></label><label>Tempo<input type="number" min={minTempo} max={maxTempo} value={Math.max(minTempo, Math.min(maxTempo, step.bpm))} disabled={settingsLocked} onChange={(event) => updateRoutineStep(index, { bpm: Number(event.target.value) })} /></label><label>Repetitions<select value={step.repetitions} disabled={settingsLocked} onChange={(event) => updateRoutineStep(index, { repetitions: Number(event.target.value) as TrainerRoutineStep["repetitions"] })}>{REPETITIONS.map((count) => <option key={count} value={count}>{count}</option>)}</select></label><label>Groove into fill<select value={step.fillPatternId} disabled={settingsLocked || !routineFills.length} onChange={(event) => updateRoutineStep(index, { fillPatternId: event.target.value })}><option value="">No fill</option>{routineFills.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{step.fillPatternId && <label>Bars before fill<select value={step.fillAfterBars} disabled={settingsLocked} onChange={(event) => updateRoutineStep(index, { fillAfterBars: Number(event.target.value) as TrainerRoutineStep["fillAfterBars"] })}>{[1, 2, 4].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>}<div className="trainer-routine-order"><button type="button" className="button-secondary" aria-label={`Move routine pattern ${index + 1} up`} disabled={settingsLocked || index === 0} onClick={() => moveRoutineStep(index, -1)}>↑</button><button type="button" className="button-secondary" aria-label={`Move routine pattern ${index + 1} down`} disabled={settingsLocked || index === customRoutineSteps.length - 1} onClick={() => moveRoutineStep(index, 1)}>↓</button><button type="button" className="button-secondary" disabled={settingsLocked} onClick={() => setCustomRoutineSteps((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div></li>; })}</ol><small>Routines save on this device. Add grooves, fills, rudiments, or song parts; tempo and repetitions are set for each step.</small></div>
      <div className="trainer-practice-plan"><span className="eyebrow">Share a setup</span><p>Setup files include your current Trainer settings, saved routine, and any custom grooves or song parts they use.</p><div className="transport"><button type="button" className="button-secondary" onClick={exportSetup}>Export setup</button><label>Import setup<input ref={setupFileRef} type="file" accept="application/json,.json" disabled={settingsLocked} onChange={(event) => void importSetup(event.target.files?.[0])} /></label></div>{setupMessage && <p role="status">{setupMessage}</p>}</div>
      {recommendation && <div className="trainer-recommendation"><span className="eyebrow">Suggested next</span><strong>{recommendation.pattern.name}</strong><p>{recommendation.reason}</p><button className="button-secondary" type="button" disabled={settingsLocked} onClick={() => { const target = availablePatterns.find((item) => item.id === recommendation.pattern.id) ?? selectedPattern; setTimingDrillFocus(null); setPracticePlan(null); setPatternId(target.id); setFillPractice(false); setBpm(recommendation.bpm); reset(); }}>Use {recommendation.bpm} BPM</button></div>}
      {timingWeakSpot && <div className="trainer-recommendation"><span className="eyebrow">Targeted timing drill</span><strong>{timingWeakSpot.instrument} on beat {timingWeakSpot.beat}</strong><p>{timingWeakSpot.problems} late or missed hits across {timingWeakSpot.rounds} recent rounds{timingWeakSpot.averageOffsetMs === null ? "." : ` · average offset ${timingWeakSpot.averageOffsetMs > 0 ? "+" : ""}${timingWeakSpot.averageOffsetMs} ms.`}</p><div className="transport"><button type="button" className="button-secondary" disabled={settingsLocked} onClick={() => { setLimbFocus("all"); setTimingDrillFocus({ sourcePatternId: phrase.id, instrument: timingWeakSpot.instrument, beat: timingWeakSpot.beat, stepOffset: Math.floor((timingWeakSpot.beat - 1) * phrase.subdivision / 4) }); setPracticePlan(null); setActiveSetlistId(""); setLoopEnabled(false); reset(); }}>Drill only {timingWeakSpot.instrument} on beat {timingWeakSpot.beat}</button><button type="button" className="button-secondary" disabled={settingsLocked} onClick={() => { setLimbFocus("all"); setTimingDrillFocus(null); setPracticePlan(null); setActiveSetlistId(""); setLoopUnit("beats"); setLoopStartBeat(timingWeakSpot.beat); setLoopEndBeat(timingWeakSpot.beat); setLoopEnabled(true); reset(); }}>Loop the whole beat</button></div></div>}
    </section>
    <section className="trainer-main">
      <div className="trainer-stage" aria-live="polite">
        <div className="trainer-stage-top"><span className="eyebrow">{pattern.level} · {gridLabel}</span><span className={`mode-pill mode-${phase === "running" ? "playing" : phase}`}>{phase}</span></div>
        <h2>{pattern.name}</h2><p>{"coaching" in pattern ? String(pattern.coaching) : "focus" in pattern ? String(pattern.focus) : pattern.description}</p>{hasFocusedTimingDrill && timingDrillFocus && <p className="trainer-focus-status" role="status">Only {timingDrillFocus.instrument} hits from beat {timingDrillFocus.beat} are active. <button type="button" disabled={settingsLocked} onClick={() => setTimingDrillFocus(null)}>End focused drill</button></p>}
        <div className="trainer-count"><strong>{Math.min(repetition + 1, repetitions)}<small> / {repetitions}</small></strong><span>Repetition</span><strong>{currentCount}</strong><span>{trainerMode === "self" ? "Clean" : "Great + Good"}</span></div>
        {(phase === "count-in" || phase === "calibrating") && <div className="trainer-countin" role="timer">{phase === "calibrating" ? "Latency calibration · " + latencyTaps + "/" + CALIBRATION_BEATS : "Count in"}<strong>{countIn}</strong></div>}
        <div className="trainer-grid" aria-label="Pattern steps with beat and subdivision counts">{Array.from({ length: totalSteps }, (_, index) => <div key={index} className={`${step === index ? "active" : ""} ${index % stepsPerBar === 0 ? "bar-start" : ""}`}><span>{getStepCountLabel(hasFocusedTimingDrill ? phrase : pattern, index + focusedStepOffset)}</span><strong>{pattern.hits.filter((hit) => hit.step === index).map((hit) => `${hit.instrument}${hit.articulation ? ` ${articulationAbbreviation(hit.articulation)}` : ""}${showStickingCues && hit.instrument !== "kick" && handCues.get(hit) ? ` ${handCues.get(hit)}` : ""}${dynamicsPractice && hit.instrument === "snare" ? hit.accent ? " A" : " G" : ""}`).join(" + ") || "·"}</strong></div>)}</div>
        {dynamicsPractice && <small className="trainer-dynamics-legend">A = accent target · G = softer ghost-note target. Ghost-note coaching applies to snare hits.</small>}
        {pattern.hits.some((hit) => hit.articulation) && <small className="trainer-dynamics-legend">fl = flam · dr = drag · z = buzz roll. Grace strokes lead into the on-beat main stroke.</small>}
        <p className="trainer-cue" aria-live="off">{phase === "rating" ? "How did that repetition feel?" : phase === "complete" ? "Round complete" : phase === "idle" ? "Ready when you are" : phase === "calibrating" ? "Tap the beat with Space, Enter, or the button below" : visibleCue || "Keep the pulse"}</p>
        <div className="transport"><button className="button" onClick={start} disabled={settingsLocked}>{phase === "complete" ? "New round" : "Start round"}</button><button className="button-secondary" onClick={pause} disabled={phase !== "running" && phase !== "count-in"}>Pause</button><button className="button-secondary" onClick={resume} disabled={phase !== "paused"}>Resume</button><button className="button-secondary" onClick={reset} disabled={phase === "idle"}>Reset</button></div>
        {phase === "calibrating" && <button type="button" className="button-secondary" onClick={() => receiveHit("snare", source)}>Tap with the beat</button>}
        <p className="audio-status" role="status">{audioMessage}</p>
        {recordingActive && <p className="trainer-recording-status" role="status">Recording microphone audio…</p>}
        {recordingMessage && <p className="audio-status" role="status">{recordingMessage}</p>}
        {(recordedClipUrl || referenceClipUrl) && (
          <div className="trainer-recording-playback">
            <span>Recording comparison · A/B</span>
            {referenceClipUrl && <label>Reference take (A)<audio controls preload="metadata" aria-label="Reference performance recording" src={referenceClipUrl}>Audio playback is not supported in this browser.</audio></label>}
            {recordedClipUrl && <label>Latest take (B)<audio controls preload="metadata" aria-label="Latest performance recording" src={recordedClipUrl}>Audio playback is not supported in this browser.</audio></label>}
            {recordedClip && <TrainerRecordingWaveform recording={recordedClip} />}
            <div className="transport">
              <button type="button" className="button-secondary" disabled={!recordedClip} onClick={() => recordedClip && setReferenceClip({ blob: recordedClip.blob, url: URL.createObjectURL(recordedClip.blob), expectedMarkersMs: recordedClip.expectedMarkersMs, actualMarkersMs: recordedClip.actualMarkersMs })}>Use latest take as reference</button>
              {referenceClip && <button type="button" className="button-secondary" onClick={() => setReferenceClip(null)}>Clear reference</button>}
            </div>
            <small>Recordings stay in page memory and are not uploaded.</small>
          </div>
        )}
        {phase === "rating" && <div className="trainer-ratings" role="group" aria-label="Rate repetition">{(["clean", "needsWork", "missed"] as TrainerRating[]).map((rating) => <button key={rating} className="button-secondary" onClick={() => rate(rating, performance.now())}>{rating === "needsWork" ? "Needs work" : rating === "missed" ? "Missed" : "Clean"}</button>)}</div>}
        {trainerMode === "scored" && (source === "keyboard" || source === "touch") && <div className="trainer-pads" aria-label="Drum input pads">{voices.map((voice) => <button key={voice} type="button" onClick={() => receiveHit(voice, source === "touch" ? "touch" : "keyboard")} disabled={phase !== "running"} className={`drum-pad pad-${voice}`}>{voice}<kbd>{Object.entries(keys).find(([, value]) => value === voice)?.[0].replace("Key", "")}</kbd></button>)}</div>}
        {lastHit && <p className="trainer-last-hit" role="status">{lastHit.rating.toUpperCase()} · {lastHit.instrument}{lastHit.articulation ? ` · ${articulationAbbreviation(lastHit.articulation)} target` : ""}{lastHit.offsetMs === null ? "" : ` · ${lastHit.offsetMs > 0 ? "+" : ""}${lastHit.offsetMs} ms`}{lastVelocity === null ? "" : ` · ${source === "midi" ? "MIDI velocity" : source.startsWith("audio-") ? "estimated strength" : "strength"} ${lastVelocity}`}{lastHit.accentTarget ? " · accent target" : ""}</p>}
        {round && <div className="trainer-result"><h3>Round recap</h3>{phase === "complete" && tempoLadderMessage && <p role="status">{tempoLadderMessage}</p>}{round.result ? <><p><strong>{round.result.score} score · {round.result.accuracy}% accuracy</strong><br />{round.result.great} Great · {round.result.good} Good · {round.result.miss} Miss · {round.result.extra} Extra</p>{limbFeedback && <div className="trainer-limb-feedback"><h4>Hands and feet</h4>{(["hands", "feet"] as const).map((limb) => { const item = limbFeedback[limb]; return <span key={limb}><strong>{limb === "hands" ? "Hands" : "Feet"}</strong> {item.onTime}/{item.total} on time{item.total ? ` · ${item.misses} missed` : ""}{item.extras ? ` · ${item.extras} extra` : ""}</span>; })}</div>}<TimingOffsetChart hits={round.hits ?? []} />{voiceTiming.length > 0 && <div className="trainer-voice-feedback"><h4>Timing by drum voice</h4>{voiceTiming.map((item) => <div className="trainer-voice-row" key={item.instrument}><strong>{item.instrument}</strong><div className="timing-offset-track" role="img" aria-label={`${item.instrument} average timing ${item.averageOffsetMs} milliseconds ${item.averageOffsetMs > 0 ? "late" : item.averageOffsetMs < 0 ? "early" : "on time"}`}><i style={{ left: `${Math.max(2, Math.min(98, 50 + item.averageOffsetMs / 2))}%` }} /></div><span>{item.averageOffsetMs > 0 ? "+" : ""}{item.averageOffsetMs} ms avg · {item.averageAbsoluteOffsetMs} ms typical distance · {item.great + item.good}/{item.total} on time{item.miss ? ` · ${item.miss} missed` : ""}</span></div>)}</div>}{(round.source === "midi" || round.source === "audio-timing" || round.source === "audio-voices") && velocityFeedback && <div className="trainer-dynamics-feedback"><h4>{dynamicsPractice ? "Dynamics target check" : "Strike-strength feedback"}</h4><p>Average {round.source.startsWith("audio-") ? "estimated strength" : "MIDI velocity"}: marked accents <strong>{velocityFeedback.accentAverage ?? "—"}</strong> · {dynamicsPractice ? "unaccented snare taps" : "other hits"} <strong>{velocityFeedback.otherAverage ?? "—"}</strong>.</p><p>{dynamicsPractice ? "Aim for accents at 85+ and ghost-note snare taps below 55." : "Aim for accents at 85+ and keep softer notes between 35 and 78."} {velocityFeedback.message}</p></div>}</> : <p><strong>{round.ratings.filter((rating) => rating === "clean").length} clean</strong> · {round.ratings.filter((rating) => rating === "needsWork").length} needs work · {round.ratings.filter((rating) => rating === "missed").length} missed</p>}</div>}
        {phase === "complete" && practicePlan?.gated && <p className={`trainer-path-checkpoint ${pathCheckpointPassed ? "passed" : "needs-work"}`} role="status">{pathCheckpointPassed ? "Checkpoint passed. The next pattern is unlocked." : `Checkpoint needs ${pathAccuracyTarget}% accuracy${trainerMode === "scored" ? ` and no more than ${pathTimingTarget} ms average timing distance` : ""}. Repeat this pattern to continue.`}</p>}
        {phase === "complete" && practicePlan && nextPlanPattern && <button type="button" className="button-secondary" disabled={Boolean(practicePlan.gated && !pathCheckpointPassed)} onClick={advancePracticePlan}>Next: {nextPlanPattern.name} ({practicePlan.currentIndex + 2}/{practicePlan.patternIds.length})</button>}
        {phase === "complete" && canRevisitPathStep && previousPathPattern && <button type="button" className="button-secondary" onClick={revisitPreviousPathStep}>Revisit previous path step: {previousPathPattern.name}</button>}
        {phase === "complete" && practicePlan && !nextPlanPattern && (!practicePlan.gated || pathCheckpointPassed) && <p className="trainer-note">{practicePlan.name && practicePlan.name !== "Adaptive focus plan" ? `${practicePlan.name} complete.` : "Practice plan complete. Your recent results will guide the next one."}</p>}
        {phase === "complete" && activeSetlist && nextSetlistPattern && <button type="button" className="button-secondary" onClick={advanceSetlist}>Next setlist part: {nextSetlistPattern.name}</button>}
        {phase === "complete" && activeSetlist && !nextSetlistPattern && setlistPatterns.length > 0 && <p className="trainer-note">Setlist complete. Choose a different setlist or replay a part.</p>}
      </div>
      <DrumKitCanvas ref={kitRef} compact interactive={false} label="Trainer drum kit animation" />
      <section className="card trainer-device" aria-label="Device setup"><span className="eyebrow">Input setup</span><h2>Connect your kit.</h2>
        {source === "midi" && trainerMode === "scored" && <><button className="button-secondary" onClick={() => void connectMidi()}>Connect USB MIDI</button><p>{midiInputs.length ? midiInputs.map((item) => item.name).join(", ") : "No MIDI input connected."}</p><div className="trainer-mapping"><span>Device profile: {profileKey.replace("midi:", "") || "default"}</span><span>Latest MIDI note: {lastMidiNote ?? "—"}</span>{lastMidiNote !== null && <label>Map note {lastMidiNote}<select value={midiMap[lastMidiNote] ?? ""} onChange={(event) => updateProfile(midiMapKey, (profile) => ({ ...profile, midiMap: { ...profile.midiMap, [lastMidiNote]: event.target.value ? event.target.value as Instrument : null } }))}><option value="">Unmapped</option>{voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>}<small>Mappings and latency are stored separately for each MIDI device. MIDI velocity is shown with each hit.</small></div></>}
        {(source === "audio-timing" || source === "audio-voices") && trainerMode === "scored" && <><p>Connect a microphone or electronic kit line out. Voice recognition uses device-specific calibration samples.</p><div className="transport"><button className="button-secondary" onClick={() => void connectAudio()} disabled={settingsLocked}>Connect audio input</button><button className="button-secondary" onClick={stopAudioInput} disabled={!audioConnected || settingsLocked}>Disconnect</button></div>{audioDevices.length > 1 && <label>Input device<select value={deviceId} disabled={settingsLocked} onChange={(event) => { stopAudioInput(); setDeviceId(event.target.value); }}><option value="">System default</option>{audioDevices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}<label>Detection threshold {Math.round(audioThreshold * 100)}%<input type="range" min="0.03" max="0.4" step="0.01" value={audioThreshold} disabled={settingsLocked} onChange={(event) => { const value = Number(event.target.value); audioThresholdRef.current = value; setAudioThreshold(value); }} /></label>{source === "audio-timing" && <label>Target voice<select value={audioVoice} disabled={settingsLocked} onChange={(event) => { const value = event.target.value as Instrument; audioVoiceRef.current = value; setAudioVoice(value); }}>{availableVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>}<meter min="0" max="100" value={audioLevel} aria-label="Relative audio input level" /><div className="trainer-audio-diagnostic">{audioClipping && <strong className="trainer-clipping-warning" role="alert">CLIPPING · lower input gain or move the mic farther away</strong>}<p role="status">{audioGuide}</p><small>Input level: {audioLevel}/100 · recent peak: {audioPeak}%{noiseFloor === null ? "" : ` · room noise: ${noiseFloor}/100`}</small><button type="button" className="button-secondary" onClick={measureBackgroundNoise} disabled={!audioConnected || measuringNoise || settingsLocked}>{measuringNoise ? "Measuring… keep quiet" : "Measure background noise"}</button></div>{source === "audio-voices" && <div className="trainer-calibration"><p>Calibrated voices for this input: {Object.keys(activeProfile.audioTemplates).length} of 5. Calibrate each drum voice for reliable classification.</p><label>Calibrate voice<select value={calibrationVoice} disabled={settingsLocked || audioDynamicsCalibrationHits > 0} onChange={(event) => setCalibrationVoice(event.target.value as Instrument)}>{voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label><button type="button" className="button-secondary" onClick={beginAudioCalibration} disabled={!audioConnected || audioCalibrationHits > 0 || audioDynamicsCalibrationHits > 0 || settingsLocked}>Calibrate next five hits</button>{audioCalibrationHits > 0 && <p>Captured {audioCalibrationHits} of 5 hits for {calibrationVoice}.</p>}</div>}{dynamicsPractice && <div className="trainer-calibration"><p>Audio dynamics for {audioDynamicsVoice}: {audioDynamicsLevels?.ghostRms ? "ghost taps calibrated" : "ghost taps not calibrated"} · {audioDynamicsLevels?.accentRms ? "accents calibrated" : "accents not calibrated"}. Measure room noise, then capture five hits at each level.</p><div className="transport"><button type="button" className="button-secondary" onClick={() => beginAudioDynamicsCalibration("ghost")} disabled={!audioConnected || settingsLocked || audioCalibrationHits > 0 || audioDynamicsCalibrationHits > 0}>Calibrate ghost taps</button><button type="button" className="button-secondary" onClick={() => beginAudioDynamicsCalibration("accent")} disabled={!audioConnected || settingsLocked || audioCalibrationHits > 0 || audioDynamicsCalibrationHits > 0 || !audioDynamicsLevels?.ghostRms}>Calibrate accents</button></div>{audioDynamicsCalibrationHits > 0 && <p>Captured {audioDynamicsCalibrationHits} of 5 {audioDynamicsKind} taps.</p>}<small>Strength feedback uses the calibrated voice profile and reports uncertain levels as unscored.</small></div>}</>}
        {trainerMode === "scored" && <><label>Input latency correction <strong>{activeProfile.latencyMs} ms</strong><input type="range" min="-200" max="200" step="5" value={activeProfile.latencyMs} onChange={(event) => { const value = Number(event.target.value); latencyRef.current = value; updateProfile(profileKey, (profile) => ({ ...profile, latencyMs: value })); }} /></label><button type="button" className="button-secondary" onClick={startLatencyCalibration} disabled={settingsLocked}>Calibrate input latency</button>{latencyMessage && <p>{latencyMessage}</p>}</>}
        <p role="status">{deviceMessage}</p>
      </section>
    </section>
    <section className="card trainer-history"><span className="eyebrow">Your practice</span><h2>Recent rounds.</h2>{patternHistory.count > 0 && <div className="trainer-pattern-history"><strong>{pattern.name}</strong><span>{patternHistory.count} rounds · {patternHistory.averageAccuracy}% average result{patternHistory.bestTempo ? ` · ${patternHistory.bestTempo} BPM at 85%+ accuracy` : ""}</span>{patternHistory.averageOffsetMs !== null && <span>Average timing: {patternHistory.averageOffsetMs > 0 ? "+" : ""}{patternHistory.averageOffsetMs} ms {patternHistory.averageOffsetMs > 0 ? "late" : patternHistory.averageOffsetMs < 0 ? "early" : "on time"} · {patternHistory.averageAbsoluteOffsetMs} ms typical distance</span>}</div>}{saved.rounds.length ? <ol>{saved.rounds.slice(0, 8).map((item) => <li key={item.id}><strong>{item.patternName}</strong><span>{item.bpm} BPM · {item.mode === "self" ? `${item.ratings.filter((rating) => rating === "clean").length}/${item.repetitions ?? 10} clean` : `${item.result?.accuracy ?? 0}% accuracy`} · {new Date(item.playedAt).toLocaleDateString()}</span></li>)}</ol> : <p>Complete a round to see your practice history.</p>}</section>
    <section className="card trainer-history trainer-progress-trends" aria-label="Practice progress trends"><span className="eyebrow">Progress trends</span><h2>Track your timing.</h2>{trainerProgress.rounds.length ? <><p>{trainerProgress.rounds.length} recent full-pattern scored rounds. {trainerProgress.delta === null ? "Complete more rounds to see whether your accuracy is moving." : `${trainerProgress.delta > 0 ? "+" : ""}${trainerProgress.delta} percentage points across the latest rounds.`}</p><TrainerProgressChart points={trainerProgress.points} /><div className="trainer-progress-voices"><strong>Hit accuracy by voice</strong>{trainerProgress.voices.map((item) => <span key={item.instrument}><b>{item.instrument}</b> {item.onTime}/{item.total} on time · {item.accuracy}%{item.averageOffsetMs === null ? "" : ` · ${item.averageOffsetMs > 0 ? "+" : ""}${item.averageOffsetMs} ms avg`}</span>)}</div></> : <p>Complete scored full-pattern rounds to see your accuracy trend and hit accuracy by drum voice.</p>}</section>
    <section className="card trainer-mastery" aria-label="Pattern mastery and review"><span className="eyebrow">Mastery & review</span><h2>Keep skills fresh.</h2><p>{masteryCounts.due} due for review · {masteryCounts.ready} ready · {masteryCounts.building} building · {masteryCounts.new} new. Adaptive plans put due patterns first.</p>{reviewSuggestions.length ? <ul>{reviewSuggestions.map((item) => <li key={item.pattern.id}><div><strong>{item.pattern.name}</strong><span>{item.status === "due" ? "Review due" : "Building"} · {item.averageAccuracy}% recent result{item.attempts ? ` · ${item.attempts} rounds` : ""}</span></div><button type="button" className="button-secondary" disabled={settingsLocked} onClick={() => { setTimingDrillFocus(null); setPracticePlan(null); setActiveSetlistId(""); setPatternId(item.pattern.id); setFillPractice(false); setLoopEnabled(false); setBpm(item.pattern.defaultBpm); reset(); }}>Review</button></li>)}</ul> : <p>Finish a few rounds to build your review schedule.</p>}</section>
  </div>;

}

function getSetlistPatterns(setlist: Setlist, songs: ReturnType<typeof allSongs>): PracticePattern[] {
  return setlist.songIds.flatMap((songId) => {
    const song = songs.find((item) => item.id === songId);
    if (!song) return [];
    const section = song.sections.find((item) => item.id === setlist.sectionIds?.[songId]) ?? song.sections[0];
    return section ? section.parts.map((part) => songPartPattern(song, section, part)) : [];
  });
}

function getPatternBarCount(pattern: PracticePattern) {
  const explicitBars = isGroovePattern(pattern) ? pattern.meter?.match(/^(\d+)\s+bars?\b/i) : null;
  return explicitBars ? Math.max(1, Number(explicitBars[1])) : 1;
}

function getStepCountParts(pattern: PracticePattern, step: number) {
  const stepsPerBeat = pattern.subdivision / 4;
  const cellsPerBar = pattern.beats * stepsPerBeat / getPatternBarCount(pattern);
  const positionInBar = step % cellsPerBar;
  const beat = Math.floor(positionInBar / stepsPerBeat) + 1;
  const withinBeat = Math.floor(positionInBar % stepsPerBeat);
  const suffix = pattern.subdivision === 8 ? ["", "&"][withinBeat]
    : pattern.subdivision === 12 ? ["", "trip", "let"][withinBeat]
      : pattern.subdivision === 16 ? ["", "e", "&", "a"][withinBeat] : "";
  return { beat, suffix: suffix ?? "" };
}

function getStepCountLabel(pattern: PracticePattern, step: number) {
  const { beat, suffix } = getStepCountParts(pattern, step);
  return `${beat}${suffix}`;
}

function getSpokenCount(pattern: PracticePattern, step: number, beatsOnly: boolean) {
  const { beat, suffix } = getStepCountParts(pattern, step);
  if (beatsOnly || !suffix) return String(beat);
  return suffix === "&" ? "and" : suffix;
}

function articulationAbbreviation(articulation: NonNullable<PatternHit["articulation"]>) {
  return articulation === "flam" ? "fl" : articulation === "drag" ? "dr" : "z";
}

function summarizeLimbFeedback(hits: RatedHit[]) {
  const result = {
    hands: { onTime: 0, total: 0, misses: 0, extras: 0 },
    feet: { onTime: 0, total: 0, misses: 0, extras: 0 }
  };
  let seen = false;
  for (const hit of hits) {
    seen = true;
    const limb = hit.instrument === "kick" ? result.feet : result.hands;
    if (hit.rating === "extra") { limb.extras += 1; continue; }
    limb.total += 1;
    if (hit.rating === "great" || hit.rating === "good") limb.onTime += 1;
    if (hit.rating === "miss") limb.misses += 1;
  }
  return seen ? result : null;
}

type TrainerProgressPoint = { accuracy: number; date: string };
type TrainerVoiceProgress = { instrument: Instrument; onTime: number; total: number; accuracy: number; averageOffsetMs: number | null };
function getTrainerProgress(rounds: TrainerRound[]) {
  const recent = rounds.filter((round) => round.mode === "scored" && round.result && !round.focusedDrill && (!round.limbFocus || round.limbFocus === "all"))
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt)).slice(-12);
  const points = recent.map((round) => ({ accuracy: round.result?.accuracy ?? 0, date: round.playedAt }));
  const split = Math.max(1, Math.floor(points.length / 2));
  const previous = points.slice(Math.max(0, points.length - split * 2), points.length - split);
  const latest = points.slice(-split);
  const delta = points.length >= 2
    ? Math.round(latest.reduce((sum, point) => sum + point.accuracy, 0) / latest.length - previous.reduce((sum, point) => sum + point.accuracy, 0) / previous.length)
    : null;
  const voiceTotals = new Map<Instrument, { onTime: number; total: number; offsets: number[] }>();
  for (const round of [...recent].reverse().slice(0, 8)) for (const hit of round.hits ?? []) {
    if (hit.rating === "extra") continue;
    const item = voiceTotals.get(hit.instrument) ?? { onTime: 0, total: 0, offsets: [] };
    item.total += 1;
    if (hit.rating === "great" || hit.rating === "good") item.onTime += 1;
    if (typeof hit.offsetMs === "number") item.offsets.push(hit.offsetMs);
    voiceTotals.set(hit.instrument, item);
  }
  const voices = [...voiceTotals.entries()].map(([instrument, item]): TrainerVoiceProgress => ({
    instrument,
    onTime: item.onTime,
    total: item.total,
    accuracy: item.total ? Math.round(item.onTime / item.total * 100) : 0,
    averageOffsetMs: item.offsets.length ? Math.round(item.offsets.reduce((sum, value) => sum + value, 0) / item.offsets.length) : null
  }));
  return { rounds: recent, points, delta, voices };
}

function TrainerProgressChart({ points }: { points: TrainerProgressPoint[] }) {
  if (!points.length) return null;
  const plotted = points.map((point, index) => ({
    ...point,
    x: 10 + index / Math.max(1, points.length - 1) * 300,
    y: 96 - point.accuracy * 0.78
  }));
  return <div className="trainer-progress-chart"><span>Scored accuracy · oldest to newest</span><svg viewBox="0 0 320 112" role="img" aria-label={`Accuracy trend from ${points[0].accuracy}% to ${points[points.length - 1].accuracy}% over ${points.length} recent full-pattern rounds`}><line x1="8" y1="18" x2="312" y2="18" className="trainer-progress-guide" /><line x1="8" y1="57" x2="312" y2="57" className="trainer-progress-guide" /><line x1="8" y1="96" x2="312" y2="96" className="trainer-progress-guide" /><text x="9" y="14">100%</text><text x="9" y="53">50%</text><polyline points={plotted.map((point) => `${point.x},${point.y}`).join(" ")} className="trainer-progress-line" />{plotted.map((point, index) => <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r="3.5" className="trainer-progress-point"><title>{point.accuracy}% · {new Date(point.date).toLocaleDateString()}</title></circle>)}</svg><small>{new Date(points[0].date).toLocaleDateString()} · {new Date(points[points.length - 1].date).toLocaleDateString()}</small></div>;
}

function getStickingCues(hits: PatternHit[], pattern: HandPattern, leadHand: "R" | "L") {
  const cycles: Record<HandPattern, Array<"R" | "L">> = {
    alternating: ["R", "L"],
    paradiddle: ["R", "L", "R", "R", "L", "R", "L", "L"],
    "double-strokes": ["R", "R", "L", "L"]
  };
  const cycle = cycles[pattern];
  const swap = (hand: "R" | "L"): "R" | "L" => leadHand === "R" ? hand : hand === "R" ? "L" : "R";
  const handHits = hits.filter((hit) => hit.instrument !== "kick").slice().sort((a, b) => a.step - b.step);
  return new Map(handHits.map((hit, index) => [hit, swap(cycle[index % cycle.length])]));
}

function TimingOffsetChart({ hits }: { hits: RatedHit[] }) {
  const timed = hits.filter((hit) => typeof hit.offsetMs === "number");
  if (!timed.length) return <p className="trainer-timing-empty">Play a scored round to see hit timing across the phrase.</p>;
  const stride = Math.max(1, Math.ceil(timed.length / 64));
  const sampled = timed.filter((_, index) => index % stride === 0 || index === timed.length - 1);
  const points = sampled.map((hit, index) => ({
    x: 10 + (index / Math.max(1, sampled.length - 1)) * 300,
    y: 50 + Math.max(-100, Math.min(100, hit.offsetMs ?? 0)) * 0.36,
    hit
  }));
  return <div className="trainer-timing-chart"><span>Timing across this round · above = early · center = on time · below = late</span><svg viewBox="0 0 320 100" role="img" aria-label={`Timing offsets for ${timed.length} hits. Points below center are late; points above center are early.`}><line x1="8" y1="50" x2="312" y2="50" className="timing-zero-line" /><line x1="8" y1="14" x2="312" y2="14" className="timing-guide-line" /><line x1="8" y1="86" x2="312" y2="86" className="timing-guide-line" />{points.map(({ x, y, hit }, index) => <circle key={`${index}-${hit.instrument}`} cx={x} cy={y} r="3.5" className={`timing-point timing-${hit.instrument}`} />)}</svg><small>Hits appear from left to right · guide lines are ±100 ms · positive timing offsets mean late.</small></div>;
}

type WaveformPreview = { blob: Blob; peaks: number[]; durationSeconds: number };

function TrainerRecordingWaveform({ recording }: { recording: MemoryRecording }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState<WaveformPreview | null>(null);
  const currentPreview = preview?.blob === recording.blob ? preview : null;

  useEffect(() => {
    let cancelled = false;
    let context: AudioContext | null = null;
    void (async () => {
      try {
        if (!window.AudioContext) throw new Error("Audio decoding is unavailable.");
        context = new AudioContext();
        const buffer = await context.decodeAudioData(await recording.blob.arrayBuffer());
        const bins = 640;
        const peaks = Array.from({ length: bins }, (_, bin) => {
          const from = Math.floor(bin * buffer.length / bins);
          const to = Math.max(from + 1, Math.floor((bin + 1) * buffer.length / bins));
          let peak = 0;
          for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            const samples = buffer.getChannelData(channel);
            for (let index = from; index < Math.min(to, samples.length); index += 1) peak = Math.max(peak, Math.abs(samples[index]));
          }
          return peak;
        });
        if (!cancelled) setPreview({ blob: recording.blob, peaks, durationSeconds: buffer.duration });
      } catch {
        if (!cancelled) setPreview({ blob: recording.blob, peaks: [], durationSeconds: 0 });
      } finally {
        if (context && context.state !== "closed") await context.close();
      }
    })();
    return () => { cancelled = true; if (context && context.state !== "closed") void context.close(); };
  }, [recording.blob]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentPreview?.peaks.length) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = canvas.width, height = canvas.height, middle = height / 2;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#292421";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#6c6259";
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(0, middle); context.lineTo(width, middle); context.stroke();
    context.strokeStyle = "#78d3be";
    context.lineWidth = 1.4;
    const step = width / currentPreview.peaks.length;
    currentPreview.peaks.forEach((peak, index) => {
      const x = (index + 0.5) * step;
      const amplitude = Math.max(1, peak * (middle - 9));
      context.beginPath(); context.moveTo(x, middle - amplitude); context.lineTo(x, middle + amplitude); context.stroke();
    });
    context.strokeStyle = "#ff8b7e";
    context.lineWidth = 1;
    const markers = recording.expectedMarkersMs;
    const stride = Math.max(1, Math.ceil(markers.length / 512));
    markers.filter((_, index) => index % stride === 0).forEach((marker) => {
      const x = marker / (currentPreview.durationSeconds * 1000) * width;
      if (x < 0 || x > width) return;
      context.beginPath(); context.moveTo(x, 5); context.lineTo(x, height - 5); context.stroke();
    });
    context.strokeStyle = "#f6ce66";
    context.lineWidth = 1.5;
    const actualStride = Math.max(1, Math.ceil(recording.actualMarkersMs.length / 512));
    recording.actualMarkersMs.filter((_, index) => index % actualStride === 0).forEach((marker) => {
      const x = marker / (currentPreview.durationSeconds * 1000) * width;
      if (x < 0 || x > width) return;
      context.beginPath(); context.moveTo(x, middle - 20); context.lineTo(x, middle + 20); context.stroke();
    });
  }, [currentPreview, recording.actualMarkersMs, recording.expectedMarkersMs]);

  return <div className="trainer-waveform">
    <span>Latest take · waveform, target hits, and your hits</span>
    <canvas ref={canvasRef} width={960} height={132} role="img" aria-label={`${recording.expectedMarkersMs.length} expected and ${recording.actualMarkersMs.length} recorded hit markers overlaid on the latest take waveform`} />
    <div className="trainer-waveform-legend"><span><i className="waveform-key" /> Audio waveform</span><span><i className="waveform-marker" /> Expected hit</span><span><i className="waveform-actual-marker" /> Recorded hit</span></div>
    {currentPreview?.durationSeconds ? <small>{recording.expectedMarkersMs.length} expected · {recording.actualMarkersMs.length} recorded hits · {Math.round(currentPreview.durationSeconds)} seconds. Red lines show targets; gold lines show your strikes. Dense passages are thinned.</small> : currentPreview ? <small>Waveform preview is unavailable for this recording format. Use the audio player above.</small> : <small>Preparing waveform preview…</small>}
  </div>;
}

function getPortableTrainerPatterns(ids: string[], availablePatterns: PracticePattern[], customGrooves: Groove[]) {
  const bundled = new Map<string, Groove>();
  const idMap = new Map<string, string>();
  for (const id of new Set(ids.filter(Boolean))) {
    if (patterns.some((item) => item.id === id)) continue;
    const custom = customGrooves.find((item) => item.id === id);
    if (custom) { bundled.set(custom.id, custom); continue; }
    const pattern = availablePatterns.find((item) => item.id === id);
    if (!pattern) continue;
    const sharedId = `custom-shared-${stablePatternHash(pattern.id)}`;
    idMap.set(pattern.id, sharedId);
    bundled.set(sharedId, {
      ...pattern,
      id: sharedId,
      name: pattern.name.slice(0, 60),
      style: "Imported practice",
      focus: "Shared from a Trainer setup",
      meter: "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter.slice(0, 20) : "4/4",
      feel: "straight"
    });
  }
  return { patterns: [...bundled.values()], idMap };
}

function stablePatternHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getExpectedHitMarkerTimes(pattern: PracticePattern, bpm: number, repetitions: number, countInBeats: number, feel: TrainerFeel = "straight", voice?: Instrument) {
  const countInMs = countInBeats * 60000 / bpm;
  return expectedRoundHits(pattern, bpm, countInMs, repetitions, feel).filter((target) => !voice || target.instrument === voice).map((target) => target.at);
}

function getActualHitMarkerTimes(hits: RatedHit[], countInBeats: number, bpm: number) {
  const countInMs = countInBeats * 60000 / bpm;
  return hits.flatMap((hit) => typeof hit.atMs === "number" ? [countInMs + hit.atMs] : []).sort((a, b) => a - b);
}

function shouldClickStep(pattern: PracticePattern, step: number, mode: "all" | "backbeat" | "subdivisions" | "sparse-bars") {
  const stepsPerBeat = pattern.subdivision / 4;
  const stepsPerBar = pattern.beats * stepsPerBeat / getPatternBarCount(pattern);
  const beatInBar = Math.floor((step % stepsPerBar) / stepsPerBeat) + 1;
  const isBeat = step % stepsPerBeat === 0;
  if (mode === "all") return isBeat;
  if (mode === "backbeat") return isBeat && (beatInBar === 2 || beatInBar === 4);
  if (mode === "subdivisions") return stepsPerBeat === 1 || !isBeat;
  const bar = Math.floor(step / stepsPerBar) + 1;
  return bar % 2 === 1 && isBeat;
}

function getLoopBeatChoices(beats: number) {
  const increment = Number.isInteger(beats) ? 1 : 0.5;
  const values: number[] = [];
  for (let beat = 1; beat <= beats + 0.001; beat += increment) values.push(Number(beat.toFixed(1)));
  if (!values.length) values.push(Math.max(1, beats));
  return values;
}

function closestNumber(values: number[], target: number) {
  return values.reduce((closest, value) => Math.abs(value - target) < Math.abs(closest - target) ? value : closest, values[0] ?? target);
}

function isTempoLadderReady(accuracy: number, misses: number, expected: number, hits: RatedHit[], target: number) {
  if (accuracy < target || (expected > 0 && misses / expected > 0.05)) return false;
  const offsets = hits.filter((hit) => typeof hit.offsetMs === "number").map((hit) => hit.offsetMs ?? 0);
  if (!offsets.length) return true;
  const mean = offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length;
  const averageAbsolute = offsets.reduce((sum, offset) => sum + Math.abs(offset), 0) / offsets.length;
  const spread = Math.sqrt(offsets.reduce((sum, offset) => sum + (offset - mean) ** 2, 0) / offsets.length);
  return averageAbsolute <= 35 && spread <= 25;
}

function getScoredTempoAdjustment(accuracy: number, misses: number, expected: number, hits: RatedHit[]) {
  const missRate = expected ? misses / expected * 100 : 0;
  const offsets = hits.filter((hit) => typeof hit.offsetMs === "number").map((hit) => hit.offsetMs ?? 0);
  const mean = offsets.length ? offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length : 0;
  const typicalOffset = offsets.length ? offsets.reduce((sum, offset) => sum + Math.abs(offset), 0) / offsets.length : null;
  const spread = offsets.length ? Math.sqrt(offsets.reduce((sum, offset) => sum + (offset - mean) ** 2, 0) / offsets.length) : null;
  if (accuracy >= 90 && missRate <= 5 && (typicalOffset === null || (typicalOffset <= 35 && (spread ?? 0) <= 25))) return 2;
  if (accuracy < 70 || missRate >= 20 || (typicalOffset !== null && typicalOffset >= 75) || (spread !== null && spread >= 60)) return -2;
  return 0;
}

function isPathCheckpointPassed(round: TrainerRound, accuracyTarget: number, timingTarget: number) {
  if (getRoundAccuracy(round) < accuracyTarget) return false;
  if (round.mode !== "scored") return true;
  const offsets = (round.hits ?? []).filter((hit) => typeof hit.offsetMs === "number").map((hit) => Math.abs(hit.offsetMs ?? 0));
  return !offsets.length || offsets.reduce((sum, value) => sum + value, 0) / offsets.length <= timingTarget;
}

function createTargetedTimingPattern(pattern: PracticePattern, instrument: Instrument, beat: number): PracticePattern {
  const stepsPerBeat = pattern.subdivision / 4;
  const stepOffset = Math.max(0, Math.floor((beat - 1) * stepsPerBeat));
  return {
    ...pattern,
    name: `${instrument} · beat ${beat} focus`,
    description: `Play only the ${instrument} hits from beat ${beat} of ${pattern.name}.`,
    beats: 1,
    hits: pattern.hits.filter((hit) => hit.instrument === instrument && hit.step >= stepOffset && hit.step < stepOffset + stepsPerBeat)
      .map((hit) => ({ ...hit, step: hit.step - stepOffset }))
  };
}

function getTimingWeakSpot(rounds: TrainerRound[], pattern: PracticePattern) {
  const recent = rounds.filter((round) => round.patternId === pattern.id && round.mode === "scored" && (!round.limbFocus || round.limbFocus === "all"))
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 5);
  const groups = new Map<string, { instrument: Instrument; beat: number; problems: number; offsets: number[]; rounds: Set<string> }>();
  const stepsPerBeat = pattern.subdivision / 4;
  for (const round of recent) for (const hit of round.hits ?? []) {
    if (hit.step === undefined || (hit.rating !== "miss" && (hit.offsetMs === null || Math.abs(hit.offsetMs) < 50))) continue;
    const beat = Math.min(pattern.beats, Math.floor(hit.step / stepsPerBeat) + 1);
    const key = `${hit.instrument}:${beat}`;
    const group = groups.get(key) ?? { instrument: hit.instrument, beat, problems: 0, offsets: [], rounds: new Set<string>() };
    group.problems += 1; group.rounds.add(round.id);
    if (typeof hit.offsetMs === "number") group.offsets.push(hit.offsetMs);
    groups.set(key, group);
  }
  const worst = [...groups.values()].sort((a, b) => b.problems - a.problems || b.rounds.size - a.rounds.size)[0];
  if (!worst || worst.problems < 2) return null;
  return {
    ...worst,
    rounds: worst.rounds.size,
    averageOffsetMs: worst.offsets.length ? Math.round(worst.offsets.reduce((sum, value) => sum + value, 0) / worst.offsets.length) : null
  };
}

function getPracticeRecommendation(rounds: TrainerRound[], availablePatterns: PracticePattern[]) {
  const groups = new Map<string, TrainerRound[]>();
  for (const round of rounds) if (!round.focusedDrill && (!round.limbFocus || round.limbFocus === "all")) groups.set(round.patternId, [...(groups.get(round.patternId) ?? []), round]);
  const candidates = [...groups.entries()].map(([patternId, items]) => {
    const recent = [...items].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 5);
    const average = recent.reduce((sum, round) => sum + getRoundAccuracy(round), 0) / Math.max(1, recent.length);
    const missTotal = recent.reduce((sum, round) => sum + (round.mode === "scored"
      ? round.result?.miss ?? 0
      : round.ratings.filter((rating) => rating === "missed").length), 0);
    const expectedTotal = recent.reduce((sum, round) => sum + (round.mode === "scored"
      ? (round.result?.great ?? 0) + (round.result?.good ?? 0) + (round.result?.miss ?? 0)
      : round.ratings.length), 0);
    const missRate = expectedTotal ? missTotal / expectedTotal * 100 : 0;
    const offsets = recent.flatMap((round) => round.hits ?? []).filter((hit) => typeof hit.offsetMs === "number").map((hit) => hit.offsetMs ?? 0);
    const mean = offsets.length ? offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length : 0;
    const typicalOffset = offsets.length ? offsets.reduce((sum, offset) => sum + Math.abs(offset), 0) / offsets.length : null;
    const spread = offsets.length ? Math.sqrt(offsets.reduce((sum, offset) => sum + (offset - mean) ** 2, 0) / offsets.length) : null;
    const timingPenalty = typicalOffset === null ? 0 : Math.min(25, typicalOffset * 0.18 + (spread ?? 0) * 0.08);
    const readiness = average - Math.min(20, missRate * 0.4) - timingPenalty;
    return { patternId, recent, average, missRate, typicalOffset, spread, readiness };
  }).sort((a, b) => a.readiness - b.readiness);
  const weakest = candidates[0];
  const candidateId = weakest?.patternId.startsWith("fill-round:") ? decodeURIComponent(weakest.patternId.split(":")[1] ?? "") : weakest?.patternId;
  const target = weakest && (availablePatterns.find((item) => item.id === weakest.patternId) ?? availablePatterns.find((item) => item.id === candidateId));
  if (!weakest || !target) return null;
  const latest = weakest.recent[0];
  const adjustment = getScoredTempoAdjustment(weakest.average, Math.round(weakest.missRate), 100, weakest.recent.flatMap((round) => round.hits ?? []));
  const bpm = Math.max(target.tempoRange[0], Math.min(target.tempoRange[1], latest.bpm + adjustment));
  const timingNote = weakest.typicalOffset === null ? "" : ` Typical timing distance is ${Math.round(weakest.typicalOffset)} ms with ${Math.round(weakest.spread ?? 0)} ms spread.`;
  const reason = `${weakest.recent.length} recent round${weakest.recent.length === 1 ? "" : "s"} average ${Math.round(weakest.average)}% with ${Math.round(weakest.missRate)}% missed hits.${timingNote} ${adjustment > 0 ? "Timing and accuracy are consistent; raise the tempo slightly." : adjustment < 0 ? "Slow down to reduce misses and steady the timing." : "Hold this tempo while you improve consistency."}`;
  return { pattern: target, bpm, reason };
}

function getRoundAccuracy(round: TrainerRound) {
  if (round.mode === "scored") return round.result?.accuracy ?? 0;
  const value = round.ratings.reduce((sum, rating) => sum + (rating === "clean" ? 1 : rating === "needsWork" ? 0.5 : 0), 0);
  return Math.round(value / Math.max(1, round.repetitions ?? 10) * 100);
}

function getPracticePlanSlotCount(available: PracticePattern[], minutes: number, repetitions: number, countInBeats: number) {
  if (!available.length) return 0;
  const averageRoundMs = available.reduce((sum, pattern) => sum + roundDurationMs(pattern, pattern.defaultBpm) * repetitions + countInBeats * 60000 / pattern.defaultBpm, 0) / available.length;
  return Math.max(1, Math.min(available.length, Math.ceil(minutes * 60000 / Math.max(1000, averageRoundMs))));
}

function getPracticePlanPatterns(rounds: TrainerRound[], available: PracticePattern[], selectedId: string, count: number) {
  const grouped = new Map<string, TrainerRound[]>();
  rounds.filter((round) => !round.focusedDrill && (!round.limbFocus || round.limbFocus === "all")).forEach((round) => grouped.set(round.patternId, [...(grouped.get(round.patternId) ?? []), round]));
  const practiced = [...grouped.entries()].map(([id, items]) => {
    const recent = [...items].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 5);
    return { id, score: recent.reduce((sum, item) => sum + getRoundAccuracy(item), 0) / Math.max(1, recent.length), attempts: items.length, last: recent[0]?.playedAt ?? "" };
  }).sort((a, b) => a.score - b.score || b.last.localeCompare(a.last));
  const byId = new Map(available.map((item) => [item.id, item]));
  const noviceOrder = { Beginner: 0, Intermediate: 1, Advanced: 2 };
  const unpracticed = available.filter((item) => !grouped.has(item.id)).sort((a, b) => noviceOrder[a.level] - noviceOrder[b.level] || a.name.localeCompare(b.name));
  const lightlyPracticed = available.filter((item) => grouped.has(item.id)).sort((a, b) => (grouped.get(a.id)?.length ?? 0) - (grouped.get(b.id)?.length ?? 0));
  const dueReview = available.filter((item) => getPatternMastery(rounds, item).status === "due")
    .sort((a, b) => (grouped.get(a.id)?.map((round) => round.playedAt).sort()[0] ?? "").localeCompare(grouped.get(b.id)?.map((round) => round.playedAt).sort()[0] ?? ""));
  const ordered = [
    ...dueReview,
    ...practiced.map((item) => byId.get(item.id)).filter((item): item is PracticePattern => Boolean(item)),
    ...(byId.has(selectedId) ? [byId.get(selectedId)!] : []),
    ...unpracticed,
    ...lightlyPracticed
  ];
  const unique = [...new Map(ordered.map((item) => [item.id, item])).values()];
  return unique.slice(0, count);
}

function summarizeVoiceTiming(hits: RatedHit[]) {
  const grouped = new Map<Instrument, RatedHit[]>();
  hits.filter((hit) => hit.rating !== "extra").forEach((hit) => grouped.set(hit.instrument, [...(grouped.get(hit.instrument) ?? []), hit]));
  return [...grouped.entries()].map(([instrument, items]) => {
    const timed = items.filter((hit) => typeof hit.offsetMs === "number");
    const averageOffsetMs = timed.length ? Math.round(timed.reduce((sum, hit) => sum + (hit.offsetMs ?? 0), 0) / timed.length) : 0;
    const averageAbsoluteOffsetMs = timed.length ? Math.round(timed.reduce((sum, hit) => sum + Math.abs(hit.offsetMs ?? 0), 0) / timed.length) : 0;
    return { instrument, total: items.length, great: items.filter((hit) => hit.rating === "great").length, good: items.filter((hit) => hit.rating === "good").length, miss: items.filter((hit) => hit.rating === "miss").length, averageOffsetMs, averageAbsoluteOffsetMs };
  }).sort((a, b) => voices.indexOf(a.instrument) - voices.indexOf(b.instrument));
}

function summarizeVelocityControl(hits: RatedHit[], dynamicsPractice = false) {
  const measured = hits.filter((hit) => typeof hit.velocity === "number" && (!dynamicsPractice || hit.instrument === "snare"));
  if (!measured.length) return null;
  const average = (items: RatedHit[]) => items.length ? Math.round(items.reduce((sum, hit) => sum + (hit.velocity ?? 0), 0) / items.length) : null;
  const accents = measured.filter((hit) => hit.accentTarget);
  const other = measured.filter((hit) => !hit.accentTarget);
  const accentAverage = average(accents), otherAverage = average(other);
  const message = accentAverage === null || otherAverage === null
    ? dynamicsPractice ? "Choose a groove with both accented and unaccented snare notes to compare the dynamic contrast." : "Play both accented and unaccented notes to compare your touch."
    : accentAverage >= 85 && otherAverage <= (dynamicsPractice ? 55 : 78) && accentAverage - otherAverage >= (dynamicsPractice ? 30 : 15)
      ? "Good contrast between accented and softer notes."
      : accentAverage - otherAverage < (dynamicsPractice ? 30 : 15)
        ? "Make the accented notes stand out more from the softer notes."
        : accentAverage < 85
          ? "Bring the main accents up while keeping the pulse relaxed."
          : dynamicsPractice ? "Lower the unaccented snare notes to create softer ghost notes." : "Lower the unaccented notes to leave room for ghost notes.";
  return { accentAverage, otherAverage, message };
}

function getPatternPracticeHistory(rounds: TrainerRound[], patternId: string) {
  const matched = rounds.filter((round) => round.patternId === patternId && !round.focusedDrill && (!round.limbFocus || round.limbFocus === "all"));
  const recent = [...matched].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 5);
  const averageAccuracy = recent.length ? Math.round(recent.reduce((sum, round) => sum + getRoundAccuracy(round), 0) / recent.length) : 0;
  const bestTempo = matched.filter((round) => getRoundAccuracy(round) >= 85).reduce((best, round) => Math.max(best, round.bpm), 0) || null;
  const offsets = recent.flatMap((round) => round.hits ?? []).filter((hit) => typeof hit.offsetMs === "number").map((hit) => hit.offsetMs ?? 0);
  const averageOffsetMs = offsets.length ? Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length) : null;
  const averageAbsoluteOffsetMs = offsets.length ? Math.round(offsets.reduce((sum, value) => sum + Math.abs(value), 0) / offsets.length) : null;
  return { count: matched.length, averageAccuracy, bestTempo, averageOffsetMs, averageAbsoluteOffsetMs };
}

type MasteryStatus = "new" | "building" | "ready" | "due";
function getPatternMastery(rounds: TrainerRound[], pattern: PracticePattern, now = Date.now()) {
  const matched = rounds.filter((round) => round.patternId === pattern.id && !round.focusedDrill && (!round.limbFocus || round.limbFocus === "all")).sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  if (!matched.length) return { pattern, status: "new" as const, attempts: 0, averageAccuracy: 0, averageAbsoluteOffsetMs: null, lastPlayedAt: null, dueAt: null };
  const recent = matched.slice(0, 5);
  const averageAccuracy = Math.round(recent.reduce((sum, round) => sum + getRoundAccuracy(round), 0) / recent.length);
  const expected = recent.reduce((sum, round) => sum + (round.mode === "scored" ? (round.result?.great ?? 0) + (round.result?.good ?? 0) + (round.result?.miss ?? 0) : round.ratings.length), 0);
  const misses = recent.reduce((sum, round) => sum + (round.mode === "scored" ? round.result?.miss ?? 0 : round.ratings.filter((rating) => rating === "missed").length), 0);
  const missRate = expected ? misses / expected * 100 : 0;
  const offsets = recent.flatMap((round) => round.hits ?? []).filter((hit) => typeof hit.offsetMs === "number").map((hit) => Math.abs(hit.offsetMs ?? 0));
  const averageAbsoluteOffsetMs = offsets.length ? Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length) : null;
  const mastered = matched.length >= 3 && averageAccuracy >= 85 && missRate <= 5 && (averageAbsoluteOffsetMs === null || averageAbsoluteOffsetMs <= 35);
  const lastPlayedAt = matched[0].playedAt;
  const intervalDays = averageAccuracy >= 95 && (averageAbsoluteOffsetMs === null || averageAbsoluteOffsetMs <= 20) ? 14 : 7;
  const dueAt = new Date(Date.parse(lastPlayedAt) + (mastered ? intervalDays : 2) * 86400000).toISOString();
  const due = now >= Date.parse(dueAt);
  return { pattern, status: due ? "due" as const : mastered ? "ready" as const : "building" as const, attempts: matched.length, averageAccuracy, averageAbsoluteOffsetMs, lastPlayedAt, dueAt };
}

function getPracticeMastery(rounds: TrainerRound[], patterns: PracticePattern[]) {
  return patterns.map((pattern) => getPatternMastery(rounds, pattern)).sort((a, b) => {
    const rank: Record<MasteryStatus, number> = { due: 0, building: 1, new: 2, ready: 3 };
    return rank[a.status] - rank[b.status] || a.averageAccuracy - b.averageAccuracy;
  });
}
