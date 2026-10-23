import { describe, expect, it } from "vitest";
import { applyDynamicsTargets, summarizeDynamics } from "@/lib/trainer-dynamics";
import { nextCoaching, transitionFeedback } from "@/lib/trainer-coaching";
import { shouldPlayTrainerClick } from "@/lib/trainer-metronome";
import { summarizeTrainerProgress } from "@/lib/trainer-progress";
import { summarizeRepetitionDrift } from "@/components/TrainerTimingBreakdown";
import { summarizeTrainerBars, summarizeTrainerTransitions } from "@/lib/trainer-bar-analysis";
import { buildTrainerSongFormPattern } from "@/lib/trainer-song-form";
import { parseCustomGrooves } from "@/lib/custom-grooves";
import { summarizeTrainerRoundInsight } from "@/lib/trainer-round-insights";
import { trainerBackingNotes } from "@/lib/trainer-backing";
import { createTrainerCuePattern } from "@/lib/trainer-cues";
import { summarizeTrainerMilestones } from "@/lib/trainer-milestones";
import { parseTrainerSetupTransfer } from "@/lib/trainer-enhancements";
import { estimateTrainerTempo } from "@/lib/trainer-tempo";
import { summarizeTrainerLiveTiming } from "@/lib/trainer-live-coaching";
import { getTrainerGoalPatterns } from "@/lib/trainer-goals";
import { summarizeTrainerInputQuality, trainerInputQualityAdvice } from "@/lib/trainer-input-quality";
import type { TrainerRound } from "@/lib/trainer";
import type { Groove, PracticePattern, RatedHit } from "@/lib/types";

const fourBeatPattern: PracticePattern = {
  id: "test-groove", name: "Test groove", level: "Beginner", description: "Test", subdivision: 4,
  beats: 4, defaultBpm: 80, tempoRange: [40, 160], hits: [
    { step: 0, instrument: "snare", accent: true },
    { step: 1, instrument: "snare" },
    { step: 2, instrument: "snare" },
    { step: 3, instrument: "snare" },
  ],
};

