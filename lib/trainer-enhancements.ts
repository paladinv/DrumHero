import type { Groove, PracticePattern } from "./types";
import { parseCustomGrooves } from "./custom-grooves";

export type TrainerSetupTransfer = {
  version: 1;
  patternId: string;
  bpm: number;
  repetitions: 4 | 8 | 10 | 16;
  countInBeats: 1 | 2 | 4;
  trainerMode: "self" | "scored";
  source: "keyboard" | "touch" | "midi" | "audio-timing" | "audio-voices";
  audioVoice: "kick" | "snare" | "hihat" | "tom" | "crash";
  tempoBuild: boolean;
  tempoLadder: boolean;
  tempoStep: 2 | 5 | 10;
  tempoTarget: 70 | 80 | 90 | 95;
  tempoFailure: "repeat" | "lower";
  pathAccuracyTarget: 70 | 80 | 85 | 90 | 95;
  pathTimingTarget: 25 | 35 | 50 | 75;
  loopEnabled: boolean;
  loopStartBeat: number;
  loopEndBeat: number;
  fillPractice: boolean;
  fillPatternId: string;
  fillAfterBars: 1 | 2 | 4;
  handPattern: "alternating" | "paradiddle" | "double-strokes";
  leadHand: "R" | "L";
  spokenCount: "off" | "beats" | "subdivisions";
  dynamicsPractice: boolean;
  practicePathId: string;
  customPatterns?: Groove[];
};

const repetitions = [4, 8, 10, 16];
const countIns = [1, 2, 4];
const sources = ["keyboard", "touch", "midi", "audio-timing", "audio-voices"];
const voices = ["kick", "snare", "hihat", "tom", "crash"];

export function createTrainerLoopPattern(pattern: PracticePattern, startBeat: number, endBeat: number): PracticePattern {
  const stepsPerBeat = pattern.subdivision / 4;
  const totalSteps = Math.round(pattern.beats * stepsPerBeat);
  const safeStartBeat = Math.max(1, Math.min(pattern.beats, startBeat));
  const safeEndBeat = Math.max(safeStartBeat, Math.min(pattern.beats, endBeat));
  const startStep = Math.max(0, Math.min(totalSteps - 1, Math.round((safeStartBeat - 1) * stepsPerBeat)));
  const endStep = Math.max(startStep + 1, Math.min(totalSteps, Math.round(safeEndBeat * stepsPerBeat)));
  const beats = (endStep - startStep) / stepsPerBeat;
  const rangeLabel = `${formatBeat(safeStartBeat)}–${formatBeat(safeEndBeat)}`;
  const originalMeter = "meter" in pattern && typeof pattern.meter === "string" ? pattern.meter : "";
  const originalBarCount = Math.max(1, Number(originalMeter.match(/^(\d+)\s+bars?\b/i)?.[1] ?? 1));
  const beatsPerBar = pattern.beats / originalBarCount;
  const selectedBarCount = beats / beatsPerBar;
  const meterSuffix = originalMeter.replace(/^\d+\s+bars?\s*·\s*/i, "");
  const loopMeter = Number.isInteger(selectedBarCount) && selectedBarCount > 0
    ? `${selectedBarCount} ${selectedBarCount === 1 ? "bar" : "bars"}${meterSuffix ? ` · ${meterSuffix}` : ""}`
    : `${rangeLabel} beat loop`;
  return {
    ...pattern,
    ...(originalMeter ? { meter: loopMeter } : {}),
    id: `loop:${encodeURIComponent(pattern.id)}:${startStep}-${endStep}`,
    name: `${pattern.name} · beats ${rangeLabel}`.slice(0, 100),
    description: `Loop beats ${rangeLabel} of ${pattern.name}.`,
    beats,
    hits: pattern.hits
      .filter((hit) => hit.step >= startStep && hit.step < endStep)
      .map((hit) => ({ ...hit, step: hit.step - startStep }))
  };
}

export function createTrainerSetupTransfer(settings: TrainerSetupTransfer): string {
  return JSON.stringify({ application: "Drum Hero", type: "trainer-setup", ...settings }, null, 2);
}

