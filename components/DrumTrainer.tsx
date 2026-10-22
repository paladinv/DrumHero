"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createDrumAudio, type DrumAudio, type TrainerClickSound } from "@/lib/audio";
import { patterns } from "@/lib/curriculum";
import { allSongs, readSongLibrary, recordSongScore, songPartPattern, writeSongLibrary, type Setlist } from "@/lib/song-library";
import { stepDurationMs } from "@/lib/scoring";
import { classifyDrumAudio, classifyDrumFeatures, createDrumOnsetState, drumSpectrumFeatures, estimateAudioVelocity, isFreshDrumOnset, rankDrumFeatureMatches } from "@/lib/trainer-audio";
import { trainerStorageKey, expectedRoundHits, getTrainerDeviceProfile, midiNoteFromMessage, midiVelocityFromMessage, parseTrainerState, roundDurationMs, scoreTrainerHit, summarizeTrainerRound, type TrainerDeviceProfile, type TrainerFeel, type TrainerLimbFocus, type TrainerMode, type TrainerRating, type TrainerRound, type TrainerSource } from "@/lib/trainer";
import { CUSTOM_GROOVES_EVENT, readCustomGrooves, writeCustomGrooves } from "@/lib/custom-grooves";
import { canUseFillPractice, compatibleFillPatterns, createGrooveFillTransition } from "@/lib/fill-practice";
import { createTrainerLoopPattern, createTrainerSetupTransfer, parseSavedTrainerRoutine, parseTrainerSetupTransfer, TRAINER_PRACTICE_PATHS, type TrainerRoutine, type TrainerRoutineStep, type TrainerSetupTransfer } from "@/lib/trainer-enhancements";
import { articulationFeedback, comparableRounds, guideRoundHits, learningStage, musicalPhrase, nextCoaching, transitionFeedback, type LearningMode } from '@/lib/trainer-coaching';
import { TrainerRehearsal } from './TrainerRehearsal';
import { TrainerPeerChallenge } from './TrainerPeerChallenge';
import type { TrainerChallenge } from '@/lib/trainer-challenge';
import { TrainerGrowthPanel } from './TrainerGrowthPanel';
import { TrainerProgressMetrics } from './TrainerProgressMetrics';
import { TrainerHandsFree } from './TrainerHandsFree';
import { TrainerDeviceReadiness } from './TrainerDeviceReadiness';
import { AdaptivePracticeFeedback } from './AdaptivePracticeFeedback';
import { TrainerTakeLibrary } from './TrainerTakeLibrary';
import type { TrainerClip, TrainerDynamicsMarker } from '@/lib/trainer-take-library';
import { TrainerRoutineShelf } from './TrainerRoutineShelf';
import { TrainerRecordingReview } from './TrainerRecordingReview';
import { TrainerFillBrowser } from './TrainerFillBrowser';
import { TrainerMidiSetup } from './TrainerMidiSetup';
import { TrainerLearningTools } from './TrainerLearningTools';
import { TrainerTapTempo } from './TrainerTapTempo';
import { TrainerDynamicsBreakdown, TrainerTimingBreakdown } from './TrainerTimingBreakdown';
import { controlledGrooveVariations, getWeakSpotTempoPlan, timingZoneForHit } from '@/lib/trainer-next';
import { applyDynamicsTargets, summarizeDynamics, type TrainerDynamicsExercise } from '@/lib/trainer-dynamics';
import { shouldPlayTrainerClick, type TrainerClickMode } from '@/lib/trainer-metronome';
import { createTrainerCuePattern, type TrainerCueDensity, type TrainerCueLead, type TrainerCueMode } from '@/lib/trainer-cues';
import { summarizeTrainerProgress, type TrainerProgressPoint } from '@/lib/trainer-progress';
import { getTrainerGoalPatterns, type TrainerSessionFocus } from '@/lib/trainer-goals';
import { summarizeTrainerLiveTiming } from '@/lib/trainer-live-coaching';
import { summarizeTrainerPlacement } from '@/lib/trainer-placement';
import type { Groove, Instrument, MidiArticulation, PatternHit, PracticePattern, RatedHit } from "@/lib/types";
import { compatibleSpeechVoice, localizedSpokenCount } from "@/lib/locale-core";
import { localizedPattern } from "@/lib/teaching-pattern-display";
import { DrumKitCanvas, type DrumKitCanvasHandle } from "./DrumKitCanvas";
import { SongLinkedPractice } from "./SongLinkedPractice";
import { useProgress } from "./ProgressProvider";
import { useLocalization } from "./LocalizationProvider";

type Phase = "idle" | "loading" | "count-in" | "running" | "rating" | "paused" | "calibrating" | "complete";
type Expected = ReturnType<typeof expectedRoundHits>[number] & { transition?: "landing"; feelZone?: RatedHit["feelZone"] };
type PracticePlan = { patternIds: string[]; currentIndex: number; minutes: number; name?: string; gated?: boolean; startedAt?: string; customSteps?: TrainerRoutineStep[]; placementCheck?: boolean; placementLabels?: string[]; warmupCooldown?: boolean };
type HandPattern = "alternating" | "paradiddle" | "double-strokes";
type SpokenCount = "off" | "beats" | "subdivisions";
type LoopUnit = "beats" | "bars";
type TimingDrillFocus = { sourcePatternId: string; instrument: Instrument; beat: number; stepOffset: number };
type MemoryRecording = TrainerClip & { url: string };
type AudioDynamicsCapture = { voice: Instrument; kind: "ghost" | "accent"; rms: number[] };
const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
const keys: Record<string, Instrument> = { Space: "kick", KeyF: "snare", KeyJ: "hihat", KeyK: "tom", KeyL: "crash" };
const REPETITIONS = [4, 8, 10, 16];
const CALIBRATION_BEATS = 8;
const CUSTOM_TRAINER_ROUTINE_KEY = "drum-hero:trainer-routine:v1";
const TRAINER_PREFERENCES_KEY = "drum-hero:trainer-preferences:v1";
const TRAINER_QUICK_START_KEY = "drum-hero:trainer-quick-start-dismissed:v1";
const TRAINER_STYLE_PRESETS = [
  { id: "rock", label: "Rock", patternId: "first-beat", feel: "straight", clickMode: "backbeat" },
  { id: "reggae", label: "Reggae one-drop", patternId: "reggae-one-drop", feel: "straight", clickMode: "backbeat" },
  { id: "shuffle", label: "Blues shuffle", patternId: "shuffle-blues", feel: "shuffle", clickMode: "subdivisions" },
  { id: "funk", label: "Funk", patternId: "syncopated-funk", feel: "straight", clickMode: "subdivisions" },
  { id: "jazz", label: "Jazz swing", patternId: "jazz-swing", feel: "shuffle", clickMode: "backbeat" },
  { id: "latin", label: "Bossa nova", patternId: "bossa-nova", feel: "straight", clickMode: "all" },
  { id: "punk", label: "Punk drive", patternId: "punk-drive", feel: "straight", clickMode: "backbeat" }
] as const;

