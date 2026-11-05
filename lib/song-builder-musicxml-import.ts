import { normalizeSong, type DrumSong, type SongSection } from "./song-library";
import { SONG_INSTRUMENTS, type SongInstrument } from "./types";
import { cleanMeterLabel, meterBeats } from "./song-builder";

export type MusicXmlSource = { id: string; label: string; count: number; defaultVoice: SongInstrument | null };
export type MusicXmlNote = { measure: number; beat: number; sourceId: string; velocity: number; duration: number };
export type MusicXmlPreview = { title: string; artist: string; measures: Array<{ meter: string; bpm: number; beats: number }>; notes: MusicXmlNote[]; sources: MusicXmlSource[]; warnings: string[] };
export type MusicXmlMapping = Record<string, SongInstrument | "ignore">;

const localChildren = (node: ParentNode, name: string) => Array.from(node.childNodes).filter((child): child is Element => child.nodeType === 1 && (child as Element).localName === name);
const firstChild = (node: ParentNode, name: string) => localChildren(node, name)[0];
const textOf = (node: ParentNode | undefined, name: string) => node ? firstChild(node, name)?.textContent?.trim() ?? "" : "";
const descendantText = (node: ParentNode, name: string) => Array.from(node.querySelectorAll("*" )).find(element => element.localName === name)?.textContent?.trim() ?? "";
const numberOf = (node: Element, name: string, fallback: number) => Number(textOf(node, name)) || fallback;

type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number; flags: number };

async function unpackMusicXmlZip(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const signature = (offset: number, expected: number) => offset >= 0 && offset + 4 <= bytes.length && view.getUint32(offset, true) === expected;
  const searchStart = Math.max(0, bytes.length - 65_557);
  let directoryEnd = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset -= 1) if (signature(offset, 0x06054b50)) { directoryEnd = offset; break; }
  if (directoryEnd < 0) throw new Error("This .mxl archive has no valid ZIP directory.");
  const entryCount = view.getUint16(directoryEnd + 10, true);
  let cursor = view.getUint32(directoryEnd + 16, true);
  if (!entryCount || entryCount > 1024 || cursor >= bytes.length) throw new Error("This .mxl archive has an invalid file list.");
  const entries: ZipEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (!signature(cursor, 0x02014b50) || cursor + 46 > bytes.length) throw new Error("This .mxl archive has a damaged file list.");
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true), size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const nameStart = cursor + 46, next = nameStart + nameLength + extraLength + commentLength;
    if (next > bytes.length) throw new Error("This .mxl archive has a truncated file name.");
    const name = new TextDecoder((flags & 0x0800) ? "utf-8" : "utf-8", { fatal: false }).decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.push({ name, method, compressedSize, size, offset: view.getUint32(cursor + 42, true), flags });
    cursor = next;
  }
  const readEntry = async (entry: ZipEntry): Promise<string> => {
    if (entry.flags & 1) throw new Error("Password-protected .mxl files are not supported.");
    if (entry.size > 20 * 1024 * 1024) throw new Error("The uncompressed MusicXML score is larger than 20 MB.");
    const local = entry.offset;
    if (!signature(local, 0x04034b50) || local + 30 > bytes.length) throw new Error("This .mxl archive contains a damaged score file.");
    const nameLength = view.getUint16(local + 26, true), extraLength = view.getUint16(local + 28, true);
    const start = local + 30 + nameLength + extraLength, end = start + entry.compressedSize;
    if (end > bytes.length) throw new Error("This .mxl score is truncated.");
    const compressed = bytes.slice(start, end);
    let unpacked: Uint8Array;
    if (entry.method === 0) unpacked = compressed;
    else if (entry.method === 8) {
      if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress .mxl scores. Choose an uncompressed .musicxml file instead.");
      try {
        const data = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        unpacked = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch { throw new Error("Could not decompress the MusicXML score in this .mxl archive."); }
    } else throw new Error(`This .mxl archive uses unsupported compression method ${entry.method}.`);
    if (unpacked.byteLength !== entry.size) throw new Error("The decompressed MusicXML score does not match its declared size.");
    return new TextDecoder("utf-8", { fatal: false }).decode(unpacked);
  };
  const container = entries.find(entry => entry.name.replaceAll("\\", "/").toLowerCase() === "meta-inf/container.xml");
  let scorePath = "";
  if (container) {
    const containerXml = await readEntry(container);
    const doc = new DOMParser().parseFromString(containerXml, "application/xml");
    scorePath = Array.from(doc.getElementsByTagName("*")).find(element => element.localName === "rootfile")?.getAttribute("full-path")?.replaceAll("\\", "/") ?? "";
  }
  const score = entries.find(entry => entry.name.replaceAll("\\", "/") === scorePath) ?? entries.find(entry => /\.(musicxml|xml)$/i.test(entry.name) && !entry.name.toLowerCase().startsWith("meta-inf/"));
  if (!score) throw new Error("The .mxl archive does not contain a MusicXML score.");
  return readEntry(score);
}

