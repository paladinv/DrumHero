"use client";
import { useState } from "react";
import { newSong } from "@/lib/song-library";
import { GM_DRUM_NOTES, MIDI_VOICES, exportSongMidi, midiTrackToSections, parseDrumMidi, type ParsedDrumMidi } from "@/lib/song-midi";
import type { DrumSong } from "@/lib/song-library";
import type { SongInstrument } from "@/lib/types";

const id = () => crypto.randomUUID();
function approximateBars(endTick: number, division: number, meter: string) {
  const [rawNumerator, rawDenominator] = meter.split("/").map(Number);
  const numerator = Number.isFinite(rawNumerator) ? rawNumerator : 4;
  const denominator = Number.isFinite(rawDenominator) && rawDenominator! > 0 ? rawDenominator! : 4;
  return Math.max(1, Math.ceil(endTick / (division * numerator * 4 / denominator)));
}
export function SongMidiExchange({ song, onImport, disabled = false }: { song: DrumSong; onImport: (song: DrumSong) => void; disabled?: boolean }) {
  const [parsed, setParsed] = useState<ParsedDrumMidi | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<number, SongInstrument | "skip">>({});
  const [title, setTitle] = useState("");
  const [exportSectionId, setExportSectionId] = useState("");
  const [message, setMessage] = useState("");
  const track = parsed?.tracks[trackIndex];
  const activeExportSectionId = song.sections.some(section => section.id === exportSectionId) ? exportSectionId : "";
  const notes = [...new Set(track?.notes.map(note => note.note) ?? [])].sort((a, b) => a - b);
  const load = async (file?: File) => {
    setParsed(null); setMapping({}); setMessage("");
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setMessage("MIDI files are limited to 8 MiB for browser import."); return; }
    try {
      const result = parseDrumMidi(await file.arrayBuffer());
      setParsed(result); setTrackIndex(0); setTitle(file.name.replace(/\.(mid|midi)$/i, "").slice(0, 100));
      const firstNotes = result.tracks[0]?.notes ?? [];
      setMapping(Object.fromEntries([...new Set(firstNotes.map(note => note.note))].map(note => [note, GM_DRUM_NOTES[note] ?? "skip"])));
      setMessage(`${result.tracks.length} drum track${result.tracks.length === 1 ? "" : "s"} ready for review. Nothing has been added yet.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not read this MIDI file."); }
  };
  const selectTrack = (index: number) => {
    setTrackIndex(index);
    const selected = parsed?.tracks[index];
    setMapping(Object.fromEntries([...new Set(selected?.notes.map(note => note.note) ?? [])].map(note => [note, GM_DRUM_NOTES[note] ?? "skip"])));
  };
  const addImported = () => {
    if (!parsed || !track || disabled) return;
    try {
      const imported = midiTrackToSections(track, parsed, mapping, id, "Imported MIDI");
      const next = { ...newSong(title.trim().slice(0, 100) || track.name || "MIDI arrangement", "MIDI import"), bpm: parsed.bpm, meter: parsed.meter, sections: [imported.section], tags: ["midi-import"] };
      onImport(next); setParsed(null); setMessage(`Imported ${imported.barCount} bars as an editable song.${imported.unmapped ? ` ${imported.unmapped} note events were skipped because of the note map or safe grid limits.` : " No note events were skipped."} Review quantization and mapping.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create a song from this MIDI track."); }
  };
  const exportMidi = () => {
    try {
      const blob = exportSongMidi(song, activeExportSectionId || undefined), url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${song.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "drum-hero-song"}.mid`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`${activeExportSectionId ? "The selected section" : "The full current arrangement"} was exported as a Standard MIDI file. Custom lanes without General MIDI notes are omitted.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not export this arrangement."); }
  };
  return <details className="song-tool-panel song-midi-exchange"><summary>MIDI arrangement exchange</summary><p>Import Standard MIDI format 0 or 1 files with drum notes on channel 10 (General MIDI percussion). Import uses the initial tempo and meter, reads at most 20,000 hits per track, rounds hits to sixteenths, and caps the song at 128 bars. Review the track, note map, and quantization before adding it as a new song. Export preserves tempo and meter changes, supports the full arrangement or one section, and is limited to 4,096 bars. Custom voices without General MIDI notes are omitted.</p><label>Export scope<select value={activeExportSectionId} onChange={event=>setExportSectionId(event.target.value)}><option value="">Full arrangement</option>{song.sections.map(section=><option key={section.id} value={section.id}>{section.name}</option>)}</select></label><div className="song-actions"><button type="button" disabled={!song.sections.some(section=>(!activeExportSectionId||section.id===activeExportSectionId)&&section.parts.some(part=>part.hits.length))} onClick={exportMidi}>Export {activeExportSectionId ? "section" : "arrangement"} as MIDI</button></div>{disabled && <p>Unlock this approved arrangement before importing a new part.</p>}<label>Import MIDI file<input type="file" accept=".mid,.midi,audio/midi,audio/x-midi" disabled={disabled} onChange={event => { void load(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
    {parsed && track && <section className="song-midi-import-review"><h4>Review MIDI import</h4><p>{parsed.tempoClamped?`${parsed.sourceBpm} BPM source · ${parsed.bpm} BPM imported`:`${parsed.bpm} BPM`} · {parsed.meter} · {track.notes.length} hits{track.truncatedNotes?` · ${track.truncatedNotes} additional events omitted by the 20,000-hit safety limit`:""} · {Math.min(128, approximateBars(track.endTick, parsed.division, parsed.meter))}{approximateBars(track.endTick, parsed.division, parsed.meter) > 128 ? "+" : ""} approximate bars. MIDI import quantizes to the nearest sixteenth note.</p><label>Song title<input maxLength={100} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Drum track<select value={trackIndex} onChange={event => selectTrack(Number(event.target.value))}>{parsed.tracks.map((item, index) => <option key={`${item.name}:${index}`} value={index}>{item.name} · {item.notes.length} hits</option>)}</select></label><fieldset><legend>Map source MIDI notes</legend>{notes.map(note => <label key={note}>Note {note} · {GM_DRUM_NOTES[note] ?? "unmapped"}<select value={mapping[note] ?? "skip"} onChange={event => setMapping(current => ({ ...current, [note]: event.target.value as SongInstrument | "skip" }))}><option value="skip">Skip note</option>{MIDI_VOICES.map(voice => <option key={voice} value={voice}>{voice}</option>)}</select></label>)}</fieldset><p>Imported notes are rounded to the nearest 16th, velocities are preserved, and duplicate hits on the same step and voice are combined. A new song is created so your existing arrangement stays intact.</p><button type="button" disabled={disabled || !track.notes.length} onClick={addImported}>Add reviewed MIDI as a new song</button></section>}
    <p role="status" aria-live="polite">{message}</p></details>;
}
