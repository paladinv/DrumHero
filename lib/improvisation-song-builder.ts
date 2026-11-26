import { DEFAULT_SONG_BUILDER_SETTINGS } from "./song-builder-settings";
import { makeSongProjectFile, type SongBuilderProjectFile } from "./song-builder-project";
import { meterBeats } from "./song-builder";
import { newSong } from "./song-library";
import { improvisationPhraseSettings, isSwing, meterParts, phraseDuration, playerPhraseStart, stepDuration, type ImprovisationTake } from "./improvisation";
import type { DrumPart, SongSection } from "./song-library";
import type { SongHitArticulation, SongInstrument } from "./types";

export const IMPROVISATION_SONG_TRANSFER_KEY = "drum-hero:improvisation-song-transfer:v1";

/** Builds a Song Builder project whose phrase patterns remain individually editable. */
export function createImprovisationSongProject(take: ImprovisationTake): SongBuilderProjectFile {
  if (!take.hits.length) throw new Error("This take has no captured drum hits to send to Song Builder.");
  if (take.phrases > 256) throw new Error("Song Builder can import up to 256 phrases in one section. Save or repeat a shorter take and send it again.");

  const createdAt = new Date().toISOString();
  const song = newSong(take.name.trim().slice(0, 100) || "Improvisation take", "Drum Hero practice");
  song.bpm = take.settings.bpm;
  song.meter = take.settings.meter;
  song.tags = ["improvisation", "original", take.settings.mode];
  song.notes = "Imported from a Drum Hero improvisation take. Phrase patterns are editable; timing has been placed on the nearest available drum grid. No microphone audio is included.";

  const parts: DrumPart[] = [];
  const clips: NonNullable<SongSection["clips"]> = [];
  for (let phrase = 0; phrase < take.phrases; phrase += 1) {
    const settings = improvisationPhraseSettings(take.settings, phrase);
    const { stepsPerBar } = meterParts(settings);
    const sourceStart = playerPhraseStart(take.settings, phrase);
    const sourceEnd = sourceStart + phraseDuration(settings);
    const subdivision: DrumPart["subdivision"] = settings.subdivision === "triplet" ? 12 : 16;
    const gridScale = subdivision / 16;
    const mapped = take.hits.flatMap(hit => {
      if (hit.atMs < sourceStart || hit.atMs >= sourceEnd) return [];
      const rawStep = (hit.atMs - sourceStart) / stepDuration(settings);
      const step = Math.max(0, Math.min(Math.ceil(stepsPerBar * settings.bars * gridScale) - 1, Math.round(rawStep * gridScale)));
      const instrument = hit.instrument as SongInstrument;
      const articulation: SongHitArticulation | undefined = hit.articulation === "foot-splash" ? "foot-splash" : undefined;
      return [{ step, instrument, velocity: hit.velocity, accent: (hit.velocity ?? 0) >= 108, ghost: (hit.velocity ?? 127) < 45, ...(articulation ? { articulation } : {}) }];
    });

    const unique = new Map<string, typeof mapped[number]>();
    for (const hit of mapped) {
      const key = `${hit.step}:${hit.instrument}`;
      const previous = unique.get(key);
      unique.set(key, previous ? { ...previous, velocity: Math.max(previous.velocity ?? 86, hit.velocity ?? 86), accent: previous.accent || hit.accent, ghost: previous.ghost && hit.ghost } : hit);
    }
    const beats = Number((settings.bars * meterBeats(settings.meter)).toFixed(2));
    const partId = crypto.randomUUID();
    const part: DrumPart = {
      id: partId,
      name: `Phrase ${phrase + 1}`,
      bpm: settings.bpm,
      beats,
      subdivision,
      meter: settings.meter,
      notes: `Imported phrase ${phrase + 1} from ${take.name}. ${isSwing(settings) ? `Swing feel (${settings.swingRatio}%). ` : ""}Timing was quantized to the ${subdivision === 12 ? "triplet" : "sixteenth-note"} grid; adjust notes and timing in Song Builder.`,
      hits: [...unique.values()].sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument)).slice(0, 256),
    };
    parts.push(part);
    clips.push({ id: crypto.randomUUID(), partId, repeats: 1 });
  }
  const firstPhrase = improvisationPhraseSettings(take.settings, 0);
  song.sections = [{
    id: crypto.randomUUID(),
    name: "Improvisation take",
    kind: "verse",
    notes: "Each phrase is its own editable drum pattern in this section. Generated drum notes only; no microphone audio is included.",
    bpm: firstPhrase.bpm,
    meter: firstPhrase.meter,
    feel: isSwing(firstPhrase) ? { kind: "swing", amount: firstPhrase.swingRatio } : { kind: "straight", amount: 50 },
    parts,
    clips,
  }];
  song.createdAt = createdAt;
  song.updatedAt = createdAt;
  return makeSongProjectFile(song, DEFAULT_SONG_BUILDER_SETTINGS);
}