/** Read plain MusicXML or the score member of a standard compressed .mxl archive. */
export async function readMusicXmlFile(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose a MusicXML file smaller than 20 MB.");
  if (/\.mxl$/i.test(file.name)) return unpackMusicXmlZip(await file.arrayBuffer());
  return file.text();
}

function voiceFromLabel(label: string, midiNote?: number): SongInstrument | null {
  const text = label.toLowerCase();
  if (/bass drum|kick/.test(text)) return "kick";
  if (/side stick|rim|cross stick/.test(text)) return "rimshot";
  if (/snare/.test(text)) return "snare";
  if (/pedal.*hat|foot.*splash/.test(text)) return "openhat";
  if (/open.*hat/.test(text)) return "openhat";
  if (/closed.*hat|hi.?hat/.test(text)) return "hihat";
  if (/low tom|floor tom|tom/.test(text)) return "tom";
  if (/crash/.test(text)) return "crash";
  if (/ride/.test(text)) return "ride";
  if (/cowbell/.test(text)) return "cowbell";
  if (/shaker/.test(text)) return "shaker";
  if (/tambourine/.test(text)) return "tambourine";
  const gm = midiNote === undefined ? undefined : midiNote - 1;
  const gmMap: Record<number, SongInstrument> = { 35: "kick", 36: "kick", 37: "rimshot", 38: "snare", 40: "snare", 42: "hihat", 44: "openhat", 46: "openhat", 47: "tom", 48: "tom", 50: "tom", 49: "crash", 51: "ride", 52: "crash", 53: "ride", 54: "tambourine", 56: "cowbell", 58: "snare", 82: "shaker" };
  return gm === undefined ? null : gmMap[gm] ?? null;
}

function requireNumber(value: string, name: string, fallback?: number) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  if (fallback !== undefined) return fallback;
  throw new Error(`MusicXML ${name} is missing or invalid.`);
}

