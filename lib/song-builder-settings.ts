import { DEFAULT_DRUM_MIX, type DrumMixSettings } from "./audio";
import type { SongInstrument } from "./types";

export const SONG_BUILDER_SETTINGS_KEY = "drum-hero:song-builder-settings:v1";
export const SONG_INSTRUMENTS: SongInstrument[] = ["kick", "snare", "hihat", "openhat", "ride", "rimshot", "tom", "crash"];
export const DEFAULT_MIDI_NOTES: Record<SongInstrument, number> = {
  kick: 36, rimshot: 37, snare: 38, hihat: 42, openhat: 46, tom: 50, crash: 49, ride: 51
};

export type SongBuilderKitPreset = { id: string; name: string; mix: DrumMixSettings };
export type SongBuilderNotationSettings = { barsPerPage: 4 | 6 | 8; cymbalNoteheads: "cross" | "diamond"; showSticking: boolean; beamGrouping: "auto" | "2" | "3" | "4" | "off" };
export type SongBuilderSettings = {
  mix: DrumMixSettings;
  midiNotes: Record<SongInstrument, number>;
  humanizeAmount: number;
  humanizeSeed: number;
  practiceTempoStep: number;
  midiInputId: string;
  kitPresets: SongBuilderKitPreset[];
  notation: SongBuilderNotationSettings;
};

export const DEFAULT_SONG_BUILDER_SETTINGS: SongBuilderSettings = {
  mix: DEFAULT_DRUM_MIX,
  midiNotes: DEFAULT_MIDI_NOTES,
  humanizeAmount: 0,
  humanizeSeed: 1729,
  practiceTempoStep: 0,
  midiInputId: "",
  kitPresets: [],
  notation: { barsPerPage: 6, cymbalNoteheads: "cross", showSticking: true, beamGrouping: "auto" }
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
  return {
    mix: normalizeDrumMix(value.mix),
    midiNotes: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, Math.round(boundedNumber(rawMidi[voice], DEFAULT_MIDI_NOTES[voice], 0, 127))])) as Record<SongInstrument, number>,
    humanizeAmount: Math.round(boundedNumber(value.humanizeAmount, 0, 0, 100)),
    humanizeSeed: Math.round(boundedNumber(value.humanizeSeed, 1729, 0, 2_147_483_647)),
    practiceTempoStep: Math.round(boundedNumber(value.practiceTempoStep, 0, 0, 12)),
    midiInputId: typeof value.midiInputId === "string" ? value.midiInputId.slice(0, 200) : "",
    kitPresets,
    notation: {
      barsPerPage: ([4, 6, 8].includes(rawNotation.barsPerPage ?? 0) ? rawNotation.barsPerPage : 6) as SongBuilderNotationSettings["barsPerPage"],
      cymbalNoteheads: rawNotation.cymbalNoteheads === "diamond" ? "diamond" : "cross",
      showSticking: rawNotation.showSticking !== false,
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
