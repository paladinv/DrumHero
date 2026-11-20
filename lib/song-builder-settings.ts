import { DEFAULT_DRUM_MIX, type DrumMixSettings } from "./audio";
import type { NotationOptions } from "./song-builder-notation";
import { SONG_INSTRUMENTS as ALL_SONG_INSTRUMENTS, type SongInstrument } from "./types";

export const SONG_BUILDER_SETTINGS_KEY = "drum-hero:song-builder-settings:v1";
export const SONG_INSTRUMENTS: SongInstrument[] = ALL_SONG_INSTRUMENTS;
export const DEFAULT_MIDI_NOTES: Record<SongInstrument, number> = Object.fromEntries([
  ["kick",36],["rimshot",37],["snare",38],["hihat",42],["openhat",46],["tom",50],["crash",49],["ride",51],["cowbell",56],["shaker",82],["tambourine",54],
  ...Array.from({length:8},(_,index)=>[`custom${index+1}`,60+index])
]) as Record<SongInstrument, number>;

export type SongBuilderKitPreset = { id: string; name: string; mix: DrumMixSettings; sampleSnapshotId?: string };
export type SongBuilderMidiControlAction = "toggle-play" | "stop" | "toggle-loop" | "toggle-metronome" | "toggle-count-in" | "previous-measure" | "next-measure";
export type SongBuilderMidiControlBinding = { id: string; action: SongBuilderMidiControlAction; message: "note" | "control-change"; number: number; channel: number };
export type SongBuilderMidiMapPreset = { id: string; name: string; notes: Record<SongInstrument, number> };
export type SongBuilderProjectChecklistItem = { id: string; label: string; done: boolean; custom?: boolean };
export type SongBuilderMicrotimingPreset = { id: string; name: string; points: Array<{ voice: SongInstrument; phase: number; offsetMs: number }> };
export type SongBuilderPerformancePreset = { id: string; name: string; bpm: number; mix: DrumMixSettings; playDrums: boolean; metronome: boolean; loop: boolean; countInBeats: number; metronomeSubdivision: number; rangeStart: number; rangeEnd: number; fractionalLoop?: boolean; loopStart?: number; loopEnd?: number; backingVolume?: number };
export type SongBuilderNotationSettings = NotationOptions;
export type SongBuilderExportPreset = { id: string; name: string; view: "tab" | "staff"; format: "png" | "pdf"; scope: "song" | "section"; paperSize: "letter" | "a4"; orientation: "portrait" | "landscape"; barsPerPage: 4 | 6 | 8; barsPerLine: 1 | 2 | 3 | 4; sectionLineBreaks: boolean; largePrint: boolean; highContrast: boolean };
export type SongBuilderAudioExportSettings = { sampleRate: 44100 | 48000; bitDepth: 16 | 24; normalize: boolean; targetDbfs: number; stemPrefix: string };
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
  midiControlBindings: SongBuilderMidiControlBinding[];
  kitPresets: SongBuilderKitPreset[];
  performancePresets: SongBuilderPerformancePreset[];
  exportPresets: SongBuilderExportPreset[];
  midiMapPresets: SongBuilderMidiMapPreset[];
  microtimingPresets: SongBuilderMicrotimingPreset[];
  projectChecklist: SongBuilderProjectChecklistItem[];
  audioExport: SongBuilderAudioExportSettings;
  midiSeparateTracks: boolean;
  notation: SongBuilderNotationSettings;
};

export const BUILTIN_MIDI_MAP_PRESETS:SongBuilderMidiMapPreset[]=[{id:"gm-standard",name:"General MIDI percussion · DAW standard",notes:DEFAULT_MIDI_NOTES}];

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
  midiControlBindings: [],
  kitPresets: [],
  performancePresets: [],
  exportPresets: [],
  midiMapPresets: [],
  microtimingPresets: [],
  projectChecklist: [
    { id: "structure", label: "Review song structure and section order", done: false },
    { id: "notation", label: "Review the full drum score", done: false },
    { id: "transitions", label: "Check fills and section transitions", done: false },
    { id: "tempo", label: "Rehearse at the target tempo", done: false },
    { id: "mix", label: "Check the kit mix and dynamics", done: false },
    { id: "final-export", label: "Export the final chart or audio", done: false }
  ],
  audioExport: { sampleRate: 44100, bitDepth: 16, normalize: true, targetDbfs: -1, stemPrefix: "drums" },
  midiSeparateTracks: true,
  notation: { barsPerPage: 6, barsPerLine: 2, sectionLineBreaks: false, pageBreakBeforeSections: [], cymbalNoteheads: "cross", showSticking: true, showArticulationMarks: true, staffPositions: { kick: 3, snare: -1, rimshot: -1, tom: -2, hihat: -5, openhat: -5, ride: -4, crash: -6, cowbell: -3, shaker: -7, tambourine: -6, custom1: 0, custom2: 1, custom3: -1, custom4: 2, custom5: 0, custom6: 1, custom7: -1, custom8: 2 }, beamGrouping: "auto" }
};