export function parseTrainerSetupTransfer(raw: string, validPatternIds: Set<string>): TrainerSetupTransfer {
  const value = JSON.parse(raw) as Partial<TrainerSetupTransfer> & { application?: unknown; type?: unknown };
  const normalized = { ...value, tempoTarget: value.tempoTarget ?? 90, tempoFailure: value.tempoFailure ?? "repeat", pathAccuracyTarget: value.pathAccuracyTarget ?? 85, pathTimingTarget: value.pathTimingTarget ?? 35 };
  const rawCustomPatterns = Array.isArray(normalized.customPatterns) ? normalized.customPatterns : [];
  const customPatterns = parseCustomGrooves(JSON.stringify(rawCustomPatterns));
  const validIds = new Set([...validPatternIds, ...customPatterns.map((pattern) => pattern.id)]);
  const definitionsValid = rawCustomPatterns.length <= 100 && customPatterns.length === rawCustomPatterns.length;
  const valid = value.application === "Drum Hero" && value.type === "trainer-setup" && value.version === 1 &&
    definitionsValid && typeof value.patternId === "string" && validIds.has(value.patternId) &&
    Number.isFinite(value.bpm) && Number(value.bpm) >= 40 && Number(value.bpm) <= 220 &&
    repetitions.includes(Number(value.repetitions)) && countIns.includes(Number(value.countInBeats)) &&
    (value.trainerMode === "self" || value.trainerMode === "scored") && sources.includes(String(value.source)) && voices.includes(String(value.audioVoice)) &&
    typeof value.tempoBuild === "boolean" && typeof value.tempoLadder === "boolean" && [2, 5, 10].includes(Number(value.tempoStep)) &&
    [70, 80, 90, 95].includes(Number(normalized.tempoTarget)) && (normalized.tempoFailure === "repeat" || normalized.tempoFailure === "lower") &&
    [70, 80, 85, 90, 95].includes(Number(normalized.pathAccuracyTarget)) && [25, 35, 50, 75].includes(Number(normalized.pathTimingTarget)) &&
    typeof value.loopEnabled === "boolean" && Number.isFinite(value.loopStartBeat) && Number(value.loopStartBeat) >= 1 &&
    Number.isFinite(value.loopEndBeat) && Number(value.loopEndBeat) >= Number(value.loopStartBeat) &&
    typeof value.fillPractice === "boolean" && typeof value.fillPatternId === "string" &&
    (!value.fillPatternId || validIds.has(value.fillPatternId)) && [1, 2, 4].includes(Number(value.fillAfterBars)) &&
    ["alternating", "paradiddle", "double-strokes"].includes(String(value.handPattern)) &&
    (value.leadHand === "R" || value.leadHand === "L") && ["off", "beats", "subdivisions"].includes(String(value.spokenCount)) &&
    typeof value.dynamicsPractice === "boolean" && typeof value.practicePathId === "string" && value.practicePathId.length <= 100;
  if (!valid) throw new Error("This Trainer setup is incomplete, unsupported, or refers to patterns that are not in your library.");
  return { ...normalized, customPatterns } as TrainerSetupTransfer;
}

export const TRAINER_PRACTICE_PATHS = [
  { id: "backbeat", name: "Backbeat foundations", patternIds: ["quarter-pulse", "first-beat", "two-beat-rock", "straight-pop", "kick-pickup-intro"] },
  { id: "fills", name: "Fills: pulse to orchestration", patternIds: ["fill-quarter-note-snare", "fill-eighth-note-snare", "fill-beat-four-sixteenths", "fill-last-two-beats-sixteenths", "fill-linear-kick-snare-tom"] },
  { id: "odd-meter", name: "Odd meter: 5/4 to 9/8", patternIds: ["five-four-drive", "seven-eight-group", "five-four-two-three", "nine-eight-grouping"] },
  { id: "dynamics", name: "Dynamics: accents and control", patternIds: ["two-bar-hat-dynamics", "disco-open-hat", "jazz-swing", "four-over-three-accent"] }
] as const;

function formatBeat(beat: number) {
  return Number.isInteger(beat) ? String(beat) : beat.toFixed(1);
}
