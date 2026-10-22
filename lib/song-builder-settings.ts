import { DEFAULT_DRUM_MIX, type DrumMixSettings } from "./audio";
import type { NotationOptions } from "./song-builder-notation";
import type { SongInstrument } from "./types";

export const SONG_BUILDER_SETTINGS_KEY = "drum-hero:song-builder-settings:v1";
export const SONG_INSTRUMENTS: SongInstrument[] = ["kick", "snare", "hihat", "openhat", "ride", "rimshot", "tom", "crash", "cowbell", "shaker", "tambourine", "custom1", "custom2", "custom3", "custom4"];
export const DEFAULT_MIDI_NOTES: Record<SongInstrument, number> = {
  kick: 36, rimshot: 37, snare: 38, hihat: 42, openhat: 46, tom: 50, crash: 49, ride: 51, cowbell: 56, shaker: 82, tambourine: 54, custom1: 60, custom2: 61, custom3: 62, custom4: 63
};

export type SongBuilderKitPreset = { id: string; name: string; mix: DrumMixSettings };
export type SongBuilderPerformancePreset = { id: string; name: string; bpm: number; mix: DrumMixSettings; playDrums: boolean; metronome: boolean; loop: boolean; countInBeats: number; metronomeSubdivision: number; rangeStart: number; rangeEnd: number; fractionalLoop?: boolean; loopStart?: number; loopEnd?: number; backingVolume?: number };
export type SongBuilderNotationSettings = NotationOptions;
export type SongBuilderSettings = {
  mix: DrumMixSettings;
  midiNotes: Record<SongInstrument, number>;
  swing: number;
  humanizeAmount: number;
  humanizeVelocityAmount: number;
  humanizeSeed: number;
  practiceTempoStep: number;
  practiceLoopsPerStep: number;
  practiceTargetBpm: number;
  midiInputId: string;
  midiLatencyMs: number;
  kitPresets: SongBuilderKitPreset[];
  performancePresets: SongBuilderPerformancePreset[];
  midiSeparateTracks: boolean;
  notation: SongBuilderNotationSettings;
};

export const DEFAULT_SONG_BUILDER_SETTINGS: SongBuilderSettings = {
  mix: DEFAULT_DRUM_MIX,
  midiNotes: DEFAULT_MIDI_NOTES,
  swing: 50,
  humanizeAmount: 0,
  humanizeVelocityAmount: 0,
  humanizeSeed: 1729,
  practiceTempoStep: 0,
  practiceLoopsPerStep: 2,
  practiceTargetBpm: 160,
  midiInputId: "",
  midiLatencyMs: 0,
  kitPresets: [],
  performancePresets: [],
  midiSeparateTracks: true,
  notation: { barsPerPage: 6, barsPerLine: 2, sectionLineBreaks: false, pageBreakBeforeSections: [], cymbalNoteheads: "cross", showSticking: true, showArticulationMarks: true, staffPositions: { kick: 3, snare: -1, rimshot: -1, tom: -2, hihat: -5, openhat: -5, ride: -4, crash: -6, cowbell: -3, shaker: -7, tambourine: -6, custom1: 0, custom2: 1, custom3: -1, custom4: 2 }, beamGrouping: "auto" }
};

const boundedNumber = (value: unknown, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Number(value))) : fallback;

export function normalizeDrumMix(input: unknown): DrumMixSettings {
  const value = input && typeof input === "object" ? input as Partial<DrumMixSettings> : {};
  const levels = value.levels && typeof value.levels === "object" ? value.levels as Partial<Record<SongInstrument, number>> : {};
  const pan = value.pan && typeof value.pan === "object" ? value.pan as Partial<Record<SongInstrument, number>> : {};
  const sampleIndex = value.sampleIndex && typeof value.sampleIndex === "object" ? value.sampleIndex as Partial<Record<SongInstrument, number>> : {};
  const muted = value.muted && typeof value.muted === "object" ? value.muted as Partial<Record<SongInstrument, boolean>> : {};
  return {
    levels: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, boundedNumber(levels[voice], DEFAULT_DRUM_MIX.levels[voice], 0, 1)])) as DrumMixSettings["levels"],
    pan: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, boundedNumber(pan[voice], 0, -1, 1)])) as DrumMixSettings["pan"],
    sampleIndex: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, Math.round(boundedNumber(sampleIndex[voice], 0, -1, voice === "tom" || voice === "rimshot" ? 2 : 3))])) as DrumMixSettings["sampleIndex"],
    muted: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, muted[voice] === true])) as DrumMixSettings["muted"],
    solo: SONG_INSTRUMENTS.includes(value.solo as SongInstrument) ? value.solo as SongInstrument : ""
  };
}