const boundedNumber = (value: unknown, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Number(value))) : fallback;

export function normalizeDrumMix(input: unknown): DrumMixSettings {
  const value = input && typeof input === "object" ? input as Partial<DrumMixSettings> : {};
  const levels = value.levels && typeof value.levels === "object" ? value.levels as Partial<Record<SongInstrument, number>> : {};
  const pan = value.pan && typeof value.pan === "object" ? value.pan as Partial<Record<SongInstrument, number>> : {};
  const sampleIndex = value.sampleIndex && typeof value.sampleIndex === "object" ? value.sampleIndex as Partial<Record<SongInstrument, number>> : {};
  const pitch = value.pitch && typeof value.pitch === "object" ? value.pitch as Partial<Record<SongInstrument, number>> : {};
  const decay = value.decay && typeof value.decay === "object" ? value.decay as Partial<Record<SongInstrument, number>> : {};
  const muted = value.muted && typeof value.muted === "object" ? value.muted as Partial<Record<SongInstrument, boolean>> : {};
  return {
    levels: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, boundedNumber(levels[voice], DEFAULT_DRUM_MIX.levels[voice], 0, 1)])) as DrumMixSettings["levels"],
    pan: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, boundedNumber(pan[voice], 0, -1, 1)])) as DrumMixSettings["pan"],
    sampleIndex: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, Math.round(boundedNumber(sampleIndex[voice], 0, -1, voice === "tom" || voice === "rimshot" ? 2 : 3))])) as DrumMixSettings["sampleIndex"],
    pitch: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, boundedNumber(pitch[voice], 0, -12, 12)])) as DrumMixSettings["pitch"],
    decay: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, boundedNumber(decay[voice], 1, 0.05, 1)])) as DrumMixSettings["decay"],
    muted: Object.fromEntries(SONG_INSTRUMENTS.map((voice) => [voice, muted[voice] === true])) as DrumMixSettings["muted"],
    solo: SONG_INSTRUMENTS.includes(value.solo as SongInstrument) ? value.solo as SongInstrument : ""
  };
}