/** Parse a standard score-partwise document without executing or importing external resources. */
export function previewMusicXmlImport(xml: string, fallbackTitle = "MusicXML import"): MusicXmlPreview {
  if (xml.length > 20 * 1024 * 1024) throw new Error("Choose a MusicXML file smaller than 20 MB.");
  if (typeof DOMParser === "undefined") throw new Error("MusicXML import requires a modern browser.");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("This MusicXML file has malformed XML.");
  const root = doc.documentElement;
  if (!root || root.localName !== "score-partwise") throw new Error("Choose an uncompressed score-partwise MusicXML file (.musicxml or .xml).");
  const partNames = new Map<string, string>();
  const instrumentNames = new Map<string, string>();
  const midiNotes = new Map<string, number>();
  const partList = Array.from(doc.getElementsByTagName("*" )).find(element => element.localName === "part-list");
  if (partList) for (const part of localChildren(partList, "score-part")) {
    const partId = part.getAttribute("id") ?? "part";
    partNames.set(partId, textOf(part, "part-name") || `Part ${partId}`);
    for (const info of localChildren(part, "score-instrument")) {
      const id = info.getAttribute("id"); if (!id) continue;
      instrumentNames.set(id, textOf(info, "instrument-name") || textOf(info, "instrument-abbreviation") || id);
    }
    for (const info of localChildren(part, "midi-instrument")) {
      const id = info.getAttribute("id"); if (id) midiNotes.set(id, Number(textOf(info, "midi-unpitched")) || 0);
    }
  }
  const sources = new Map<string, MusicXmlSource>();
  const records = new Map<number, { meter: string; bpm: number; beats: number; notes: MusicXmlNote[] }>();
  const warnings: string[] = [];
  const xmlParts = Array.from(root.children).filter(child => child.localName === "part");
  if (!xmlParts.length) throw new Error("The MusicXML score has no parts.");
  let maxMeasure = 0;
  for (const part of xmlParts) {
    const partId = part.getAttribute("id") ?? "part";
    const partLabel = partNames.get(partId) ?? `Part ${partId}`;
    let divisions = 1, meter = "4/4", bpm = 80;
    const measures = localChildren(part, "measure");
    for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
      const measure = measures[measureIndex]!;
      const number = Number(measure.getAttribute("number")) || measureIndex + 1;
      maxMeasure = Math.max(maxMeasure, number);
      const record = records.get(number) ?? { meter, bpm, beats: meterBeats(meter), notes: [] };
      let cursor = 0, previousNoteBeat = 0, maxCursor = 0;
      for (const item of Array.from(measure.children)) {
        if (item.localName === "attributes") {
          const nextDivisions = Number(textOf(item, "divisions")); if (nextDivisions > 0) divisions = nextDivisions;
          const time = firstChild(item, "time");
          if (time) {
            const beatsText = localChildren(time, "beats").map(child => child.textContent?.trim() ?? "").join("+");
            const numerator = beatsText.split("+").reduce((sum, value) => sum + (Number(value) || 0), 0);
            const denominator = Number(textOf(time, "beat-type")) || 4;
            if (numerator > 0 && numerator <= 32 && [2, 4, 8, 16].includes(denominator)) meter = cleanMeterLabel(`${numerator}/${denominator}`);
            else warnings.push(`Measure ${number}: an unsupported time signature was kept as ${meter}.`);
          }
          record.meter = meter; record.beats = meterBeats(meter);
        } else if (item.localName === "direction") {
          const sound = firstChild(item, "sound");
          const tempo = Number(sound?.getAttribute("tempo"));
          if (tempo > 0) { bpm = Math.max(40, Math.min(200, Math.round(tempo))); record.bpm = bpm; }
          const perMinute = Array.from(item.getElementsByTagName("*" )).find(element => element.localName === "per-minute")?.textContent;
          const directionTempo = Number(perMinute);
          if (!tempo && directionTempo > 0) { bpm = Math.max(40, Math.min(200, Math.round(directionTempo))); record.bpm = bpm; }
        } else if (item.localName === "backup") {
          cursor = Math.max(0, cursor - numberOf(item, "duration", 0) / divisions);
        } else if (item.localName === "forward") {
          cursor += numberOf(item, "duration", 0) / divisions; maxCursor = Math.max(maxCursor, cursor);
        } else if (item.localName === "note") {
          const chord = !!firstChild(item, "chord");
          const beat = chord ? previousNoteBeat : cursor;
          const duration = Math.max(0, Number(textOf(item, "duration")) / divisions || 0);
          if (!firstChild(item, "rest") && duration >= 0) {
            const instrument = firstChild(item, "instrument");
            const instrumentId = instrument?.getAttribute("id") ?? "";
            const sourceId = instrumentId ? `${partId}:${instrumentId}` : `${partId}:midi:${textOf(item, "midi-unpitched") || textOf(item, "display-step") || "unknown"}`;
            const label = instrumentNames.get(instrumentId) ?? `${partLabel} · ${instrumentId || "percussion note"}`;
            const rawMidi = instrumentId ? midiNotes.get(instrumentId) : Number(textOf(item, "midi-unpitched")) || undefined;
            const midiNote = rawMidi || undefined;
            const displayLabel = [label, textOf(firstChild(item, "unpitched") ?? item, "display-step"), textOf(firstChild(item, "unpitched") ?? item, "display-octave")].filter(Boolean).join(" ");
            const source = sources.get(sourceId) ?? { id: sourceId, label: displayLabel || label, count: 0, defaultVoice: voiceFromLabel(label, midiNote) ?? voiceFromLabel(partLabel, midiNote) };
            source.count += 1; sources.set(sourceId, source);
            const velocity = Math.max(1, Math.min(127, Math.round(Number(firstChild(item, "sound")?.getAttribute("dynamics")) || (firstChild(item, "accent") ? 112 : 86))));
            record.notes.push({ measure: number, beat, sourceId, velocity, duration });
          }
          if (!chord) { previousNoteBeat = cursor; cursor += duration; maxCursor = Math.max(maxCursor, cursor); }
        }
      }
      record.beats = Math.max(record.beats, maxCursor);
      records.set(number, record);
    }
  }
  if (!maxMeasure || !sources.size) throw new Error("No percussion notes were found in this MusicXML score.");
  const measures = Array.from({ length: maxMeasure }, (_, index) => {
    const record = records.get(index + 1) ?? { meter: "4/4", bpm: 80, beats: 4, notes: [] };
    const meterBeatsValue = meterBeats(record.meter);
    return { meter: record.meter, bpm: record.bpm, beats: Math.max(0.5, Math.min(32, Math.max(meterBeatsValue, record.beats))) };
  });
  if (measures.length > 1024) throw new Error("This score is longer than the 1,024-measure import limit.");
  const notes = [...records.entries()].flatMap(([measure, record]) => record.notes.map(note => ({ ...note, measure }))).slice(0, 20_000);
  if (notes.length === 20_000) warnings.push("Only the first 20,000 percussion notes are included.");
  const unsnappedMeasures = [...new Set(notes.filter(note => ![4, 8, 12, 16, 20].some(subdivision => Math.abs(note.beat - Math.round(note.beat * subdivision / 4) * 4 / subdivision) < 0.015)).map(note => note.measure))];
  if (unsnappedMeasures.length) warnings.push(`Measures ${unsnappedMeasures.slice(0, 12).join(", ")}${unsnappedMeasures.length > 12 ? ", …" : ""} contain note positions finer than the editor grid; those notes will be rounded to the nearest supported step.`);
  const title = descendantText(root, "work-title") || descendantText(root, "movement-title") || fallbackTitle;
  const artist = Array.from(doc.getElementsByTagName("*" )).find(element => element.localName === "creator")?.textContent?.trim() || "MusicXML import";
  const dedupedWarnings = [...new Set(warnings)];
  return { title: title.slice(0, 120), artist: artist.slice(0, 120), measures, notes, sources: [...sources.values()].sort((a, b) => a.label.localeCompare(b.label)), warnings: dedupedWarnings };
}