export function normalizeSongBuilderSettings(input: unknown): SongBuilderSettings {
  const value = input && typeof input === "object" ? input as Partial<SongBuilderSettings> : {};
  const rawNotation = value.notation && typeof value.notation === "object" ? value.notation as Partial<SongBuilderNotationSettings> : {};
  const rawMidi = value.midiNotes && typeof value.midiNotes === "object" ? value.midiNotes as Partial<Record<SongInstrument, number>> : {};
  const kitPresets = Array.isArray(value.kitPresets) ? value.kitPresets.flatMap((preset) => {
    if (!preset || typeof preset !== "object" || typeof preset.id !== "string" || typeof preset.name !== "string") return [];
    const name = preset.name.trim().slice(0, 40);
    if (!name) return [];
    return [{ id: preset.id.slice(0, 100), name, mix: normalizeDrumMix(preset.mix) }];
  }).slice(0, 20) : [];
  const performancePresets = Array.isArray(value.performancePresets) ? value.performancePresets.flatMap((preset) => {
    if (!preset || typeof preset !== "object" || typeof preset.id !== "string" || typeof preset.name !== "string") return [];
    const name = preset.name.trim().slice(0, 40);
    if (!name) return [];
    return [{ id: preset.id.slice(0, 100), name, bpm: Math.round(boundedNumber(preset.bpm, 80, 40, 200)), mix: normalizeDrumMix(preset.mix), playDrums: preset.playDrums !== false, metronome: preset.metronome === true, loop: preset.loop === true, countInBeats: Math.round(boundedNumber(preset.countInBeats, 4, 0, 8)), metronomeSubdivision: Math.round(boundedNumber(preset.metronomeSubdivision, 1, 1, 4)), rangeStart: Math.round(boundedNumber(preset.rangeStart, 1, 1, 4096)), rangeEnd: Math.round(boundedNumber(preset.rangeEnd, 0, 0, 4096)), fractionalLoop: preset.fractionalLoop===true, loopStart: boundedNumber(preset.loopStart,0,0,4096), loopEnd: boundedNumber(preset.loopEnd,0,0,4096), backingVolume: typeof preset.backingVolume === "number" ? boundedNumber(preset.backingVolume, 0.65, 0, 1) : undefined }];
  }).slice(-20) : [];
  return {
    mix: normalizeDrumMix(value.mix),
    midiNotes: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, Math.round(boundedNumber(rawMidi[voice], DEFAULT_MIDI_NOTES[voice], 0, 127))])) as Record<SongInstrument, number>,
    swing: Math.round(boundedNumber(value.swing, 50, 50, 75)),
    humanizeAmount: Math.round(boundedNumber(value.humanizeAmount, 0, 0, 100)),
    humanizeVelocityAmount: Math.round(boundedNumber(value.humanizeVelocityAmount, boundedNumber(value.humanizeAmount,0,0,100), 0, 100)),
    humanizeSeed: Math.round(boundedNumber(value.humanizeSeed, 1729, 0, 2_147_483_647)),
    practiceTempoStep: Math.round(boundedNumber(value.practiceTempoStep, 0, 0, 12)),
    practiceLoopsPerStep: Math.round(boundedNumber(value.practiceLoopsPerStep, 2, 1, 32)),
    practiceTargetBpm: Math.round(boundedNumber(value.practiceTargetBpm, 160, 40, 200)),
    midiInputId: typeof value.midiInputId === "string" ? value.midiInputId.slice(0, 200) : "",
    midiLatencyMs: Math.round(boundedNumber(value.midiLatencyMs, 0, -250, 500)),
    kitPresets,
    performancePresets,
    midiSeparateTracks: value.midiSeparateTracks !== false,
    notation: {
      paperSize: rawNotation.paperSize === 'a4' ? 'a4' : 'letter',
      orientation: rawNotation.orientation === 'portrait' ? 'portrait' : 'landscape',
      barsPerPage: ([4, 6, 8].includes(rawNotation.barsPerPage ?? 0) ? rawNotation.barsPerPage : 6) as SongBuilderNotationSettings["barsPerPage"],
      barsPerLine: ([1,2,3,4].includes(rawNotation.barsPerLine??0)?rawNotation.barsPerLine:2) as 1|2|3|4,
      sectionLineBreaks: rawNotation.sectionLineBreaks === true,
      pageBreakBeforeSections: Array.isArray(rawNotation.pageBreakBeforeSections) ? rawNotation.pageBreakBeforeSections.filter((id): id is string => typeof id === 'string').slice(0,32) : [],
      cymbalNoteheads: rawNotation.cymbalNoteheads === "diamond" ? "diamond" : "cross",
      showSticking: rawNotation.showSticking !== false,
      showArticulationMarks: rawNotation.showArticulationMarks !== false,
      staffPositions: Object.fromEntries(SONG_INSTRUMENTS.map(voice => [voice, Math.round(boundedNumber(rawNotation.staffPositions?.[voice], DEFAULT_SONG_BUILDER_SETTINGS.notation.staffPositions?.[voice] ?? 0, -8, 8))])) as SongBuilderNotationSettings["staffPositions"],
      beamGrouping: ["auto", "2", "3", "4", "off"].includes(rawNotation.beamGrouping ?? "") ? rawNotation.beamGrouping as SongBuilderNotationSettings["beamGrouping"] : "auto"
    }
  };
}

export function readSongBuilderSettings(): SongBuilderSettings {
  if (typeof window === "undefined") return DEFAULT_SONG_BUILDER_SETTINGS;
  try {
    return normalizeSongBuilderSettings(JSON.parse(window.localStorage.getItem(SONG_BUILDER_SETTINGS_KEY) || "null"));
  } catch {
    return DEFAULT_SONG_BUILDER_SETTINGS;
  }
}

export function writeSongBuilderSettings(settings: SongBuilderSettings) {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(SONG_BUILDER_SETTINGS_KEY, JSON.stringify(normalizeSongBuilderSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
