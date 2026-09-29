"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDrumAudio, type DrumAudio } from "@/lib/audio";
import { patterns } from "@/lib/curriculum";
import { allSongs, readSongLibrary, recordSongScore, songPartPattern, writeSongLibrary, type Setlist } from "@/lib/song-library";
import { stepDurationMs } from "@/lib/scoring";
import { classifyDrumAudio, classifyDrumFeatures, drumSpectrumFeatures } from "@/lib/trainer-audio";
import { TRAINER_KEY, expectedRoundHits, getTrainerDeviceProfile, midiNoteFromMessage, midiVelocityFromMessage, parseTrainerState, roundDurationMs, scoreTrainerHit, summarizeTrainerRound, type TrainerDeviceProfile, type TrainerMode, type TrainerRating, type TrainerRound, type TrainerSource } from "@/lib/trainer";
import { CUSTOM_GROOVES_EVENT, readCustomGrooves } from "@/lib/custom-grooves";
import type { Instrument, PracticePattern, RatedHit } from "@/lib/types";
import { DrumKitCanvas, type DrumKitCanvasHandle } from "./DrumKitCanvas";
import { useProgress } from "./ProgressProvider";

type Phase = "idle" | "loading" | "count-in" | "running" | "rating" | "paused" | "calibrating" | "complete";
type Expected = ReturnType<typeof expectedRoundHits>[number];
type PracticePlan = { patternIds: string[]; currentIndex: number; minutes: number };
const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
const keys: Record<string, Instrument> = { Space: "kick", KeyF: "snare", KeyJ: "hihat", KeyK: "tom", KeyL: "crash" };
const REPETITIONS = [4, 8, 10, 16];
const CALIBRATION_BEATS = 8;

