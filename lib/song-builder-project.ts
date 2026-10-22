import { readBuilderArchive } from "./song-builder-backup";
import { normalizeSong, type DrumSong } from "./song-library";
import { normalizeDrumMix, normalizeSongBuilderSettings, type SongBuilderSettings } from "./song-builder-settings";
import type { SongInstrument } from "./types";

export type EmbeddedCustomSample = { name: string; type: string; base64: string };
export type SongBuilderProjectFile = {
  format: "drum-hero-song";
  version: 1;
  song: DrumSong;
  mix: SongBuilderSettings["mix"];
  midiNotes: Record<SongInstrument, number>;
  notation?: SongBuilderSettings["notation"];
  workspace?: import("./song-builder-backup").BuilderArchive;
  customSamples?: Partial<Record<SongInstrument, EmbeddedCustomSample>>;
};

const voices: SongInstrument[] = ["kick", "snare", "hihat", "openhat", "ride", "rimshot", "tom", "crash", "cowbell", "shaker", "tambourine", "custom1", "custom2", "custom3", "custom4"];
export const MAX_PROJECT_SAMPLE_BYTES = 24 * 1024 * 1024;
const MAX_SAMPLE_BYTES = 12 * 1024 * 1024;

export function makeSongProjectFile(song: DrumSong, settings: SongBuilderSettings, customSamples: Partial<Record<SongInstrument, EmbeddedCustomSample>> = {}): SongBuilderProjectFile {
  return { format: "drum-hero-song", version: 1, song: structuredClone(song), mix: structuredClone(settings.mix), midiNotes: { ...settings.midiNotes }, notation: structuredClone(settings.notation), ...(Object.keys(customSamples).length ? { customSamples: structuredClone(customSamples) } : {}) };
}

export function readSongProjectFile(input: unknown): SongBuilderProjectFile | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<SongBuilderProjectFile>;
  if (value.format !== "drum-hero-song" || value.version !== 1) return null;
  const song = normalizeSong(value.song);
  if (!song) return null;
  const customSamples: Partial<Record<SongInstrument, EmbeddedCustomSample>> = {};
  let totalSampleBytes = 0;
  if (value.customSamples !== undefined) {
    if (!value.customSamples || typeof value.customSamples !== "object" || Array.isArray(value.customSamples)) return null;
    for (const [voice, sample] of Object.entries(value.customSamples)) {
      if (!voices.includes(voice as SongInstrument) || !sample || typeof sample !== "object" ||
          typeof sample.name !== "string" || !sample.name.trim() || sample.name.length > 120 ||
          typeof sample.type !== "string" || !sample.type.startsWith("audio/") || sample.type.length > 100 ||
          typeof sample.base64 !== "string" || sample.base64.length > 16 * 1024 * 1024 || sample.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(sample.base64)) return null;
      const estimatedBytes = Math.floor(sample.base64.length * 3 / 4) - (sample.base64.endsWith("==") ? 2 : sample.base64.endsWith("=") ? 1 : 0);
      if (estimatedBytes < 1 || estimatedBytes > MAX_SAMPLE_BYTES) return null;
      totalSampleBytes += estimatedBytes;
      if (totalSampleBytes > MAX_PROJECT_SAMPLE_BYTES) return null;
      customSamples[voice as SongInstrument] = { name: sample.name.slice(0, 120), type: sample.type, base64: sample.base64 };
    }
  }
  let workspace: SongBuilderProjectFile['workspace'];
  try { workspace = readBuilderArchive(value.workspace); } catch { return null; }
  return {
    ...(workspace ? { workspace } : {}),
    format: "drum-hero-song",
    version: 1,
    song: { ...song, id: crypto.randomUUID(), bundled: false },
    mix: normalizeDrumMix(value.mix),
    notation: normalizeSongBuilderSettings({ notation:value.notation }).notation,
    midiNotes: normalizeSongBuilderSettings({ midiNotes: value.midiNotes }).midiNotes,
    ...(Object.keys(customSamples).length ? { customSamples } : {})
  };
}