function supportedSubdivision(beatPositions: number[], beats: number): 4 | 8 | 12 | 16 | 20 {
  const matches = (subdivision: number) => beatPositions.every(beat => Math.abs(beat * subdivision / 4 - Math.round(beat * subdivision / 4)) < 0.015);
  return ([4, 8, 12, 16, 20] as const).filter(value => value === 20 || Number.isInteger(beats * value / 4)).find(matches) ?? 16;
}

export function createSongFromMusicXmlPreview(preview: MusicXmlPreview, mapping: MusicXmlMapping, title = preview.title, artist = preview.artist): { song: DrumSong; noteCount: number; ignoredNoteCount: number } {
  const assigned = preview.notes.flatMap(note => {
    const voice = mapping[note.sourceId] ?? preview.sources.find(source => source.id === note.sourceId)?.defaultVoice ?? "ignore";
    return voice !== "ignore" && SONG_INSTRUMENTS.includes(voice) ? [{ ...note, voice }] : [];
  });
  const segments: Array<{ first: number; last: number; meter: string; bpm: number }> = [];
  let start = 0;
  while (start < preview.measures.length) {
    const first = preview.measures[start]!;
    let end = start, noteCount = 0;
    while (end < preview.measures.length) {
      const measure = preview.measures[end]!;
      const count = assigned.filter(note => note.measure === end + 1).length;
      if (end > start && (measure.meter !== first.meter || measure.bpm !== first.bpm || noteCount + count > 240 || preview.measures.slice(start, end + 1).reduce((sum, item) => sum + item.beats, 0) > 32)) break;
      noteCount += count; end += 1;
    }
    segments.push({ first: start, last: end, meter: first.meter, bpm: first.bpm }); start = end;
  }
  const sections: SongSection[] = segments.slice(0, 32).map((segment, sectionIndex) => {
    const measureRows = preview.measures.slice(segment.first, segment.last);
    const measureStarts: number[] = []; let totalBeats = 0;
    measureRows.forEach(row => { measureStarts.push(totalBeats); totalBeats += row.beats; });
    const localNotes = assigned.filter(note => note.measure > segment.first && note.measure <= segment.last);
    const positions = localNotes.map(note => measureStarts[note.measure - segment.first - 1]! + note.beat);
    const subdivision = supportedSubdivision(positions, totalBeats);
    const merged = new Map<string, { step: number; instrument: SongInstrument; velocity: number; accent: boolean }>();
    for (const note of localNotes) {
      const beat = measureStarts[note.measure - segment.first - 1]! + note.beat;
      const step = Math.max(0, Math.round(beat * subdivision / 4));
      const key = `${note.voice}:${step}`, current = merged.get(key);
      merged.set(key, { step, instrument: note.voice, velocity: Math.max(current?.velocity ?? 0, note.velocity), accent: (current?.accent ?? false) || note.velocity >= 108 });
    }
    const partId = crypto.randomUUID();
    const part = { id: partId, name: `Imported measures ${segment.first + 1}–${segment.last}`, bpm: segment.bpm, beats: Math.max(0.5, totalBeats), subdivision, meter: segment.meter, hits: [...merged.values()].sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument)) };
    return { id: crypto.randomUUID(), name: `Part ${sectionIndex + 1} · measures ${segment.first + 1}–${segment.last}`, kind: "other" as const, notes: "Imported from MusicXML. Review note mappings and the percussion staff before publishing.", parts: [part], clips: [{ id: crypto.randomUUID(), partId, repeats: 1 }], repeats: 1, bpm: segment.bpm, meter: segment.meter };
  });
  if (!sections.length) throw new Error("No mapped percussion notes were available to import.");
  if (segments.length > 32) throw new Error("This score needs more than 32 tempo or meter sections. Simplify its changes before importing.");
  const raw = { id: crypto.randomUUID(), title: title.trim() || preview.title, artist: artist.trim() || preview.artist, difficulty: "Intermediate" as const, bpm: preview.measures[0]?.bpm ?? 80, meter: preview.measures[0]?.meter ?? "4/4", tags: ["musicxml import"], notes: "Imported from MusicXML.", sections, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), bundled: false };
  const song = normalizeSong(raw);
  if (!song) throw new Error("This MusicXML arrangement could not be normalized into a song.");
  return { song, noteCount: assigned.length, ignoredNoteCount: preview.notes.length - assigned.length };
}

