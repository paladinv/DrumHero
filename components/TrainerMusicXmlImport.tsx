"use client";

import { useMemo, useRef, useState } from "react";
import { createTrainerPatternsFromMusicXmlPreview, previewMusicXmlImport, readMusicXmlFile, type MusicXmlPreview, type TrainerMusicXmlMapping } from "@/lib/song-builder-musicxml-import";
import type { Groove, Instrument, SongInstrument } from "@/lib/types";
import { TrainerNotationView } from "./TrainerNotationView";

const VOICES: Instrument[] = ["kick", "snare", "hihat", "tom", "crash"];
const VOICE_LABEL: Record<Instrument, string> = { kick: "Kick", snare: "Snare", hihat: "Hi-hat / ride", tom: "Tom", crash: "Crash" };

function trainerVoice(voice: SongInstrument | null): Instrument | null {
  if (voice === "kick" || voice === "snare" || voice === "tom" || voice === "crash") return voice;
  if (voice === "hihat" || voice === "openhat" || voice === "ride") return "hihat";
  if (voice === "rimshot") return "snare";
  return null;
}

export function TrainerMusicXmlImport({ disabled = false, onImport }: { disabled?: boolean; onImport: (pattern: Groove) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<MusicXmlPreview | null>(null);
  const [mapping, setMapping] = useState<TrainerMusicXmlMapping>({});
  const [firstMeasure, setFirstMeasure] = useState(1);
  const [lastMeasure, setLastMeasure] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const previewResult = useMemo(() => {
    if (!preview) return null;
    try { return createTrainerPatternsFromMusicXmlPreview(preview, mapping, firstMeasure, lastMeasure); }
    catch { return null; }
  }, [firstMeasure, lastMeasure, mapping, preview]);

  const rangeOptions = useMemo(() => {
    if (!preview) return [];
    const first = preview.measures[firstMeasure - 1];
    if (!first) return [];
    const options: number[] = [firstMeasure];
    let totalBeats = first.beats;
    for (let index = firstMeasure; index < preview.measures.length && options.length < 8; index += 1) {
      const next = preview.measures[index]!;
      if (next.meter !== first.meter || next.bpm !== first.bpm || totalBeats + next.beats > 32) break;
      totalBeats += next.beats;
      options.push(index + 1);
    }
    return options;
  }, [firstMeasure, preview]);

  const load = async (file?: File) => {
    if (!file) return;
    setError(""); setPreview(null); setBusy(true);
    try {
      const parsed = previewMusicXmlImport(await readMusicXmlFile(file), file.name.replace(/\.(mxl|musicxml|xml)$/i, ""));
      setPreview(parsed); setFirstMeasure(1); setLastMeasure(1);
      setMapping(Object.fromEntries(parsed.sources.map(source => [source.id, trainerVoice(source.defaultVoice) ?? "ignore"])));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read that MusicXML score."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  const importMeasure = () => {
    if (!previewResult || disabled) return;
    onImport({ ...previewResult.pattern, id: `custom-${crypto.randomUUID()}` });
    setError("");
  };

  return <details className="trainer-musicxml-import">
    <summary>Import MusicXML into Trainer</summary>
    <p>Load .mxl, .musicxml, or .xml, map percussion parts, review the staff, then add the selected passage as a practice groove. The source file stays on this device.</p>
    <input ref={input} className="visually-hidden" type="file" accept=".mxl,.musicxml,.xml,application/xml,text/xml" aria-label="Choose MusicXML for Trainer" onChange={event => void load(event.currentTarget.files?.[0])} />
    <button type="button" className="button-secondary" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? "Reading score…" : "Choose MusicXML score"}</button>
    {error && <p role="alert">{error}</p>}
    {preview && <div className="trainer-musicxml-review">
      <h3>{preview.title}</h3>
      <p>{preview.artist} · {preview.measures.length} measures · {preview.notes.length} percussion notes · {preview.sources.length} source instruments</p>
      <div className="trainer-musicxml-range"><label>First measure<select value={firstMeasure} disabled={disabled} onChange={event => { const next = Number(event.target.value); setFirstMeasure(next); setLastMeasure(next); }}>{preview.measures.map((item, index) => <option key={index + 1} value={index + 1}>Measure {index + 1} · {item.meter} · {item.bpm} BPM</option>)}</select></label><label>Last measure<select value={rangeOptions.includes(lastMeasure) ? lastMeasure : firstMeasure} disabled={disabled} onChange={event => setLastMeasure(Number(event.target.value))}>{rangeOptions.map(number => <option key={number} value={number}>Measure {number}</option>)}</select></label></div>
      <fieldset disabled={disabled}><legend>Map MusicXML instruments to Trainer voices</legend><div className="trainer-musicxml-mappings">{preview.sources.map(source => <label key={source.id}><span>{source.label} · {source.count} notes</span><select aria-label={`Map ${source.label} to a Trainer voice`} value={mapping[source.id] ?? "ignore"} onChange={event => setMapping(current => ({ ...current, [source.id]: event.target.value as Instrument | "ignore" }))}><option value="ignore">Ignore</option>{VOICES.map(voice => <option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label>)}</div></fieldset>
      <div className="trainer-musicxml-score-comparison">
        <section aria-label="Recognized source score preview"><h4>Recognized source</h4>{previewResult?.sourcePattern ? <><TrainerNotationView pattern={previewResult.sourcePattern} /><small>{previewResult.sourceNoteCount} recognized events · {previewResult.sourceIgnoredNoteCount} not mapped from source labels</small></> : <p>Source labels did not identify a supported drum voice. Use the mapping controls and compare the mapped score with the original score.</p>}</section>
        <section aria-label="Mapped Trainer score preview"><h4>Practice mapping</h4>{previewResult ? <><TrainerNotationView pattern={previewResult.pattern} /><small>{previewResult.noteCount} mapped events · {previewResult.ignoredNoteCount} ignored events</small></> : <p>Map at least one note in this measure range to a Trainer voice.</p>}</section>
      </div>
      {previewResult && <p>{previewResult.noteCount} mapped note events · {previewResult.ignoredNoteCount} ignored events · measures {previewResult.firstMeasure}–{previewResult.lastMeasure} · {previewResult.pattern.meter} · {previewResult.pattern.subdivision}-step grid</p>}
      {preview.warnings.length > 0 && <details><summary>Source score findings · {preview.warnings.length}</summary><ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
      {previewResult?.warnings.length ? <div className="trainer-musicxml-warnings" role="status"><strong>Review before practice</strong><ul>{previewResult.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div> : null}
      <p>Import one to eight contiguous measures that share a meter and tempo, up to 32 beats. The source view uses recognized MusicXML drum labels; the practice view shows your chosen mapping. Time signatures, supported note positions, accents, and detected R/L sticking appear in both. Grace notes, ties, ornaments, and unsupported details are called out for source-score review.</p>
      <div className="transport"><button type="button" disabled={disabled || !previewResult} onClick={importMeasure}>Add this passage to Trainer</button><button type="button" className="button-secondary" onClick={() => { setPreview(null); setError(""); }}>Close preview</button></div>
    </div>}
  </details>;
}