describe("Trainer improvements", () => {
  it("builds scored crash and dynamic cue targets and cues a fill one beat early", () => {
    const crash = createTrainerCuePattern(fourBeatPattern, "crash", 3);
    expect(crash.cueSteps).toEqual([2]);
    expect(crash.pattern.hits.filter(hit => hit.instrument === "crash").map(hit => hit.step)).toEqual([2]);

    const dynamics = createTrainerCuePattern(fourBeatPattern, "loud", 2);
    expect(dynamics.hasDynamicsTargets).toBe(true);
    expect(dynamics.pattern.hits.map(hit => hit.velocityTarget)).toEqual([55, 105, 105, 105]);
    expect(dynamics.cueSteps).toEqual([1]);

    const twoBars = { ...fourBeatPattern, beats: 8, meter: "2 bars · 4/4" };
    expect(createTrainerCuePattern(twoBars, "fill", 1, 4)).toMatchObject({ cueSteps: [3], pattern: twoBars });
  });

  it("creates a repeatable randomized cue sequence with a callout for each response", () => {
    const twoBars = { ...fourBeatPattern, beats: 8, meter: "2 bars · 4/4" };
    const first = createTrainerCuePattern(twoBars, "random", 1, undefined, 42);
    const repeat = createTrainerCuePattern(twoBars, "random", 1, undefined, 42);
    expect(first).toEqual(repeat);
    expect(first.pattern.id).toContain("trainer-cue:random:");
    expect(first.callouts).toHaveLength(2);
    expect(first.callouts?.every(callout => /Next: (crash|play louder|play softer)/.test(callout.label))).toBe(true);
    expect(first.cueSteps).toEqual(first.callouts?.map(callout => callout.step));
  });

  it("spaces random cues across repeated one-bar grooves", () => {
    const spaced = createTrainerCuePattern(fourBeatPattern, "random", 1, undefined, 42, 4, 1, 8);
    expect(spaced.repetitionPatterns).toHaveLength(8);
    expect(spaced.callouts?.map(callout => [callout.repetition, callout.bar])).toEqual([[0, 1], [4, 5]]);
    expect(spaced.repetitionPatterns?.[1].hits).toEqual(fourBeatPattern.hits);
    expect(spaced.label).toContain("every 4 bars across the round (2 cues)");
  });

  it("adds scored voice-drop and accent-shift cues", () => {
    const groove = { ...fourBeatPattern, subdivision: 8 as const, hits: [
      ...[0, 2, 4, 5, 6].map(step => ({ step, instrument: "hihat" as const })),
      { step: 0, instrument: "kick" as const },
      { step: 4, instrument: "snare" as const },
    ] };
    const dropout = createTrainerCuePattern(groove, "dropout", 3, undefined, 1, 1, 1, 4, "hihat");
    expect(dropout.callouts).toEqual([{ step: 2, bar: 1, label: "Next: drop hihat from beat 3." }]);
    expect(dropout.pattern.hits.filter(hit => hit.instrument === "hihat").map(hit => hit.step)).toEqual([0, 2]);
    expect(dropout.pattern.hits.filter(hit => hit.instrument === "kick")).toHaveLength(1);

    const accent = createTrainerCuePattern(groove, "accent-shift", 3);
    expect(accent.hasDynamicsTargets).toBe(true);
    expect(accent.pattern.hits.filter(hit => hit.instrument === "hihat").map(hit => [hit.accent, hit.velocityTarget])).toEqual([[false, 45], [false, 45], [true, 105], [true, 105], [false, 45]]);
    expect(accent.callouts?.[0].label).toBe("Next: move the accent to beat 3.");
  });

  it("turns scored recap data into an instrument-specific one-beat drill", () => {
    const round: TrainerRound = {
      id: "coaching", patternId: fourBeatPattern.id, patternName: fourBeatPattern.name, bpm: 90,
      playedAt: "2026-10-01T12:00:00.000Z", mode: "scored", source: "midi", ratings: [], result: null,
      hits: [{ instrument: "kick", rating: "miss", offsetMs: null, step: 0, repetition: 0 }],
    };
    expect(nextCoaching(round, fourBeatPattern)).toMatchObject({ instrument: "kick", beat: 1, bpm: 85 });
  });

  it("summarizes recent audio input reliability by selected profile", () => {
    const round = (id: string, profile: string, source: "audio-timing" | "audio-voices", quality: { inputClipped?: boolean; uncertainDetections?: number } = {}): TrainerRound => ({
      id, patternId: "test-groove", patternName: "Test groove", bpm: 80,
      playedAt: `2026-10-0${id === "three" ? "3" : id === "two" ? "2" : "1"}T12:00:00.000Z`, mode: "scored", source,
      inputProfile: profile, ratings: [], result: { id, patternId: "test-groove", patternName: "Test groove", bpm: 80, playedAt: "2026-10-01T12:00:00.000Z", score: 80, accuracy: 80, great: 4, good: 0, miss: 0, extra: 0, maxCombo: 4 },
      ...quality,
    });
    const summary = summarizeTrainerInputQuality([
      round("one", "audio:kit-a", "audio-timing"),
      round("two", "audio:kit-a", "audio-voices", { uncertainDetections: 2 }),
      round("three", "audio:kit-a", "audio-voices", { inputClipped: true }),
      round("other", "audio:kit-b", "audio-voices", { inputClipped: true }),
    ], "audio:kit-a");
    expect(summary).toMatchObject({ audioRounds: 3, cleanAudioRounds: 1, flaggedAudioRounds: 2, audioReliabilityPercent: 33 });
    expect(summary.rounds.map(point => point.id)).toEqual(["three", "two", "one"]);
  });

  it("turns recent audio flags into a concrete calibration recommendation", () => {
    const summary = {
      rounds: [
        { id: "clip-a", playedAt: "2026-10-03T00:00:00.000Z", source: "audio-timing", uncertainDetections: 0, inputClipped: true, reliable: false },
        { id: "clip-b", playedAt: "2026-10-02T00:00:00.000Z", source: "audio-timing", uncertainDetections: 0, inputClipped: true, reliable: false },
      ], audioRounds: 2, cleanAudioRounds: 0, flaggedAudioRounds: 2, audioReliabilityPercent: 0,
    };
    expect(trainerInputQualityAdvice(summary)).toMatchObject({ action: "lower-gain", title: "Lower the input gain" });
  });

  it("builds a complete AABA form and summarizes groove, fill, and landing accuracy", () => {
    const grooveA: Groove = { ...fourBeatPattern, meter: "4/4", style: "Groove", focus: "A part", hits: [{ step: 0, instrument: "snare" }] };
    const grooveB: Groove = { ...fourBeatPattern, id: "part-b", name: "Part B", meter: "4/4", style: "Groove", focus: "B part", hits: [{ step: 0, instrument: "kick" }] };
    const fill: Groove = { ...fourBeatPattern, id: "fill-test", name: "Fill: Single hit", meter: "4/4", style: "Fill study", focus: "Fill", hits: [{ step: 2, instrument: "tom" }] };
    const form = buildTrainerSongFormPattern({ id: "custom-form-test", template: "AABA", partA: grooveA, partB: grooveB, fill, fillAfterSections: [2] });
    expect(form).toMatchObject({ beats: 20, meter: "5 bars · 4/4", trainerFillStepRanges: [[8, 12]] });
    const hits: RatedHit[] = [
      { instrument: "snare", rating: "great", offsetMs: 0, step: 4, repetition: 0 },
      { instrument: "tom", rating: "miss", offsetMs: null, step: 10, repetition: 0 },
      { instrument: "kick", rating: "good", offsetMs: 12, step: 12, repetition: 0 },
    ];
    expect(summarizeTrainerTransitions(hits, form!)).toEqual([{ fillBar: 3, grooveBefore: "100% on time", fill: "0% on time", landing: "100% on time" }]);
  });

  it("builds custom multi-bar arrangements with repeats, dynamics, and persistable targets", () => {
    const grooveA: Groove = { ...fourBeatPattern, meter: "4/4", style: "Groove", focus: "A part", hits: [{ step: 0, instrument: "snare" }] };
    const grooveB: Groove = { ...fourBeatPattern, id: "part-b", name: "Part B", meter: "4/4", style: "Groove", focus: "B part", hits: [{ step: 0, instrument: "kick" }] };
    const form = buildTrainerSongFormPattern({
      id: "custom-form-dynamics", template: "Custom", partA: grooveA, partB: grooveB,
      customSections: [
        { part: "A", bars: 2, repeats: 1, intensity: "soft" },
        { part: "B", bars: 4, repeats: 2, intensity: "strong" },
      ],
    });
    expect(form).toMatchObject({ beats: 40, meter: "10 bars · 4/4" });
    expect(form?.hits[0]).toMatchObject({ step: 0, velocityTarget: 48, accent: false });
    expect(form?.hits[2]).toMatchObject({ step: 8, velocityTarget: 110, accent: true });
    const restored = parseCustomGrooves(JSON.stringify([form]));
    expect(restored[0].hits[0]).toMatchObject({ velocityTarget: 48 });
    expect(restored[0].hits[2]).toMatchObject({ velocityTarget: 110 });
    expect(parseCustomGrooves(JSON.stringify([{ ...form, hits: [{ step: 0, instrument: "kick", velocityTarget: 128 }] }]))).toEqual([]);
  });

  it("explains scored outcomes and flags unreliable audio input", () => {
    const round: TrainerRound = {
      id: "insight", patternId: fourBeatPattern.id, patternName: fourBeatPattern.name, bpm: 90,
      playedAt: "2026-10-01T12:00:00.000Z", mode: "scored", source: "midi", inputProfile: "midi:practice-kit",
      ratings: [], result: { id: "insight", patternId: fourBeatPattern.id, patternName: fourBeatPattern.name, bpm: 90, playedAt: "2026-10-01T12:00:00.000Z", score: 70, accuracy: 70, great: 2, good: 1, miss: 1, extra: 0, maxCombo: 3 },
      hits: [{ instrument: "snare", rating: "miss", offsetMs: null, step: 1, repetition: 0 }],
    };
    expect(summarizeTrainerRoundInsight(round, fourBeatPattern)).toMatchObject({
      title: "Focus on the missed strokes", nextStep: expect.stringContaining("beat 2"),
      reliability: expect.stringContaining("midi:practice-kit"),
    });
    const clipped = summarizeTrainerRoundInsight({ ...round, inputClipped: true }, fourBeatPattern);
    expect(clipped).toMatchObject({ title: "Check the input before using this score", warning: expect.stringContaining("clipped") });
    expect(summarizeTrainerRoundInsight({ ...round, mode: "self" }, fourBeatPattern)).toBeNull();
  });

  it("provides distinct synthesized backing note patterns for Trainer challenges", () => {
    const sixteenthPattern = { ...fourBeatPattern, subdivision: 16 as const };
    expect(trainerBackingNotes(sixteenthPattern, "rock").map(note => note.kind)).toContain("shaker");
    expect(trainerBackingNotes(sixteenthPattern, "funk").some(note => note.kind === "bass" && note.step % 4 === 3)).toBe(true);
    expect(trainerBackingNotes(sixteenthPattern, "shuffle").some(note => note.kind === "shaker")).toBe(true);
  });

  it("reports timing and measured dynamics for each bar across repeated multi-bar patterns", () => {
    const twoBars = { ...fourBeatPattern, beats: 8, meter: "2 bars · 4/4" };
    const bars = summarizeTrainerBars([
      { instrument: "snare", rating: "great", offsetMs: 10, velocity: 90, velocityTarget: 100, step: 0, repetition: 0 },
      { instrument: "kick", rating: "miss", offsetMs: null, step: 1, repetition: 0 },
      { instrument: "snare", rating: "good", offsetMs: -20, velocity: 80, velocityTarget: 100, step: 4, repetition: 0 },
      { instrument: "snare", rating: "great", offsetMs: 0, step: 0, repetition: 1 },
      { instrument: "snare", rating: "great", offsetMs: 0, step: 0, repetition: 1, transition: "landing" },
      { instrument: "snare", rating: "extra", offsetMs: null, step: 4, repetition: 1 },
    ], twoBars);
    expect(bars).toMatchObject([
      { bar: 1, targets: 2, onTime: 1, missed: 1, averageOffsetMs: 10, typicalOffsetMs: 10, dynamicsSamples: 1, averageDynamicsError: 10 },
      { bar: 2, targets: 1, onTime: 1, missed: 0, averageOffsetMs: -20, typicalOffsetMs: 20, dynamicsSamples: 1, averageDynamicsError: 20 },
      { bar: 3, targets: 1, onTime: 1, missed: 0 },
    ]);
  });

  it("estimates tap tempo while filtering an isolated missed beat", () => {
    expect(estimateTrainerTempo([0, 500, 1000, 1500])).toBe(120);
    expect(estimateTrainerTempo([0, 500, 1000, 2600, 3100])).toBe(120);
    expect(estimateTrainerTempo([0, 500])).toBeNull();
  });

  it("summarizes recent timing and filters the available patterns by session goal", () => {
    const hits: RatedHit[] = [
      { instrument: "snare", rating: "great", offsetMs: 25 },
      { instrument: "kick", rating: "good", offsetMs: 18 },
      { instrument: "hihat", rating: "great", offsetMs: 21 },
    ];
    expect(summarizeTrainerLiveTiming(hits)?.message).toContain("trending 21 ms late");
    const oddMeter = { ...fourBeatPattern, id: "odd-meter", beats: 5, meter: "1 bar · 5/4" };
    const focusPatterns: PracticePattern[] = [
      { ...fourBeatPattern, id: "ghost", name: "Ghost Note Pocket", description: "Quiet snare taps" },
      { ...fourBeatPattern, id: "syncopated", name: "Offbeat Kick", description: "Displaced accents" },
      { ...fourBeatPattern, id: "dynamics", name: "Hat Accent Alternation", description: "Soft and strong strokes" },
    ];
    expect(getTrainerGoalPatterns([fourBeatPattern, oddMeter], "odd-meter").map(pattern => pattern.id)).toEqual(["odd-meter"]);
    expect(getTrainerGoalPatterns([fourBeatPattern, oddMeter], "backbeat").map(pattern => pattern.id)).toEqual(["test-groove"]);
    expect(getTrainerGoalPatterns(focusPatterns, "ghost-notes").map(pattern => pattern.id)).toEqual(["ghost"]);
    expect(getTrainerGoalPatterns(focusPatterns, "syncopation").map(pattern => pattern.id)).toEqual(["syncopated"]);
    expect(getTrainerGoalPatterns(focusPatterns, "dynamics").map(pattern => pattern.id)).toContain("dynamics");
  });

  it("fills new cue and audio settings with defaults when importing an older setup", () => {
    const legacySetup = {
      application: "Drum Hero", type: "trainer-setup", version: 1, patternId: "test-groove", bpm: 80,
      repetitions: 4, countInBeats: 1, trainerMode: "scored", source: "keyboard", audioVoice: "kick",
      tempoBuild: false, tempoLadder: false, tempoStep: 2, loopEnabled: false, loopStartBeat: 1, loopEndBeat: 4,
      fillPractice: false, fillPatternId: "", fillAfterBars: 1, handPattern: "alternating", leadHand: "R",
      spokenCount: "off", dynamicsPractice: false, practicePathId: "backbeat"
    };
    const setup = parseTrainerSetupTransfer(JSON.stringify(legacySetup), new Set(["test-groove"]));
    expect(setup).toMatchObject({ cueMode: "off", cueVoice: "hihat", cueBeat: 1, trainerDrumLevel: 100, trainerClickLevel: 100, clickSound: "hat" });
    const randomSetup = parseTrainerSetupTransfer(JSON.stringify({ ...legacySetup, cueMode: "random" }), new Set(["test-groove"]));
    expect(randomSetup.cueMode).toBe("random");
    const dropoutSetup = parseTrainerSetupTransfer(JSON.stringify({ ...legacySetup, cueMode: "dropout", cueVoice: "tom" }), new Set(["test-groove"]));
    expect(dropoutSetup).toMatchObject({ cueMode: "dropout", cueVoice: "tom" });
  });

  it("tracks reliable practice milestones and ignores clipped attempts", () => {
    const baseRound: TrainerRound = {
      id: "milestone-round", patternId: "test-groove", patternName: "Test groove", bpm: 80,
      playedAt: "2026-10-01T12:00:00.000Z", mode: "scored", source: "midi", ratings: [],
      result: { id: "milestone-round", patternId: "test-groove", patternName: "Test groove", bpm: 80,
        playedAt: "2026-10-01T12:00:00.000Z", score: 90, accuracy: 90, great: 4, good: 0, miss: 0, extra: 0, maxCombo: 4 },
      hits: Array.from({ length: 16 }, (_, index) => ({ instrument: "snare" as const, rating: "great" as const, offsetMs: 10, step: index, repetition: 0 }))
    };
    const clipped = { ...baseRound, id: "clipped", inputClipped: true };
    const cueVariants = ["crash", "loud", "soft", "fill"].map(mode => ({ ...baseRound, id: mode, patternId: `trainer-cue:${mode}:test-groove` }));
    const milestones = summarizeTrainerMilestones([baseRound, clipped, ...cueVariants]);
    expect(milestones.find(item => item.id === "first-score")).toMatchObject({ progress: 1, earned: true });
    expect(milestones.find(item => item.id === "steady-pocket")).toMatchObject({ progress: 16, earned: true });
    expect(milestones.find(item => item.id === "pattern-explorer")).toMatchObject({ progress: 1, earned: false });
  });

  it("alternates two audible bars with two silent bars, carrying through one-bar repetitions", () => {
    const firstBeat = (repetition: number) => shouldPlayTrainerClick(fourBeatPattern, 0, "progressive-silence", repetition, 1);
    expect([0, 1, 2, 3, 4].map(firstBeat)).toEqual([true, true, false, false, true]);
    const eighthNotePattern = { ...fourBeatPattern, subdivision: 8 };
    expect(shouldPlayTrainerClick(eighthNotePattern, 0, "all")).toBe(true);
    expect(shouldPlayTrainerClick(eighthNotePattern, 1, "all")).toBe(false);
  });

  it("creates distinct dynamics targets for contrast, crescendo, and evenness", () => {
    const neutralPattern = { ...fourBeatPattern, hits: [
      { step: 0, instrument: "hihat" as const, accent: true },
      { step: 1, instrument: "hihat" as const },
      { step: 2, instrument: "kick" as const },
      { step: 3, instrument: "kick" as const },
    ] };
    expect(applyDynamicsTargets(neutralPattern, "contrast").hits.map(hit => hit.velocityTarget)).toEqual([105, 45, 45, 45]);
    const backbeatPattern = { ...fourBeatPattern, subdivision: 8 as const, hits: [{ step: 2, instrument: "snare" as const }, { step: 6, instrument: "snare" as const }] };
    expect(applyDynamicsTargets(backbeatPattern, "contrast").hits.map(hit => hit.velocityTarget)).toEqual([45, 105, 45, 105]);
    expect(applyDynamicsTargets(fourBeatPattern, "crescendo").hits.map(hit => hit.velocityTarget)).toEqual([42, 63, 84, 105]);
    expect(applyDynamicsTargets(fourBeatPattern, "evenness").hits.map(hit => hit.velocityTarget)).toEqual([70, 70, 70, 70]);
  });

  it("reports measured strike strength against its target", () => {
    const hits: RatedHit[] = [
      { instrument: "snare", rating: "great", offsetMs: 2, velocity: 100, velocityTarget: 105 },
      { instrument: "snare", rating: "good", offsetMs: -8, velocity: 50, velocityTarget: 45 },
    ];
    expect(summarizeDynamics(hits)).toMatchObject({ count: 2, targetAverage: 75, playedAverage: 75, meanError: 5 });
    expect(summarizeDynamics([]).count).toBe(0);
  });

  it("detects a gradual timing drift across repetitions", () => {
    const hits: RatedHit[] = [-30, -10, 10, 30].map((offsetMs, repetition) => ({ instrument: "snare", rating: "great", offsetMs, repetition }));
    expect(summarizeRepetitionDrift(hits)).toMatchObject({ driftPerPassMs: 20, message: "Your average timing moves later by about 20 ms per pass." });
  });

  it("scores the first groove bar after a fill separately from the fill landing", () => {
    const hits: RatedHit[] = [
      { instrument: "kick", rating: "great", offsetMs: 0, step: 0, repetition: 0 },
      { instrument: "tom", rating: "miss", offsetMs: null, step: 4, repetition: 0 },
      { instrument: "kick", rating: "good", offsetMs: 20, step: 0, repetition: 1 },
      { instrument: "kick", rating: "great", offsetMs: 0, step: 0, repetition: 1, transition: "landing" },
    ];
    expect(transitionFeedback(hits, 4, 4)).toMatchObject({ groove: "100% hits on time", fill: "0% hits on time", returnGroove: "100% hits on time", landing: "100% hits on time" });
  });

  it("tracks comparable progress across tempos and reports timing, dynamics, and fill returns", () => {
    const pattern: PracticePattern & { meter: string } = { ...fourBeatPattern, id: "groove-fill", beats: 8, meter: "2 bars · 4/4", trainerFillStepRanges: [[4, 8]] };
    const makeRound = (id: string, playedAt: string, bpm: number, accuracy: number, hits: RatedHit[], inputClipped = false): TrainerRound => ({
      id, patternId: pattern.id, patternName: pattern.name, bpm, playedAt, mode: "scored", source: "midi", ratings: [], repetitions: 4,
      result: { id, patternId: pattern.id, patternName: pattern.name, bpm, playedAt, score: accuracy, accuracy, great: 4, good: 2, miss: 1, extra: 0, maxCombo: 4 },
      hits, feel: "straight", limbFocus: "all", adaptation: "standard", inputProfile: "midi:test", inputClipped
    });
    const first = makeRound("first", "2026-10-01T12:00:00.000Z", 80, 65, [
      { instrument: "snare", rating: "great", offsetMs: 20, velocity: 105, velocityTarget: 105, step: 0, repetition: 1 },
      { instrument: "hihat", rating: "miss", offsetMs: null, step: 1, repetition: 1 },
      { instrument: "snare", rating: "great", offsetMs: 0, velocity: 45, velocityTarget: 45, step: 4, repetition: 1, feelZone: "fill" },
      { instrument: "snare", rating: "great", offsetMs: 0, step: 0, repetition: 1, transition: "landing" },
    ]);
    const second = makeRound("second", "2026-10-02T12:00:00.000Z", 90, 85, [
      { instrument: "snare", rating: "great", offsetMs: -8, velocity: 90, velocityTarget: 105, step: 0, repetition: 1 },
      { instrument: "hihat", rating: "good", offsetMs: 12, step: 1, repetition: 1 },
    ]);
    const clipped = makeRound("clipped", "2026-10-03T12:00:00.000Z", 95, 99, [], true);
    const current: TrainerRound = { ...second, id: "current", bpm: 100, result: null, hits: [], playedAt: "2026-10-04T12:00:00.000Z" };

    const summary = summarizeTrainerProgress([first, second, clipped], current, pattern);
    expect(summary.matchingAttemptCount).toBe(2);
    expect(summary.points.map(point => point.accuracy)).toEqual([65, 85]);
    expect(summary.delta).toBe(20);
    expect(summary.metrics.find(metric => metric.id === "tempo")?.points.map(point => point.value)).toEqual([80, 90]);
    expect(summary.metrics.find(metric => metric.id === "timing")?.points.map(point => point.value)).toEqual([10, 10]);
    expect(summary.metrics.find(metric => metric.id === "dynamics")?.points.map(point => point.value)).toEqual([0, 15]);
    expect(summary.metrics.find(metric => metric.id === "fill-return")?.points.map(point => point.value)).toEqual([50, 100]);
  });
});
