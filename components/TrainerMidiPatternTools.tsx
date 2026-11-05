"use client";

import { useMemo, useState } from "react";
import { createTrainerPatternFromMidi, trainerMidiPreview, trainerPatternMidi } from "@/lib/trainer-midi";
import type { Groove, Instrument, PracticePattern } from "@/lib/types";
import type { MidiImportPreview } from "@/lib/song-builder-import";

const voices: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];

function safeTitle(filename: string) {
  return filename.replace(/\.(mid|midi)$/i, "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 60) || "Imported MIDI groove";
}

export function TrainerMidiPatternTools({ pattern, bpm, disabled, onImport }: {
  pattern: PracticePattern;
  bpm: number;
  disabled: boolean;
  onImport: (pattern: Groove) => boolean;
}) {
  const [preview, setPreview] = useState<MidiImportPreview | null>(null);
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Groove["level"]>("Intermediate");
  const [mapping, setMapping] = useState<Record<number, Instrument | null>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const usedPitchCount = useMemo(() => Object.values(mapping).filter(Boolean).length, [mapping]);

  const download = () => {
    try {
      const blob = trainerPatternMidi(pattern, bpm);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${pattern.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trainer-pattern"}.mid`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`${pattern.name} exported as a Standard MIDI drum pattern.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The MIDI pattern could not be exported.");
    }
  };

  const loadFile = async (file?: File) => {
    setPreview(null);
    setMessage("");
    if (!file) return;
    setBusy(true);
    try {
      const next = trainerMidiPreview(await file.arrayBuffer(), safeTitle(file.name));
      const defaults = Object.fromEntries(next.pitches.map(item => [item.note, voices.includes(item.defaultVoice as Instrument) ? item.defaultVoice as Instrument : null]));
      setPreview(next);
      setMapping(defaults);
      setName(safeTitle(file.name));
      setMessage(`Review ${next.pitches.length} MIDI pitches across ${next.tracks.length} tracks, then add the mapped hits to your local Trainer library.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That MIDI file could not be read.");
    } finally {
      setBusy(false);
    }
  };

  const importPattern = () => {
    if (!preview) return;
    try {
      const groove = createTrainerPatternFromMidi(preview, { name, mapping, level });
      if (!onImport(groove)) {
        setMessage("The Trainer library could not save this pattern. Remove an unused custom pattern or check browser storage.");
        return;
      }
      setMessage(`Imported “${groove.name}” with ${groove.hits.length} mapped hits. It is selected and ready to practise.`);
      setPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This MIDI file could not become a Trainer groove.");
    }
  };

  return <details className="trainer-midi-pattern-tools">
    <summary>MIDI pattern exchange</summary>
    <p>Export the selected groove as a standard drum MIDI file, or import a short constant-tempo pattern. Imported files stay in this browser’s custom Trainer library.</p>
    <button type="button" className="button-secondary" disabled={disabled} onClick={download}>Export selected pattern as MIDI</button>
    <label>Import a Standard MIDI file<input type="file" accept=".mid,.midi,audio/midi,audio/x-midi" disabled={disabled || busy} onChange={event => { void loadFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} /></label>
    {preview && <section className="trainer-midi-import-preview" aria-label="Review MIDI pattern mapping">
      <h4>Review imported pattern</h4>
      <label>Pattern name<input maxLength={60} value={name} disabled={disabled} onChange={event => setName(event.target.value)} /></label>
      <label>Difficulty<select value={level} disabled={disabled} onChange={event => setLevel(event.target.value as Groove["level"])}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
      <p>{preview.notes.length} note events · {preview.pitches.length} pitches · {preview.tempos[0]?.bpm ?? 80} BPM · {preview.meters[0]?.meter ?? "4/4"}</p>
      <div className="trainer-midi-pitch-map">{preview.pitches.map(pitch => <label key={pitch.note}>MIDI {pitch.note} · {pitch.count} hit{pitch.count === 1 ? "" : "s"}<select value={mapping[pitch.note] ?? "ignore"} disabled={disabled} onChange={event => setMapping(current => ({ ...current, [pitch.note]: event.target.value === "ignore" ? null : event.target.value as Instrument }))}><option value="ignore">Ignore</option>{voices.map(voice => <option key={voice} value={voice}>{voice}</option>)}</select></label>)}</div>
      <small>{usedPitchCount} pitch mapping{usedPitchCount === 1 ? "" : "s"} included. Tempo and meter changes are not imported into a single Trainer groove.</small>
      <div className="transport"><button type="button" disabled={disabled || !name.trim() || !usedPitchCount} onClick={importPattern}>Add mapped pattern to Trainer</button><button type="button" className="button-secondary" disabled={disabled} onClick={() => setPreview(null)}>Cancel import</button></div>
    </section>}
    <p role="status">{message}</p>
  </details>;
}