export function normalizeSongBuilderSettings(input: unknown): SongBuilderSettings {
  const value = input && typeof input === "object" ? input as Partial<SongBuilderSettings> : {};
  const rawNotation = value.notation && typeof value.notation === "object" ? value.notation as Partial<SongBuilderNotationSettings> : {};
  const rawAudioExport = value.audioExport && typeof value.audioExport === "object" ? value.audioExport as Partial<SongBuilderAudioExportSettings> : {};
  const rawMidi = value.midiNotes && typeof value.midiNotes === "object" ? value.midiNotes as Partial<Record<SongInstrument, number>> : {};
  const kitPresets = Array.isArray(value.kitPresets) ? value.kitPresets.flatMap((preset) => {
    if (!preset || typeof preset !== "object" || typeof preset.id !== "string" || typeof preset.name !== "string") return [];
    const name = preset.name.trim().slice(0, 40);
    if (!name) return [];
    return [{ id: preset.id.slice(0, 100), name, mix: normalizeDrumMix(preset.mix), sampleSnapshotId: typeof preset.sampleSnapshotId === "string" ? preset.sampleSnapshotId.slice(0, 100) : undefined }];
  }).slice(0, 20) : [];
  const controlActions: SongBuilderMidiControlAction[] = ["toggle-play", "stop", "toggle-loop", "toggle-metronome", "toggle-count-in", "previous-measure", "next-measure"];
  const midiControlBindings = Array.isArray(value.midiControlBindings) ? value.midiControlBindings.flatMap(binding => {
    if (!binding || typeof binding !== "object" || typeof binding.id !== "string" || !controlActions.includes(binding.action as SongBuilderMidiControlAction) || !["note", "control-change"].includes(binding.message ?? "")) return [];
    return [{ id: binding.id.slice(0, 100), action: binding.action as SongBuilderMidiControlAction, message: binding.message as "note" | "control-change", number: Math.round(boundedNumber(binding.number, 0, 0, 127)), channel: Math.round(boundedNumber(binding.channel, 0, 0, 16)) }];
  }).slice(0, 14) : [];
  const performancePresets = Array.isArray(value.performancePresets) ? value.performancePresets.flatMap((preset) => {
    if (!preset || typeof preset !== "object" || typeof preset.id !== "string" || typeof preset.name !== "string") return [];
    const name = preset.name.trim().slice(0, 40);
    if (!name) return [];
    return [{ id: preset.id.slice(0, 100), name, bpm: Math.round(boundedNumber(preset.bpm, 80, 40, 200)), mix: normalizeDrumMix(preset.mix), playDrums: preset.playDrums !== false, metronome: preset.metronome === true, loop: preset.loop === true, countInBeats: Math.round(boundedNumber(preset.countInBeats, 4, 0, 8)), metronomeSubdivision: Math.round(boundedNumber(preset.metronomeSubdivision, 1, 1, 4)), rangeStart: Math.round(boundedNumber(preset.rangeStart, 1, 1, 4096)), rangeEnd: Math.round(boundedNumber(preset.rangeEnd, 0, 0, 4096)), fractionalLoop: preset.fractionalLoop===true, loopStart: boundedNumber(preset.loopStart,0,0,4096), loopEnd: boundedNumber(preset.loopEnd,0,0,4096), backingVolume: typeof preset.backingVolume === "number" ? boundedNumber(preset.backingVolume, 0.65, 0, 1) : undefined }];
  }).slice(-20) : [];
  const exportPresets = Array.isArray(value.exportPresets) ? value.exportPresets.flatMap((preset) => {
    if (!preset || typeof preset !== "object" || typeof preset.id !== "string" || typeof preset.name !== "string") return [];
    const name = preset.name.trim().slice(0, 40);
    if (!name) return [];
    return [{ id: preset.id.slice(0, 100), name, view: preset.view === "staff" ? "staff" as const : "tab" as const, format: preset.format === "pdf" ? "pdf" as const : "png" as const, scope: preset.scope === "section" ? "section" as const : "song" as const, paperSize: preset.paperSize === "a4" ? "a4" as const : "letter" as const, orientation: preset.orientation === "portrait" ? "portrait" as const : "landscape" as const, barsPerPage: ([4, 6, 8].includes(preset.barsPerPage) ? preset.barsPerPage : 6) as 4 | 6 | 8, barsPerLine: ([1, 2, 3, 4].includes(preset.barsPerLine) ? preset.barsPerLine : 2) as 1 | 2 | 3 | 4, sectionLineBreaks: preset.sectionLineBreaks === true, largePrint:preset.largePrint===true,highContrast:preset.highContrast===true }];
  }).slice(-20) : [];
  const midiMapPresets = Array.isArray(value.midiMapPresets) ? value.midiMapPresets.flatMap((preset) => {
    if (!preset || typeof preset !== "object" || typeof preset.id !== "string" || typeof preset.name !== "string" || !preset.notes || typeof preset.notes !== "object") return [];
    const name = preset.name.trim().slice(0, 40);
    if (!name) return [];
    const notes = Object.fromEntries(SONG_INSTRUMENTS.map(voice => [voice,Math.round(boundedNumber((preset.notes as Partial<Record<SongInstrument,number>>)[voice],DEFAULT_MIDI_NOTES[voice],0,127))])) as Record<SongInstrument,number>;
    return [{id:preset.id.slice(0,100),name,notes}];
  }).slice(-24) : [];
  const defaultChecklist = DEFAULT_SONG_BUILDER_SETTINGS.projectChecklist;
  const projectChecklist = Array.isArray(value.projectChecklist) ? value.projectChecklist.flatMap(item => item && typeof item === "object" && typeof item.id === "string" && typeof item.label === "string" && item.label.trim() ? [{id:item.id.slice(0,100),label:item.label.trim().slice(0,100),done:item.done===true,custom:item.custom===true||undefined}] : []).slice(0,40) : structuredClone(defaultChecklist);
  const microtimingPresets = Array.isArray(value.microtimingPresets) ? value.microtimingPresets.flatMap((preset) => {
    if (!preset || typeof preset !== "object" || typeof preset.id !== "string" || typeof preset.name !== "string" || !Array.isArray(preset.points)) return [];
    const name = preset.name.trim().slice(0, 40);
    if (!name) return [];
    const points = preset.points.slice(0, 512).flatMap((point) => point && typeof point === "object" && SONG_INSTRUMENTS.includes(point.voice as SongInstrument) && Number.isFinite(point.phase) && Number.isFinite(point.offsetMs) ? [{ voice: point.voice as SongInstrument, phase: boundedNumber(point.phase, 0, 0, 1), offsetMs: boundedNumber(point.offsetMs, 0, -250, 250) }] : []);
    return points.length ? [{ id: preset.id.slice(0, 100), name, points }] : [];
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
    midiControlBindings,
    kitPresets,
    performancePresets,
    exportPresets,
    midiMapPresets,
    microtimingPresets,
    projectChecklist,
    audioExport: { sampleRate: rawAudioExport.sampleRate === 48000 ? 48000 : 44100, bitDepth: rawAudioExport.bitDepth === 24 ? 24 : 16, normalize: rawAudioExport.normalize !== false, targetDbfs: boundedNumber(rawAudioExport.targetDbfs, -1, -12, -0.1), stemPrefix: typeof rawAudioExport.stemPrefix === "string" ? rawAudioExport.stemPrefix.trim().replace(/[^a-z0-9_-]+/gi,"-").slice(0,40) || "drums" : "drums" },
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
      largePrint: rawNotation.largePrint === true,
      highContrast: rawNotation.highContrast === true,
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
