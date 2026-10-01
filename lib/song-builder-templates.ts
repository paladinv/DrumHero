import { makeBlankPart } from "./song-builder";
import type { DrumSong, SongSection } from "./song-library";

export type ArrangementTemplateId = "pop-form" | "verse-chorus" | "12-bar-blues";
export const ARRANGEMENT_TEMPLATES: Array<{ id: ArrangementTemplateId; label: string; description: string }> = [
  { id: "pop-form", label: "Pop song", description: "Intro · verse · chorus · verse · chorus · outro" },
  { id: "verse-chorus", label: "Short verse + chorus", description: "Two verses and two choruses" },
  { id: "12-bar-blues", label: "12-bar blues", description: "I · IV · I · V · IV · turnaround" }
];

function section(song: DrumSong, name: string, kind: SongSection["kind"], bars: number, notes = "") {
  const part = makeBlankPart(`${name} groove`, "4/4", song.bpm);
  const sectionId = crypto.randomUUID();
  return {
    id: sectionId,
    name,
    kind,
    notes,
    parts: [part],
    clips: [{ id: crypto.randomUUID(), partId: part.id, repeats: bars }],
    repeats: 1,
    bpm: song.bpm,
    meter: "4/4"
  };
}

export function createArrangementTemplate(song: DrumSong, templateId: ArrangementTemplateId): SongSection[] {
  const items = templateId === "pop-form"
    ? [
        ["Intro", "intro", 2], ["Verse 1", "verse", 4], ["Chorus 1", "chorus", 4],
        ["Verse 2", "verse", 4], ["Chorus 2", "chorus", 4], ["Outro", "outro", 2]
      ] as const
    : templateId === "verse-chorus"
      ? [["Verse 1", "verse", 4], ["Chorus 1", "chorus", 4], ["Verse 2", "verse", 4], ["Chorus 2", "chorus", 4]] as const
      : [["I · bars 1–4", "verse", 4], ["IV · bars 5–6", "bridge", 2], ["I · bars 7–8", "verse", 2], ["V · bar 9", "other", 1], ["IV · bar 10", "bridge", 1], ["Turnaround · bars 11–12", "fill", 2]] as const;
  return items.map(([name, kind, bars]) => section(song, name, kind, bars, templateId === "12-bar-blues" ? `12-bar form · ${bars} ${bars === 1 ? "bar" : "bars"}` : ""));
}
