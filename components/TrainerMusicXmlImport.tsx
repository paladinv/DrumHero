"use client";

import { useMemo, useRef, useState } from "react";
import { createTrainerPatternFromMusicXmlPreview, previewMusicXmlImport, readMusicXmlFile, type MusicXmlPreview, type TrainerMusicXmlMapping } from "@/lib/song-builder-musicxml-import";
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
  const [measureNumber, setMeasureNumber] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const previewResult = useMemo(() => {
    if (!preview) return null;
    try { return createTrainerPatternFromMusicXmlPreview(preview, mapping, measureNumber); }
    catch { return null; }
  }, [mapping, measureNumber, preview]);

  const load = async (file?: File) => {
    if (!file) return;
    setError(""); setPreview(null); setBusy(true);
    try {
      const parsed = previewMusicXmlImport(await readMusicXmlFile(file), file.name.replace(/\.(mxl|musicxml|xml)$/i, ""));
      setPreview(parsed); setMeasureNumber(1);
      setMapping(Object.fromEntries(parsed.sources.map(source => [source.id, trainerVoice(source.defaultVoice) ?? "ignore"])));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read that MusicXML score."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  };

  const importMeasure = () => {
    if (!previewResult || disabled) return;
    onImport(previewResult.pattern);
    setError("");
  };

  return <details className="trainer-musicxml-import">
    <summary>Import a MusicXML measure into Trainer</summary>
    <p>Load .mxl, .musicxml, or .xml, map percussion parts, review the staff, then add the selected measure as a practice groove. The source file stays on this device.</p>
    <input ref={input} className="visually-hidden" type="file" accept=".mxl,.musicxml,.xml,application/xml,text/xml" aria-label="Choose MusicXML for Trainer" onChange={event => void load(event.currentTarget.files?.[0])} />
    <button type="button" className="button-secondary" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? "Reading score…" : "Choose MusicXML score"}</button>
    {error && <p role="alert">{error}</p>}
    {preview && <div className="trainer-musicxml-review">
      <h3>{preview.title}</h3>
      <p>{preview.artist} · {preview.measures.length} measures · {preview.notes.length} percussion notes · {preview.sources.length} source instruments</p>
      <label>Measure to practise<select value={measureNumber} disabled={disabled} onChange={event => setMeasureNumber(Number(event.target.value))}>{preview.measures.map((item, index) => <option key={index + 1} value={index + 1}>Measure {index + 1} · {item.meter} · {item.bpm} BPM</option>)}</select></label>
      <fieldset disabled={disabled}><legend>Map MusicXML instruments to Trainer voices</legend><div className="trainer-musicxml-mappings">{preview.sources.map(source => <label key={source.id}><span>{source.label} · {source.count} notes</span><select aria-label={`Map ${source.label} to a Trainer voice`} value={mapping[source.id] ?? "ignore"} onChange={event => setMapping(current => ({ ...current, [source.id]: event.target.value as Instrument | "ignore" }))}><option value="ignore">Ignore</option>{VOICES.map(voice => <option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label>)}</div></fieldset>
      <section aria-label="Mapped Trainer score preview"><h4>Mapped measure score</h4>{previewResult ? <TrainerNotationView pattern={previewResult.pattern} /> : <p>Map at least one note in this measure to a Trainer voice.</p>}</section>
      {previewResult && <p>{previewResult.noteCount} mapped note events · {previewResult.ignoredNoteCount} ignored events · {previewResult.pattern.meter} · {previewResult.pattern.subdivision}-step grid</p>}
      {preview.warnings.length > 0 && <details><summary>Source score findings · {preview.warnings.length}</summary><ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
      {previewResult?.warnings.length ? <div className="trainer-musicxml-warnings" role="status"><strong>Review before practice</strong><ul>{previewResult.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div> : null}
      <p>Trainer imports one measure at a time. Time signature, supported note positions, accents, and detected R/L sticking are shown in the preview. Grace notes, ties, ornaments, and other unsupported details are called out for source-score review.</p>
      <div className="transport"><button type="button" disabled={disabled || !previewResult} onClick={importMeasure}>Add this measure to Trainer</button><button type="button" className="button-secondary" onClick={() => { setPreview(null); setError(""); }}>Close preview</button></div>
    </div>}
  </details>;
}