export function DrumTrainer({ initialPatternId }: { initialPatternId?: string }) {
  const [libraryPatterns, setLibraryPatterns] = useState<PracticePattern[]>([]);
  const [customGrooves, setCustomGrooves] = useState<PracticePattern[]>([]);
  const [librarySongs, setLibrarySongs] = useState(() => allSongs(readSongLibrary()));
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [activeSetlistId, setActiveSetlistId] = useState("");
  const [setlistIndex, setSetlistIndex] = useState(0);
  const availablePatterns = [...patterns, ...libraryPatterns, ...customGrooves];
  const [patternId, setPatternId] = useState(initialPatternId ?? patterns[0].id);
  const pattern = availablePatterns.find((item) => item.id === patternId) ?? patterns[0];
  const availableVoices = [...new Set(pattern.hits.map((hit) => hit.instrument))];
  const [bpm, setBpm] = useState(pattern.defaultBpm);
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
  }, [initialPatternId]);
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
  }, [initialPatternId]);
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
  const [practicePlan, setPracticePlan] = useState<PracticePlan | null>(null);
  const [planMinutes, setPlanMinutes] = useState(10);
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
  const [noiseFloor, setNoiseFloor] = useState<number | null>(null);
  const [measuringNoise, setMeasuringNoise] = useState(false);
  const [audioConnected, setAudioConnected] = useState(false);
  const [audioThreshold, setAudioThreshold] = useState(0.07);
  const [audioVoice, setAudioVoice] = useState<Instrument>("snare");
  const [calibrationVoice, setCalibrationVoice] = useState<Instrument>("snare");
  const [audioCalibrationHits, setAudioCalibrationHits] = useState(0);
  const [deviceId, setDeviceId] = useState("");
  const [audioDevices, setAudioDevices] = useState<Array<{ id: string; label: string }>>([]);
  const [midiInputs, setMidiInputs] = useState<Array<{ id: string; name: string }>>([]);
  const [profileKey, setProfileKey] = useState("keyboard");
  const [latencyTaps, setLatencyTaps] = useState(0);
  const [latencyMessage, setLatencyMessage] = useState("");
  const startAtRef = useRef(0), pauseAtRef = useRef(0), lastStepRef = useRef(-1), lastCountBeatRef = useRef(-1), lastAudioHitRef = useRef(0), lastAudioLevelRef = useRef(0);
  const audioThresholdRef = useRef(audioThreshold), audioVoiceRef = useRef(audioVoice), latencyRef = useRef(saved.latencyMs);
  const profileKeyRef = useRef(profileKey), savedRef = useRef(saved), repetitionsRef = useRef(repetitions), countInBeatsRef = useRef(countInBeats);
  const calibrationBeatRef = useRef(-1), calibrationTapsRef = useRef<Set<number>>(new Set()), calibrationOffsetsRef = useRef<number[]>([]);
  const audioCalibrationRef = useRef<{ voice: Instrument; features: number[][] } | null>(null);
  const noiseMeasurementRef = useRef<{ until: number; values: number[] } | null>(null);
  const expectedRef = useRef<Expected[]>([]), audioRef = useRef<DrumAudio | null>(null), kitRef = useRef<DrumKitCanvasHandle>(null);
  const startRequestRef = useRef(0);
  const midiRef = useRef<MIDIAccess | null>(null), streamRef = useRef<MediaStream | null>(null), contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null), frameRef = useRef<number | null>(null), sourceRef = useRef(source);
  const { progress, recordTrainerRound, setSound } = useProgress();
  const duration = roundDurationMs(pattern, bpm);
  const activeProfile = getTrainerDeviceProfile(saved, profileKey);

  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { repetitionsRef.current = repetitions; }, [repetitions]);
  useEffect(() => { countInBeatsRef.current = countInBeats; }, [countInBeats]);
  useEffect(() => { profileKeyRef.current = profileKey; latencyRef.current = activeProfile.latencyMs; }, [activeProfile.latencyMs, profileKey]);
  useEffect(() => { const id = window.setTimeout(() => { const state = parseTrainerState(localStorage.getItem(TRAINER_KEY)); savedRef.current = state; setSaved(state); setHydrated(true); }, 0); return () => clearTimeout(id); }, []);
  useEffect(() => { if (hydrated) { try { localStorage.setItem(TRAINER_KEY, JSON.stringify(saved)); } catch { /* Training still works without storage. */ } } }, [hydrated, saved]);
  useEffect(() => { sourceRef.current = source; }, [source]);

  const updateProfile = useCallback((key: string, update: (profile: TrainerDeviceProfile) => TrainerDeviceProfile) => {
    setSaved((state) => ({ ...state, deviceProfiles: { ...state.deviceProfiles, [key]: update(getTrainerDeviceProfile(state, key)) } }));
  }, []);
  const chooseProfile = useCallback((key: string) => {
    profileKeyRef.current = key; setProfileKey(key);
    latencyRef.current = getTrainerDeviceProfile(savedRef.current, key).latencyMs;
  }, []);

  const stopAudioInput = useCallback(() => {
    audioCalibrationRef.current = null;
    noiseMeasurementRef.current = null;
    setAudioCalibrationHits(0);
    setMeasuringNoise(false);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null; analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    setAudioConnected(false);
    if (contextRef.current) void contextRef.current.close(); contextRef.current = null;
    setAudioLevel(0); setNoiseFloor(null);
  }, []);
  const disconnectMidi = useCallback(() => {
    midiRef.current?.inputs.forEach((input) => { input.onmidimessage = null; });
    if (midiRef.current) midiRef.current.onstatechange = null;
    midiRef.current = null; setMidiInputs([]);
  }, []);
  const reset = useCallback(() => {
    startRequestRef.current += 1;
    setPhase("idle"); setRepetition(0); repetitionRef.current = 0; setStep(-1); setCountIn(countInBeatsRef.current);
    ratingsRef.current = []; setRatings([]); hitsRef.current = []; setHits([]); setLastHit(null); setLastVelocity(null); setRound(null);
    expectedRef.current = []; lastStepRef.current = -1; lastCountBeatRef.current = -1;
  }, []);
  const finish = useCallback(() => {
    if (phaseRef.current === "complete") return;
    if (trainerMode === "scored") expectedRef.current.forEach((target) => { if (!target.matched) { target.matched = true; hitsRef.current.push({ instrument: target.instrument, rating: "miss", offsetMs: null, accentTarget: Boolean(target.accent) }); } });
    const result = summarizeTrainerRound(pattern, bpm, trainerMode, trainerMode === "self" ? "self" : sourceRef.current, ratingsRef.current, hitsRef.current, repetitionsRef.current);
    if (tempoBuild && trainerMode === "scored") {
      const accuracy = result.result?.accuracy ?? 0;
      const nextBpm = Math.max(pattern.tempoRange[0], Math.min(pattern.tempoRange[1], bpm + (accuracy >= 90 ? 2 : accuracy < 70 ? -2 : 0)));
      if (nextBpm !== bpm) setBpm(nextBpm);
    }
    setHits([...hitsRef.current]); setRound(result); setPhase("complete"); setRepetition(repetitionsRef.current);
    setSaved((state) => ({ ...state, rounds: [result, ...state.rounds].slice(0, 50) }));
    recordTrainerRound(result.playedAt.slice(0, 10));
    if (pattern.id.startsWith("song:")) { const [, songId, sectionId] = pattern.id.split(":"); const score = result.result?.score ?? Math.round(result.ratings.reduce((sum, rating) => sum + (rating === "clean" ? 100 : rating === "needsWork" ? 50 : 0), 0) / Math.max(1, result.ratings.length)); writeSongLibrary(recordSongScore(readSongLibrary(), songId, sectionId, score)); }
  }, [bpm, pattern, recordTrainerRound, tempoBuild, trainerMode]);
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
      if (progress.settings.sound) {
        if (nextStep % (pattern.subdivision / 4) === 0) audioRef.current?.click(nextStep === 0);
        if (trainerMode === "self") pattern.hits.filter((hit) => hit.step === nextStep).forEach((hit) => audioRef.current?.hit(hit.instrument));
      }
    }
    if (trainerMode === "scored") expectedRef.current.forEach((target) => {
      if (!target.matched && now - target.at > 100) { target.matched = true; hitsRef.current.push({ instrument: target.instrument, rating: "miss", offsetMs: null, accentTarget: Boolean(target.accent) }); setHits([...hitsRef.current]); }
    });
    if (trainerMode === "self" && elapsed >= (repetitionRef.current + 1) * duration) { pauseAtRef.current = now; setPhase("rating"); setStep(pattern.beats * (pattern.subdivision / 4) - 1); }
    if (trainerMode === "scored" && elapsed >= repetitionsRef.current * duration + 125) finish();
  }, [bpm, duration, finish, pattern.beats, pattern.hits, pattern.subdivision, progress.settings.sound, trainerMode, updateProfile]);
  useEffect(() => { if (phase !== "count-in" && phase !== "running" && phase !== "calibrating") return; const id = window.setInterval(() => tick(), 20); return () => clearInterval(id); }, [phase, tick]);
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
    const startAt = performance.now() + countInBeats * 60000 / bpm;
    startAtRef.current = startAt; expectedRef.current = expectedRoundHits(pattern, bpm, startAt, repetitions).filter((hit) => source !== "audio-timing" || hit.instrument === audioVoice);
    setCountIn(countInBeats);
    setPhase("count-in");
  };
  const rate = (rating: TrainerRating, at: number) => {
    if (phaseRef.current !== "rating") return;
    ratingsRef.current = [...ratingsRef.current, rating]; setRatings(ratingsRef.current);
    let nextBpm = bpm;
    if (trainerMode === "self" && tempoBuild) nextBpm = Math.max(pattern.tempoRange[0], Math.min(pattern.tempoRange[1], bpm + (rating === "clean" ? 2 : rating === "missed" ? -2 : 0)));
    if (ratingsRef.current.length >= repetitionsRef.current) { if (nextBpm !== bpm) setBpm(nextBpm); finish(); return; }
    repetitionRef.current = ratingsRef.current.length; setRepetition(repetitionRef.current);
    const nextDuration = roundDurationMs(pattern, nextBpm);
    if (nextBpm !== bpm) setBpm(nextBpm);
    startAtRef.current = at - repetitionRef.current * nextDuration;
    lastStepRef.current = -1; setStep(0); setPhase("running");
  };
  const pause = () => { if (phaseRef.current !== "running" && phaseRef.current !== "count-in") return; setPausedFrom(phaseRef.current); pauseAtRef.current = performance.now(); setPhase("paused"); };
  const resume = () => { if (phaseRef.current !== "paused") return; const shift = performance.now() - pauseAtRef.current; startAtRef.current += shift; expectedRef.current.forEach((target) => { target.at += shift; }); setPhase(pausedFrom); };
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
    if (phaseRef.current !== "running" || trainerMode !== "scored" || sourceRef.current !== input) return;
    const value = scoreTrainerHit(performance.now(), expectedRef.current, instrument, latencyRef.current);
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
        const now = performance.now();
        if (now - lastAudioLevelRef.current > 100) {
          lastAudioLevelRef.current = now;
          setAudioLevel(Math.round(Math.min(100, detected.rms * 1000)));
        }
        const noiseMeasurement = noiseMeasurementRef.current;
        if (noiseMeasurement) {
          if (now < noiseMeasurement.until && !detected.peak) noiseMeasurement.values.push(detected.rms);
          if (now >= noiseMeasurement.until) {
            noiseMeasurementRef.current = null;
            setMeasuringNoise(false);
            const sorted = noiseMeasurement.values.slice().sort((a, b) => a - b);
            const measuredRms = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
            const nextThreshold = Math.max(0.03, Math.min(0.4, measuredRms * 5 + 0.02));
            setNoiseFloor(Math.round(measuredRms * 1000));
            audioThresholdRef.current = nextThreshold; setAudioThreshold(nextThreshold);
            setDeviceMessage(sorted.length ? `Room noise measured at ${Math.round(measuredRms * 1000)}%. Detection threshold adjusted to ${Math.round(nextThreshold * 100)}%.` : "No quiet samples were captured. Keep still and measure the room again.");
          }
        }
        if (detected.peak >= audioThresholdRef.current && performance.now() - lastAudioHitRef.current > 90) {
          lastAudioHitRef.current = performance.now();
          analyser.getFloatFrequencyData(spectrum);
          const features = drumSpectrumFeatures(spectrum, context.sampleRate, analyser.fftSize);
          const calibration = audioCalibrationRef.current;
          if (calibration) {
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
            if (voice) receiveHit(voice, input);
          }
        }
        frameRef.current = requestAnimationFrame(sample);
      }; sample(); setDeviceMessage("Audio input connected. Strike a drum to test the signal.");
    } catch { stopAudioInput(); setDeviceMessage("Audio permission was denied or the input could not start."); }
  };
  const beginAudioCalibration = () => {
    if (!audioConnected) { setDeviceMessage("Connect the audio input first."); return; }
    audioCalibrationRef.current = { voice: calibrationVoice, features: [] };
    setAudioCalibrationHits(0); setDeviceMessage("Strike the " + calibrationVoice + " five times, with a short pause between hits.");
  };
  useEffect(() => () => { stopAudioInput(); disconnectMidi(); audioRef.current?.close(); }, [stopAudioInput, disconnectMidi]);
  useEffect(() => { window.render_game_to_text = () => { const nextTarget = expectedRef.current.find((target) => !target.matched); return JSON.stringify({ mode: phaseRef.current, pattern: pattern.name, bpm, input: trainerMode === "self" ? "self" : sourceRef.current, repetition: repetitionRef.current + 1, total: repetitions, step, countIn, ratings: ratingsRef.current.length, hits: hitsRef.current.length, lastHit, nextTargetInMs: nextTarget ? Math.round(nextTarget.at - performance.now()) : null }); };
    window.advanceTime = (ms) => { const shift = Math.max(0, ms); startAtRef.current -= shift; expectedRef.current.forEach((target) => { target.at -= shift; }); tick(performance.now()); };
    return () => { delete window.render_game_to_text; delete window.advanceTime; };
  }, [bpm, countIn, lastHit, pattern.name, repetitions, step, tick, trainerMode]);

  const settingsLocked = phase !== "idle" && phase !== "complete";
  const activeSetlist = setlists.find((item) => item.id === activeSetlistId);
  const setlistPatterns = activeSetlist ? getSetlistPatterns(activeSetlist, librarySongs) : [];
  const nextSetlistPattern = setlistPatterns[setlistIndex + 1];
  const loadSetlist = (id: string) => {
    setPracticePlan(null);
    setActiveSetlistId(id); setSetlistIndex(0);
    const selected = setlists.find((item) => item.id === id);
    const first = selected ? getSetlistPatterns(selected, librarySongs)[0] : null;
    if (first) { setPatternId(first.id); setBpm(first.defaultBpm); reset(); }
  };
  const advanceSetlist = () => {
    if (!nextSetlistPattern) return;
    setPracticePlan(null);
    reset(); setSetlistIndex((index) => index + 1);
    setPatternId(nextSetlistPattern.id); setBpm(nextSetlistPattern.defaultBpm);
  };
  const startPracticePlan = () => {
    const slots = getPracticePlanSlotCount(availablePatterns, planMinutes, repetitions, countInBeats);
    const selected = getPracticePlanPatterns(saved.rounds, availablePatterns, patternId, slots);
    if (!selected.length) return;
    setPracticePlan({ patternIds: selected.map((item) => item.id), currentIndex: 0, minutes: planMinutes });
    setActiveSetlistId(""); setPatternId(selected[0].id); setBpm(selected[0].defaultBpm); reset();
  };
  const advancePracticePlan = () => {
    if (!practicePlan) return;
    const nextIndex = practicePlan.currentIndex + 1;
    const nextPattern = availablePatterns.find((item) => item.id === practicePlan.patternIds[nextIndex]);
    if (!nextPattern) return;
    setPracticePlan({ ...practicePlan, currentIndex: nextIndex });
    setPatternId(nextPattern.id); setBpm(nextPattern.defaultBpm); reset();
  };
  const cancelPracticePlan = () => setPracticePlan(null);
  const recommendation = getPracticeRecommendation(saved.rounds, availablePatterns);
  const nextPlanPattern = practicePlan ? availablePatterns.find((item) => item.id === practicePlan.patternIds[practicePlan.currentIndex + 1]) : null;
  const patternHistory = getPatternPracticeHistory(saved.rounds, pattern.id);
  const voiceTiming = summarizeVoiceTiming(round?.hits ?? []);
  const velocityFeedback = summarizeVelocityControl(round?.hits ?? []);
  const audioGuide = noiseFloor === null
    ? "Measure the room with the kit quiet to set a useful detection threshold."
    : noiseFloor > 6
      ? "Room noise is high. Move closer to the kit or reduce background sound, then measure again."
      : audioLevel < 2
        ? "Input is very quiet. Move the mic closer or raise its input gain."
        : audioLevel > 80
          ? "Input is very strong. Reduce gain or move the mic farther away to avoid clipping."
          : "Input level looks usable. Strike each voice once to confirm the meter responds.";
  const totalSteps = pattern.beats * (pattern.subdivision / 4);
  const visibleHits = pattern.hits.filter((hit) => hit.step === step);
  const currentCount = trainerMode === "scored" ? hits.filter((hit) => hit.rating === "great" || hit.rating === "good").length : ratings.filter((rating) => rating === "clean").length;
  const midiMapKey = profileKey.startsWith("midi:") ? profileKey : (midiInputs[0] ? "midi:" + midiInputs[0].id : "midi:default");
  const midiMap = getTrainerDeviceProfile(saved, midiMapKey).midiMap;
  const gridLabel = pattern.subdivision === 4 ? "quarter-note grid" : pattern.subdivision === 8 ? "eighth-note grid" : pattern.subdivision === 12 ? "triplet grid" : "sixteenth-note grid";
  return <div className="trainer-layout">
    <section className="card trainer-setup" aria-label="Trainer setup">
      <span className="eyebrow">Round setup</span><h2>Choose your focus.</h2>
      <label>Pattern<select value={patternId} disabled={settingsLocked} onChange={(event) => { const next = availablePatterns.find((item) => item.id === event.target.value) ?? patterns[0]; setPracticePlan(null); setActiveSetlistId(""); setPatternId(next.id); setBpm(next.defaultBpm); audioVoiceRef.current = next.hits[0]?.instrument ?? "snare"; setAudioVoice(audioVoiceRef.current); reset(); }}>{availablePatterns.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select></label>
      <p>{pattern.description}{"sticking" in pattern ? ` Sticking: ${String(pattern.sticking)}.` : ""}</p>
      <label>Tempo <strong>{bpm} BPM</strong><input type="range" min={pattern.tempoRange[0]} max={pattern.tempoRange[1]} value={bpm} disabled={settingsLocked} onChange={(event) => setBpm(Number(event.target.value))} /></label>
      <div className="trainer-round-options"><label>Repetitions<select value={repetitions} disabled={settingsLocked} onChange={(event) => setRepetitions(Number(event.target.value))}>{REPETITIONS.map((count) => <option key={count} value={count}>{count}</option>)}</select></label><label>Count-in<select value={countInBeats} disabled={settingsLocked} onChange={(event) => setCountInBeats(Number(event.target.value))}>{[1, 2, 4].map((count) => <option key={count} value={count}>{count} beat{count === 1 ? "" : "s"}</option>)}</select></label></div>
      <label className="trainer-tempo-build"><input type="checkbox" checked={tempoBuild} disabled={settingsLocked} onChange={(event) => setTempoBuild(event.target.checked)} /> Build tempo automatically: self ratings adjust each pass; scored rounds adjust by 2 BPM after 90%+ accuracy or below 70%</label>
      <fieldset disabled={settingsLocked}><legend>Round method</legend><label><input type="radio" name="round-method" checked={trainerMode === "self"} onChange={() => { stopAudioInput(); disconnectMidi(); setTrainerMode("self"); }} /> Self rate each repetition</label><label><input type="radio" name="round-method" checked={trainerMode === "scored"} onChange={() => setTrainerMode("scored")} /> Score played hits</label></fieldset>
      {trainerMode === "scored" && <label>Scored input<select value={source} disabled={settingsLocked} onChange={(event) => { stopAudioInput(); disconnectMidi(); const next = event.target.value as TrainerSource; setSource(next); chooseProfile(next); reset(); }}><option value="keyboard">Keyboard</option><option value="touch">Touch pads</option><option value="midi">USB MIDI kit</option><option value="audio-timing">Audio: timing only</option><option value="audio-voices">Audio: calibrated voices</option></select></label>}
      <p className="trainer-note">{repetitions} repetitions · {countInBeats}-beat count-in · {Math.round(duration / 1000)} seconds per repetition. {trainerMode === "self" ? "Rate each pass before moving on." : "Great within 50 ms; Good within 100 ms."}</p>
      <label><input type="checkbox" checked={progress.settings.sound} onChange={(event) => setSound(event.target.checked)} /> Metronome and drum sound</label>
      {setlists.length > 0 && <div className="trainer-setlist"><span className="eyebrow">Setlist rehearsal</span><label>Follow a setlist<select value={activeSetlistId} disabled={settingsLocked} onChange={(event) => loadSetlist(event.target.value)}><option value="">Choose a setlist…</option>{setlists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{activeSetlist && <p>{setlistPatterns.length ? activeSetlist.name + ": part " + Math.min(setlistIndex + 1, setlistPatterns.length) + " of " + setlistPatterns.length : "This setlist has no playable parts yet."}</p>}</div>}
      <div className="trainer-practice-plan"><span className="eyebrow">Focused practice</span><label>Plan length<select value={planMinutes} disabled={settingsLocked || Boolean(practicePlan)} onChange={(event) => setPlanMinutes(Number(event.target.value))}><option value={5}>About 5 minutes · {getPracticePlanSlotCount(availablePatterns, 5, repetitions, countInBeats)} rounds</option><option value={10}>About 10 minutes · {getPracticePlanSlotCount(availablePatterns, 10, repetitions, countInBeats)} rounds</option><option value={20}>About 20 minutes · {getPracticePlanSlotCount(availablePatterns, 20, repetitions, countInBeats)} rounds</option></select></label><button type="button" className="button-secondary" disabled={settingsLocked} onClick={startPracticePlan}>{practicePlan ? "Restart plan" : "Build a practice plan"}</button>{practicePlan && <><p>About {practicePlan.minutes} minutes · Pattern {practicePlan.currentIndex + 1} of {practicePlan.patternIds.length}. The plan starts with your weakest recent patterns, then adds patterns you have practiced less often. Each round uses your current repetition setting.</p><button type="button" className="button-secondary" onClick={cancelPracticePlan}>End plan</button></>}</div>
      {recommendation && <div className="trainer-recommendation"><span className="eyebrow">Suggested next</span><strong>{recommendation.pattern.name}</strong><p>{recommendation.reason}</p><button className="button-secondary" type="button" disabled={settingsLocked} onClick={() => { setPracticePlan(null); setPatternId(recommendation.pattern.id); setBpm(recommendation.bpm); reset(); }}>Use {recommendation.bpm} BPM</button></div>}
    </section>
    <section className="trainer-main">
      <div className="trainer-stage" aria-live="polite">
        <div className="trainer-stage-top"><span className="eyebrow">{pattern.level} · {gridLabel}</span><span className={`mode-pill mode-${phase === "running" ? "playing" : phase}`}>{phase}</span></div>
        <h2>{pattern.name}</h2><p>{"coaching" in pattern ? String(pattern.coaching) : "focus" in pattern ? String(pattern.focus) : pattern.description}</p>
        <div className="trainer-count"><strong>{Math.min(repetition + 1, repetitions)}<small> / {repetitions}</small></strong><span>Repetition</span><strong>{currentCount}</strong><span>{trainerMode === "self" ? "Clean" : "Great + Good"}</span></div>
        {(phase === "count-in" || phase === "calibrating") && <div className="trainer-countin" role="timer">{phase === "calibrating" ? "Latency calibration · " + latencyTaps + "/" + CALIBRATION_BEATS : "Count in"}<strong>{countIn}</strong></div>}
        <div className="trainer-grid" aria-label="Pattern steps">{Array.from({ length: totalSteps }, (_, index) => <div key={index} className={step === index ? "active" : ""}><span>{index + 1}</span><strong>{pattern.hits.filter((hit) => hit.step === index).map((hit) => hit.instrument).join(" + ") || "·"}</strong></div>)}</div>
        <p className="trainer-cue" aria-live="off">{phase === "rating" ? "How did that repetition feel?" : phase === "complete" ? "Round complete" : phase === "idle" ? "Ready when you are" : phase === "calibrating" ? "Tap the beat with Space, Enter, or the button below" : visibleHits.map((hit) => hit.instrument).join(" + ") || "Keep the pulse"}</p>
        <div className="transport"><button className="button" onClick={start} disabled={settingsLocked}>{phase === "complete" ? "New round" : "Start round"}</button><button className="button-secondary" onClick={pause} disabled={phase !== "running" && phase !== "count-in"}>Pause</button><button className="button-secondary" onClick={resume} disabled={phase !== "paused"}>Resume</button><button className="button-secondary" onClick={reset} disabled={phase === "idle"}>Reset</button></div>
        {phase === "calibrating" && <button type="button" className="button-secondary" onClick={() => receiveHit("snare", source)}>Tap with the beat</button>}
        <p className="audio-status" role="status">{audioMessage}</p>
        {phase === "rating" && <div className="trainer-ratings" role="group" aria-label="Rate repetition">{(["clean", "needsWork", "missed"] as TrainerRating[]).map((rating) => <button key={rating} className="button-secondary" onClick={() => rate(rating, performance.now())}>{rating === "needsWork" ? "Needs work" : rating === "missed" ? "Missed" : "Clean"}</button>)}</div>}
        {trainerMode === "scored" && (source === "keyboard" || source === "touch") && <div className="trainer-pads" aria-label="Drum input pads">{voices.map((voice) => <button key={voice} type="button" onClick={() => receiveHit(voice, source === "touch" ? "touch" : "keyboard")} disabled={phase !== "running"} className={`drum-pad pad-${voice}`}>{voice}<kbd>{Object.entries(keys).find(([, value]) => value === voice)?.[0].replace("Key", "")}</kbd></button>)}</div>}
        {lastHit && <p className="trainer-last-hit" role="status">{lastHit.rating.toUpperCase()} · {lastHit.instrument}{lastHit.offsetMs === null ? "" : ` · ${lastHit.offsetMs > 0 ? "+" : ""}${lastHit.offsetMs} ms`}{lastVelocity === null ? "" : " · MIDI velocity " + lastVelocity}{lastHit.accentTarget ? " · accent target" : ""}</p>}
        {round && <div className="trainer-result"><h3>Round recap</h3>{round.result ? <><p><strong>{round.result.score} score · {round.result.accuracy}% accuracy</strong><br />{round.result.great} Great · {round.result.good} Good · {round.result.miss} Miss · {round.result.extra} Extra</p>{voiceTiming.length > 0 && <div className="trainer-voice-feedback"><h4>Timing by drum voice</h4>{voiceTiming.map((item) => <div className="trainer-voice-row" key={item.instrument}><strong>{item.instrument}</strong><div className="timing-offset-track" role="img" aria-label={`${item.instrument} average timing ${item.averageOffsetMs} milliseconds ${item.averageOffsetMs > 0 ? "late" : item.averageOffsetMs < 0 ? "early" : "on time"}`}><i style={{ left: `${Math.max(2, Math.min(98, 50 + item.averageOffsetMs / 2))}%` }} /></div><span>{item.averageOffsetMs > 0 ? "+" : ""}{item.averageOffsetMs} ms avg · {item.averageAbsoluteOffsetMs} ms typical distance · {item.great + item.good}/{item.total} on time{item.miss ? ` · ${item.miss} missed` : ""}</span></div>)}</div>}{round.source === "midi" && velocityFeedback && <div className="trainer-dynamics-feedback"><h4>Accent and ghost-note control</h4><p>Average MIDI velocity: accents <strong>{velocityFeedback.accentAverage ?? "—"}</strong> · other hits <strong>{velocityFeedback.otherAverage ?? "—"}</strong>.</p><p>Try accents above 85 and softer taps between 35 and 78. {velocityFeedback.message}</p></div>}</> : <p><strong>{round.ratings.filter((rating) => rating === "clean").length} clean</strong> · {round.ratings.filter((rating) => rating === "needsWork").length} needs work · {round.ratings.filter((rating) => rating === "missed").length} missed</p>}</div>}
        {phase === "complete" && practicePlan && nextPlanPattern && <button type="button" className="button-secondary" onClick={advancePracticePlan}>Next plan pattern ({practicePlan.currentIndex + 2}/{practicePlan.patternIds.length}): {nextPlanPattern.name}</button>}
        {phase === "complete" && practicePlan && !nextPlanPattern && <p className="trainer-note">Practice plan complete. Your recent results will guide the next one.</p>}
        {phase === "complete" && activeSetlist && nextSetlistPattern && <button type="button" className="button-secondary" onClick={advanceSetlist}>Next setlist part: {nextSetlistPattern.name}</button>}
        {phase === "complete" && activeSetlist && !nextSetlistPattern && setlistPatterns.length > 0 && <p className="trainer-note">Setlist complete. Choose a different setlist or replay a part.</p>}
      </div>
      <DrumKitCanvas ref={kitRef} compact interactive={false} label="Trainer drum kit animation" />
      <section className="card trainer-device" aria-label="Device setup"><span className="eyebrow">Input setup</span><h2>Connect your kit.</h2>
        {source === "midi" && trainerMode === "scored" && <><button className="button-secondary" onClick={() => void connectMidi()}>Connect USB MIDI</button><p>{midiInputs.length ? midiInputs.map((item) => item.name).join(", ") : "No MIDI input connected."}</p><div className="trainer-mapping"><span>Device profile: {profileKey.replace("midi:", "") || "default"}</span><span>Latest MIDI note: {lastMidiNote ?? "—"}</span>{lastMidiNote !== null && <label>Map note {lastMidiNote}<select value={midiMap[lastMidiNote] ?? ""} onChange={(event) => updateProfile(midiMapKey, (profile) => ({ ...profile, midiMap: { ...profile.midiMap, [lastMidiNote]: event.target.value ? event.target.value as Instrument : null } }))}><option value="">Unmapped</option>{voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>}<small>Mappings and latency are stored separately for each MIDI device. MIDI velocity is shown with each hit.</small></div></>}
        {(source === "audio-timing" || source === "audio-voices") && trainerMode === "scored" && <><p>Connect a microphone or electronic kit line out. Voice recognition uses device-specific calibration samples.</p><div className="transport"><button className="button-secondary" onClick={() => void connectAudio()} disabled={settingsLocked}>Connect audio input</button><button className="button-secondary" onClick={stopAudioInput} disabled={!audioConnected || settingsLocked}>Disconnect</button></div>{audioDevices.length > 1 && <label>Input device<select value={deviceId} disabled={settingsLocked} onChange={(event) => { stopAudioInput(); setDeviceId(event.target.value); }}><option value="">System default</option>{audioDevices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}<label>Detection threshold {Math.round(audioThreshold * 100)}%<input type="range" min="0.03" max="0.4" step="0.01" value={audioThreshold} disabled={settingsLocked} onChange={(event) => { const value = Number(event.target.value); audioThresholdRef.current = value; setAudioThreshold(value); }} /></label>{source === "audio-timing" && <label>Target voice<select value={audioVoice} disabled={settingsLocked} onChange={(event) => { const value = event.target.value as Instrument; audioVoiceRef.current = value; setAudioVoice(value); }}>{availableVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>}<meter min="0" max="100" value={audioLevel} aria-label="Relative audio input level" /><div className="trainer-audio-diagnostic"><p role="status">{audioGuide}</p><small>Input level: {audioLevel}/100{noiseFloor === null ? "" : ` · room noise: ${noiseFloor}/100`}</small><button type="button" className="button-secondary" onClick={measureBackgroundNoise} disabled={!audioConnected || measuringNoise || settingsLocked}>{measuringNoise ? "Measuring… keep quiet" : "Measure background noise"}</button></div>{source === "audio-voices" && <div className="trainer-calibration"><p>Calibrated voices for this input: {Object.keys(activeProfile.audioTemplates).length} of 5. Calibrate each drum voice for reliable classification.</p><label>Calibrate voice<select value={calibrationVoice} disabled={settingsLocked} onChange={(event) => setCalibrationVoice(event.target.value as Instrument)}>{voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label><button type="button" className="button-secondary" onClick={beginAudioCalibration} disabled={!audioConnected || audioCalibrationHits > 0 || settingsLocked}>Calibrate next five hits</button>{audioCalibrationHits > 0 && <p>Captured {audioCalibrationHits} of 5 hits for {calibrationVoice}.</p>}</div>}</>}
        {trainerMode === "scored" && <><label>Input latency correction <strong>{activeProfile.latencyMs} ms</strong><input type="range" min="-200" max="200" step="5" value={activeProfile.latencyMs} onChange={(event) => { const value = Number(event.target.value); latencyRef.current = value; updateProfile(profileKey, (profile) => ({ ...profile, latencyMs: value })); }} /></label><button type="button" className="button-secondary" onClick={startLatencyCalibration} disabled={settingsLocked}>Calibrate input latency</button>{latencyMessage && <p>{latencyMessage}</p>}</>}
        <p role="status">{deviceMessage}</p>
      </section>
    </section>
    <section className="card trainer-history"><span className="eyebrow">Your practice</span><h2>Recent rounds.</h2>{patternHistory.count > 0 && <div className="trainer-pattern-history"><strong>{pattern.name}</strong><span>{patternHistory.count} rounds · {patternHistory.averageAccuracy}% average result{patternHistory.bestTempo ? ` · ${patternHistory.bestTempo} BPM at 85%+ accuracy` : ""}</span>{patternHistory.averageOffsetMs !== null && <span>Average timing: {patternHistory.averageOffsetMs > 0 ? "+" : ""}{patternHistory.averageOffsetMs} ms {patternHistory.averageOffsetMs > 0 ? "late" : patternHistory.averageOffsetMs < 0 ? "early" : "on time"} · {patternHistory.averageAbsoluteOffsetMs} ms typical distance</span>}</div>}{saved.rounds.length ? <ol>{saved.rounds.slice(0, 8).map((item) => <li key={item.id}><strong>{item.patternName}</strong><span>{item.bpm} BPM · {item.mode === "self" ? `${item.ratings.filter((rating) => rating === "clean").length}/${item.repetitions ?? 10} clean` : `${item.result?.accuracy ?? 0}% accuracy`} · {new Date(item.playedAt).toLocaleDateString()}</span></li>)}</ol> : <p>Complete a round to see your practice history.</p>}</section>
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

function getPracticeRecommendation(rounds: TrainerRound[], availablePatterns: PracticePattern[]) {
  const groups = new Map<string, TrainerRound[]>();
  for (const round of rounds) groups.set(round.patternId, [...(groups.get(round.patternId) ?? []), round]);
  const candidates = [...groups.entries()].map(([patternId, items]) => {
    const recent = [...items].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 5);
    const scores = recent.map((round) => round.mode === "scored"
      ? round.result?.accuracy ?? 0
      : Math.round((round.ratings.filter((rating) => rating === "clean").length + round.ratings.filter((rating) => rating === "needsWork").length * 0.5) / Math.max(1, round.repetitions ?? 10) * 100));
    return { patternId, recent, average: scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length) };
  }).sort((a, b) => a.average - b.average);
  const weakest = candidates[0], target = weakest && availablePatterns.find((item) => item.id === weakest.patternId);
  if (!weakest || !target) return null;
  const latest = weakest.recent[0];
  const bpm = Math.max(target.tempoRange[0], Math.min(target.tempoRange[1], latest.bpm + (weakest.average >= 85 ? 4 : weakest.average < 65 ? -5 : 0)));
  const reason = weakest.average >= 85
    ? "Recent rounds average " + Math.round(weakest.average) + "%. Raise the tempo a little."
    : weakest.average < 65
      ? "Recent rounds average " + Math.round(weakest.average) + "%. Slow it down and build consistency."
      : "Recent rounds average " + Math.round(weakest.average) + "%. Repeat this pattern at a steady tempo.";
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
  rounds.forEach((round) => grouped.set(round.patternId, [...(grouped.get(round.patternId) ?? []), round]));
  const practiced = [...grouped.entries()].map(([id, items]) => {
    const recent = [...items].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 5);
    return { id, score: recent.reduce((sum, item) => sum + getRoundAccuracy(item), 0) / Math.max(1, recent.length), attempts: items.length, last: recent[0]?.playedAt ?? "" };
  }).sort((a, b) => a.score - b.score || b.last.localeCompare(a.last));
  const byId = new Map(available.map((item) => [item.id, item]));
  const noviceOrder = { Beginner: 0, Intermediate: 1, Advanced: 2 };
  const unpracticed = available.filter((item) => !grouped.has(item.id)).sort((a, b) => noviceOrder[a.level] - noviceOrder[b.level] || a.name.localeCompare(b.name));
  const lightlyPracticed = available.filter((item) => grouped.has(item.id)).sort((a, b) => (grouped.get(a.id)?.length ?? 0) - (grouped.get(b.id)?.length ?? 0));
  const ordered = [
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

function summarizeVelocityControl(hits: RatedHit[]) {
  const measured = hits.filter((hit) => typeof hit.velocity === "number");
  if (!measured.length) return null;
  const average = (items: RatedHit[]) => items.length ? Math.round(items.reduce((sum, hit) => sum + (hit.velocity ?? 0), 0) / items.length) : null;
  const accents = measured.filter((hit) => hit.accentTarget);
  const other = measured.filter((hit) => !hit.accentTarget);
  const accentAverage = average(accents), otherAverage = average(other);
  const message = accentAverage === null || otherAverage === null
    ? "Play both accented and unaccented notes to compare your touch."
    : accentAverage >= 85 && otherAverage <= 78 && accentAverage - otherAverage >= 15
      ? "Good contrast between accented and softer notes."
      : accentAverage - otherAverage < 15
        ? "Make the accented notes stand out more from the softer notes."
        : accentAverage < 85
          ? "Bring the main accents up while keeping the pulse relaxed."
          : "Lower the unaccented notes to leave room for ghost notes.";
  return { accentAverage, otherAverage, message };
}

function getPatternPracticeHistory(rounds: TrainerRound[], patternId: string) {
  const matched = rounds.filter((round) => round.patternId === patternId);
  const recent = [...matched].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 5);
  const averageAccuracy = recent.length ? Math.round(recent.reduce((sum, round) => sum + getRoundAccuracy(round), 0) / recent.length) : 0;
  const bestTempo = matched.filter((round) => getRoundAccuracy(round) >= 85).reduce((best, round) => Math.max(best, round.bpm), 0) || null;
  const offsets = recent.flatMap((round) => round.hits ?? []).filter((hit) => typeof hit.offsetMs === "number").map((hit) => hit.offsetMs ?? 0);
  const averageOffsetMs = offsets.length ? Math.round(offsets.reduce((sum, value) => sum + value, 0) / offsets.length) : null;
  const averageAbsoluteOffsetMs = offsets.length ? Math.round(offsets.reduce((sum, value) => sum + Math.abs(value), 0) / offsets.length) : null;
  return { count: matched.length, averageAccuracy, bestTempo, averageOffsetMs, averageAbsoluteOffsetMs };
}
