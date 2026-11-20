import { arrangementMidi, arrangementMusicXml, type NotationOptions } from "./song-builder-export";
import { expressionStrikes } from "./song-builder-creative";
import { automationScaleAtHit, type ArrangementBar } from "./song-builder";
import { previewMidiImport } from "./song-builder-import";
import { previewMusicXmlImport } from "./song-builder-musicxml-import";
import type { SongInstrument } from "./types";

export type SongExportCheck = { format: "MIDI" | "MusicXML"; passed: boolean; expectedNotes: number; importedNotes: number; expectedMeasures: number; importedMeasures: number | null; issues: string[] };

function expectedMidiNotes(bars: ArrangementBar[]) {
  return bars.reduce((total, bar) => total + bar.hits.reduce((count, hit) => {
    if (automationScaleAtHit(bar, hit) <= 0.001) return count;
    const subdivision = hit.sourceSubdivision ?? bar.subdivision;
    return count + expressionStrikes(hit.articulation, 60_000 / bar.bpm * 4 / subdivision).length;
  }, 0), 0);
}

export async function validateSongBuilderExports(bars: ArrangementBar[], title: string, artist: string, noteMap: Record<SongInstrument, number>, swing: number, separateTracks: boolean, notation: NotationOptions): Promise<SongExportCheck[]> {
  if (!bars.length) throw new Error("There is no arrangement to validate.");
  const results: SongExportCheck[] = [];
  const midiIssues: string[] = [];
  try {
    const midi = await arrangementMidi(bars, title, noteMap, swing, separateTracks).arrayBuffer();
    const imported = previewMidiImport(midi, title);
    const expectedNotes = expectedMidiNotes(bars);
    if (imported.notes.length !== expectedNotes) midiIssues.push(`Expected ${expectedNotes} MIDI note events; read back ${imported.notes.length}.`);
    let beat = 0, bpm = 0, meter = "";
    const expectedTempos: Array<{ tick: number; bpm: number }> = [], expectedMeters: Array<{ tick: number; meter: string }> = [];
    for (const bar of bars) {
      const tick = Math.round(beat * 480);
      if (bar.bpm !== bpm) { expectedTempos.push({ tick, bpm: bar.bpm }); bpm = bar.bpm; }
      if (bar.meter !== meter) { expectedMeters.push({ tick, meter: bar.meter }); meter = bar.meter; }
      beat += bar.beats;
    }
    const tempoMatches = imported.tempos.length === expectedTempos.length && imported.tempos.every((item, index) => item.tick === expectedTempos[index]?.tick && item.bpm === expectedTempos[index]?.bpm);
    const meterMatches = imported.meters.length === expectedMeters.length && imported.meters.every((item, index) => item.tick === expectedMeters[index]?.tick && item.meter === expectedMeters[index]?.meter);
    if (!tempoMatches) midiIssues.push("Tempo changes or their measure positions differ from the arrangement.");
    if (!meterMatches) midiIssues.push("Meter changes or their measure positions differ from the arrangement.");
    results.push({ format: "MIDI", passed: midiIssues.length === 0, expectedNotes, importedNotes: imported.notes.length, expectedMeasures: bars.length, importedMeasures: null, issues: midiIssues });
  } catch (error) {
    results.push({ format: "MIDI", passed: false, expectedNotes: expectedMidiNotes(bars), importedNotes: 0, expectedMeasures: bars.length, importedMeasures: null, issues: [error instanceof Error ? error.message : "MIDI round-trip could not be read."] });
  }
  const xmlIssues: string[] = [];
  try {
    const xml = await arrangementMusicXml(bars, title, artist, noteMap, notation).text();
    const imported = previewMusicXmlImport(xml, title);
    const expectedNotes = bars.reduce((sum, bar) => sum + bar.hits.length, 0);
    if (imported.notes.length !== expectedNotes) xmlIssues.push(`Expected ${expectedNotes} MusicXML notes; read back ${imported.notes.length}.`);
    if (imported.measures.length !== bars.length) xmlIssues.push(`Expected ${bars.length} measures; read back ${imported.measures.length}.`);
    const meterMismatch = bars.some((bar, index) => imported.measures[index]?.meter !== bar.meter);
    if (meterMismatch) xmlIssues.push("One or more MusicXML time signatures differ from the arrangement.");
    results.push({ format: "MusicXML", passed: xmlIssues.length === 0, expectedNotes, importedNotes: imported.notes.length, expectedMeasures: bars.length, importedMeasures: imported.measures.length, issues: xmlIssues });
  } catch (error) {
    results.push({ format: "MusicXML", passed: false, expectedNotes: bars.reduce((sum, bar) => sum + bar.hits.length, 0), importedNotes: 0, expectedMeasures: bars.length, importedMeasures: 0, issues: [error instanceof Error ? error.message : "MusicXML round-trip could not be read."] });
  }
  return results;
}
