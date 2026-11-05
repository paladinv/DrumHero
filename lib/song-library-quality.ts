import type { DrumPart, DrumSong, SongSection } from "./song-library";

export type SongQualityIssue = {
  id: string;
  severity: "review" | "note";
  title: string;
  detail: string;
  sectionId?: string;
  partId?: string;
};

const parseMeter = (meter?: string) => {
  const match = meter?.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!match) return undefined;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  return numerator > 0 && denominator > 0 ? { numerator, denominator } : undefined;
};

function reviewPart(song: DrumSong, section: SongSection, part: DrumPart): SongQualityIssue[] {
  const issues: SongQualityIssue[] = [];
  const meter = parseMeter(part.meter ?? section.meter ?? song.meter);
  const partMeter = parseMeter(part.meter);
  const sectionMeter = parseMeter(section.meter ?? song.meter);
  const context = { sectionId: section.id, partId: part.id };
  const expectedSteps = part.beats * part.subdivision / 4;

  if (!Number.isInteger(expectedSteps)) {
    issues.push({ id: `${section.id}:${part.id}:grid`, severity: "review", title: "Grid does not land on a full subdivision", detail: `${part.beats} beats at subdivision ${part.subdivision} creates a partial final step. Adjust the beat count or subdivision.`, ...context });
  }

  if (partMeter && sectionMeter && (partMeter.numerator !== sectionMeter.numerator || partMeter.denominator !== sectionMeter.denominator)) {
    issues.push({ id: `${section.id}:${part.id}:meter`, severity: "review", title: "Part and section meters differ", detail: `This part is marked ${part.meter}; its section is ${section.meter ?? song.meter}. Check that the bar length is intentional.`, ...context });
  }

  if (meter && part.beats % meter.numerator !== 0) {
    issues.push({ id: `${section.id}:${part.id}:bar-length`, severity: "note", title: "Part ends partway through a bar", detail: `${part.beats} beats does not make a whole number of ${meter.numerator}/${meter.denominator} bars. This can be intentional for a pickup or short fill.`, ...context });
  }

  if (!part.hits.length) {
    issues.push({ id: `${section.id}:${part.id}:empty`, severity: "review", title: "Part has no hits", detail: "Add drum hits, or keep this part empty only if it is an intentional rest.", ...context });
  }

  const handGroups = new Map<string, number>();
  const outOfBounds = part.hits.filter(hit => hit.step < 0 || hit.step >= expectedSteps);
  if (outOfBounds.length) {
    issues.push({ id: `${section.id}:${part.id}:bounds`, severity: "review", title: "Hits fall outside the part grid", detail: `${outOfBounds.length} hit${outOfBounds.length === 1 ? " is" : "s are"} beyond the ${Math.floor(expectedSteps)} available steps.`, ...context });
  }
  for (const hit of part.hits) {
    if (!hit.sticking) continue;
    const key = `${hit.step}:${hit.sticking}`;
    handGroups.set(key, (handGroups.get(key) ?? 0) + 1);
  }
  const sharedHandSteps = [...handGroups.entries()].filter(([, count]) => count > 1).map(([key]) => Number(key.split(":")[0])).sort((a, b) => a - b);
  if (sharedHandSteps.length) {
    const firstBeat = sharedHandSteps[0] * 4 / part.subdivision + 1;
    issues.push({ id: `${section.id}:${part.id}:sticking`, severity: "note", title: "Check simultaneous sticking", detail: `Multiple hits assign the same hand to the same step. First occurrence is near beat ${Number.isInteger(firstBeat) ? firstBeat : firstBeat.toFixed(2)}; this may be intentional, but review the sticking.`, ...context });
  }
  return issues;
}

export function reviewSongArrangement(song: DrumSong): SongQualityIssue[] {
  const issues: SongQualityIssue[] = [];
  if (!song.sections.length) {
    issues.push({ id: "song:sections", severity: "review", title: "Song has no sections", detail: "Add at least one arrangement section before practicing or preparing a setlist." });
  }

  for (const section of song.sections) {
    if (!section.parts.length) {
      issues.push({ id: `${section.id}:parts`, severity: "review", title: `${section.name} has no drum parts`, detail: "Add a part or remove this empty section before using it in a setlist.", sectionId: section.id });
    }
    for (const part of section.parts) issues.push(...reviewPart(song, section, part));
    for (const clip of section.clips ?? []) {
      if (!section.parts.some(part => part.id === clip.partId)) {
        issues.push({ id: `${section.id}:clip:${clip.id}`, severity: "review", title: `${section.name} uses a missing part`, detail: "A repeated arrangement clip points to a part that no longer exists. Review the section playback order.", sectionId: section.id });
      }
    }
  }

  const source = song.source;
  if (source && Object.values(source).some(value => typeof value === "string" && value.trim())) {
    if (!source.url.trim()) issues.push({ id: "song:source-url", severity: "review", title: "Source details have no URL", detail: "Add the source page URL or clear the source fields if they are not needed." });
    if (!source.attribution.trim()) issues.push({ id: "song:attribution", severity: "review", title: "Attribution is missing", detail: "Add the credited source or rights holder before sharing this arrangement." });
    if (!source.authorization.trim()) issues.push({ id: "song:authorization", severity: "review", title: "Authorization status is missing", detail: "Record the permission, license, or other basis for using this material. Drum Hero does not verify rights." });
  }
  return issues;
}

export const NATIVE_SONG_VOICES = ["kick", "snare", "hihat", "tom", "crash"] as const;

export function nativeSongVoiceCompatibility(song: DrumSong) {
  const supported = new Set<string>(NATIVE_SONG_VOICES);
  const voices = new Map<string, Map<string, { sectionId: string; partId: string; label: string }>>();
  for (const section of song.sections) for (const part of section.parts) for (const hit of part.hits) {
    if (supported.has(hit.instrument)) continue;
    const locations = voices.get(hit.instrument) ?? new Map<string, { sectionId: string; partId: string; label: string }>();
    locations.set(`${section.id}:${part.id}`, { sectionId: section.id, partId: part.id, label: `${section.name} / ${part.name}` });
    voices.set(hit.instrument, locations);
  }
  return [...voices.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([voice, locations]) => ({ voice, locations: [...locations.values()] }));
}