export function DrumTrainer({ initialPatternId }: { initialPatternId?: string }) {
  const { formatDate, locale, t } = useLocalization();
  const [libraryPatterns, setLibraryPatterns] = useState<PracticePattern[]>([]);
  const [customGrooves, setCustomGrooves] = useState<Groove[]>([]);
  const [librarySongs, setLibrarySongs] = useState(() => allSongs(readSongLibrary()));
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [activeSetlistId, setActiveSetlistId] = useState("");
  const [setlistIndex, setSetlistIndex] = useState(0);
  const availablePatterns = useMemo(() => [...patterns, ...libraryPatterns, ...customGrooves], [customGrooves, libraryPatterns]);
  const [patternId, setPatternId] = useState(initialPatternId ?? patterns[0].id);
  const [variationId, setVariationId] = useState("base");
  const selectedPattern = availablePatterns.find((item) => item.id === patternId) ?? patterns[0];
  const selectedDisplay = localizedPattern(selectedPattern, locale);
  const grooveVariations = useMemo(() => controlledGrooveVariations(selectedPattern), [selectedPattern]);
  const activeVariationId = grooveVariations.some(item => item.id === variationId) ? variationId : "base";
  const [fillPractice, setFillPractice] = useState(false);
  const [fillPatternId, setFillPatternId] = useState("");
  const [fillAfterBars, setFillAfterBars] = useState(2);
  const [timingDrillFocus, setTimingDrillFocus] = useState<TimingDrillFocus | null>(null);
  const [learningMode, setLearningMode] = useState<LearningMode>('normal');
  const [swingRatio, setSwingRatio] = useState(2 / 3);
  const [pocketMs, setPocketMs] = useState(35);
  const [phraseBars, setPhraseBars] = useState<0 | 4 | 8 | 16>(0);
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);
  const [quickStartLoaded, setQuickStartLoaded] = useState(false);
  const [quickStartDismissed, setQuickStartDismissed] = useState(false);
  const [dynamicsPractice, setDynamicsPractice] = useState(false);
  const [dynamicsExercise, setDynamicsExercise] = useState<TrainerDynamicsExercise>("contrast");
  const [cueMode, setCueMode] = useState<TrainerCueMode>("off");
  const [cueBeat, setCueBeat] = useState(1);
  const [cueEveryBars, setCueEveryBars] = useState<TrainerCueDensity>(1);
  const [cueLeadBeats, setCueLeadBeats] = useState<TrainerCueLead>(1);
  const [cueAdaptive, setCueAdaptive] = useState(false);
  const [cueAdaptiveMessage, setCueAdaptiveMessage] = useState("");
  const [cueSeed, setCueSeed] = useState(1);
  const [trainerDrumLevel, setTrainerDrumLevel] = useState(100);
  const [trainerClickLevel, setTrainerClickLevel] = useState(100);
  const [clickSound, setClickSound] = useState<TrainerClickSound>("hat");
  const [trainerPreferencesLoaded, setTrainerPreferencesLoaded] = useState(false);
  const [guideHeadphonesConfirmed, setGuideHeadphonesConfirmed] = useState(false);
  const [preflightRequested, setPreflightRequested] = useState(false);
  const [preflightSignalSeen, setPreflightSignalSeen] = useState(false);
  const [preflightMessage, setPreflightMessage] = useState("");
  const [guideLeakTestResult, setGuideLeakTestResult] = useState<"clear" | "detected" | null>(null);
  const receiveHitCurrentRef = useRef<(instrument: Instrument, input: TrainerSource, velocity?: number, articulation?: MidiArticulation) => void>(() => {});
  const [audioConfidence, setAudioConfidence] = useState<number | null>(null);
  const [audioMatches, setAudioMatches] = useState<Array<{ instrument: Instrument; similarity: number }>>([]);
  const [uncertainHits, setUncertainHits] = useState(0);
  const guideRef = useRef<Expected[]>([]);
  const guidePlayedRef = useRef(new Set<number>());
  const scheduledClickRef = useRef(new Set<string>());
  const audioOnsetRef = useRef(createDrumOnsetState());
  const previewTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [feel, setFeel] = useState<TrainerFeel>("straight");
  const [clickMode, setClickMode] = useState<TrainerClickMode>("all");
  const [limbFocus, setLimbFocus] = useState<TrainerLimbFocus>("all");
  const [adaptiveMode, setAdaptiveMode] = useState<"standard" | "seated" | "single-voice">("standard");
  const [adaptiveVoice, setAdaptiveVoice] = useState<Instrument>("snare");
  const [handPattern, setHandPattern] = useState<HandPattern>("alternating");
  const [leadHand, setLeadHand] = useState<"R" | "L">("R");
  const fillChoices = compatibleFillPatterns(selectedPattern, availablePatterns);
  const selectedFill = fillChoices.find((item) => item.id === fillPatternId) ?? fillChoices[0];
  const canAddFillPractice = canUseFillPractice(selectedPattern) && fillChoices.length > 0;
  const phrase = useMemo(() => {
    const selected = availablePatterns.find((item) => item.id === patternId) ?? patterns[0];
    const base = controlledGrooveVariations(selected).find((item) => item.id === activeVariationId)?.pattern ?? selected;
    if (phraseBars) return musicalPhrase(base, phraseBars, compatibleFillPatterns(base, availablePatterns).find(item => item.id === fillPatternId) ?? compatibleFillPatterns(base, availablePatterns)[0]);
    if (!fillPractice || !canUseFillPractice(base)) return base;
    const choices = compatibleFillPatterns(base, availablePatterns);
    const fill = choices.find((item) => item.id === fillPatternId) ?? choices[0];
    return fill ? createGrooveFillTransition(base, fill, fillAfterBars, `fill-round:${encodeURIComponent(base.id)}:${encodeURIComponent(fill.id)}:${fillAfterBars}`) ?? base : base;
  }, [activeVariationId, availablePatterns, fillAfterBars, fillPatternId, fillPractice, patternId, phraseBars]);
  const hasFocusedTimingDrill = timingDrillFocus?.sourcePatternId === phrase.id;
  const focusedStepOffset = hasFocusedTimingDrill ? timingDrillFocus.stepOffset : 0;
  const timingPracticePhrase = useMemo(() => hasFocusedTimingDrill && timingDrillFocus
    ? createTargetedTimingPattern(phrase, timingDrillFocus.instrument, timingDrillFocus.beat)
    : phrase, [hasFocusedTimingDrill, phrase, timingDrillFocus]);
  const trainingPhrase = useMemo(() => {
    if (adaptiveMode === "single-voice") return { ...timingPracticePhrase, name: `${timingPracticePhrase.name} · ${adaptiveVoice} rhythm`, description: `The rhythm is mapped to one ${adaptiveVoice} voice. Use this lower-reach variation to work on timing.`, hits: timingPracticePhrase.hits.map((hit) => ({ ...hit, instrument: adaptiveVoice })) };
    if (adaptiveMode === "seated") return { ...timingPracticePhrase, name: `${timingPracticePhrase.name} · seated option`, description: "Hand-playable variation with kick targets removed. Adjust the setup to a comfortable position.", hits: timingPracticePhrase.hits.filter((hit) => hit.instrument !== "kick") };
    if (limbFocus === "all") return timingPracticePhrase;
    const hits = timingPracticePhrase.hits.filter((hit) => limbFocus === "feet" ? hit.instrument === "kick" : hit.instrument !== "kick");
    return { ...timingPracticePhrase, name: `${timingPracticePhrase.name} · ${limbFocus} only`, description: `Practice the ${limbFocus} part alone. Other limb hits count as extras.`, hits };
  }, [adaptiveMode, adaptiveVoice, limbFocus, timingPracticePhrase]);
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
  const loopPattern = useMemo(() => loopEnabled ? createTrainerLoopPattern(trainingPhrase, activeLoopStartBeat, activeLoopEndBeat) : trainingPhrase, [activeLoopEndBeat, activeLoopStartBeat, loopEnabled, trainingPhrase]);
  const dynamicsPattern = useMemo(() => dynamicsPractice ? applyDynamicsTargets(loopPattern, dynamicsExercise) : loopPattern, [dynamicsExercise, dynamicsPractice, loopPattern]);
  const fillCueStartStep = fillPractice && !loopEnabled && !phraseBars
    ? fillAfterBars * selectedPattern.beats * selectedPattern.subdivision / 4 / getPatternBarCount(selectedPattern)
    : undefined;
  const cueResult = useMemo(() => createTrainerCuePattern(dynamicsPattern, cueMode, cueBeat, fillCueStartStep, cueSeed, cueEveryBars, cueLeadBeats), [cueBeat, cueEveryBars, cueLeadBeats, cueMode, cueSeed, dynamicsPattern, fillCueStartStep]);
  const pattern = cueResult.pattern;
  const hasDynamicsTargets = dynamicsPractice || cueResult.hasDynamicsTargets;
  const selectedBeatsPerBar = Math.max(1, Math.floor(selectedPattern.beats / getPatternBarCount(selectedPattern)));
  const showStickingCues = pattern.hits.some((hit) => hit.instrument !== "kick");
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
  const [timedRemaining, setTimedRemaining] = useState(0);
  const [rehearsalSeconds, setRehearsalSeconds] = useState<number | null>(null);
  const [challenge, setChallenge] = useState<TrainerChallenge | null>(null);
  const timedRoundRef = useRef<number | null>(null);
  const [practicePlan, setPracticePlan] = useState<PracticePlan | null>(null);
  const [practiceGoal, setPracticeGoal] = useState<TrainerSessionFocus>("adaptive");
  const [planMinutes, setPlanMinutes] = useState(10);
  const [planWarmupCooldown, setPlanWarmupCooldown] = useState(false);
  const [planAutoAdvance, setPlanAutoAdvance] = useState(false);
  const [planRestSeconds, setPlanRestSeconds] = useState<0 | 5 | 10>(5);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);
  const [practicePathId, setPracticePathId] = useState<(typeof TRAINER_PRACTICE_PATHS)[number]["id"]>("backbeat");
  const [pathAccuracyTarget, setPathAccuracyTarget] = useState<70 | 80 | 85 | 90 | 95>(85);
  const [pathTimingTarget, setPathTimingTarget] = useState<25 | 35 | 50 | 75>(35);
  const [customRoutineName, setCustomRoutineName] = useState("My practice routine");
  const [customRoutineSteps, setCustomRoutineSteps] = useState<TrainerRoutineStep[]>([]);
  const [customRoutineGated, setCustomRoutineGated] = useState(true);
  const [customRoutineAccuracyTarget, setCustomRoutineAccuracyTarget] = useState<70 | 80 | 85 | 90 | 95>(85);
  const [customRoutineTimingTarget, setCustomRoutineTimingTarget] = useState<25 | 35 | 50 | 75>(35);
  const [customRoutineLoaded, setCustomRoutineLoaded] = useState(false);
  const [ratings, setRatings] = useState<TrainerRating[]>([]);
  const ratingsRef = useRef<TrainerRating[]>([]);
  const [hits, setHits] = useState<RatedHit[]>([]);
  const hitsRef = useRef<RatedHit[]>([]);
  const [lastHit, setLastHit] = useState<RatedHit | null>(null);
  const [lastVelocity, setLastVelocity] = useState<number | null>(null);
  const [round, setRound] = useState<TrainerRound | null>(null);
  const [saved, setSaved] = useState(() => parseTrainerState(null));
  const [hydrated, setHydrated] = useState(false);
  const [loadedProfileId, setLoadedProfileId] = useState("");
  const [deviceMessage, setDeviceMessage] = useState("Choose an input to test it.");
  const [audioMessage, setAudioMessage] = useState("Recorded drum sounds load when you start a round.");
  const [lastMidiNote, setLastMidiNote] = useState<number | null>(null);
  const [lastMidiNoteVersion, setLastMidiNoteVersion] = useState(0);
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
  const activeRoundPatternRef = useRef<PracticePattern | null>(null);
  const startRequestRef = useRef(0);
  const clippingStreakRef = useRef(0);
  const actualRecordingMarkersRef = useRef<number[]>([]);
  const preflightRequestedRef = useRef(false);
  const guideLeakTestRef = useRef<{ peak: number } | null>(null);
  const guideLeakTimerRef = useRef<number | null>(null);
  const midiRef = useRef<MIDIAccess | null>(null), streamRef = useRef<MediaStream | null>(null), contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null), frameRef = useRef<number | null>(null), sourceRef = useRef(source);
  const recorderRef = useRef<MediaRecorder | null>(null), recordingStreamRef = useRef<MediaStream | null>(null);
  const ownsRecordingStreamRef = useRef(false), discardedRecordersRef = useRef(new WeakSet<MediaRecorder>());
  const { progress, profileId, recordTrainerRound, setSound } = useProgress();
  const duration = roundDurationMs(pattern, bpm);
  const activeProfile = getTrainerDeviceProfile(saved, profileKey);
  const audioDynamicsVoice = source === "audio-timing" ? audioVoice : calibrationVoice;
  const audioDynamicsLevels = activeProfile.audioDynamics?.[audioDynamicsVoice];
  const createTrainerAudio = () => {
    const audio = createDrumAudio();
    audio?.setMasterLevel(trainerDrumLevel / 100);
    audio?.setClickLevel(trainerClickLevel / 100);
    audio?.setClickSound(clickSound);
    return audio;
  };

  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { repetitionsRef.current = repetitions; }, [repetitions]);
  useEffect(() => { countInBeatsRef.current = countInBeats; }, [countInBeats]);
  useEffect(() => { profileKeyRef.current = profileKey; latencyRef.current = activeProfile.latencyMs; }, [activeProfile.latencyMs, profileKey]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const value: unknown = JSON.parse(localStorage.getItem(TRAINER_PREFERENCES_KEY) ?? "null");
        if (value && typeof value === "object") {
          const prefs = value as Record<string, unknown>;
          if (Number.isFinite(prefs.bpm) && Number(prefs.bpm) >= 40 && Number(prefs.bpm) <= 220) setRequestedBpm(Number(prefs.bpm));
          if (!initialPatternId && typeof prefs.patternId === "string" && prefs.patternId.length <= 200) setPatternId(prefs.patternId);
          if (typeof prefs.variationId === "string" && prefs.variationId.length <= 80) setVariationId(prefs.variationId);
          if (prefs.trainerMode === "self" || prefs.trainerMode === "scored") setTrainerMode(prefs.trainerMode);
          if (["keyboard", "touch", "midi", "audio-timing", "audio-voices"].includes(String(prefs.source))) setSource(prefs.source as TrainerSource);
          if (["straight", "shuffle", "laid-back", "shuffle-laid-back"].includes(String(prefs.feel))) setFeel(prefs.feel as TrainerFeel);
          if (["all", "backbeat", "subdivisions", "sparse-bars", "progressive-silence"].includes(String(prefs.clickMode))) setClickMode(prefs.clickMode as TrainerClickMode);
          if (typeof prefs.dynamicsPractice === "boolean") setDynamicsPractice(prefs.dynamicsPractice);
          if (["contrast", "crescendo", "evenness"].includes(String(prefs.dynamicsExercise))) setDynamicsExercise(prefs.dynamicsExercise as TrainerDynamicsExercise);
          if (["off", "fill", "crash", "loud", "soft", "random"].includes(String(prefs.cueMode))) setCueMode(prefs.cueMode as TrainerCueMode);
          if (Number.isInteger(prefs.cueBeat) && Number(prefs.cueBeat) >= 1 && Number(prefs.cueBeat) <= 16) setCueBeat(Number(prefs.cueBeat));
          if ([1, 2, 4].includes(Number(prefs.cueEveryBars))) setCueEveryBars(Number(prefs.cueEveryBars) as TrainerCueDensity);
          if ([1, 2].includes(Number(prefs.cueLeadBeats))) setCueLeadBeats(Number(prefs.cueLeadBeats) as TrainerCueLead);
          if (typeof prefs.cueAdaptive === "boolean") setCueAdaptive(prefs.cueAdaptive);
          if (Number.isFinite(prefs.trainerDrumLevel) && Number(prefs.trainerDrumLevel) >= 0 && Number(prefs.trainerDrumLevel) <= 100) setTrainerDrumLevel(Number(prefs.trainerDrumLevel));
          if (Number.isFinite(prefs.trainerClickLevel) && Number(prefs.trainerClickLevel) >= 0 && Number(prefs.trainerClickLevel) <= 100) setTrainerClickLevel(Number(prefs.trainerClickLevel));
          if (["hat", "woodblock", "beep"].includes(String(prefs.clickSound))) setClickSound(prefs.clickSound as TrainerClickSound);
          if (Number.isFinite(prefs.swingRatio) && Number(prefs.swingRatio) >= 0.5 && Number(prefs.swingRatio) <= 0.75) setSwingRatio(Number(prefs.swingRatio));
          if (Number.isFinite(prefs.pocketMs) && Number(prefs.pocketMs) >= 0 && Number(prefs.pocketMs) <= 80) setPocketMs(Number(prefs.pocketMs));
          if (REPETITIONS.includes(Number(prefs.repetitions))) setRepetitions(Number(prefs.repetitions));
          if ([1, 2, 4].includes(Number(prefs.countInBeats))) setCountInBeats(Number(prefs.countInBeats));
          if (!initialPatternId && (prefs.limbFocus === "all" || prefs.limbFocus === "hands" || prefs.limbFocus === "feet")) setLimbFocus(prefs.limbFocus);
          if (!initialPatternId && typeof prefs.loopEnabled === "boolean") setLoopEnabled(prefs.loopEnabled);
          if (!initialPatternId && (prefs.loopUnit === "beats" || prefs.loopUnit === "bars")) setLoopUnit(prefs.loopUnit);
          if (!initialPatternId && Number.isInteger(prefs.loopStartBeat) && Number(prefs.loopStartBeat) >= 1 && Number(prefs.loopStartBeat) <= 2000) setLoopStartBeat(Number(prefs.loopStartBeat));
          if (!initialPatternId && Number.isInteger(prefs.loopEndBeat) && Number(prefs.loopEndBeat) >= 1 && Number(prefs.loopEndBeat) <= 2000) setLoopEndBeat(Number(prefs.loopEndBeat));
          if (!initialPatternId && Number.isInteger(prefs.loopStartBar) && Number(prefs.loopStartBar) >= 1 && Number(prefs.loopStartBar) <= 2000) setLoopStartBar(Number(prefs.loopStartBar));
          if (!initialPatternId && Number.isInteger(prefs.loopEndBar) && Number(prefs.loopEndBar) >= 1 && Number(prefs.loopEndBar) <= 2000) setLoopEndBar(Number(prefs.loopEndBar));
          if (!initialPatternId && [0, 4, 8, 16].includes(Number(prefs.phraseBars))) setPhraseBars(Number(prefs.phraseBars) as 0 | 4 | 8 | 16);
          if (["normal", "listen-copy-solo", "build-limbs"].includes(String(prefs.learningMode))) setLearningMode(prefs.learningMode as LearningMode);
          if (typeof prefs.advancedOptionsOpen === "boolean") setAdvancedOptionsOpen(prefs.advancedOptionsOpen);
          if (typeof prefs.guideHeadphonesConfirmed === "boolean") setGuideHeadphonesConfirmed(prefs.guideHeadphonesConfirmed);
          if (typeof prefs.profileKey === "string" && prefs.profileKey.length <= 200) { setProfileKey(prefs.profileKey); profileKeyRef.current = prefs.profileKey; }
          if (typeof prefs.planWarmupCooldown === "boolean") setPlanWarmupCooldown(prefs.planWarmupCooldown);
          if (typeof prefs.planAutoAdvance === "boolean") setPlanAutoAdvance(prefs.planAutoAdvance);
          if ([0, 5, 10].includes(Number(prefs.planRestSeconds))) setPlanRestSeconds(Number(prefs.planRestSeconds) as 0 | 5 | 10);
        }
      } catch { /* Malformed preferences are replaced after the next edit. */ }
      setTrainerPreferencesLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [initialPatternId]);
  useEffect(() => {
    if (!trainerPreferencesLoaded) return;
    try { localStorage.setItem(TRAINER_PREFERENCES_KEY, JSON.stringify({ bpm: requestedBpm, patternId, variationId, trainerMode, source, feel, swingRatio, pocketMs, clickMode, repetitions, countInBeats, limbFocus, loopEnabled, loopUnit, loopStartBeat, loopEndBeat, loopStartBar, loopEndBar, phraseBars, learningMode, advancedOptionsOpen, guideHeadphonesConfirmed, profileKey, dynamicsPractice, dynamicsExercise, cueMode, cueBeat, cueEveryBars, cueLeadBeats, cueAdaptive, planWarmupCooldown, planAutoAdvance, planRestSeconds, trainerDrumLevel, trainerClickLevel, clickSound })); }
    catch { /* Preferences remain available for this visit when storage is full. */ }
  }, [advancedOptionsOpen, clickMode, clickSound, countInBeats, cueAdaptive, cueBeat, cueEveryBars, cueLeadBeats, cueMode, dynamicsExercise, dynamicsPractice, feel, guideHeadphonesConfirmed, learningMode, limbFocus, loopEnabled, loopEndBar, loopEndBeat, loopStartBar, loopStartBeat, loopUnit, patternId, phraseBars, planAutoAdvance, planRestSeconds, planWarmupCooldown, pocketMs, profileKey, repetitions, requestedBpm, source, swingRatio, trainerClickLevel, trainerDrumLevel, trainerMode, trainerPreferencesLoaded, variationId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setQuickStartDismissed(localStorage.getItem(TRAINER_QUICK_START_KEY) === "1"); }
      catch { setQuickStartDismissed(false); }
      setQuickStartLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const load = () => { const state = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId))); savedRef.current = state; setSaved(state); setLoadedProfileId(profileId); setHydrated(true); };
    const timer = window.setTimeout(load, 0);
    const importState = () => load();
    window.addEventListener("drum-hero:trainer-state-import", importState);
    return () => { clearTimeout(timer); window.removeEventListener("drum-hero:trainer-state-import", importState); };
  }, [profileId]);
  useEffect(() => { if (hydrated && loadedProfileId === profileId) { try { localStorage.setItem(trainerStorageKey(profileId), JSON.stringify(saved)); } catch { /* Training still works without storage. */ } } }, [hydrated, loadedProfileId, profileId, saved]);
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
    audioOnsetRef.current = createDrumOnsetState();
    preflightRequestedRef.current = false; setPreflightRequested(false); setPreflightSignalSeen(false);
    guideLeakTestRef.current = null; if (guideLeakTimerRef.current) clearTimeout(guideLeakTimerRef.current); guideLeakTimerRef.current = null; setGuideLeakTestResult(null);
    setAudioMatches([]); setAudioConfidence(null);
    setMeasuringNoise(false);
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null; analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    setAudioConnected(false);
    if (contextRef.current) void contextRef.current.close(); contextRef.current = null;
    setAudioLevel(0); setAudioPeak(0); setNoiseFloor(null);
  }, [setAudioCalibrationHits, setAudioDynamicsCalibrationHits, setAudioDynamicsKind, setAudioClipping, setPreflightRequested, setPreflightSignalSeen, setGuideLeakTestResult, setAudioMatches, setAudioConfidence, setMeasuringNoise, setAudioConnected, setAudioLevel, setAudioPeak, setNoiseFloor]);
  const disconnectMidi = useCallback(() => {
    midiRef.current?.inputs.forEach((input) => { input.onmidimessage = null; });
    if (midiRef.current) midiRef.current.onstatechange = null;
    midiRef.current = null; setMidiInputs([]); setLastMidiNote(null); setLastVelocity(null);
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
    previewTimersRef.current.forEach(clearTimeout); previewTimersRef.current = [];
    guideRef.current = []; guidePlayedRef.current.clear();
    scheduledClickRef.current.clear();
    audioRef.current?.silence();
    if (recorderRef.current && recorderRef.current.state !== "inactive") stopPerformanceRecording(true);
    setPhase("idle"); setAutoAdvanceCountdown(null); setRepetition(0); repetitionRef.current = 0; setStep(-1); setCountIn(countInBeatsRef.current);
    ratingsRef.current = []; setRatings([]); hitsRef.current = []; setHits([]); setLastHit(null); setLastVelocity(null); setRound(null);
    expectedRef.current = []; lastStepRef.current = -1; lastCountBeatRef.current = -1;
    activeRoundPatternRef.current = null;
  }, [stopPerformanceRecording]);
  useEffect(() => {
    const stopForProfileChange = () => { reset(); stopAudioInput(); setPracticePlan(null); setActiveSetlistId(""); };
    window.addEventListener("drum-hero:learner-profile-change", stopForProfileChange);
    return () => window.removeEventListener("drum-hero:learner-profile-change", stopForProfileChange);
  }, [reset, stopAudioInput]);
  const finish = useCallback(() => {
    if (phaseRef.current === "complete") return;
    const roundPattern = activeRoundPatternRef.current ?? pattern;
    if (trainerMode === "scored") expectedRef.current.forEach((target) => { if (!target.matched) { target.matched = true; hitsRef.current.push({ instrument: target.instrument, rating: "miss", offsetMs: null, accentTarget: Boolean(target.accent), velocityTarget: target.velocityTarget, articulation: target.articulation, articulationSpacingMs: target.articulationSpacingMs, transition: target.transition, feelZone: target.feelZone, step: target.step, repetition: target.repetition }); } });
    hitsRef.current = hitsRef.current.map(hit => hit.articulation === 'buzz' && hit.rating !== 'miss' && (hit.sustainMs ?? 0) < 60 ? { ...hit, rating: 'miss' as const, offsetMs: null } : hit);
    const result = summarizeTrainerRound(roundPattern, bpm, trainerMode, trainerMode === "self" ? "self" : sourceRef.current, ratingsRef.current, hitsRef.current, repetitionsRef.current);
    if (practicePlan?.placementCheck) {
      const placementPattern = availablePatterns.find(item => item.id === practicePlan.patternIds[practicePlan.currentIndex]);
      if (placementPattern) { result.patternId = placementPattern.id; result.patternName = placementPattern.name; }
    }
    if (timedRoundRef.current) result.durationSeconds = timedRoundRef.current;
    if (hasFocusedTimingDrill && timingDrillFocus) result.focusedDrill = { instrument: timingDrillFocus.instrument, beat: timingDrillFocus.beat };
    result.feel = feel; result.limbFocus = limbFocus; result.adaptation = adaptiveMode; if (sourceRef.current.startsWith("audio-")) { result.uncertainDetections = uncertainHits; result.inputClipped = audioClipping; } result.inputProfile = profileKeyRef.current; if (sourceRef.current === "audio-timing") result.targetVoice = audioVoiceRef.current; result.swingRatio = swingRatio; result.pocketMs = pocketMs; if (learningMode !== 'normal') result.learningMode = learningMode;
    if (activeVariationId !== "base") result.variationId = activeVariationId;
    if (tempoLadder) {
      const scoredReady = result.result ? isTempoLadderReady(result.result.accuracy, result.result.miss, result.result.great + result.result.good + result.result.miss, hitsRef.current, tempoLadderTarget) : null;
      const selfClean = result.ratings.filter((rating) => rating === "clean").length;
      const selfMissed = result.ratings.filter((rating) => rating === "missed").length;
      const selfReady = result.ratings.length > 0 && selfMissed === 0 && selfClean / result.ratings.length >= tempoLadderTarget / 100;
      const ready = scoredReady ?? selfReady;
      const nextBpm = ready ? Math.min(roundPattern.tempoRange[1], bpm + tempoLadderStep) : tempoLadderFailure === "lower" ? Math.max(roundPattern.tempoRange[0], bpm - tempoLadderStep) : bpm;
      setTempoLadderMessage(ready
        ? nextBpm === bpm ? `Top tempo reached at ${bpm} BPM. Keep it steady or choose a harder pattern.` : `Target met. Next round: ${nextBpm} BPM.`
        : `Target missed. ${nextBpm === bpm ? `Repeat ${bpm}` : `Lower to ${nextBpm}`} BPM and try again.`);
      if (nextBpm !== bpm) setBpm(nextBpm);
    } else if (tempoBuild && trainerMode === "scored") {
      const score = result.result;
      const adjustment = score ? getScoredTempoAdjustment(score.accuracy, score.miss, score.great + score.good + score.miss, hitsRef.current) : 0;
      const nextBpm = Math.max(roundPattern.tempoRange[0], Math.min(roundPattern.tempoRange[1], bpm + adjustment));
      if (nextBpm !== bpm) setBpm(nextBpm);
    }
    if (cueMode === "random" && cueAdaptive && (result.uncertainDetections || result.inputClipped)) {
      setCueAdaptiveMessage("Input quality affected this round, so the cue pace stayed the same. Recalibrate before using scored audio to adapt the drill.");
    } else if (cueMode === "random" && cueAdaptive) {
      const cueAccuracy = result.result?.accuracy ?? (result.ratings.length ? Math.round(result.ratings.reduce((sum, rating) => sum + (rating === "clean" ? 100 : rating === "needsWork" ? 50 : 0), 0) / result.ratings.length) : 0);
      const nextDensity: TrainerCueDensity = cueAccuracy >= 85 ? Math.max(1, cueEveryBars - 1) as TrainerCueDensity : cueAccuracy < 60 ? Math.min(4, cueEveryBars + 1) as TrainerCueDensity : cueEveryBars;
      if (nextDensity !== cueEveryBars) {
        setCueEveryBars(nextDensity);
        setCueAdaptiveMessage(cueAccuracy >= 85 ? `Strong response (${cueAccuracy}%). Cues will come more often: every ${nextDensity} bar${nextDensity === 1 ? "" : "s"}.` : `Let's make this easier (${cueAccuracy}%). Cues will come every ${nextDensity} bars.`);
      } else setCueAdaptiveMessage(`Cue pace held at every ${cueEveryBars} bar${cueEveryBars === 1 ? "" : "s"} for a ${cueAccuracy}% response score.`);
    }
    const planCanContinue = practicePlan && practicePlan.currentIndex < practicePlan.patternIds.length - 1 && (!practicePlan.gated || isPathCheckpointPassed(result, pathAccuracyTarget, pathTimingTarget));
    if (planAutoAdvance && planCanContinue) setAutoAdvanceCountdown(planRestSeconds);
    else setAutoAdvanceCountdown(null);
    actualRecordingMarkersRef.current = getActualHitMarkerTimes(hitsRef.current, countInBeatsRef.current, bpm);
    stopPerformanceRecording();
    setHits([...hitsRef.current]); setRound(result); setPhase("complete"); setRepetition(repetitionsRef.current);
    setSaved((state) => ({ ...state, rounds: [result, ...state.rounds].slice(0, 50) }));
    recordTrainerRound(result.playedAt.slice(0, 10));
    if (roundPattern.id.startsWith("song:") && adaptiveMode === "standard") { const [, songId, sectionId, partId] = roundPattern.id.split(":"); const score = result.result?.score ?? Math.round(result.ratings.reduce((sum, rating) => sum + (rating === "clean" ? 100 : rating === "needsWork" ? 50 : 0), 0) / Math.max(1, result.ratings.length)); writeSongLibrary(recordSongScore(readSongLibrary(), songId, sectionId, score, { partId, bpm, engine: "trainer", completePart: sourceRef.current !== "audio-timing" || new Set(roundPattern.hits.map((hit) => hit.instrument)).size === 1, inputMode: trainerMode === "self" ? "self" : sourceRef.current === "midi" ? "midi" : sourceRef.current.startsWith("audio") ? "audio" : sourceRef.current === "touch" ? "touch" : "keyboard" })); }
  }, [activeVariationId, adaptiveMode, audioClipping, uncertainHits, availablePatterns, bpm, cueAdaptive, cueEveryBars, cueMode, feel, swingRatio, pocketMs, learningMode, hasFocusedTimingDrill, limbFocus, pattern, planAutoAdvance, planRestSeconds, practicePlan, pathAccuracyTarget, pathTimingTarget, recordTrainerRound, setBpm, stopPerformanceRecording, tempoBuild, tempoLadder, tempoLadderFailure, tempoLadderStep, tempoLadderTarget, timingDrillFocus, trainerMode]);
  const tick = useCallback((now = performance.now()) => {
    if (phaseRef.current !== "count-in" && phaseRef.current !== "running" && phaseRef.current !== "calibrating") return;
    const beatMs = 60000 / bpm;
    if (now < startAtRef.current) {
      const remaining = Math.max(1, Math.ceil((startAtRef.current - now) / beatMs));
      setCountIn(remaining);
      if (remaining !== lastCountBeatRef.current) lastCountBeatRef.current = remaining;
      return;
    }
    if (phaseRef.current === "calibrating") {
      const elapsed = now - startAtRef.current, beat = Math.floor(elapsed / beatMs);
      if (beat !== calibrationBeatRef.current && beat < CALIBRATION_BEATS) {
        calibrationBeatRef.current = beat; setCountIn(CALIBRATION_BEATS - beat);
      }
      if (elapsed >= CALIBRATION_BEATS * beatMs) {
        const offsets = calibrationOffsetsRef.current;
        if (offsets.length >= 4) {
          const sorted = [...offsets].sort((a, b) => a - b);
          const latency = Math.max(-200, Math.min(200, Math.round(sorted[Math.floor(sorted.length / 2)])));
          const key = profileKeyRef.current;
          updateProfile(key, (profile) => ({ ...profile, latencyMs: latency, latencyCalibrated: true }));
          latencyRef.current = latency;
          setLatencyMessage("Calibration saved for this device: " + (latency > 0 ? "+" : "") + latency + " ms.");
        } else setLatencyMessage("Only " + offsets.length + " taps were captured. Try again and tap with the click.");
        setPhase("idle"); setLatencyTaps(offsets.length);
      }
      return;
    }
    if (phaseRef.current === "count-in") setPhase("running");
    const elapsed = now - startAtRef.current;
    if (timedRoundRef.current) setTimedRemaining(Math.max(0, Math.ceil(timedRoundRef.current - elapsed / 1000)));
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
      const voice = hasSpeech ? compatibleSpeechVoice(locale, window.speechSynthesis.getVoices()) : undefined;
      if (hasSpeech && voice && !window.speechSynthesis.speaking && !window.speechSynthesis.pending && (speakGrid || (speakBeats && beatBoundary))) {
        const token = getSpokenCount(pattern, nextStep, speakBeats, locale);
        if (token) {
          const utterance = new SpeechSynthesisUtterance(token);
          utterance.lang = voice.lang;
          utterance.voice = voice;
          utterance.rate = 1.6;
          window.speechSynthesis.speak(utterance);
        }
      }
    }
    if (trainerMode === "scored") expectedRef.current.forEach((target) => {
      if (!target.matched && now - target.at > 100) { target.matched = true; hitsRef.current.push({ instrument: target.instrument, rating: "miss", offsetMs: null, accentTarget: Boolean(target.accent), velocityTarget: target.velocityTarget, articulation: target.articulation, step: target.step, repetition: target.repetition }); setHits([...hitsRef.current]); }
    });
    if (trainerMode === "self" && elapsed >= (repetitionRef.current + 1) * duration) { pauseAtRef.current = now; setPhase("rating"); setStep(pattern.beats * (pattern.subdivision / 4) - 1); }
    if (trainerMode === "scored" && elapsed >= (timedRoundRef.current ? timedRoundRef.current * 1000 : repetitionsRef.current * duration) + 125) finish();
  }, [bpm, duration, finish, locale, pattern, spokenCount, trainerMode, updateProfile]);
  useEffect(() => { if (phase !== "count-in" && phase !== "running" && phase !== "calibrating") return; const id = window.setInterval(() => tick(), 20); return () => clearInterval(id); }, [phase, tick]);
  const scheduleAudioWindow = useCallback((now = performance.now()) => {
    if ((!progress.settings.sound && phaseRef.current !== "calibrating") || !audioRef.current || !["count-in", "running", "calibrating"].includes(phaseRef.current)) return;
    const audio = audioRef.current;
    const end = now + 120;
    const beatMs = 60000 / bpm;
    const scheduleClickOnce = (key: string, at: number, accent: boolean) => {
      if (at < now - 80 || at > end || scheduledClickRef.current.has(key)) return;
      scheduledClickRef.current.add(key);
      audio.scheduleClick(at, accent);
    };
    if (phaseRef.current === "count-in" || phaseRef.current === "calibrating") {
      const countStart = startAtRef.current - countInBeatsRef.current * beatMs;
      for (let beat = 0; beat < countInBeatsRef.current; beat += 1) scheduleClickOnce(`count-in:${beat}`, countStart + beat * beatMs, beat === 0);
    }
    if (phaseRef.current === "calibrating") {
      for (let beat = 0; beat < CALIBRATION_BEATS; beat += 1) scheduleClickOnce(`calibration:${beat}`, startAtRef.current + beat * beatMs, beat === 0);
      return;
    }
    guideRef.current.forEach((target, targetIndex) => {
      const stage = learningStage(learningMode, target.repetition, repetitionsRef.current);
      if ((trainerMode === "self" || stage === "Listen" || stage === "Copy") && !guidePlayedRef.current.has(targetIndex) && target.at >= now - 80 && target.at <= end) {
        guidePlayedRef.current.add(targetIndex);
        audio.scheduleHit(target.instrument, target.at, target.accent);
      }
    });
    if (phaseRef.current !== "running" && phaseRef.current !== "count-in") return;
    const firstRepetition = Math.max(0, Math.floor((now - startAtRef.current) / duration));
    const lastRepetition = Math.min(repetitionsRef.current - 1, Math.ceil((end - startAtRef.current) / duration));
    const stepMs = stepDurationMs(bpm, pattern.subdivision);
    const totalSteps = Math.round(pattern.beats * pattern.subdivision / 4);
    for (let repetitionIndex = firstRepetition; repetitionIndex <= lastRepetition; repetitionIndex += 1) {
      for (let nextStep = 0; nextStep < totalSteps; nextStep += 1) {
        if (!shouldPlayTrainerClick(pattern, nextStep, clickMode, repetitionIndex, getPatternBarCount(pattern))) continue;
        const at = startAtRef.current + repetitionIndex * duration + nextStep * stepMs;
        scheduleClickOnce(`grid:${repetitionIndex}:${nextStep}`, at, nextStep === 0);
      }
    }
  }, [bpm, clickMode, duration, learningMode, pattern, progress.settings.sound, trainerMode]);
  useEffect(() => {
    if (phase !== "count-in" && phase !== "running" && phase !== "calibrating") return;
    const id = window.setInterval(() => scheduleAudioWindow(), 20);
    return () => clearInterval(id);
  }, [phase, scheduleAudioWindow]);
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
          if (clip.size > 0) {
            const clipPattern = activeRoundPatternRef.current ?? pattern;
            const clipDurationMs = roundDurationMs(clipPattern, bpm);
            setRecordedClip({
              patternId: clipPattern.id,
              patternName: clipPattern.name,
              bpm,
              createdAt: new Date().toISOString(),
              blob: clip,
              url: URL.createObjectURL(clip),
              bookmarksMs: [],
              settings: { feel, swingRatio, pocketMs, learningMode, source: trainerMode === "self" ? "self" : source, inputProfile: profileKey, targetVoice: source === "audio-timing" ? audioVoice : undefined, beatsPerBar: clipPattern.beats / getPatternBarCount(clipPattern) },
              expectedMarkersMs: getExpectedHitMarkerTimes(clipPattern, bpm, rehearsalSeconds ? Math.ceil(rehearsalSeconds * 1000 / clipDurationMs) : repetitions, countInBeats, feel, source === "audio-timing" ? audioVoice : undefined, { swingRatio, pocketMs, learningMode, includeFinalReturn: !rehearsalSeconds && (fillPractice || phraseBars > 0) && !loopEnabled }).filter(ms => !rehearsalSeconds || ms < (rehearsalSeconds + countInBeats * 60 / bpm) * 1000),
              actualMarkersMs: actualRecordingMarkersRef.current,
              expectedDynamics: getExpectedDynamicsMarkers(clipPattern, bpm, rehearsalSeconds ? Math.ceil(rehearsalSeconds * 1000 / clipDurationMs) : repetitions, countInBeats, feel, { swingRatio, pocketMs }).filter(marker => !rehearsalSeconds || marker.timeMs < (rehearsalSeconds + countInBeats * 60 / bpm) * 1000),
              actualDynamics: getActualDynamicsMarkers(hitsRef.current, countInBeats, bpm),
            });
            if (isCurrentRecorder) setRecordingMessage("Recording ready. Play it back below to review your performance.");
          }
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
    const roundCueSeed = cueMode === "random" ? Math.floor(Math.random() * 0x7ffffffe) + 1 : cueSeed;
    const roundPattern = cueMode === "random" ? createTrainerCuePattern(dynamicsPattern, "random", cueBeat, fillCueStartStep, roundCueSeed, cueEveryBars, cueLeadBeats).pattern : pattern;
    if (learningMode === 'build-limbs' && (!roundPattern.hits.some(hit => hit.instrument === 'kick') || !roundPattern.hits.some(hit => hit.instrument !== 'kick'))) { setAudioMessage('Choose a pattern with kick and hand voices for the limb-building sequence.'); return; }
    if (learningMode === 'listen-copy-solo') setSound(true);
    reset(); if (cueMode === "random") setCueSeed(roundCueSeed); activeRoundPatternRef.current = roundPattern;
    const roundDuration = roundDurationMs(roundPattern, bpm);
    const request = startRequestRef.current; if (!audioRef.current) audioRef.current = createTrainerAudio();
    const audio = audioRef.current;
    if (!audio) setAudioMessage("Web Audio is unavailable; visual timing remains active.");
    else if (progress.settings.sound || learningMode === "listen-copy-solo") {
      setAudioMessage("Loading recorded drum sounds…");
      setPhase("loading");
      const complete = await audio.ready;
      if (startRequestRef.current !== request) return;
      setAudioMessage(complete ? "Recorded drum sounds and metronome are ready." : "Some recorded samples failed to load; unavailable drum voices will be silent.");
    } else setAudioMessage("Sound is muted; visual timing remains active.");
    if (startRequestRef.current !== request) return;
    if (recordAudio) await beginPerformanceRecording(request);
    if (startRequestRef.current !== request) return;
    const playingSeconds = rehearsalSeconds;
    const runRepetitions = playingSeconds ? Math.ceil(playingSeconds * 1000 / roundDuration) : repetitions;
    timedRoundRef.current = playingSeconds; setTimedRemaining(playingSeconds ?? 0);
    repetitionsRef.current = runRepetitions;
    const startAt = performance.now() + countInBeats * 60000 / bpm;
    actualRecordingMarkersRef.current = [];
    startAtRef.current = startAt;
    const hasReturn = (fillPractice || phraseBars > 0) && !loopEnabled && !playingSeconds;
    const expected: Expected[] = expectedRoundHits(roundPattern, bpm, startAt, runRepetitions, feel, { swingRatio, pocketMs })
      .map((hit) => ({ ...hit, ...(focusedStepOffset ? { step: hit.step + focusedStepOffset } : {}), feelZone: timingZoneForHit(roundPattern, hit.step, hit.instrument) }))
      .filter((hit) => (!playingSeconds || hit.at < startAt + playingSeconds * 1000) && (source !== "audio-timing" || hit.instrument === audioVoice));
    if (hasReturn) {
      const landingAt = startAt + runRepetitions * roundDuration;
      expected.push(...expectedRoundHits(roundPattern, bpm, landingAt, 1, feel, { swingRatio, pocketMs })
        .filter((hit) => hit.step === 0 && (source !== "audio-timing" || hit.instrument === audioVoice))
        .map((hit) => ({ ...hit, repetition: runRepetitions - 1, transition: "landing" as const })));
    }
    expectedRef.current = expected;
    const guide = guideRoundHits(roundPattern, bpm, startAt, runRepetitions, feel, { swingRatio, pocketMs }).filter(hit => !playingSeconds || hit.at < startAt + playingSeconds * 1000);
    if (hasReturn) guide.push(...guideRoundHits(roundPattern, bpm, startAt + runRepetitions * roundDuration, 1, feel, { swingRatio, pocketMs }).filter(hit => hit.step === 0).map(hit => ({ ...hit, repetition: runRepetitions - 1 })));
    guideRef.current = guide;
    guidePlayedRef.current.clear(); scheduledClickRef.current.clear();
    expectedRef.current = expectedRef.current.filter(hit => {
      const stage = learningStage(learningMode, hit.repetition, repetitions);
      return stage !== 'Listen' && (stage !== 'Feet' || hit.instrument === 'kick') && (stage !== 'Hands' || hit.instrument !== 'kick');
    });
    setUncertainHits(0);
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
    guideRef.current = guideRoundHits(pattern, nextBpm, startAtRef.current, repetitions, feel, { swingRatio, pocketMs });
    lastStepRef.current = -1; setStep(0); setPhase("running");
  };
  const pause = () => { if (phaseRef.current !== "running" && phaseRef.current !== "count-in") return; setPausedFrom(phaseRef.current); pauseAtRef.current = performance.now(); guideRef.current.forEach((target, index) => { if (target.at > pauseAtRef.current) guidePlayedRef.current.delete(index); }); scheduledClickRef.current.clear(); audioRef.current?.silence(); if (recorderRef.current?.state === "recording") recorderRef.current.pause(); setPhase("paused"); };
  const resume = () => { if (phaseRef.current !== "paused") return; const shift = performance.now() - pauseAtRef.current; startAtRef.current += shift; expectedRef.current.forEach((target) => { target.at += shift; }); guideRef.current.forEach(target => { target.at += shift; }); scheduledClickRef.current.clear(); if (recorderRef.current?.state === "paused") recorderRef.current.resume(); setPhase(pausedFrom); };
  const startLatencyCalibration = async () => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "complete") return;
    if (!audioRef.current) audioRef.current = createTrainerAudio();
    const request = ++startRequestRef.current;
    setLatencyMessage("Preparing the count-in sound…"); setPhase("loading");
    if (audioRef.current) await audioRef.current.ready;
    if (startRequestRef.current !== request) return;
    calibrationOffsetsRef.current = []; calibrationTapsRef.current = new Set(); calibrationBeatRef.current = -1;
    setLatencyTaps(0); setLatencyMessage("Tap with the click for eight beats after the count-in.");
    startAtRef.current = performance.now() + countInBeats * 60000 / bpm;
    lastCountBeatRef.current = -1; setCountIn(countInBeats); setPhase("calibrating");
  };
  const receiveHit = useCallback((instrument: Instrument, input: TrainerSource, velocity?: number, midiArticulation?: MidiArticulation) => {
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
    const currentStage = learningStage(learningMode, Math.max(0, Math.floor((now - startAtRef.current) / roundDurationMs(pattern, bpm))), repetitionsRef.current);
    if (currentStage === 'Listen' && !expectedRef.current.some(target => !target.matched && target.instrument === instrument && Math.abs(now - latencyRef.current - target.at) <= 100)) return;
    const buzz = [...hitsRef.current].reverse().find(hit => hit.instrument === instrument && hit.articulation === 'buzz' && hit.atMs !== undefined && now - latencyRef.current - startAtRef.current - hit.atMs >= 0 && now - latencyRef.current - startAtRef.current - hit.atMs <= 180);
    if (buzz && buzz.atMs !== undefined) { const elapsed = Math.round(now - latencyRef.current - startAtRef.current - buzz.atMs); if (elapsed - (buzz.sustainMs ?? 0) <= 65) buzz.sustainMs = elapsed; setHits([...hitsRef.current]); return; }
    const value = scoreTrainerHit(now, expectedRef.current, instrument, latencyRef.current);
    value.atMs = Math.round(now - latencyRef.current - startAtRef.current);
    if (typeof velocity === "number") value.velocity = velocity;
    if (input === "midi" && midiArticulation) value.midiArticulation = midiArticulation;
    hitsRef.current = [...hitsRef.current, value]; setHits(hitsRef.current); setLastHit(value);
    if (progress.settings.sound && input !== "audio-timing" && input !== "audio-voices") audioRef.current?.hit(instrument);
  }, [bpm, learningMode, pattern, progress.settings.sound, trainerMode]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => {
    if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (phaseRef.current === "calibrating" && (event.code === "Space" || event.code === "Enter")) { event.preventDefault(); receiveHit("snare", sourceRef.current); return; }
    const voice = keys[event.code]; if (voice && trainerMode === "scored" && sourceRef.current === "keyboard") { event.preventDefault(); receiveHit(voice, "keyboard"); }
  }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [receiveHit, trainerMode]);

  useEffect(() => { receiveHitCurrentRef.current = receiveHit; }, [receiveHit]);
  const connectMidi = async () => {
    if (!navigator.requestMIDIAccess) { setDeviceMessage("Web MIDI is unavailable in this browser. Use touch, keyboard, or audio input."); return; }
    try {
      disconnectMidi(); const access = await navigator.requestMIDIAccess({ sysex: false }); midiRef.current = access;
      const bind = () => {
        const inputs = [...access.inputs.values()]; setMidiInputs(inputs.map((input) => ({ id: input.id, name: input.name ?? "MIDI input" })));
        inputs.forEach((input) => { input.onmidimessage = (event) => {
          const data = event.data, note = data ? midiNoteFromMessage(data) : null; if (note === null) return;
          const key = "midi:" + input.id; chooseProfile(key);
          const midiProfile = getTrainerDeviceProfile(savedRef.current, key);
          const instrument = midiProfile.midiMap[note] ?? null;
          const articulation = midiProfile.midiArticulations[note] ?? undefined;
          const velocity = data ? midiVelocityFromMessage(data) : null;
          setLastMidiNote(note);
          setLastMidiNoteVersion(version => version + 1);
          setLastVelocity(velocity);
          setDeviceMessage(instrument ? "MIDI note " + note + " → " + instrument + " · velocity " + (velocity ?? 0) : "MIDI note " + note + " is unmapped. Assign a voice below.");
          if (instrument) receiveHit(instrument, "midi", velocity ?? undefined, articulation);
        }; });
      }; bind(); access.onstatechange = bind;
      setDeviceMessage(access.inputs.size ? "MIDI connected. Strike a pad to test its mapping." : "MIDI access granted; connect and power on your kit.");
    } catch { setDeviceMessage("MIDI access was denied or failed. Keyboard and touch remain available."); }
  };
  // Rebind when mapping or scoring callback changes, without requesting permission again.
  useEffect(() => { midiRef.current?.inputs.forEach((input) => { input.onmidimessage = (event) => {
    const data = event.data, note = data ? midiNoteFromMessage(data) : null; if (note === null) return;
    const key = "midi:" + input.id; chooseProfile(key);
    const midiProfile = getTrainerDeviceProfile(savedRef.current, key);
    const instrument = midiProfile.midiMap[note] ?? null;
    const articulation = midiProfile.midiArticulations[note] ?? undefined;
    const velocity = data ? midiVelocityFromMessage(data) : null;
    setLastMidiNote(note); setLastMidiNoteVersion(version => version + 1); setLastVelocity(velocity);
    setDeviceMessage(instrument ? "MIDI note " + note + " → " + instrument + " · velocity " + (velocity ?? 0) : "MIDI note " + note + " is unmapped. Assign a voice below.");
    if (instrument) receiveHit(instrument, "midi", velocity ?? undefined, articulation);
  }; }); }, [chooseProfile, receiveHit, saved.deviceProfiles]);

  const measureBackgroundNoise = () => {
    if (!audioConnected) { setDeviceMessage("Connect the audio input before measuring the room noise."); return; }
    noiseMeasurementRef.current = { until: performance.now() + 2000, values: [] };
    setNoiseFloor(null); setMeasuringNoise(true);
    setDeviceMessage("Measuring the room. Keep the kit quiet for two seconds.");
  };
  const runGuideLeakCheck = async () => {
    if (!audioConnected) { setPreflightMessage("Connect the microphone before checking guide bleed."); return; }
    if (!audioRef.current) audioRef.current = createTrainerAudio();
    const audio = audioRef.current;
    if (!audio) { setPreflightMessage("Web Audio is unavailable for a guide check."); return; }
    const request = startRequestRef.current;
    await audio.ready;
    if (request !== startRequestRef.current) return;
    if (guideLeakTimerRef.current) clearTimeout(guideLeakTimerRef.current);
    const check = { peak: 0 };
    guideLeakTestRef.current = check; setGuideLeakTestResult(null); setPreflightMessage("Playing one guide snare. Keep the room quiet for a moment.");
    audio.silence(); audio.scheduleHit("snare", performance.now() + 100);
    guideLeakTimerRef.current = window.setTimeout(() => {
      if (guideLeakTestRef.current !== check) return;
      guideLeakTestRef.current = null; guideLeakTimerRef.current = null;
      const detected = check.peak >= Math.max(0.02, audioThresholdRef.current * 0.5);
      setGuideLeakTestResult(detected ? "detected" : "clear");
      setPreflightMessage(detected ? "The microphone heard the guide sample. Use headphones or mute the guide during scored practice." : "No guide bleed crossed the current detection threshold.");
    }, 800);
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
        if (preflightRequestedRef.current && detected.peak >= Math.max(0.025, audioThresholdRef.current * 0.7)) {
          preflightRequestedRef.current = false; setPreflightRequested(false); setPreflightSignalSeen(true);
          setPreflightMessage("A clear strike reached the Trainer. Check latency and guide bleed below.");
        }
        clippingStreakRef.current = detected.peak >= 0.985 ? clippingStreakRef.current + 1 : 0;
        if (clippingStreakRef.current >= 2) setAudioClipping(true);
        const now = performance.now();
        if (guideLeakTestRef.current) guideLeakTestRef.current.peak = Math.max(guideLeakTestRef.current.peak, detected.peak);
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
        if (isFreshDrumOnset(audioOnsetRef.current, detected.peak, detected.rms, activeDetectionThreshold, now)) {
          lastAudioHitRef.current = now;
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
            const templates = savedRef.current.deviceProfiles[audioProfileKey]?.audioTemplates ?? {};
            const matches = rankDrumFeatureMatches(features, templates);
            setAudioMatches(matches.slice(0, 3));
            const result = classifyDrumFeatures(features, templates);
            setAudioConfidence(result.confidence);
            if (!result.instrument && sourceRef.current === 'audio-voices') setUncertainHits(count => count + 1);
            const input = sourceRef.current;
            const voice = input === "audio-timing" ? audioVoiceRef.current : result.instrument;
            const confidence = input === "audio-voices" ? " (" + Math.round(result.confidence * 100) + "% confidence)" : "";
            setDeviceMessage(voice ? "Audio hit: " + voice + confidence : "Audio hit detected; voice uncertain. Calibrate this device before scoring voices.");
            const levels = voice ? savedRef.current.deviceProfiles[audioProfileKey]?.audioDynamics?.[voice] : undefined;
            const estimatedVelocity = voice ? estimateAudioVelocity(detected.rms, levels) : null;
            if (voice) receiveHitCurrentRef.current(voice, input, estimatedVelocity ?? undefined);
          }
        }
        frameRef.current = requestAnimationFrame(sample);
      }; audioOnsetRef.current = createDrumOnsetState(); sample(); setDeviceMessage("Audio input connected. Strike a drum to test the signal.");
    } catch { stopAudioInput(); setDeviceMessage("Audio permission was denied or the input could not start."); }
  };
  const beginAudioCalibration = (voiceOrEvent?: Instrument | object) => {
    const voice = typeof voiceOrEvent === "string" ? voiceOrEvent : calibrationVoice;
    if (!audioConnected) { setDeviceMessage("Connect the audio input first."); return; }
    if (audioDynamicsCalibrationRef.current) { setDeviceMessage("Finish the dynamics calibration before calibrating drum voices."); return; }
    setCalibrationVoice(voice);
    audioCalibrationRef.current = { voice, features: [] };
    setAudioCalibrationHits(0); setDeviceMessage("Strike the " + voice + " five times, with a short pause between hits.");
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
  useEffect(() => () => { startRequestRef.current += 1; previewTimersRef.current.forEach(clearTimeout); stopPerformanceRecording(true); stopAudioInput(); disconnectMidi(); audioRef.current?.close(); }, [stopAudioInput, stopPerformanceRecording, disconnectMidi]);
  useEffect(() => { window.render_game_to_text = () => { const nextTarget = expectedRef.current.find((target) => !target.matched); return JSON.stringify({ mode: phaseRef.current, pattern: pattern.name, bpm, input: trainerMode === "self" ? "self" : sourceRef.current, repetition: repetitionRef.current + 1, total: repetitions, step, countIn, ratings: ratingsRef.current.length, hits: hitsRef.current.length, lastHit, nextTargetInMs: nextTarget ? Math.round(nextTarget.at - performance.now()) : null }); };
    window.advanceTime = (ms) => { const shift = Math.max(0, ms); startAtRef.current -= shift; expectedRef.current.forEach((target) => { target.at -= shift; }); tick(performance.now()); };
    return () => { delete window.render_game_to_text; delete window.advanceTime; };
  }, [bpm, countIn, lastHit, pattern.name, repetitions, step, tick, trainerMode]);

  const settingsLocked = (phase !== "idle" && phase !== "complete") || rehearsalSeconds !== null;
  const activeSetlist = setlists.find((item) => item.id === activeSetlistId);
  const setlistPatterns = activeSetlist ? getSetlistPatterns(activeSetlist, librarySongs) : [];
  const nextSetlistPattern = setlistPatterns[setlistIndex + 1];
  const applyRoutineStep = useCallback((step: TrainerRoutineStep) => {
    const item = availablePatterns.find((candidate) => candidate.id === step.patternId);
    if (!item) return;
    const fills = compatibleFillPatterns(item, availablePatterns);
    const fill = fills.find((candidate) => candidate.id === step.fillPatternId);
    const minBpm = fill ? Math.max(item.tempoRange[0], fill.tempoRange[0]) : item.tempoRange[0];
    const maxBpm = fill ? Math.min(item.tempoRange[1], fill.tempoRange[1]) : item.tempoRange[1];
    setLearningMode("normal"); setPhraseBars(0); setVariationId("base");
    setPatternId(item.id); setBpm(Math.max(minBpm, Math.min(maxBpm, step.bpm))); setRepetitions(step.repetitions);
    setFillPractice(Boolean(fill)); setFillPatternId(fill?.id ?? fills[0]?.id ?? ""); setFillAfterBars(step.fillAfterBars); setLoopEnabled(false);
  }, [availablePatterns, setBpm]);
  const addCurrentToRoutine = () => {
    if (customRoutineSteps.length >= 20) { setSetupMessage("A personal routine can contain up to 20 patterns."); return; }
    const step: TrainerRoutineStep = { patternId, bpm, repetitions: repetitions as TrainerRoutineStep["repetitions"], fillPatternId: fillPractice ? selectedFill?.id ?? "" : "", fillAfterBars: fillAfterBars as TrainerRoutineStep["fillAfterBars"] };
    setCustomRoutineSteps((items) => [...items, step]);
    setSetupMessage(`${selectedPattern.name} added to ${customRoutineName || "your routine"}.`);
  };
  const updateRoutineStep = (index: number, update: Partial<TrainerRoutineStep>) => setCustomRoutineSteps((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...update, ...(update.bpm === undefined ? {} : { bpm: Math.max(40, Math.min(220, Math.round(update.bpm))) }) } : item));
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
    if (first) { setPatternId(first.id); setVariationId("base"); setBpm(first.defaultBpm); reset(); }
  };
  const advanceSetlist = () => {
    if (!nextSetlistPattern) return;
    setTimingDrillFocus(null); setPracticePlan(null);
    reset(); setSetlistIndex((index) => index + 1);
    setPatternId(nextSetlistPattern.id); setVariationId("base"); setBpm(nextSetlistPattern.defaultBpm);
  };
  const startPracticePlan = () => {
    const goalPatterns = getTrainerGoalPatterns(availablePatterns, practiceGoal, availablePatterns);
    const repetitionsPerStep = practiceGoal === "fills" ? 4 : repetitions as TrainerRoutineStep["repetitions"];
    const slots = getGoalSessionSlotCount(availablePatterns, practiceGoal, planMinutes, repetitions, countInBeats);
    const selected = getPracticePlanPatterns(saved.rounds, goalPatterns, patternId, slots);
    if (!selected.length) { setSetupMessage("No patterns in your library match that session goal yet."); return; }
    const coreSteps: TrainerRoutineStep[] = selected.map((item) => {
      const fill = practiceGoal === "fills" ? compatibleFillPatterns(item, availablePatterns)[0] : undefined;
      return { patternId: item.id, bpm: item.defaultBpm, repetitions: repetitionsPerStep, fillPatternId: fill?.id ?? "", fillAfterBars: 2 };
    });
    const warmupPattern = planWarmupCooldown
      ? availablePatterns.find(item => ["quarter-pulse", "first-beat", "two-beat-rock"].includes(item.id)) ?? availablePatterns.find(item => item.level === "Beginner") ?? selected[0]
      : null;
    const warmupStep: TrainerRoutineStep | null = warmupPattern ? { patternId: warmupPattern.id, bpm: Math.max(warmupPattern.tempoRange[0], Math.min(warmupPattern.tempoRange[1], 70)), repetitions: 4, fillPatternId: "", fillAfterBars: 1 } : null;
    const cooldownStep: TrainerRoutineStep | null = warmupPattern ? { ...warmupStep!, bpm: Math.max(warmupPattern.tempoRange[0], Math.min(warmupPattern.tempoRange[1], 60)) } : null;
    const steps = [...(warmupStep ? [warmupStep] : []), ...coreSteps, ...(cooldownStep ? [cooldownStep] : [])];
    const titles: Record<TrainerSessionFocus, string> = { adaptive: "Adaptive focus session", backbeat: "Backbeat consistency session", fills: "Groove and fill session", coordination: "Hands and feet session", "odd-meter": "Odd-meter session" };
    setAutoAdvanceCountdown(null);
    setPracticePlan({ patternIds: steps.map((step) => step.patternId), currentIndex: 0, minutes: planMinutes, name: titles[practiceGoal], customSteps: steps, warmupCooldown: Boolean(warmupStep) });
    setTimingDrillFocus(null); setActiveSetlistId(""); setPracticePathId("backbeat"); setPatternId(steps[0].patternId); setVariationId("base"); setBpm(steps[0].bpm); applyRoutineStep(steps[0]); setSetupMessage(""); reset();
  };
  const startPlacementCheck = () => {
    const groovePatterns = availablePatterns.filter(item => !item.id.toLowerCase().startsWith("fill") && !item.name.toLowerCase().includes("fill"));
    const easy = groovePatterns.find(item => ["first-beat", "two-beat-rock", "straight-pop", "quarter-pulse"].includes(item.id)) ?? groovePatterns.find(item => item.level === "Beginner");
    const subdivisions = groovePatterns.filter(item => item.subdivision >= 8 && item.id !== easy?.id).sort((a, b) => Number(a.level !== "Beginner") - Number(b.level !== "Beginner") || a.hits.length - b.hits.length);
    const transition = groovePatterns.filter(item => item.id !== easy?.id && !subdivisions.slice(0, 1).some(candidate => candidate.id === item.id) && compatibleFillPatterns(item, availablePatterns).length > 0).sort((a, b) => Number(a.level !== "Beginner") - Number(b.level !== "Beginner"))[0];
    const selected = [easy, subdivisions[0], transition].filter((item): item is PracticePattern => Boolean(item));
    for (const item of groovePatterns) if (selected.length < 3 && !selected.some(existing => existing.id === item.id)) selected.push(item);
    if (selected.length < 3) { setSetupMessage("Add three grooves to your library to run the placement check."); return; }
    const selectedFills = compatibleFillPatterns(selected[2], availablePatterns);
    const steps: TrainerRoutineStep[] = selected.map((item, index) => ({ patternId: item.id, bpm: Math.max(item.tempoRange[0], Math.min(item.tempoRange[1], 70)), repetitions: 4, fillPatternId: index === 2 ? selectedFills[0]?.id ?? "" : "", fillAfterBars: 1 }));
    const labels = ["Steady pulse", "Subdivision control", selectedFills.length ? "Groove-to-fill transition" : "Coordination control"];
    setPracticePlan({ patternIds: steps.map(step => step.patternId), currentIndex: 0, minutes: 3, name: "Quick placement check", startedAt: new Date().toISOString(), customSteps: steps, placementCheck: true, placementLabels: labels });
    setAutoAdvanceCountdown(null); setTimingDrillFocus(null); setActiveSetlistId(""); setFillPractice(false); setLoopEnabled(false); setVariationId("base");
    setPatternId(steps[0].patternId); applyRoutineStep(steps[0]); reset(); setSetupMessage("");
  };
  const startPracticePath = () => {
    const selectedPath = TRAINER_PRACTICE_PATHS.find((item) => item.id === practicePathId);
    const selected = selectedPath?.patternIds.map((id) => availablePatterns.find((item) => item.id === id)).filter((item): item is PracticePattern => Boolean(item)) ?? [];
    if (!selected.length || !selectedPath) { setSetupMessage("This practice path has no available patterns in your library."); return; }
    setPracticePlan({ patternIds: selected.map((item) => item.id), currentIndex: 0, minutes: Math.max(5, selected.length * 2), name: selectedPath.name, gated: true, startedAt: new Date().toISOString() });
    setTimingDrillFocus(null); setActiveSetlistId(""); setFillPractice(false); setLoopEnabled(false); setPatternId(selected[0].id); setVariationId("base"); setBpm(selected[0].defaultBpm); reset(); setSetupMessage("");
  };
  const advancePracticePlan = useCallback(() => {
    if (!practicePlan) return;
    if (practicePlan.gated && (!round || !isPathCheckpointPassed(round, pathAccuracyTarget, pathTimingTarget))) return;
    const nextIndex = practicePlan.currentIndex + 1;
    const nextPattern = availablePatterns.find((item) => item.id === practicePlan.patternIds[nextIndex]);
    if (!nextPattern) return;
    setPracticePlan({ ...practicePlan, currentIndex: nextIndex });
    setTimingDrillFocus(null);
    const routineStep = practicePlan.customSteps?.[nextIndex];
    if (routineStep) applyRoutineStep(routineStep);
    else { setPatternId(nextPattern.id); setVariationId("base"); setBpm(nextPattern.defaultBpm); setFillPractice(false); setLoopEnabled(false); }
    reset();
  }, [applyRoutineStep, availablePatterns, pathAccuracyTarget, pathTimingTarget, practicePlan, reset, round, setBpm]);
  const revisitPreviousPathStep = () => {
    if (!practicePlan || practicePlan.currentIndex < 1) return;
    const previousIndex = practicePlan.currentIndex - 1;
    const previousPattern = availablePatterns.find((item) => item.id === practicePlan.patternIds[previousIndex]);
    if (!previousPattern) return;
    setPracticePlan({ ...practicePlan, currentIndex: previousIndex }); setTimingDrillFocus(null);
    const routineStep = practicePlan.customSteps?.[previousIndex];
    if (routineStep) applyRoutineStep(routineStep);
    else { setPatternId(previousPattern.id); setVariationId("base"); setBpm(previousPattern.defaultBpm); setFillPractice(false); setLoopEnabled(false); }
    reset();
  };
  const cancelPracticePlan = () => { setAutoAdvanceCountdown(null); setPracticePlan(null); };
  useEffect(() => {
    if (autoAdvanceCountdown === null) return;
    const timer = window.setTimeout(() => {
      if (autoAdvanceCountdown <= 0) {
        setAutoAdvanceCountdown(null);
        advancePracticePlan();
      } else setAutoAdvanceCountdown(autoAdvanceCountdown - 1);
    }, autoAdvanceCountdown <= 0 ? 0 : 1000);
    return () => window.clearTimeout(timer);
  }, [advancePracticePlan, autoAdvanceCountdown]);
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
    const transfer: TrainerSetupTransfer = { version: 1, patternId: remapId(patternId), bpm, repetitions: repetitions as TrainerSetupTransfer["repetitions"], countInBeats: countInBeats as TrainerSetupTransfer["countInBeats"], trainerMode, source, audioVoice, tempoBuild, tempoLadder, tempoStep: tempoLadderStep, tempoTarget: tempoLadderTarget, tempoFailure: tempoLadderFailure, pathAccuracyTarget, pathTimingTarget, loopEnabled, loopStartBeat: activeLoopStartBeat, loopEndBeat: activeLoopEndBeat, fillPractice, fillPatternId: remapId(fillPatternId), fillAfterBars: fillAfterBars as TrainerSetupTransfer["fillAfterBars"], handPattern, leadHand, spokenCount, dynamicsPractice, dynamicsExercise, practicePathId, customPatterns: packaged.patterns, feel, clickMode, limbFocus, customRoutine, swingRatio, pocketMs, learningMode, phraseBars, variationId: activeVariationId, cueMode, cueBeat, cueEveryBars, cueLeadBeats, cueAdaptive, trainerDrumLevel, trainerClickLevel, clickSound };
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
      setPatternId(transfer.patternId); setVariationId(transfer.variationId ?? "base"); setTrainerMode(transfer.trainerMode); setSource(transfer.source); audioVoiceRef.current = transfer.audioVoice; setAudioVoice(transfer.audioVoice);
      setSwingRatio(transfer.swingRatio ?? 2 / 3); setPocketMs(transfer.pocketMs ?? 35); setLearningMode(transfer.learningMode ?? 'normal'); setPhraseBars(transfer.phraseBars ?? 0);
      setFeel(transfer.feel); setClickMode(transfer.clickMode); setLimbFocus(transfer.limbFocus);
      setDynamicsExercise(transfer.dynamicsExercise ?? "contrast");
      if (transfer.customRoutine) {
        setCustomRoutineName(transfer.customRoutine.name); setCustomRoutineSteps(transfer.customRoutine.steps);
        setCustomRoutineGated(transfer.customRoutine.gated); setCustomRoutineAccuracyTarget(transfer.customRoutine.accuracyTarget); setCustomRoutineTimingTarget(transfer.customRoutine.timingTarget);
      }
      setRepetitions(transfer.repetitions); setCountInBeats(transfer.countInBeats); setTempoBuild(transfer.tempoBuild && !transfer.tempoLadder); setTempoLadder(transfer.tempoLadder); setTempoLadderStep(transfer.tempoStep); setTempoLadderTarget(transfer.tempoTarget); setTempoLadderFailure(transfer.tempoFailure);
      setPathAccuracyTarget(transfer.pathAccuracyTarget); setPathTimingTarget(transfer.pathTimingTarget);
      setLoopEnabled(transfer.loopEnabled); setLoopUnit("beats"); setLoopStartBeat(transfer.loopStartBeat); setLoopEndBeat(transfer.loopEndBeat);
      const importFillPractice = (transfer.fillPractice || transfer.cueMode === "fill") && Boolean(nextFill);
      setFillPractice(importFillPractice); setFillPatternId(nextFill?.id ?? nextFills[0]?.id ?? ""); setFillAfterBars(transfer.fillAfterBars);
      setCueMode(transfer.cueMode === "fill" && !nextFill ? "off" : transfer.cueMode); setCueBeat(transfer.cueBeat); setCueEveryBars(transfer.cueEveryBars ?? 1); setCueLeadBeats(transfer.cueLeadBeats ?? 1); setCueAdaptive(transfer.cueAdaptive ?? false); setCueAdaptiveMessage("");
      setTrainerDrumLevel(transfer.trainerDrumLevel); audioRef.current?.setMasterLevel(transfer.trainerDrumLevel / 100);
      setTrainerClickLevel(transfer.trainerClickLevel); audioRef.current?.setClickLevel(transfer.trainerClickLevel / 100);
      setClickSound(transfer.clickSound); audioRef.current?.setClickSound(transfer.clickSound);
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
  const voiceTiming = summarizeVoiceTiming(round?.hits ?? []);
  const velocityFeedback = hasDynamicsTargets ? null : summarizeVelocityControl(round?.hits ?? [], false);
  const liveTimingCoach = useMemo(() => phase === "running" ? summarizeTrainerLiveTiming(hits, feel, pocketMs, swingRatio) : null, [feel, hits, phase, pocketMs, swingRatio]);
  const roundsWithCurrent = round && !saved.rounds.some((item) => item.id === round.id) ? [round, ...saved.rounds] : saved.rounds;
  const placementSummary = practicePlan?.placementCheck ? summarizeTrainerPlacement(roundsWithCurrent.filter(item => item.playedAt >= (practicePlan.startedAt ?? "") && practicePlan.patternIds.includes(item.patternId)), practicePlan.patternIds) : null;
  const comparisonContext: TrainerRound = { id: 'context', patternId: pattern.id, patternName: pattern.name, bpm, playedAt: new Date().toISOString(), mode: trainerMode, source: trainerMode === 'self' ? 'self' : source, ratings: [], result: null, feel, limbFocus, adaptation: adaptiveMode, swingRatio, pocketMs, inputProfile: profileKey, targetVoice: source === "audio-timing" ? audioVoice : undefined, learningMode: learningMode === "normal" ? undefined : learningMode, variationId: activeVariationId };
  const comparable = comparableRounds(roundsWithCurrent, comparisonContext);
  const patternHistory = getPatternPracticeHistory(comparable, pattern.id);
  const trainerProgress = summarizeTrainerProgress(roundsWithCurrent, comparisonContext, pattern);
  const timingDistance = trainerProgress.timingDistance;
  const timingSpread = trainerProgress.timingSpread;
  const templateValues = Object.values(activeProfile.audioTemplates);
  const overlappingTemplates = templateValues.some((a, i) => templateValues.slice(i + 1).some(b => {
    const similarity = a.reduce((sum, value, j) => sum + value * b[j], 0) / (Math.hypot(...a) * Math.hypot(...b) || 1);
    return similarity > 0.96;
  }));
  const confusingPair = audioMatches.length > 1 && audioMatches[0].similarity - audioMatches[1].similarity < 0.1 ? audioMatches.slice(0, 2) as [typeof audioMatches[number], typeof audioMatches[number]] : null;
  const coaching = round && round.patternId === pattern.id ? nextCoaching(round, pattern) : null;
  const transition = round && round.patternId === pattern.id && fillPractice && !loopEnabled && !phraseBars ? transitionFeedback(round.hits ?? [], fillAfterBars * selectedPattern.beats * selectedPattern.subdivision / 4, Math.round(pattern.beats * pattern.subdivision / 4 / getPatternBarCount(pattern))) : null;
  const articulationNotes = articulationFeedback(round?.hits ?? []);
  const midiArticulationSummary = [...new Set((round?.hits ?? []).flatMap(hit => hit.midiArticulation ? [hit.midiArticulation] : []))].map(articulation => `${articulation.replaceAll("-", " ")}: ${(round?.hits ?? []).filter(hit => hit.midiArticulation === articulation).length}`).join(" · ");
  const referenceMatches = Boolean(recordedClip && referenceClip && sameTrainerClipSetup(recordedClip, referenceClip));
  const referenceMismatch = recordedClip && referenceClip ? trainerClipMismatchReason(recordedClip, referenceClip) : "";
  const stage = learningStage(learningMode, repetition, repetitions);
  const upcomingStage = learningMode === "normal" ? "" : repetition + 1 < repetitions ? learningStage(learningMode, repetition + 1, repetitions) : "Complete";
  const audioScoring = trainerMode === "scored" && source.startsWith("audio-");
  const guideLeakCheckNeeded = audioScoring && learningMode === "listen-copy-solo";
  const audioVoiceReady = source !== "audio-voices" || (Object.keys(activeProfile.audioTemplates).length >= 2 && (audioConfidence ?? 0) >= 0.88);
  const audioPreflightReady = audioConnected && preflightSignalSeen && activeProfile.latencyCalibrated === true && audioVoiceReady && (!guideLeakCheckNeeded || guideLeakTestResult === "clear" || guideHeadphonesConfirmed);
  const recoveryAvailable = ["count-in", "running", "paused", "rating"].includes(phase);
  const limbFeedback = summarizeLimbFeedback(round?.hits ?? []);
  const currentPathPatternId = practicePlan?.patternIds[practicePlan.currentIndex];
  const pathCheckpointPassed = Boolean(practicePlan?.gated && round && round.patternId === currentPathPatternId && isPathCheckpointPassed(round, pathAccuracyTarget, pathTimingTarget));
  const recentPathAttempts = practicePlan?.gated && currentPathPatternId
    ? roundsWithCurrent.filter((item) => item.patternId === currentPathPatternId && (!practicePlan.startedAt || item.playedAt >= practicePlan.startedAt)).sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 2)
    : [];
  const previousPathPattern = practicePlan?.gated && practicePlan.currentIndex > 0 ? availablePatterns.find((item) => item.id === practicePlan.patternIds[practicePlan.currentIndex - 1]) : null;
  const canRevisitPathStep = Boolean(previousPathPattern && recentPathAttempts.length >= 2 && recentPathAttempts.every((attempt) => !isPathCheckpointPassed(attempt, pathAccuracyTarget, pathTimingTarget)));
  const timingWeakSpot = getTimingWeakSpot(roundsWithCurrent, phrase, activeVariationId);
  const weakSpotTempo = timingWeakSpot ? getWeakSpotTempoPlan(roundsWithCurrent, phrase, timingWeakSpot.instrument, timingWeakSpot.beat, activeVariationId) : null;
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
  const activeCueCallout = phase === "running" && cueResult.cueSteps.includes(step)
    ? cueResult.callouts?.find((callout) => callout.step === step)?.label ?? cueResult.label
    : "";
  const currentCount = trainerMode === "scored" ? hits.filter((hit) => hit.rating === "great" || hit.rating === "good").length : ratings.filter((rating) => rating === "clean").length;
  const midiMapKey = profileKey.startsWith("midi:") ? profileKey : (midiInputs[0] ? "midi:" + midiInputs[0].id : "midi:default");
  const midiProfile = getTrainerDeviceProfile(saved, midiMapKey);
  const midiMap = midiProfile.midiMap;
  const midiArticulations = midiProfile.midiArticulations;
  const gridLabel = pattern.subdivision === 4 ? "quarter-note grid" : pattern.subdivision === 8 ? "eighth-note grid" : pattern.subdivision === 12 ? "triplet grid" : "sixteenth-note grid";
  const previewFeel = async () => {
    previewTimersRef.current.forEach(clearTimeout);
    if (!audioRef.current) audioRef.current = createTrainerAudio();
    const audio = audioRef.current;
    if (!audio) return;
    const request = startRequestRef.current;
    await audio.ready;
    if (request !== startRequestRef.current) return;
    const previewStart = performance.now() + 150;
    guideRoundHits(pattern, bpm, previewStart, 1, feel, { swingRatio, pocketMs }).forEach(target => audio.scheduleHit(target.instrument, target.at, target.accent));
  };
  const loadRoutine = (routine: TrainerRoutine) => {
    setCustomRoutineName(routine.name); setCustomRoutineSteps(routine.steps); setCustomRoutineGated(routine.gated); setCustomRoutineAccuracyTarget(routine.accuracyTarget); setCustomRoutineTimingTarget(routine.timingTarget);
  };
  const restartSlower = () => {
    const slower = Math.max(pattern.tempoRange[0], Math.round(bpm - Math.max(3, bpm * 0.08)));
    setTempoBuild(false); setTempoLadder(false); setTempoLadderMessage(""); setBpm(slower); reset();
  };
  const repeatCurrentBar = () => {
    const beat = (loopEnabled ? activeLoopStartBeat : 1) + (step + focusedStepOffset) / (pattern.subdivision / 4);
    const bar = Math.max(1, Math.min(phraseBarCount, Math.floor(Math.max(0, beat - 1) / phraseBeatsPerBar) + 1));
    setTimingDrillFocus(null); setLoopUnit("bars"); setLoopStartBar(bar); setLoopEndBar(bar); setLoopEnabled(true); reset();
  };
  const returnToFullPhrase = () => { setLoopEnabled(false); setTimingDrillFocus(null); reset(); };
  const prepareGrowthRound = (skill?: string) => {
    if (settingsLocked) return;
    const warmupId = skill === 'dynamics' ? 'paradiddle' : skill === 'hands' || skill === 'timing' ? 'single-stroke' : 'quarter-pulse';
    const warmup = skill ? availablePatterns.find(item => item.id === warmupId) ?? patterns[0] : selectedPattern;
    reset(); setPracticePlan(null); setActiveSetlistId(''); setTimingDrillFocus(null);
    setPatternId(warmup.id); setVariationId("base"); setFillPractice(false); setPhraseBars(0); setLoopEnabled(false);
    setLearningMode('normal'); setTempoBuild(false); setTempoLadder(false);
    setLimbFocus(skill === 'feet' ? 'feet' : skill === 'hands' || skill === 'dynamics' ? 'hands' : skill ? 'all' : 'hands');
    setDynamicsPractice(skill === 'dynamics'); setRepetitions(4);
    setBpm(Math.max(warmup.tempoRange[0], Math.min(warmup.tempoRange[1], skill ? Math.round(warmup.defaultBpm * 0.7) : bpm - 8)));
    setDeviceMessage(skill === 'dynamics' ? 'Warmup ready. Alternate soft and accented strokes; start when ready.' : 'Gentler round ready. Start when ready.');
  };
  const applyStylePreset = (preset: (typeof TRAINER_STYLE_PRESETS)[number]) => {
    if (settingsLocked) return;
    const next = availablePatterns.find((item) => item.id === preset.patternId);
    if (!next) return;
    reset(); setPracticePlan(null); setActiveSetlistId(""); setTimingDrillFocus(null);
    setPatternId(next.id); setVariationId("base"); setFillPractice(false); setPhraseBars(0);
    setAdaptiveMode("standard"); setLimbFocus("all"); setLearningMode("normal"); setDynamicsPractice(false);
    setFeel(preset.feel); setClickMode(preset.clickMode); setBpm(next.defaultBpm);
    setLoopEnabled(false); setLoopUnit("beats"); setLoopStartBeat(1); setLoopEndBeat(next.beats);
    setLoopStartBar(1); setLoopEndBar(getPatternBarCount(next));
  };
  const applyBeginnerSetup = () => {
    applyStylePreset(TRAINER_STYLE_PRESETS[0]);
    setTrainerMode("self"); setSource("keyboard"); setRepetitions(4); setCountInBeats(4);
    setBpm(Math.max(patterns.find((item) => item.id === "first-beat")?.tempoRange[0] ?? 40, Math.min(patterns.find((item) => item.id === "first-beat")?.tempoRange[1] ?? 120, 70)));
    setDynamicsPractice(false); setDynamicsExercise("contrast"); setDeviceMessage("Beginner setup ready. Press Start practice when you are ready; no drum kit is needed.");
  };
  const dismissQuickStart = () => {
    setQuickStartDismissed(true);
    try { localStorage.setItem(TRAINER_QUICK_START_KEY, "1"); } catch { /* The guide remains hidden for this visit. */ }
  };

  const linkedParts = patternId.startsWith("song:") ? patternId.split(":") : null;
  const linkedSong = linkedParts ? librarySongs.find(song => song.id === linkedParts[1]) : undefined;
  if (linkedSong?.sections.some(section => section.id === linkedParts?.[2] && section.parts.some(part => part.id === linkedParts?.[3]))) return <SongLinkedPractice patternId={patternId} engine="trainer" targetBpm={bpm} />;

  return <div className="trainer-layout">
    <nav className="trainer-section-nav" aria-label={t("Trainer")}>
      <a href="#trainer-setup">{t("Trainer")}</a><a href="#trainer-playing">{t("Practice")}</a><a href="#trainer-progress">{t("Progress")}</a>
    </nav>
    <section id="trainer-setup" className="card trainer-setup" aria-label={t("Trainer setup")}>
      <span className="eyebrow">Round setup</span><h2>Choose your focus.</h2>
      {quickStartLoaded && !quickStartDismissed && <section className="trainer-quick-start" aria-label="Getting started guide"><div><span className="eyebrow">First time here?</span><h3>Start with one easy groove.</h3><p>Use a relaxed 70 BPM backbeat, four short passes, and the built-in sounds. You can practise without connecting a kit.</p></div><div className="transport"><button type="button" className="button-secondary" disabled={settingsLocked} onClick={applyBeginnerSetup}>Set up my first round</button><button type="button" className="button-secondary" onClick={dismissQuickStart}>Hide guide</button></div></section>}
      <div className="trainer-style-presets" aria-label="Quick style setups">
        <strong>Quick style setup</strong>
        <p>Choose a matching groove, feel, and click pattern. You can adjust each setting below.</p>
        <div className="transport" role="group" aria-label="Drum style presets">{TRAINER_STYLE_PRESETS.map((preset) => <button key={preset.id} type="button" className="button-secondary" aria-pressed={patternId === preset.patternId && feel === preset.feel && clickMode === preset.clickMode && variationId === "base" && !fillPractice && phraseBars === 0 && limbFocus === "all"} disabled={settingsLocked} onClick={() => applyStylePreset(preset)}>{preset.label}</button>)}</div>
      </div>
      <label>{t("Pattern")}<select value={patternId} disabled={settingsLocked} onChange={(event) => { const next = availablePatterns.find((item) => item.id === event.target.value) ?? patterns[0]; const nextFills = compatibleFillPatterns(next, availablePatterns); setPracticePlan(null); setActiveSetlistId(""); setTimingDrillFocus(null); setPatternId(next.id); setVariationId("base"); setFillPatternId(nextFills[0]?.id ?? ""); if (!canUseFillPractice(next)) setFillPractice(false); setBpm(next.defaultBpm); audioVoiceRef.current = next.hits[0]?.instrument ?? "snare"; setAudioVoice(audioVoiceRef.current); reset(); }}>{availablePatterns.map((item) => <option key={item.id} value={item.id}>{localizedPattern(item, locale).name} · {t(item.level)}</option>)}</select></label>
      <Link className="trainer-groove-editor-link" href="/grooves">Browse grooves or build a custom groove</Link>
      <p>{localizedPattern(pattern, locale).description}{"sticking" in pattern ? ` ${t("Sticking:")} ${String(pattern.sticking)}.` : ""}</p>
      {grooveVariations.length > 0 && <fieldset disabled={settingsLocked}><legend>Controlled groove variation</legend><label>Phrase variation<select value={activeVariationId} onChange={event => { setVariationId(event.target.value); setTimingDrillFocus(null); reset(); }}><option value="base">Original groove</option>{grooveVariations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><small>Variations change one feature at a time: kick pickups, a displaced backbeat, or more space in the hi-hat. The target grid updates with the variation.</small></fieldset>}
      <label>Tempo <strong>{bpm} BPM</strong><input type="range" min={pattern.tempoRange[0]} max={pattern.tempoRange[1]} value={bpm} disabled={settingsLocked} onChange={(event) => setBpm(Number(event.target.value))} /></label>
      <TrainerTapTempo min={pattern.tempoRange[0]} max={pattern.tempoRange[1]} disabled={settingsLocked} onApply={value => { setBpm(value); setTempoBuild(false); setTempoLadder(false); reset(); }} />
      <fieldset disabled={settingsLocked}><legend>Round method</legend><label><input type="radio" name="round-method" checked={trainerMode === "self"} onChange={() => { stopAudioInput(); disconnectMidi(); setTrainerMode("self"); setLearningMode("normal"); reset(); }} /> Self rate each repetition</label><label><input type="radio" name="round-method" checked={trainerMode === "scored"} onChange={() => { setTrainerMode("scored"); reset(); }} /> Score played hits</label></fieldset>
      {trainerMode === "scored" && <label>Scored input<select value={source} disabled={settingsLocked} onChange={(event) => { stopAudioInput(); disconnectMidi(); const next = event.target.value as TrainerSource; setSource(next); chooseProfile(next); reset(); }}><option value="keyboard">Keyboard</option><option value="touch">Touch pads</option><option value="midi">USB MIDI kit</option><option value="audio-timing">Audio: timing only</option><option value="audio-voices">Audio: calibrated voices</option></select></label>}
      <button id="trainer-start" type="button" className="button" disabled={settingsLocked} onClick={() => void start()}>Start practice</button>
      <TrainerRehearsal challenge={challenge} playingRemaining={timedRemaining} steps={customRoutineSteps} patterns={availablePatterns} phase={phase} disabled={settingsLocked} onPrepare={(step, seconds) => { reset(); setPracticePlan(null); setActiveSetlistId(''); setTimingDrillFocus(null); setTempoBuild(false); setTempoLadder(false); setTrainerMode('scored'); setRehearsalSeconds(seconds); applyRoutineStep(step); }} onStart={() => void start()} onEnd={() => { setRehearsalSeconds(null); timedRoundRef.current = null; repetitionsRef.current = repetitions; }} onStop={() => { reset(); setRehearsalSeconds(null); timedRoundRef.current = null; repetitionsRef.current = repetitions; }} />
      <TrainerPeerChallenge pattern={selectedPattern} bpm={bpm} disabled={settingsLocked} onAccept={incoming => { setChallenge(incoming); setCustomGrooves(readCustomGrooves()); reset(); setPatternId(incoming.pattern.id); setVariationId("base"); setBpm(incoming.bpm); setFillPractice(false); setPhraseBars(0); setLoopEnabled(false); setTimingDrillFocus(null); setLimbFocus('all'); setLearningMode('normal'); setPracticePlan(null); setActiveSetlistId(''); setTrainerMode('scored'); }} />
      {challenge && <p className="trainer-challenge-goal" role="status">Challenge: {challenge.goal} · {challenge.targetAccuracy}% target · {challenge.durationSeconds} seconds suggested. Use Start accepted challenge in the timed rehearsal panel.</p>}
      <TrainerGrowthPanel rounds={saved.rounds} patternId={pattern.id} disabled={settingsLocked} onWarmup={prepareGrowthRound} onRecover={() => prepareGrowthRound()} />
      <TrainerHandsFree onToggle={() => { if (phase === 'paused') resume(); else if (phase === 'running' || phase === 'count-in') pause(); else if (!settingsLocked) void start(); }} onRepeat={() => { if (rehearsalSeconds === null && !['loading', 'calibrating'].includes(phase)) void start(); }} onMark={() => { if (phase === 'rating') rate('needsWork', performance.now()); else setDeviceMessage('Needs work can be marked during a self-rating checkpoint.'); }} />
      <TrainerTakeLibrary latest={recordedClip} disabled={settingsLocked} onReference={take => setReferenceClip({ ...take, url: URL.createObjectURL(take.blob) })} />
      <TrainerLearningTools rounds={saved.rounds} pattern={pattern} patterns={availablePatterns} profileId={profileId} disabled={settingsLocked} onSelectPattern={id => { const next = availablePatterns.find(item => item.id === id); if (!next) return; setTimingDrillFocus(null); setPracticePlan(null); setActiveSetlistId(""); setPatternId(next.id); setVariationId("base"); setFillPractice(false); setFillPatternId(compatibleFillPatterns(next, availablePatterns)[0]?.id ?? ""); setPhraseBars(0); setLoopEnabled(false); setAdaptiveMode("standard"); setLimbFocus("all"); setLearningMode("normal"); setBpm(next.defaultBpm); reset(); }} onUseGoalTempo={value => { setBpm(value); setTempoBuild(false); setTempoLadder(false); reset(); }} onStartRetention={steps => { if (!steps.length) return; setPracticePlan({ patternIds: steps.map(item => item.patternId), currentIndex: 0, minutes: Math.max(4, steps.length * 2), name: "Retention remix", customSteps: steps }); setTimingDrillFocus(null); setActiveSetlistId(""); setVariationId("base"); setPhraseBars(0); setLoopEnabled(false); setAdaptiveMode("standard"); setLimbFocus("all"); setLearningMode("normal"); applyRoutineStep(steps[0]); reset(); }} />

      <details className="trainer-advanced" open={advancedOptionsOpen} onToggle={event => setAdvancedOptionsOpen(event.currentTarget.open)}><summary>Practice options, routines, and advanced settings</summary>
      <fieldset disabled={settingsLocked}><legend>Learning sequence</legend><label>Round style<select value={learningMode} onChange={event => { setLearningMode(event.target.value as LearningMode); if (event.target.value !== 'normal') { setTrainerMode('scored'); setTempoBuild(false); setTempoLadder(false); setLimbFocus('all'); } reset(); }}><option value="normal">Standard round</option><option value="listen-copy-solo">Listen → Copy → Play alone</option><option value="build-limbs">Feet → Hands → Together</option></select></label><small>Listen is unscored; Copy adds the guide; Play alone removes it. Limb stages gradually combine the two parts. Use headphones with audio input to keep the guide out of the microphone.</small></fieldset>
      <fieldset disabled={settingsLocked}><legend>Musical phrase</legend><label>Arrangement length<select value={phraseBars} onChange={event => { setPhraseBars(Number(event.target.value) as typeof phraseBars); setLoopEnabled(false); setTimingDrillFocus(null); }}><option value={0}>Original pattern</option>{[4, 8, 16].map(bars => <option key={bars} value={bars}>{bars} bars</option>)}</select></label><small>Four-bar sections include a last-beat rest, a compatible fill when available, and alternating normal/accented sections.</small></fieldset>
      {canAddFillPractice && <fieldset disabled={settingsLocked}><legend>Groove into a fill</legend><label><input type="checkbox" checked={fillPractice} onChange={(event) => { setTimingDrillFocus(null); setFillPractice(event.target.checked); }} /> Add a fill to this groove round</label>{fillPractice && <><TrainerFillBrowser fills={fillChoices} selectedId={selectedFill?.id ?? ""} disabled={settingsLocked} onSelect={setFillPatternId} /><label>Play groove for<select value={fillAfterBars} onChange={(event) => setFillAfterBars(Number(event.target.value))}><option value={1}>1 bar, then fill</option><option value={2}>2 bars, then fill</option><option value={4}>4 bars, then fill</option></select></label><small>Each repetition is {fillAfterBars + 1} bars: groove, then fill and return to beat one.</small></>}</fieldset>}
      <fieldset disabled={settingsLocked}><legend>Loop a section</legend><label><input type="checkbox" checked={loopEnabled} disabled={settingsLocked || hasFocusedTimingDrill} onChange={(event) => setLoopEnabled(event.target.checked)} /> Repeat only a selected part of this pattern</label>{loopEnabled && <><label>Choose range by<select value={loopUnit} onChange={(event) => setLoopUnit(event.target.value as LoopUnit)}><option value="beats">Beats</option><option value="bars">Bars</option></select></label>{loopUnit === "beats" ? <div className="trainer-loop-range"><label>Start on beat<select value={visibleLoopStartBeat} onChange={(event) => { const next = Number(event.target.value); setLoopStartBeat(next); if (visibleLoopEndBeat < next) setLoopEndBeat(next); }}>{loopBeatChoices.map((beat) => <option key={beat} value={beat}>{beat}</option>)}</select></label><label>End on beat<select value={visibleLoopEndBeat} onChange={(event) => setLoopEndBeat(Number(event.target.value))}>{loopBeatChoices.filter((beat) => beat >= visibleLoopStartBeat).map((beat) => <option key={beat} value={beat}>{beat}</option>)}</select></label></div> : <div className="trainer-loop-range"><label>First bar<select value={visibleLoopStartBar} onChange={(event) => { const next = Number(event.target.value); setLoopStartBar(next); if (visibleLoopEndBar < next) setLoopEndBar(next); }}>{Array.from({ length: phraseBarCount }, (_, index) => index + 1).map((bar) => <option key={bar} value={bar}>{bar}</option>)}</select></label><label>Last bar<select value={visibleLoopEndBar} onChange={(event) => setLoopEndBar(Number(event.target.value))}>{Array.from({ length: phraseBarCount }, (_, index) => index + 1).filter((bar) => bar >= visibleLoopStartBar).map((bar) => <option key={bar} value={bar}>{bar}</option>)}</select></label></div>}<small>The selected section becomes a complete round and loops back to its own first beat.</small></>}</fieldset>
      {showStickingCues && <fieldset disabled={settingsLocked}><legend>Sticking cues</legend><label>Hand pattern<select value={handPattern} onChange={(event) => setHandPattern(event.target.value as HandPattern)}><option value="alternating">Alternating singles</option><option value="paradiddle">Single paradiddle · RLRR LRLL</option><option value="double-strokes">Double strokes · RRLL</option></select></label><label>Lead hand<select value={leadHand} onChange={(event) => setLeadHand(event.target.value as "R" | "L")}><option value="R">Right hand</option><option value="L">Left hand</option></select></label><small>R and L appear beside hand hits in the step grid. Kick notes stay assigned to the foot.</small></fieldset>}
      <fieldset disabled={settingsLocked}><legend>Spoken count</legend><label>Count style<select value={spokenCount} onChange={(event) => setSpokenCount(event.target.value as SpokenCount)}><option value="off">Off</option><option value="beats">Beat numbers</option><option value="subdivisions">Subdivisions when the pace allows</option></select></label><small>Uses browser speech when available. At fast tempos, it switches to beat numbers; the metronome stays on time.</small></fieldset>
      <fieldset disabled={settingsLocked}><legend>Feel target</legend><label>Swing offbeat position · {Math.round(swingRatio * 100)}%<input type="range" min="0.5" max="0.75" step="0.01" value={swingRatio} onChange={event => setSwingRatio(Number(event.target.value))} /></label><label>Snare delay · {pocketMs} ms<input type="range" min="0" max="80" step="5" value={pocketMs} onChange={event => setPocketMs(Number(event.target.value))} /></label><button type="button" onClick={() => void previewFeel()}>Listen to this feel</button><label>Timing profile<select value={feel} onChange={(event) => setFeel(event.target.value as TrainerFeel)}><option value="straight">Straight · on the grid</option><option value="shuffle">Swing eighth-note offbeats</option><option value="laid-back">Laid-back snare</option><option value="shuffle-laid-back">Swing with a laid-back snare</option></select></label><small>Timing scores compare against this feel. Shuffle changes eighth-note offbeats; laid-back shifts snare targets slightly behind the pulse.</small></fieldset>
      <fieldset disabled={settingsLocked}><legend>Click pattern</legend><label>Metronome<select value={clickMode} onChange={(event) => setClickMode(event.target.value as TrainerClickMode)}><option value="all">Every beat</option><option value="backbeat">Beats 2 and 4</option><option value="subdivisions">Subdivisions only</option><option value="sparse-bars">Odd-numbered bars only</option><option value="progressive-silence">Two bars on, two bars silent</option></select></label><small>{clickMode === "progressive-silence" ? "The count-in stays audible. The click returns after each silent pair of bars." : "The count-in and latency calibration keep a full beat click."}</small></fieldset>
      <fieldset disabled={settingsLocked}><legend>Limb focus</legend><label>Practice<select value={limbFocus} onChange={(event) => { setAdaptiveMode("standard"); setTimingDrillFocus(null); setLimbFocus(event.target.value as TrainerLimbFocus); reset(); }}><option value="all">Full pattern · hands and feet</option><option value="hands">Hands only · kick hits count extra</option><option value="feet">Feet only · hand hits count extra</option></select></label><small>Isolate one part of the groove, then return to the full pattern and coordinate both limbs.</small></fieldset>
      <fieldset disabled={settingsLocked} className="trainer-adaptive-options"><legend>Adapt the playing part</legend><label>Practice option<select value={adaptiveMode} onChange={(event) => { setAdaptiveMode(event.target.value as typeof adaptiveMode); setLimbFocus("all"); setTimingDrillFocus(null); reset(); }}><option value="standard">Standard pattern</option><option value="seated">Seated / no kick target</option><option value="single-voice">One voice / reduced reach</option></select></label>{adaptiveMode === "single-voice" && <label>Use this voice<select value={adaptiveVoice} onChange={(event) => { setAdaptiveVoice(event.target.value as Instrument); reset(); }}>{voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>}<p>{adaptiveMode === "seated" ? "Kick targets are removed so the selected pattern can be played with the hands. Use a comfortable position and adjust tempo or repetitions as needed." : adaptiveMode === "single-voice" ? `All rhythm targets use ${adaptiveVoice}; this keeps the timing while reducing movement between kit surfaces.` : "Choose a comfortable tempo and set length. Adaptive rounds are labelled and kept out of full-pattern comparison scores."}</p>{adaptiveMode !== "standard" && <button type="button" className="button-secondary" onClick={() => { setAdaptiveMode("standard"); setLimbFocus("all"); reset(); }}>Return to standard pattern</button>}</fieldset>
      {adaptiveMode !== "standard" && <AdaptivePracticeFeedback mode={adaptiveMode} voice={adaptiveVoice} pattern={selectedDisplay.name} />}
      <div className="trainer-round-options"><label>Repetitions<select value={repetitions} disabled={settingsLocked} onChange={(event) => setRepetitions(Number(event.target.value))}>{REPETITIONS.map((count) => <option key={count} value={count}>{count}</option>)}</select></label><label>Count-in<select value={countInBeats} disabled={settingsLocked} onChange={(event) => setCountInBeats(Number(event.target.value))}>{[1, 2, 4].map((count) => <option key={count} value={count}>{count} beat{count === 1 ? "" : "s"}</option>)}</select></label></div>
      <label className="trainer-tempo-build"><input type="checkbox" checked={tempoBuild} disabled={settingsLocked} onChange={(event) => { setTempoBuild(event.target.checked); if (event.target.checked) { setTempoLadder(false); setTempoLadderMessage(""); } }} /> Build tempo automatically: self ratings adjust each pass; scored rounds use accuracy, misses, and timing steadiness</label>
      <fieldset disabled={settingsLocked}><legend>Tempo ladder</legend><label><input type="checkbox" checked={tempoLadder} onChange={(event) => { setTempoLadder(event.target.checked); if (event.target.checked) setTempoBuild(false); setTempoLadderMessage(""); }} /> Raise the target after a successful full round</label>{tempoLadder && <><label>Increase by<select value={tempoLadderStep} onChange={(event) => setTempoLadderStep(Number(event.target.value) as 2 | 5 | 10)}><option value={2}>2 BPM</option><option value={5}>5 BPM</option><option value={10}>10 BPM</option></select></label><label>Pass target<select value={tempoLadderTarget} onChange={(event) => setTempoLadderTarget(Number(event.target.value) as 70 | 80 | 90 | 95)}>{[70, 80, 90, 95].map((target) => <option key={target} value={target}>{target}%</option>)}</select></label><label>If a round misses the target<select value={tempoLadderFailure} onChange={(event) => setTempoLadderFailure(event.target.value as "repeat" | "lower")}><option value="repeat">Repeat this tempo</option><option value="lower">Lower by one step</option></select></label><small>{trainerMode === "scored" ? `Advance at ${tempoLadderTarget}% accuracy with at most 5% misses and steady timing (35 ms average offset, 25 ms spread).` : `Advance when at least ${tempoLadderTarget}% of passes are clean with no missed pass.`}</small></>}</fieldset>
      <fieldset disabled={settingsLocked}><legend>Dynamics practice</legend><label><input type="checkbox" checked={dynamicsPractice} onChange={(event) => { setDynamicsPractice(event.target.checked); reset(); }} /> Add strike-strength targets</label>{dynamicsPractice && <label>Exercise<select value={dynamicsExercise} onChange={event => { setDynamicsExercise(event.target.value as TrainerDynamicsExercise); reset(); }}><option value="contrast">Accents and ghost notes</option><option value="crescendo">Crescendo through each bar</option><option value="evenness">Even volume</option></select></label>}<small>{dynamicsPractice ? "The step grid shows a target strength from 0–127. MIDI velocity or calibrated audio reports how closely you matched it; keyboard and touch remain usable for timing." : "Add a dynamics target when you want to practise accents, crescendos, or even volume."}</small></fieldset>
      <fieldset disabled={settingsLocked} className="trainer-cue-practice">
        <legend>Cue response practice</legend>
        <label>Call for<select value={cueMode} onChange={event => { const next = event.target.value as TrainerCueMode; setCueMode(next); setCueAdaptiveMessage(""); if (next === "fill") { setFillPractice(true); if (!fillPatternId && fillChoices[0]) setFillPatternId(fillChoices[0].id); setPhraseBars(0); setLoopEnabled(false); } reset(); }}>
          <option value="off">No cue</option><option value="fill" disabled={!canAddFillPractice}>Fill before the groove returns</option><option value="crash">Crash on a selected beat</option><option value="loud">Play louder from a selected beat</option><option value="soft">Play softer from a selected beat</option><option value="random">Random cue sequence each round</option>
        </select></label>
        {cueMode !== "off" && cueMode !== "fill" && cueMode !== "random" && <label>Cue beat<select value={Math.min(cueBeat, selectedBeatsPerBar)} onChange={event => { setCueBeat(Number(event.target.value)); reset(); }}>{Array.from({ length: selectedBeatsPerBar }, (_, index) => index + 1).map(beat => <option key={beat} value={beat}>Beat {beat}</option>)}</select></label>}
        {cueMode === "random" && <><div className="trainer-round-options"><label>Cue spacing<select value={cueEveryBars} onChange={event => { setCueEveryBars(Number(event.target.value) as TrainerCueDensity); setCueAdaptiveMessage(""); reset(); }}><option value={1}>Every bar</option><option value={2}>Every 2 bars</option><option value={4}>Every 4 bars</option></select></label><label>Response lead<select value={cueLeadBeats} onChange={event => { setCueLeadBeats(Number(event.target.value) as TrainerCueLead); reset(); }}><option value={1}>1 beat</option><option value={2}>2 beats</option></select></label></div><label><input type="checkbox" checked={cueAdaptive} onChange={event => { setCueAdaptive(event.target.checked); setCueAdaptiveMessage(""); }} /> Adjust cue frequency from my result</label></>}
        <small>{cueMode === "fill" ? "A visual callout appears one beat before the selected fill. Its notes and return to the groove are scored." : cueMode === "crash" ? "Add a scored crash target at the chosen beat in every bar." : cueMode === "loud" || cueMode === "soft" ? "A callout changes the target at the chosen beat; MIDI or calibrated audio can score strike strength." : cueMode === "random" ? "Each round mixes crash, louder, and softer responses. Choose how often cues appear and how many beats you have to react." : "Choose a fill, crash, or dynamic change to practise reacting to a cue."}{cueResult.label && cueMode !== "off" && <span className="trainer-cue-preview">{cueResult.label}</span>}{cueMode === "random" && getPatternBarCount(dynamicsPattern) < cueEveryBars && <span className="trainer-cue-preview">This groove has {getPatternBarCount(dynamicsPattern)} {getPatternBarCount(dynamicsPattern) === 1 ? "bar" : "bars"}, so it cues once per phrase. Select a multi-bar pattern to space cues across its bars.</span>}</small>
      </fieldset>
      <p className="trainer-note">{repetitions} repetitions · {countInBeats}-beat count-in · {Math.round(duration / 1000)} seconds per repetition. {trainerMode === "self" ? "Rate each pass before moving on." : "Great within 50 ms; Good within 100 ms."}</p>
      <label><input type="checkbox" checked={progress.settings.sound} onChange={(event) => setSound(event.target.checked)} /> Metronome and drum sound</label>
      <details className="trainer-audio-controls"><summary>Practice audio levels and click sound</summary><fieldset disabled={settingsLocked}><label>Drum kit level · {trainerDrumLevel}%<input type="range" min="0" max="100" step="1" value={trainerDrumLevel} onChange={(event) => { const value = Number(event.target.value); setTrainerDrumLevel(value); audioRef.current?.setMasterLevel(value / 100); }} /></label><label>Metronome and count-in level · {trainerClickLevel}%<input type="range" min="0" max="100" step="1" value={trainerClickLevel} onChange={(event) => { const value = Number(event.target.value); setTrainerClickLevel(value); audioRef.current?.setClickLevel(value / 100); }} /></label><label>Metronome sound<select value={clickSound} onChange={(event) => { const value = event.target.value as TrainerClickSound; setClickSound(value); audioRef.current?.setClickSound(value); }}><option value="hat">Hi-hat</option><option value="woodblock">Woodblock</option><option value="beep">Soft beep</option></select></label><small>These controls affect Trainer playback only. The metronome setting also controls count-in volume.</small></fieldset></details>
      <label><input type="checkbox" checked={recordAudio} disabled={settingsLocked} onChange={(event) => setRecordAudio(event.target.checked)} /> Record microphone audio for playback comparison</label>
      <small>Recording asks for microphone access when the round starts, stays in page memory, and is not uploaded. MIDI and keyboard hits are captured only if they make sound in the room.</small>
      {setlists.length > 0 && <div className="trainer-setlist"><span className="eyebrow">Setlist rehearsal</span><label>Follow a setlist<select value={activeSetlistId} disabled={settingsLocked} onChange={(event) => loadSetlist(event.target.value)}><option value="">Choose a setlist…</option>{setlists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{activeSetlist && <p>{setlistPatterns.length ? activeSetlist.name + ": part " + Math.min(setlistIndex + 1, setlistPatterns.length) + " of " + setlistPatterns.length : "This setlist has no playable parts yet."}</p>}</div>}
      <div className="trainer-practice-plan"><span className="eyebrow">Guided skill path</span><label>Choose a path<select value={practicePathId} disabled={settingsLocked} onChange={(event) => setPracticePathId(event.target.value as typeof practicePathId)}>{TRAINER_PRACTICE_PATHS.map((path) => <option key={path.id} value={path.id}>{path.name}</option>)}</select></label><div className="trainer-round-options"><label>Accuracy goal<select value={pathAccuracyTarget} disabled={settingsLocked} onChange={(event) => setPathAccuracyTarget(Number(event.target.value) as 70 | 80 | 85 | 90 | 95)}>{[70, 80, 85, 90, 95].map((target) => <option key={target} value={target}>{target}%</option>)}</select></label><label>Timing goal<select value={pathTimingTarget} disabled={settingsLocked} onChange={(event) => setPathTimingTarget(Number(event.target.value) as 25 | 35 | 50 | 75)}>{[25, 35, 50, 75].map((target) => <option key={target} value={target}>{target} ms average</option>)}</select></label></div><p>Pass each checkpoint by meeting your accuracy goal and timing goal when hit timing is available. A missed checkpoint stays in the path until you repeat it.</p><button type="button" className="button-secondary" disabled={settingsLocked} onClick={startPracticePath}>Start skill path</button></div>
      <div className="trainer-practice-plan"><span className="eyebrow">Goal-based session</span><label>Session focus<select value={practiceGoal} disabled={settingsLocked || Boolean(practicePlan)} onChange={event => setPracticeGoal(event.target.value as TrainerSessionFocus)}><option value="adaptive">Adaptive mix · weakest and least-practiced patterns</option><option value="backbeat">Steady backbeat</option><option value="fills">Groove-to-fill transitions</option><option value="coordination">Hands and feet coordination</option><option value="odd-meter">Odd meter</option></select></label><label>Plan length<select value={planMinutes} disabled={settingsLocked || Boolean(practicePlan)} onChange={(event) => setPlanMinutes(Number(event.target.value))}><option value={5}>About 5 minutes · {getGoalSessionSlotCount(availablePatterns, practiceGoal, 5, repetitions, countInBeats)} rounds</option><option value={10}>About 10 minutes · {getGoalSessionSlotCount(availablePatterns, practiceGoal, 10, repetitions, countInBeats)} rounds</option><option value={20}>About 20 minutes · {getGoalSessionSlotCount(availablePatterns, practiceGoal, 20, repetitions, countInBeats)} rounds</option></select></label><button type="button" className="button-secondary" disabled={settingsLocked} onClick={startPracticePlan}>{practicePlan ? "Restart session" : "Build my practice session"}</button>{practicePlan && <><p>{practicePlan.name ?? "Adaptive focus plan"} · About {practicePlan.minutes} minutes · Pattern {practicePlan.currentIndex + 1} of {practicePlan.patternIds.length}. {practicePlan.name?.startsWith("Adaptive") ? "Starts with your weakest recent patterns, then adds patterns you have practiced less often." : "Patterns and fills are ordered around your selected skill focus."} Fill sessions use four repetitions per pattern to leave time for the transition; other sessions use your selected repetition count.</p><button type="button" className="button-secondary" onClick={cancelPracticePlan}>End plan</button></>}</div>
      <div className="trainer-practice-plan trainer-session-tools"><span className="eyebrow">Session tools</span><button type="button" className="button-secondary" disabled={settingsLocked} onClick={startPlacementCheck}>Run 3-round placement check</button><label className="trainer-routine-gate"><input type="checkbox" checked={planWarmupCooldown} disabled={Boolean(practicePlan)} onChange={event => setPlanWarmupCooldown(event.target.checked)} /> Add a 4-repetition warm-up and cooldown to goal sessions</label><label className="trainer-routine-gate"><input type="checkbox" checked={planAutoAdvance} onChange={event => { setPlanAutoAdvance(event.target.checked); if (!event.target.checked) setAutoAdvanceCountdown(null); }} /> Auto-advance when each session round finishes</label>{planAutoAdvance && <label>Break between patterns<select value={planRestSeconds} onChange={event => setPlanRestSeconds(Number(event.target.value) as 0 | 5 | 10)}><option value={0}>No break</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option></select></label>}<small>The placement check samples a steady pulse, a subdivision groove, and a fill transition when your library has a matching fill. Session warm-up and cooldown use an easy groove at a comfortable tempo.</small></div>
      <div className="trainer-practice-plan trainer-routine-builder"><span className="eyebrow">Build a personal routine</span><TrainerRoutineShelf current={{ name: customRoutineName, steps: customRoutineSteps, gated: customRoutineGated, accuracyTarget: customRoutineAccuracyTarget, timingTarget: customRoutineTimingTarget }} patterns={availablePatterns} disabled={settingsLocked} onLoad={loadRoutine} /><label>Routine name<input value={customRoutineName} maxLength={50} disabled={settingsLocked} onChange={(event) => setCustomRoutineName(event.target.value)} /></label><div className="trainer-round-options"><label>Accuracy checkpoint<select value={customRoutineAccuracyTarget} disabled={settingsLocked} onChange={(event) => setCustomRoutineAccuracyTarget(Number(event.target.value) as typeof customRoutineAccuracyTarget)}>{[70, 80, 85, 90, 95].map((target) => <option key={target} value={target}>{target}%</option>)}</select></label><label>Timing checkpoint<select value={customRoutineTimingTarget} disabled={settingsLocked} onChange={(event) => setCustomRoutineTimingTarget(Number(event.target.value) as typeof customRoutineTimingTarget)}>{[25, 35, 50, 75].map((target) => <option key={target} value={target}>{target} ms</option>)}</select></label></div><label className="trainer-routine-gate"><input type="checkbox" checked={customRoutineGated} disabled={settingsLocked} onChange={(event) => setCustomRoutineGated(event.target.checked)} /> Require a checkpoint before each next pattern</label><div className="transport"><button type="button" className="button-secondary" disabled={settingsLocked || customRoutineSteps.length >= 20} onClick={addCurrentToRoutine}>Add selected pattern</button><button type="button" className="button-secondary" disabled={settingsLocked || customRoutineSteps.length === 0} onClick={startCustomRoutine}>Start personal routine</button></div><ol className="trainer-routine-steps">{customRoutineSteps.map((step, index) => { const routinePattern = availablePatterns.find((item) => item.id === step.patternId); const routineFills = routinePattern ? compatibleFillPatterns(routinePattern, availablePatterns) : []; const routineFill = routineFills.find((item) => item.id === step.fillPatternId); const minTempo = routineFill && routinePattern ? Math.max(routinePattern.tempoRange[0], routineFill.tempoRange[0]) : routinePattern?.tempoRange[0] ?? 40; const maxTempo = routineFill && routinePattern ? Math.min(routinePattern.tempoRange[1], routineFill.tempoRange[1]) : routinePattern?.tempoRange[1] ?? 220; return <li key={`${step.patternId}-${index}`}><span className="trainer-routine-number">{index + 1}</span><label>Pattern<select value={step.patternId} disabled={settingsLocked} onChange={(event) => { const next = availablePatterns.find((item) => item.id === event.target.value); updateRoutineStep(index, { patternId: event.target.value, bpm: next?.defaultBpm ?? step.bpm, fillPatternId: "" }); }}>{!routinePattern && <option value={step.patternId}>Unavailable · {step.patternId}</option>}{availablePatterns.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select></label><label>Tempo<input type="number" min={minTempo} max={maxTempo} value={Math.max(minTempo, Math.min(maxTempo, step.bpm))} disabled={settingsLocked} onChange={(event) => updateRoutineStep(index, { bpm: Number(event.target.value) })} /></label><label>Repetitions<select value={step.repetitions} disabled={settingsLocked} onChange={(event) => updateRoutineStep(index, { repetitions: Number(event.target.value) as TrainerRoutineStep["repetitions"] })}>{REPETITIONS.map((count) => <option key={count} value={count}>{count}</option>)}</select></label><label>Groove into fill<select value={step.fillPatternId} disabled={settingsLocked || !routineFills.length} onChange={(event) => updateRoutineStep(index, { fillPatternId: event.target.value })}><option value="">No fill</option>{routineFills.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{step.fillPatternId && <label>Bars before fill<select value={step.fillAfterBars} disabled={settingsLocked} onChange={(event) => updateRoutineStep(index, { fillAfterBars: Number(event.target.value) as TrainerRoutineStep["fillAfterBars"] })}>{[1, 2, 4].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>}<div className="trainer-routine-order"><button type="button" className="button-secondary" aria-label={`Move routine pattern ${index + 1} up`} disabled={settingsLocked || index === 0} onClick={() => moveRoutineStep(index, -1)}>↑</button><button type="button" className="button-secondary" aria-label={`Move routine pattern ${index + 1} down`} disabled={settingsLocked || index === customRoutineSteps.length - 1} onClick={() => moveRoutineStep(index, 1)}>↓</button><button type="button" className="button-secondary" disabled={settingsLocked} onClick={() => setCustomRoutineSteps((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div></li>; })}</ol><small>Routines save on this device. Add grooves, fills, rudiments, or song parts; tempo and repetitions are set for each step.</small></div>
      <div className="trainer-practice-plan"><span className="eyebrow">Share a setup</span><p>Setup files include your current Trainer settings, saved routine, and any custom grooves or song parts they use.</p><div className="transport"><button type="button" className="button-secondary" onClick={exportSetup}>Export setup</button><label>Import setup<input ref={setupFileRef} type="file" accept="application/json,.json" disabled={settingsLocked} onChange={(event) => void importSetup(event.target.files?.[0])} /></label></div>{setupMessage && <p role="status">{setupMessage}</p>}</div>
      {recommendation && <div className="trainer-recommendation"><span className="eyebrow">{t("Suggested next")}</span><strong>{localizedPattern(recommendation.pattern, locale).name}</strong><p>{recommendation.reason}</p><button className="button-secondary" type="button" disabled={settingsLocked} onClick={() => { const target = availablePatterns.find((item) => item.id === recommendation.pattern.id) ?? selectedPattern; setTimingDrillFocus(null); setPracticePlan(null); setPatternId(target.id); setVariationId("base"); setFillPractice(false); setBpm(recommendation.bpm); reset(); }}>{t("Use {bpm} BPM", { bpm: recommendation.bpm })}</button></div>}
      {timingWeakSpot && <div className="trainer-recommendation"><span className="eyebrow">Targeted timing drill</span><strong>{timingWeakSpot.instrument} on beat {timingWeakSpot.beat}</strong><p>{timingWeakSpot.problems} late or missed hits across {timingWeakSpot.rounds} recent rounds{timingWeakSpot.averageOffsetMs === null ? "." : ` · average offset ${timingWeakSpot.averageOffsetMs > 0 ? "+" : ""}${timingWeakSpot.averageOffsetMs} ms.`}</p>{weakSpotTempo && <p>Per-spot tempo plan: {weakSpotTempo.progression.join(" → ")} BPM{weakSpotTempo.accuracy === null ? " · start gently and build in 2 BPM steps" : ` · ${weakSpotTempo.accuracy}% recent target accuracy`}{weakSpotTempo.typicalOffsetMs === null ? "" : ` · ${weakSpotTempo.typicalOffsetMs} ms typical timing distance`}. The ladder advances by 2 BPM after each round reaches 80% accuracy.</p>}<div className="transport"><button type="button" className="button-secondary" disabled={settingsLocked} onClick={() => { setLimbFocus("all"); setTimingDrillFocus({ sourcePatternId: phrase.id, instrument: timingWeakSpot.instrument, beat: timingWeakSpot.beat, stepOffset: Math.floor((timingWeakSpot.beat - 1) * phrase.subdivision / 4) }); setPracticePlan(null); setActiveSetlistId(""); setLoopEnabled(false); reset(); }}>Drill only {timingWeakSpot.instrument} on beat {timingWeakSpot.beat}</button>{weakSpotTempo && <button type="button" className="button-secondary" disabled={settingsLocked} onClick={() => { setLimbFocus("all"); setTimingDrillFocus({ sourcePatternId: phrase.id, instrument: timingWeakSpot.instrument, beat: timingWeakSpot.beat, stepOffset: Math.floor((timingWeakSpot.beat - 1) * phrase.subdivision / 4) }); setPracticePlan(null); setActiveSetlistId(""); setLoopEnabled(false); setTempoBuild(false); setTempoLadder(true); setTempoLadderStep(2); setTempoLadderTarget(80); setTempoLadderFailure("repeat"); setTempoLadderMessage(""); setRepetitions(8); setBpm(weakSpotTempo.startBpm); reset(); }}>Start 3-step BPM build</button>}<button type="button" className="button-secondary" disabled={settingsLocked} onClick={() => { setLimbFocus("all"); setTimingDrillFocus(null); setPracticePlan(null); setActiveSetlistId(""); setLoopUnit("beats"); setLoopStartBeat(timingWeakSpot.beat); setLoopEndBeat(timingWeakSpot.beat); setLoopEnabled(true); reset(); }}>Loop the whole beat</button></div></div>}
      </details>
    </section>
    <section id="trainer-playing" className="trainer-main" aria-label={t("Practice")}>
      <div className="trainer-stage" aria-live="polite">
        <div className="trainer-stage-top"><span className="eyebrow">{pattern.level} · {gridLabel}</span><span className={`mode-pill mode-${phase === "running" ? "playing" : phase}`}>{phase}</span></div>
        <h2>{pattern.id === selectedPattern.id && activeVariationId === "base" ? selectedDisplay.name : pattern.name}</h2><p>{pattern.id === selectedPattern.id && activeVariationId === "base" ? ("coaching" in selectedDisplay ? String(selectedDisplay.coaching) : "focus" in selectedDisplay ? String(selectedDisplay.focus) : selectedDisplay.description) : pattern.description}</p>{hasFocusedTimingDrill && timingDrillFocus && <p className="trainer-focus-status" role="status">Only {t(timingDrillFocus.instrument)} hits from beat {String(timingDrillFocus.beat)} are active. <button type="button" disabled={settingsLocked} onClick={() => setTimingDrillFocus(null)}>{t("End focused drill")}</button></p>}
        <div className="trainer-count"><strong>{Math.min(repetition + 1, repetitions)}<small> / {repetitions}</small></strong><span>Repetition</span><strong>{currentCount}</strong><span>{trainerMode === "self" ? "Clean" : "Great + Good"}</span></div>
        {(phase === "count-in" || phase === "calibrating") && <div className="trainer-countin" role="timer">{phase === "calibrating" ? "Latency calibration · " + latencyTaps + "/" + CALIBRATION_BEATS : "Count in"}<strong>{countIn}</strong></div>}
        <div className="trainer-grid" aria-label="Pattern steps with beat and subdivision counts">{Array.from({ length: totalSteps }, (_, index) => {
          const cellHits = pattern.hits.filter(hit => hit.step === index);
          const listenCell = learningMode !== "normal" && stage === "Listen" && cellHits.length > 0;
          const cellTargets = cellHits.filter(hit => stage !== "Listen" && (stage !== "Feet" || hit.instrument === "kick") && (stage !== "Hands" || hit.instrument !== "kick") && (trainerMode !== "scored" || source !== "audio-timing" || hit.instrument === audioVoice));
          const cellAttempted = hits.some(hit => hit.step === index + focusedStepOffset && hit.repetition === repetition && cellTargets.some(target => target.instrument === hit.instrument));
          const activeCell = (trainerMode === "self" && cellHits.length > 0) || cellTargets.length > 0;
          const inactiveCell = trainerMode === "scored" && !activeCell && cellHits.length > 0 && !listenCell;
          const cellMark = listenCell ? "listen" : activeCell ? cellAttempted ? "done" : "target" : inactiveCell ? "inactive" : "empty";
          const label = cellHits.length ? `${getStepCountLabel(hasFocusedTimingDrill ? phrase : pattern, index + focusedStepOffset)}: ${cellHits.map(hit => hit.instrument).join(", ")}${listenCell ? ", listen stage" : activeCell ? ", active target" : inactiveCell ? ", inactive in this stage" : ""}` : getStepCountLabel(hasFocusedTimingDrill ? phrase : pattern, index + focusedStepOffset);
          return <div key={index} aria-label={label} data-target={cellMark} className={`${step === index ? "active" : ""} ${index % stepsPerBar === 0 ? "bar-start" : ""} ${inactiveCell ? "stage-inactive" : ""} ${listenCell ? "stage-listen" : ""} ${activeCell && cellTargets.length ? "stage-target" : ""}`}><span>{getStepCountLabel(hasFocusedTimingDrill ? phrase : pattern, index + focusedStepOffset)}</span><strong>{cellHits.map((hit) => `${hit.instrument}${hit.articulation ? ` ${articulationAbbreviation(hit.articulation)}` : ""}${showStickingCues && hit.instrument !== "kick" && handCues.get(hit) ? ` ${handCues.get(hit)}` : ""}${hasDynamicsTargets && typeof hit.velocityTarget === "number" ? ` T${hit.velocityTarget}` : ""}`).join(" + ") || "·"}</strong>{cellTargets.length > 0 && <small>{cellAttempted ? "played" : "target"}</small>}{listenCell && <small>listen</small>}</div>;
        })}</div>
        {hasDynamicsTargets && <small className="trainer-dynamics-legend">T = target strike strength on a 0–127 scale. Use MIDI or calibrated audio input for strength scoring.</small>}
        {pattern.hits.some((hit) => hit.articulation) && <small className="trainer-dynamics-legend">fl = flam · dr = drag · z = buzz roll. Flam and drag grace strokes lead into the main stroke. Buzz targets use an onset and sustain window.</small>}
        <p className="trainer-learning-stage" role="status">{stage}{learningMode !== "normal" ? ` · pass ${Math.min(repetition + 1, repetitions)}/${repetitions}` : ""}</p>{upcomingStage && <p className="trainer-stage-upcoming">Coming next: {upcomingStage}. Active targets are highlighted in the grid.</p>}{activeCueCallout && <p className="trainer-cue-response" role="status" aria-live="assertive">{activeCueCallout}</p>}<p className="trainer-cue" aria-live="off">{phase === "rating" ? "How did that repetition feel?" : phase === "complete" ? "Round complete" : phase === "idle" ? "Ready when you are" : phase === "calibrating" ? "Tap the beat with Space, Enter, or the button below" : visibleCue || "Keep the pulse"}</p>
        <div className="transport"><button className="button" onClick={start} disabled={settingsLocked}>{phase === "complete" ? "New round" : "Start round"}</button><button className="button-secondary" onClick={pause} disabled={phase !== "running" && phase !== "count-in"}>Pause</button><button className="button-secondary" onClick={resume} disabled={phase !== "paused"}>Resume</button><button className="button-secondary" onClick={reset} disabled={phase === "idle"}>Reset</button></div>
        {recoveryAvailable && <div className="trainer-recovery-controls" aria-label="Round recovery"><button type="button" onClick={restartSlower}>Restart 8% slower</button><button type="button" onClick={repeatCurrentBar}>Repeat current bar</button>{(loopEnabled || hasFocusedTimingDrill) && <button type="button" onClick={returnToFullPhrase}>Return to full phrase</button>}</div>}
        {phase === "calibrating" && <button type="button" className="button-secondary" onClick={() => receiveHit("snare", source)}>Tap with the beat</button>}
        <p className="audio-status" role="status">{audioMessage}</p>
        {recordingActive && <p className="trainer-recording-status" role="status">Recording microphone audio…</p>}
        {recordingMessage && <p className="audio-status" role="status">{recordingMessage}</p>}
        {(recordedClipUrl || referenceClipUrl) && (
          <div className="trainer-recording-playback">
            <span>Recording comparison · A/B</span>{referenceClip && <small>Reference: {referenceClip.patternName} · {referenceClip.bpm} BPM · {referenceClip.settings ? `${referenceClip.settings.feel ?? "straight"} feel · ${referenceClip.settings.source ?? "unknown input"}` : "older take · settings unavailable"}.</small>}
            {recordedClip && <><TrainerRecordingWaveform recording={recordedClip} /><TrainerRecordingReview key={recordedClip.url} url={recordedClip.url} label={`${recordedClip.patternName} · ${recordedClip.bpm} BPM · ${recordedClip.settings?.feel ?? "straight"} feel · ${recordedClip.settings?.source ?? "unknown input"}`} expected={recordedClip.expectedMarkersMs} actual={recordedClip.actualMarkersMs} expectedDynamics={recordedClip.expectedDynamics} actualDynamics={recordedClip.actualDynamics} bookmarksMs={recordedClip.bookmarksMs} onAddBookmark={timeMs => setRecordedClip(current => current ? { ...current, bookmarksMs: [...new Set([...(current.bookmarksMs ?? []), timeMs])].sort((a, b) => a - b) } : current)} onRemoveBookmark={timeMs => setRecordedClip(current => current ? { ...current, bookmarksMs: (current.bookmarksMs ?? []).filter(item => item !== timeMs) } : current)} bpm={recordedClip.bpm} beatsPerBar={recordedClip.settings?.beatsPerBar ?? 4} reference={referenceClip ? { url: referenceClip.url, label: `${referenceClip.patternName} · ${referenceClip.bpm} BPM`, matching: referenceMatches, reason: referenceMismatch, legacySettings: !referenceClip.settings, expected: referenceClip.expectedMarkersMs, actual: referenceClip.actualMarkersMs, expectedDynamics: referenceClip.expectedDynamics, actualDynamics: referenceClip.actualDynamics } : undefined} /></>}
            <div className="transport">
              <button type="button" className="button-secondary" disabled={!recordedClip} onClick={() => recordedClip && setReferenceClip({ ...recordedClip, url: URL.createObjectURL(recordedClip.blob) })}>Use latest take as reference</button>
              {referenceClip && <button type="button" className="button-secondary" onClick={() => setReferenceClip(null)}>Clear reference</button>}
            </div>
            <small>Latest take stays in page memory until you save it below. Recordings are not uploaded.</small>
          </div>
        )}
        {phase === "rating" && <div className="trainer-ratings" role="group" aria-label="Rate repetition">{(["clean", "needsWork", "missed"] as TrainerRating[]).map((rating) => <button key={rating} className="button-secondary" onClick={() => rate(rating, performance.now())}>{rating === "needsWork" ? "Needs work" : rating === "missed" ? "Missed" : "Clean"}</button>)}</div>}
        {trainerMode === "scored" && (source === "keyboard" || source === "touch") && <div className="trainer-pads" aria-label="Drum input pads">{voices.map((voice) => <button key={voice} type="button" onClick={() => receiveHit(voice, source === "touch" ? "touch" : "keyboard")} disabled={phase !== "running"} className={`drum-pad pad-${voice}`}>{voice}<kbd>{Object.entries(keys).find(([, value]) => value === voice)?.[0].replace("Key", "")}</kbd></button>)}</div>}
        {lastHit && <p className="trainer-last-hit" role="status">{lastHit.rating.toUpperCase()} · {lastHit.instrument}{lastHit.midiArticulation ? ` · ${lastHit.midiArticulation.replaceAll("-", " ")}` : ""}{lastHit.articulation ? ` · ${articulationAbbreviation(lastHit.articulation)} target` : ""}{lastHit.offsetMs === null ? "" : ` · ${lastHit.offsetMs > 0 ? "+" : ""}${lastHit.offsetMs} ms`}{lastVelocity === null ? "" : ` · ${source === "midi" ? "MIDI velocity" : source.startsWith("audio-") ? "estimated strength" : "strength"} ${lastVelocity}`}{lastHit.accentTarget ? " · accent target" : ""}</p>}
        {liveTimingCoach && <p className="trainer-live-coach" role="status" aria-live="polite">Timing coach · {liveTimingCoach.message}</p>}
        {phase === "complete" && cueAdaptiveMessage && <p className="trainer-live-coach" role="status">{cueAdaptiveMessage}</p>}
        {round && <div className="trainer-result"><h3>Round recap</h3>{round.durationSeconds && <p>Timed practice · {round.durationSeconds} seconds of playing time.</p>}{challenge && round.patternId === challenge.pattern.id && round.durationSeconds === challenge.durationSeconds && round.result && !round.inputClipped && !round.uncertainDetections && <p>{round.result.accuracy >= challenge.targetAccuracy ? 'Challenge target met' : 'Keep practising toward the challenge target'} · {round.result.accuracy}% / {challenge.targetAccuracy}% using {round.source}.</p>}{Boolean(round.uncertainDetections || round.inputClipped) && <p role="status">Input quality affected this round: {round.uncertainDetections ?? 0} uncertain detections{round.inputClipped ? ", clipping detected" : ""}. Recheck calibration before comparing this score. This round is excluded from comparable trends.</p>}{coaching && <div className="trainer-next-action"><strong>Next practice focus</strong><p>{coaching.text}</p><button type="button" disabled={settingsLocked} onClick={() => { setLoopUnit('beats'); setTimingDrillFocus(null); setLoopStartBeat(coaching.beat + (loopEnabled ? activeLoopStartBeat - 1 : 0)); setLoopEndBeat(coaching.beat + (loopEnabled ? activeLoopStartBeat - 1 : 0)); setLoopEnabled(true); setLearningMode('normal'); setBpm(coaching.bpm); reset(); }}>Practise this beat</button></div>}{transition && <div className="trainer-transition-feedback"><h4>Groove → fill → return</h4><p>Groove: {transition.groove} · Fill: {transition.fill} · Return to beat one after the fill: {transition.landing}</p></div>}{articulationNotes.map(note => <p key={note}>{note}</p>)}{midiArticulationSummary && <p>MIDI articulation details: {midiArticulationSummary}.</p>}{round.hits?.some(hit => hit.articulation === 'buzz') && <p>Buzz gestures: {round.hits.filter(hit => hit.articulation === 'buzz' && (hit.sustainMs ?? 0) >= 60).length} sustained for at least 60 ms. Keep the buzz continuous through the 180 ms gesture window.</p>}{phase === "complete" && tempoLadderMessage && <p role="status">{tempoLadderMessage}</p>}{round.result ? <><p><strong>{round.result.score} score · {round.result.accuracy}% accuracy</strong><br />{round.result.great} Great · {round.result.good} Good · {round.result.miss} Miss · {round.result.extra} Extra</p>{limbFeedback && <div className="trainer-limb-feedback"><h4>Hands and feet</h4>{(["hands", "feet"] as const).map((limb) => { const item = limbFeedback[limb]; return <span key={limb}><strong>{limb === "hands" ? "Hands" : "Feet"}</strong> {item.onTime}/{item.total} on time{item.total ? ` · ${item.misses} missed` : ""}{item.extras ? ` · ${item.extras} extra` : ""}</span>; })}</div>}<TimingOffsetChart hits={round.hits ?? []} /><TrainerTimingBreakdown hits={round.hits ?? []} />{voiceTiming.length > 0 && <div className="trainer-voice-feedback"><h4>Timing by drum voice</h4>{voiceTiming.map((item) => <div className="trainer-voice-row" key={item.instrument}><strong>{item.instrument}</strong><div className="timing-offset-track" role="img" aria-label={`${item.instrument} average timing ${item.averageOffsetMs} milliseconds ${item.averageOffsetMs > 0 ? "late" : item.averageOffsetMs < 0 ? "early" : "on time"}`}><i style={{ left: `${Math.max(2, Math.min(98, 50 + item.averageOffsetMs / 2))}%` }} /></div><span>{item.averageOffsetMs > 0 ? "+" : ""}{item.averageOffsetMs} ms avg · {item.averageAbsoluteOffsetMs} ms typical distance · {item.great + item.good}/{item.total} on time{item.miss ? ` · ${item.miss} missed` : ""}</span></div>)}</div>}{(round.source === "midi" || round.source === "audio-timing" || round.source === "audio-voices") && velocityFeedback && <div className="trainer-dynamics-feedback"><h4>{dynamicsPractice ? "Dynamics target check" : "Strike-strength feedback"}</h4><p>Average {round.source.startsWith("audio-") ? "estimated strength" : "MIDI velocity"}: marked accents <strong>{velocityFeedback.accentAverage ?? "—"}</strong> · {dynamicsPractice ? "unaccented snare taps" : "other hits"} <strong>{velocityFeedback.otherAverage ?? "—"}</strong>.</p><p>{dynamicsPractice ? "Aim for accents at 85+ and ghost-note snare taps below 55." : "Aim for accents at 85+ and keep softer notes between 35 and 78."} {velocityFeedback.message}</p></div>}</> : <p><strong>{round.ratings.filter((rating) => rating === "clean").length} clean</strong> · {round.ratings.filter((rating) => rating === "needsWork").length} needs work · {round.ratings.filter((rating) => rating === "missed").length} missed</p>}</div>}
        {practicePlan && <p className="trainer-session-status" role="status">{practicePlan.placementCheck ? `Placement check · ${practicePlan.placementLabels?.[practicePlan.currentIndex] ?? "Round"} · round ${practicePlan.currentIndex + 1} of ${practicePlan.patternIds.length}.` : practicePlan.warmupCooldown && practicePlan.currentIndex === 0 ? "Session warm-up · play this easy groove at a comfortable tempo." : practicePlan.warmupCooldown && practicePlan.currentIndex === practicePlan.patternIds.length - 1 ? "Session cooldown · return to this easy groove and finish relaxed." : "Guided session · follow the selected pattern and focus."}</p>}
        {phase === "complete" && autoAdvanceCountdown !== null && nextPlanPattern && <p className="trainer-session-status" role="status" aria-live="polite">Next pattern in {autoAdvanceCountdown} seconds: {nextPlanPattern.name}. <button type="button" className="button-secondary" onClick={() => { setAutoAdvanceCountdown(null); setPlanAutoAdvance(false); }}>Stop auto-advance</button></p>}
        {phase === "complete" && practicePlan?.placementCheck && placementSummary && !nextPlanPattern && <div className="trainer-placement-result" role="status"><h3>{placementSummary.title}</h3><p>Placement check average: {placementSummary.averageAccuracy}% across {placementSummary.completedRounds} short rounds.</p><p>{placementSummary.recommendation}</p></div>}
        {phase === "complete" && practicePlan?.gated && <p className={`trainer-path-checkpoint ${pathCheckpointPassed ? "passed" : "needs-work"}`} role="status">{pathCheckpointPassed ? "Checkpoint passed. The next pattern is unlocked." : `Checkpoint needs ${pathAccuracyTarget}% accuracy${trainerMode === "scored" ? ` and no more than ${pathTimingTarget} ms average timing distance` : ""}. Repeat this pattern to continue.`}</p>}
        {phase === "complete" && practicePlan && nextPlanPattern && <button type="button" className="button-secondary" disabled={Boolean(practicePlan.gated && !pathCheckpointPassed)} onClick={advancePracticePlan}>Next: {nextPlanPattern.name} ({practicePlan.currentIndex + 2}/{practicePlan.patternIds.length})</button>}
        {phase === "complete" && canRevisitPathStep && previousPathPattern && <button type="button" className="button-secondary" onClick={revisitPreviousPathStep}>Revisit previous path step: {previousPathPattern.name}</button>}
        {phase === "complete" && practicePlan && !nextPlanPattern && (!practicePlan.gated || pathCheckpointPassed) && <p className="trainer-note">{practicePlan.name && practicePlan.name !== "Adaptive focus session" ? `${practicePlan.name} complete.` : "Practice plan complete. Your recent results will guide the next one."}</p>}
        {phase === "complete" && activeSetlist && nextSetlistPattern && <button type="button" className="button-secondary" onClick={advanceSetlist}>Next setlist part: {nextSetlistPattern.name}</button>}
        {phase === "complete" && activeSetlist && !nextSetlistPattern && setlistPatterns.length > 0 && <p className="trainer-note">Setlist complete. Choose a different setlist or replay a part.</p>}
      </div>
        {round && hasDynamicsTargets && <TrainerDynamicsBreakdown hits={round.hits ?? []} source={round.source} />}
      {transition && <section className="trainer-transition-return"><h4>First groove bar after the fill</h4><p>Return-bar accuracy: {transition.returnGroove} · Beat-one landing: {transition.landing}</p></section>}
      <DrumKitCanvas ref={kitRef} compact interactive={false} label="Trainer drum kit animation" />
      <section className="card trainer-device" aria-label="Device setup"><span className="eyebrow">Input setup</span><h2>Connect your kit.</h2>
        {source === "midi" && trainerMode === "scored" && <><button className="button-secondary" onClick={() => void connectMidi()}>Connect USB MIDI</button><p>{midiInputs.length ? midiInputs.map((item) => item.name).join(", ") : "No MIDI input connected."}</p><TrainerMidiSetup profileKey={midiMapKey} lastMidiNote={lastMidiNote} lastMidiNoteVersion={lastMidiNoteVersion} connected={midiInputs.length > 0} midiMap={midiMap} midiArticulations={midiArticulations} disabled={settingsLocked} onMapNote={(note, voice) => updateProfile(midiMapKey, profile => ({ ...profile, midiMap: { ...profile.midiMap, [note]: voice } }))} onMapArticulation={(note, articulation) => updateProfile(midiMapKey, profile => ({ ...profile, midiArticulations: { ...profile.midiArticulations, [note]: articulation } }))} onApply={(nextMap, nextArticulations) => updateProfile(midiMapKey, profile => ({ ...profile, midiMap: { ...nextMap }, midiArticulations: { ...nextArticulations } }))} /></>}
        {(source === "audio-timing" || source === "audio-voices") && trainerMode === "scored" && <><p>Connect a microphone or electronic kit line out. Voice recognition uses device-specific calibration samples.</p><div className="transport"><button className="button-secondary" onClick={() => void connectAudio()} disabled={settingsLocked}>Connect audio input</button><button className="button-secondary" onClick={stopAudioInput} disabled={!audioConnected || settingsLocked}>Disconnect</button></div>{audioDevices.length > 1 && <label>Input device<select value={deviceId} disabled={settingsLocked} onChange={(event) => { stopAudioInput(); setDeviceId(event.target.value); }}><option value="">System default</option>{audioDevices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}<label>Detection threshold {Math.round(audioThreshold * 100)}%<input type="range" min="0.03" max="0.4" step="0.01" value={audioThreshold} disabled={settingsLocked} onChange={(event) => { const value = Number(event.target.value); audioThresholdRef.current = value; setAudioThreshold(value); }} /></label>{source === "audio-timing" && <label>Target voice<select value={audioVoice} disabled={settingsLocked} onChange={(event) => { const value = event.target.value as Instrument; audioVoiceRef.current = value; setAudioVoice(value); }}>{availableVoices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label>}<meter min="0" max="100" value={audioLevel} aria-label="Relative audio input level" /><div className="trainer-audio-diagnostic">{audioClipping && <strong className="trainer-clipping-warning" role="alert">CLIPPING · lower input gain or move the mic farther away</strong>}<p role="status">{audioGuide}</p>{audioClipping && <button type="button" disabled={settingsLocked} onClick={() => { clippingStreakRef.current = 0; setAudioClipping(false); }}>Clear clipping warning after adjusting gain</button>}<small>Input level: {audioLevel}/100 · recent peak: {audioPeak}%{noiseFloor === null ? "" : ` · room noise: ${noiseFloor}/100`}</small><button type="button" className="button-secondary" onClick={measureBackgroundNoise} disabled={!audioConnected || measuringNoise || settingsLocked}>{measuringNoise ? "Measuring… keep quiet" : "Measure background noise"}</button></div><div className="trainer-preflight"><strong>Audio preflight</strong><p>Check that a strike reaches the input, latency is calibrated, voice recognition is ready, and the guide stays out of the microphone.</p><button type="button" className="button-secondary" disabled={!audioConnected} onClick={() => { const next = !preflightRequested; preflightRequestedRef.current = next; setPreflightRequested(next); setPreflightSignalSeen(false); setPreflightMessage(next ? "Strike one drum to check the input signal." : "Signal check stopped."); }}>{preflightRequested ? "Stop signal check" : "Run strike signal check"}</button><ul><li>{preflightSignalSeen ? "Ready" : "Check"} · Input signal {preflightSignalSeen ? "reached the Trainer" : "strike once to verify"}</li><li>{activeProfile.latencyCalibrated ? "Ready" : "Check"} · Input latency {activeProfile.latencyCalibrated ? `${activeProfile.latencyMs} ms saved for this device` : "run latency calibration or set a correction"}</li><li>{audioVoiceReady ? "Ready" : "Check"} · {source === "audio-voices" ? "Voice templates and latest recognition confidence" : `Target voice set to ${audioVoice}`}</li><li>{!guideLeakCheckNeeded || guideLeakTestResult === "clear" || guideHeadphonesConfirmed ? "Ready" : guideLeakTestResult === "detected" ? "Detected" : "Check"} · Guide audio leakage</li></ul>{guideLeakCheckNeeded && <button type="button" className="button-secondary" disabled={!audioConnected || settingsLocked} onClick={() => void runGuideLeakCheck()}>Check guide bleed through microphone</button>}{guideLeakCheckNeeded && <label><input type="checkbox" checked={guideHeadphonesConfirmed} onChange={event => setGuideHeadphonesConfirmed(event.target.checked)} /> I use headphones or have muted the guide near this microphone</label>}<p role="status">{preflightMessage || (audioPreflightReady ? "Input is ready for this practice setup." : "Resolve the checks above for more reliable scoring. You can start a round while you adjust them.")}</p></div>{source === "audio-voices" && <div className="trainer-calibration"><p>Calibrated voices for this input: {Object.keys(activeProfile.audioTemplates).length} of 5. Calibrate each drum voice for reliable classification.</p><label>Calibrate voice<select value={calibrationVoice} disabled={settingsLocked || audioDynamicsCalibrationHits > 0} onChange={(event) => setCalibrationVoice(event.target.value as Instrument)}>{voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}</select></label><button type="button" className="button-secondary" onClick={beginAudioCalibration} disabled={!audioConnected || audioCalibrationHits > 0 || audioDynamicsCalibrationHits > 0 || settingsLocked}>Calibrate next five hits</button>{audioCalibrationHits > 0 && <p>Captured {audioCalibrationHits} of 5 hits for {calibrationVoice}.</p>}</div>}{hasDynamicsTargets && <div className="trainer-calibration"><p>Audio dynamics for {audioDynamicsVoice}: {audioDynamicsLevels?.ghostRms ? "ghost taps calibrated" : "ghost taps not calibrated"} · {audioDynamicsLevels?.accentRms ? "accents calibrated" : "accents not calibrated"}. Measure room noise, then capture five hits at each level.</p><div className="transport"><button type="button" className="button-secondary" onClick={() => beginAudioDynamicsCalibration("ghost")} disabled={!audioConnected || settingsLocked || audioCalibrationHits > 0 || audioDynamicsCalibrationHits > 0}>Calibrate ghost taps</button><button type="button" className="button-secondary" onClick={() => beginAudioDynamicsCalibration("accent")} disabled={!audioConnected || settingsLocked || audioCalibrationHits > 0 || audioDynamicsCalibrationHits > 0 || !audioDynamicsLevels?.ghostRms}>Calibrate accents</button></div>{audioDynamicsCalibrationHits > 0 && <p>Captured {audioDynamicsCalibrationHits} of 5 {audioDynamicsKind} taps.</p>}<small>Strength feedback uses the calibrated voice profile and reports uncertain levels as unscored.</small></div>}</>}
        {trainerMode === "scored" && <><label>Input latency correction <strong>{activeProfile.latencyMs} ms</strong><input type="range" min="-200" max="200" step="5" value={activeProfile.latencyMs} onChange={(event) => { const value = Number(event.target.value); latencyRef.current = value; updateProfile(profileKey, (profile) => ({ ...profile, latencyMs: value, latencyCalibrated: true })); }} /></label><button type="button" className="button-secondary" onClick={startLatencyCalibration} disabled={settingsLocked}>Calibrate input latency</button>{latencyMessage && <p>{latencyMessage}</p>}</>}
        {trainerMode === "scored" && source.startsWith("audio-") && <div className="trainer-input-confidence"><strong>Input confidence</strong><p>{audioConfidence === null ? 'Strike the kit to check detection confidence.' : `${Math.round(audioConfidence * 100)}% latest voice similarity · ${uncertainHits} uncertain detections left unscored this round.`}</p><p>{Object.keys(activeProfile.audioTemplates).length}/5 voices calibrated. {templateValues.length < 2 ? "More voice samples are needed to assess calibration quality." : overlappingTemplates ? "Some voice samples are very similar; recalibrate those voices separately." : "Voice templates are distinct at the current similarity threshold."} {Object.values(activeProfile.audioTemplates).length >= 2 ? 'Compare each voice separately; overlapping sounds can reduce confidence.' : 'Calibrate at least two different voices before voice scoring.'}</p>{audioMatches.length > 0 && <small>Latest match ranking: {audioMatches.map(item => `${item.instrument} ${Math.round(item.similarity * 100)}%`).join(" · ")}</small>}{confusingPair && source === "audio-voices" && <div className="trainer-audio-confusion" role="status"><p>These sounds are close: {confusingPair[0].instrument} {Math.round(confusingPair[0].similarity * 100)}% and {confusingPair[1].instrument} {Math.round(confusingPair[1].similarity * 100)}%. Calibrate them separately with a clean pause between strikes.</p><button type="button" className="button-secondary" disabled={!audioConnected || audioCalibrationHits > 0 || audioDynamicsCalibrationHits > 0 || settingsLocked} onClick={() => beginAudioCalibration(confusingPair[1].instrument)}>Recalibrate {confusingPair[1].instrument}</button></div>}</div>}<p role="status">{deviceMessage}</p>
      </section>
    </section>
    <TrainerDeviceReadiness profileKey={profileKey} latencyMs={activeProfile.latencyMs} rounds={saved.rounds} disabled={settingsLocked} onCalibrate={startLatencyCalibration} />
    <section id="trainer-progress" className="card trainer-history"><span className="eyebrow">Your practice</span><h2>Recent rounds.</h2>{patternHistory.count > 0 && <div className="trainer-pattern-history"><strong>{localizedPattern(pattern, locale).name}</strong><span>{patternHistory.count} rounds · {patternHistory.averageAccuracy}% average result{patternHistory.bestTempo ? ` · ${patternHistory.bestTempo} BPM at 85%+ accuracy` : ""}</span>{patternHistory.averageOffsetMs !== null && <span>Average timing: {patternHistory.averageOffsetMs > 0 ? "+" : ""}{patternHistory.averageOffsetMs} ms {patternHistory.averageOffsetMs > 0 ? "late" : patternHistory.averageOffsetMs < 0 ? "early" : "on time"} · {patternHistory.averageAbsoluteOffsetMs} ms typical distance</span>}</div>}{saved.rounds.length ? <ol>{saved.rounds.slice(0, 8).map((item) => { const localizedName = t(`pattern.${item.patternId}.name`); return <li key={item.id}><strong>{localizedName === `pattern.${item.patternId}.name` ? item.patternName : localizedName}</strong><span>{item.bpm} BPM · {item.mode === "self" ? `${item.ratings.filter((rating) => rating === "clean").length}/${item.repetitions ?? 10} clean` : `${item.result?.accuracy ?? 0}% accuracy`} · {item.adaptation && item.adaptation !== "standard" ? "adapted · " : ""}{formatDate(new Date(item.playedAt))}</span></li>; })}</ol> : <p>Complete a round to see your practice history.</p>}</section>
    <section className="card trainer-history trainer-progress-trends" aria-label="Practice progress trends"><span className="eyebrow">Progress trends</span><h2>See progress across sessions.</h2>{trainerProgress.rounds.length ? <><p>{trainerProgress.matchingAttemptCount} comparable rounds from {saved.rounds.length} saved attempts. Trends compare the same pattern and setup across tempos; the charts use up to the latest {trainerProgress.rounds.length}. {trainerProgress.delta === null ? "Complete another comparable round to see how accuracy is moving." : `${trainerProgress.delta > 0 ? "+" : ""}${trainerProgress.delta} percentage points across the two halves of the recent accuracy trend.`}</p><p>Recent timing distance: {timingDistance ?? "—"} ms · timing variation: {timingSpread ?? "—"} ms. Lower values mean tighter and steadier timing.</p><TrainerProgressChart points={trainerProgress.points} /><TrainerProgressMetrics metrics={trainerProgress.metrics} /><div className="trainer-progress-voices"><strong>Hit accuracy by voice</strong>{trainerProgress.voices.map((item) => <span key={item.instrument}><b>{item.instrument}</b> {item.onTime}/{item.total} on time · {item.accuracy}%{item.averageOffsetMs === null ? "" : ` · ${item.averageOffsetMs > 0 ? "+" : ""}${item.averageOffsetMs} ms avg`}</span>)}</div></> : <p>Complete reliable, scored full-pattern rounds to see your accuracy, tempo, timing, dynamics, and fill-return trends.</p>}<details className="trainer-progress-explainer"><summary>What counts as a matching attempt?</summary><p>Rounds must use the selected pattern, input type and device profile, target voice, feel, and variation. Tempo can vary so the chart can show progression. Focused drills, one-limb or adapted rounds, learning stages, clipped audio, and uncertain audio detections stay out because they use different targets or less reliable input.</p><p>{trainerProgress.matchingAttemptCount} matching attempts are available; up to the latest 12 appear in each trend. Timing and dynamics need measured hits, and fill-return data appears after groove-to-fill practice.</p></details></section>
    <section className="card trainer-mastery" aria-label="Pattern mastery and review"><span className="eyebrow">Mastery & review</span><h2>Keep skills fresh.</h2><p>{masteryCounts.due} due for review · {masteryCounts.ready} ready · {masteryCounts.building} building · {masteryCounts.new} new. Adaptive plans put due patterns first.</p>{reviewSuggestions.length ? <ul>{reviewSuggestions.map((item) => <li key={item.pattern.id}><div><strong>{localizedPattern(item.pattern, locale).name}</strong><span>{item.status === "due" ? "Review due" : "Building"} · {item.averageAccuracy}% recent result{item.attempts ? ` · ${item.attempts} rounds` : ""}</span></div><button type="button" className="button-secondary" disabled={settingsLocked} onClick={() => { setTimingDrillFocus(null); setPracticePlan(null); setActiveSetlistId(""); setPatternId(item.pattern.id); setFillPractice(false); setLoopEnabled(false); setBpm(item.pattern.defaultBpm); reset(); }}>Review</button></li>)}</ul> : <p>Finish a few rounds to build your review schedule.</p>}</section>
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
  if (pattern.id.startsWith('phrase:')) return Number(pattern.id.split(':').at(-1)) || 1;
  const explicitBars = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter.match(/^(\d+)\s+bars?\b/i) : null;
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

function getSpokenCount(pattern: PracticePattern, step: number, beatsOnly: boolean, locale: import("@/lib/locale-core").Locale) {
  const { beat, suffix } = getStepCountParts(pattern, step);
  return localizedSpokenCount(locale, beat, suffix, beatsOnly);
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

function TrainerProgressChart({ points }: { points: TrainerProgressPoint[] }) {
  const { formatDate } = useLocalization();
  if (!points.length) return null;
  const plotted = points.map((point, index) => ({
    ...point,
    x: 10 + index / Math.max(1, points.length - 1) * 300,
    y: 96 - point.accuracy * 0.78
  }));
  return <div className="trainer-progress-chart"><span>Scored accuracy · oldest to newest</span><svg viewBox="0 0 320 112" role="img" aria-label={`Accuracy trend from ${points[0].accuracy}% to ${points[points.length - 1].accuracy}% over ${points.length} recent full-pattern rounds`}><line x1="8" y1="18" x2="312" y2="18" className="trainer-progress-guide" /><line x1="8" y1="57" x2="312" y2="57" className="trainer-progress-guide" /><line x1="8" y1="96" x2="312" y2="96" className="trainer-progress-guide" /><text x="9" y="14">100%</text><text x="9" y="53">50%</text><polyline points={plotted.map((point) => `${point.x},${point.y}`).join(" ")} className="trainer-progress-line" />{plotted.map((point, index) => <circle key={`${point.date}-${index}`} cx={point.x} cy={point.y} r="3.5" className="trainer-progress-point"><title>{point.accuracy}% · {formatDate(new Date(point.date))}</title></circle>)}</svg><small>{formatDate(new Date(points[0].date))} · {formatDate(new Date(points[points.length - 1].date))}</small></div>;
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

function getExpectedHitMarkerTimes(pattern: PracticePattern, bpm: number, repetitions: number, countInBeats: number, feel: TrainerFeel = "straight", voice?: Instrument, options: { swingRatio?: number; pocketMs?: number; learningMode?: LearningMode; includeFinalReturn?: boolean } = {}) {
  const countInMs = countInBeats * 60000 / bpm;
  const targets: Expected[] = expectedRoundHits(pattern, bpm, countInMs, repetitions, feel, options).filter((target) => {
    const stage = learningStage(options.learningMode ?? 'normal', target.repetition, repetitions);
    return (!voice || target.instrument === voice) && stage !== 'Listen' && (stage !== 'Feet' || target.instrument === 'kick') && (stage !== 'Hands' || target.instrument !== 'kick');
  });
  if (options.includeFinalReturn) {
    const finalAt = countInMs + repetitions * roundDurationMs(pattern, bpm);
    targets.push(...expectedRoundHits(pattern, bpm, finalAt, 1, feel, options)
      .filter(target => target.step === 0 && (!voice || target.instrument === voice))
      .filter(target => { const stage = learningStage(options.learningMode ?? 'normal', repetitions - 1, repetitions); return stage !== 'Listen' && (stage !== 'Feet' || target.instrument === 'kick') && (stage !== 'Hands' || target.instrument !== 'kick'); })
      .map(target => ({ ...target, repetition: repetitions - 1, transition: 'landing' as const })));
  }
  return targets.map((target) => target.at);
}

function trainerClipMismatchReason(a: TrainerClip, b: TrainerClip) {
  if (a.patternId !== b.patternId) return "The patterns differ.";
  if (a.bpm !== b.bpm) return `The tempos differ (${a.bpm} and ${b.bpm} BPM).`;
  if (!a.settings || !b.settings) return "";
  if ((a.settings.feel ?? "straight") !== (b.settings.feel ?? "straight")) return "The feel targets differ.";
  if ((a.settings.swingRatio ?? 2 / 3) !== (b.settings.swingRatio ?? 2 / 3)) return "The swing ratios differ.";
  if ((a.settings.pocketMs ?? 35) !== (b.settings.pocketMs ?? 35)) return "The snare pocket targets differ.";
  if ((a.settings.learningMode ?? "normal") !== (b.settings.learningMode ?? "normal")) return "The learning stages differ.";
  if ((a.settings.source ?? "self") !== (b.settings.source ?? "self")) return "The input types differ.";
  if (a.settings.targetVoice !== b.settings.targetVoice) return "The target drum voices differ.";
  if ((a.settings.inputProfile ?? "") !== (b.settings.inputProfile ?? "")) return "The input device profiles differ.";
  return "";
}
function sameTrainerClipSetup(a: TrainerClip, b: TrainerClip) {
  return trainerClipMismatchReason(a, b) === "";
}

function getActualHitMarkerTimes(hits: RatedHit[], countInBeats: number, bpm: number) {
  const countInMs = countInBeats * 60000 / bpm;
  return hits.flatMap((hit) => typeof hit.atMs === "number" ? [countInMs + hit.atMs] : []).sort((a, b) => a - b);
}

function getExpectedDynamicsMarkers(pattern: PracticePattern, bpm: number, repetitions: number, countInBeats: number, feel: TrainerFeel, options: { swingRatio?: number; pocketMs?: number }): TrainerDynamicsMarker[] {
  const startAt = countInBeats * 60000 / bpm;
  return expectedRoundHits(pattern, bpm, startAt, repetitions, feel, options)
    .flatMap(target => typeof target.velocityTarget === "number" ? [{ timeMs: target.at, velocity: target.velocityTarget }] : []);
}

function getActualDynamicsMarkers(hits: RatedHit[], countInBeats: number, bpm: number): TrainerDynamicsMarker[] {
  const countInMs = countInBeats * 60000 / bpm;
  return hits.flatMap(hit => typeof hit.atMs === "number" && typeof hit.velocity === "number" ? [{ timeMs: countInMs + hit.atMs, velocity: hit.velocity }] : []).sort((a, b) => a.timeMs - b.timeMs);
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
  const fillRanges = (pattern.trainerFillStepRanges ?? []).flatMap(([start, end]) => {
    const clippedStart = Math.max(start, stepOffset), clippedEnd = Math.min(end, stepOffset + stepsPerBeat);
    return clippedEnd > clippedStart ? [[clippedStart - stepOffset, clippedEnd - stepOffset] as [number, number]] : [];
  });
  return {
    ...pattern,
    name: `${instrument} · beat ${beat} focus`,
    description: `Play only the ${instrument} hits from beat ${beat} of ${pattern.name}.`,
    beats: 1,
    trainerFillStepRanges: fillRanges,
    hits: pattern.hits.filter((hit) => hit.instrument === instrument && hit.step >= stepOffset && hit.step < stepOffset + stepsPerBeat)
      .map((hit) => ({ ...hit, step: hit.step - stepOffset }))
  };
}

function getTimingWeakSpot(rounds: TrainerRound[], pattern: PracticePattern, variationId = "base") {
  const recent = rounds.filter((round) => round.patternId === pattern.id && (round.variationId ?? "base") === variationId && round.mode === "scored" && !round.inputClipped && !round.uncertainDetections && !round.focusedDrill && !round.learningMode && (!round.limbFocus || round.limbFocus === "all") && (!round.adaptation || round.adaptation === "standard"))
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
  for (const round of rounds) if (!round.focusedDrill && !round.learningMode && (!round.limbFocus || round.limbFocus === "all") && (!round.adaptation || round.adaptation === "standard")) groups.set(round.patternId, [...(groups.get(round.patternId) ?? []), round]);
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

function getGoalSessionSlotCount(available: PracticePattern[], focus: TrainerSessionFocus, minutes: number, repetitions: number, countInBeats: number) {
  const focused = getTrainerGoalPatterns(available, focus, available);
  const estimatePatterns = focus === "fills"
    ? focused.flatMap(pattern => {
      if (!canUseFillPractice(pattern)) return [];
      const fill = compatibleFillPatterns(pattern, available)[0];
      const transition = fill ? createGrooveFillTransition(pattern, fill, 2, `goal-fill:${pattern.id}:${fill.id}`) : null;
      return transition ? [transition] : [];
    })
    : focused;
  return getPracticePlanSlotCount(estimatePatterns, minutes, focus === "fills" ? 4 : repetitions, countInBeats);
}

function getPracticePlanPatterns(rounds: TrainerRound[], available: PracticePattern[], selectedId: string, count: number) {
  const grouped = new Map<string, TrainerRound[]>();
  rounds.filter((round) => !round.focusedDrill && !round.learningMode && (!round.limbFocus || round.limbFocus === "all") && (!round.adaptation || round.adaptation === "standard")).forEach((round) => grouped.set(round.patternId, [...(grouped.get(round.patternId) ?? []), round]));
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
  const matched = rounds.filter((round) => round.patternId === patternId && !round.focusedDrill && !round.learningMode && (!round.limbFocus || round.limbFocus === "all") && (!round.adaptation || round.adaptation === "standard"));
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
  const matched = rounds.filter((round) => round.patternId === pattern.id && !round.focusedDrill && !round.learningMode && (!round.limbFocus || round.limbFocus === "all") && (!round.adaptation || round.adaptation === "standard")).sort((a, b) => b.playedAt.localeCompare(a.playedAt));
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