export type MusicXmlImportIssue = { measure: number; voice: SongInstrument; sourceBeat: number; importedBeat: number; rounded: boolean; merged: boolean };

/** Describe the actual quantization and voice collisions produced by the current mapping. */
export function reviewMusicXmlChanges(preview: MusicXmlPreview, mapping: MusicXmlMapping): MusicXmlImportIssue[] {
  const { song } = createSongFromMusicXmlPreview(preview, mapping);
  const issues: MusicXmlImportIssue[] = [];
  for (const section of song.sections) {
    const part = section.parts[0], range = part?.name.match(/measures (\d+)–(\d+)/);
    if (!part || !range) continue;
    const first = Number(range[1]), last = Number(range[2]);
    const starts = new Map<number, number>(); let offset = 0;
    for (let measure = first; measure <= last; measure++) { starts.set(measure, offset); offset += preview.measures[measure - 1]?.beats ?? 0; }
    const groups = new Map<string, MusicXmlImportIssue[]>();
    for (const note of preview.notes) {
      const start = starts.get(note.measure), voice = mapping[note.sourceId] ?? preview.sources.find(source => source.id === note.sourceId)?.defaultVoice ?? "ignore";
      if (start === undefined || voice === "ignore") continue;
      const exactStep = (start + note.beat) * part.subdivision / 4, step = Math.max(0, Math.round(exactStep));
      const item: MusicXmlImportIssue = { measure: note.measure, voice, sourceBeat: note.beat, importedBeat: step * 4 / part.subdivision - start, rounded: Math.abs(step - exactStep) >= 0.015, merged: false };
      const key = `${voice}:${step}`; groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    for (const group of groups.values()) for (const item of group) {
      item.merged = group.length > 1;
      if (item.rounded || item.merged) issues.push(item);
    }
  }
  return issues.sort((a, b) => a.measure - b.measure || a.sourceBeat - b.sourceBeat);
}
