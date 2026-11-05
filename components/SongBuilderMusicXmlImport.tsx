"use client";

import { useMemo, useRef, useState } from "react";
import { BUILDER_VOICES, VOICE_LABEL } from "@/lib/song-builder";
import { createSongFromMusicXmlPreview, previewMusicXmlImport, readMusicXmlFile, reviewMusicXmlChanges, type MusicXmlMapping, type MusicXmlPreview } from "@/lib/song-builder-musicxml-import";
import type { DrumSong } from "@/lib/song-library";
import type { SongInstrument } from "@/lib/types";

export function SongBuilderMusicXmlImport({ onImport }: { onImport: (song: DrumSong, noteCount: number, ignoredNoteCount: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<MusicXmlPreview | null>(null);
  const [mapping, setMapping] = useState<MusicXmlMapping>({});
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const measureReview = useMemo(() => {
    if (!preview) return [];
    const counts = new Map<number, Map<string, number>>();
    for (const note of preview.notes) {
      const bySource = counts.get(note.measure) ?? new Map<string, number>();
      bySource.set(note.sourceId, (bySource.get(note.sourceId) ?? 0) + 1);
      counts.set(note.measure, bySource);
    }
    return preview.measures.slice(0, 64).map((measure, index) => ({
      number: index + 1, ...measure,
      notes: [...(counts.get(index + 1) ?? new Map()).entries()].map(([sourceId, count]) => ({ label: preview.sources.find(source => source.id === sourceId)?.label ?? sourceId, count }))
    }));
  }, [preview]);

  const changeReview = useMemo(() => {
    if (!preview) return { issues: [], error: "" };
    try { return { issues: reviewMusicXmlChanges(preview, mapping), error: "" }; }
    catch (reason) { return { issues: [], error: reason instanceof Error ? reason.message : "Could not review this import." }; }
  }, [preview, mapping]);
  const affectedMeasures = new Set(changeReview.issues.map(issue => issue.measure));

  const load = async (file?: File) => {
    if (!file) return;
    setError(""); setPreview(null); setBusy(true);
    try {
      const parsed = previewMusicXmlImport(await readMusicXmlFile(file), file.name.replace(/\.(mxl|musicxml|xml)$/i, ""));
      setPreview(parsed); setTitle(parsed.title); setArtist(parsed.artist);
      setMapping(Object.fromEntries(parsed.sources.map(source => [source.id, source.defaultVoice ?? "ignore"])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read that MusicXML file.");
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const importSong = () => {
    if (!preview) return;
    try {
      const result = createSongFromMusicXmlPreview(preview, mapping, title, artist);
      onImport(result.song, result.noteCount, result.ignoredNoteCount);
      setPreview(null); setMapping({});
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not import this score."); }
  };

  return <section className="song-builder-musicxml-import" aria-label="Import MusicXML score">
    <div className="song-builder-tool-actions">
      <button type="button" className="button-secondary" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Reading score…" : "Import MusicXML"}</button>
      <input ref={inputRef} className="visually-hidden" type="file" accept=".mxl,.musicxml,.xml,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,application/xml,text/xml" aria-label="Choose a MusicXML score" onChange={event => void load(event.target.files?.[0])}/>
      <small>Imports .mxl, .musicxml, or .xml percussion scores.</small>
    </div>
    {error && <p role="alert">{error}</p>}
    {preview && <div className="card song-builder-musicxml-review">
      <div className="song-builder-section-heading"><div><span className="eyebrow">MusicXML import review</span><h3>{title || preview.title}</h3></div><button type="button" className="button-secondary" onClick={() => setPreview(null)}>Cancel</button></div>
      <p>{preview.measures.length} measures · {preview.notes.length} percussion notes · {preview.sources.length} source instruments</p>
      <div className="song-builder-tool-fields"><label>Song title<input maxLength={120} value={title} onChange={event => setTitle(event.target.value)}/></label><label>Artist<input maxLength={120} value={artist} onChange={event => setArtist(event.target.value)}/></label></div>
      {preview.warnings.length > 0 && <ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      <details className="song-builder-musicxml-measure-review"><summary>Review measure timing and source voices</summary><div className="song-builder-table-scroll"><table><thead><tr><th scope="col">Measure</th><th scope="col">Meter</th><th scope="col">Tempo</th><th scope="col">Quarter-note beats</th><th scope="col">Percussion voices and notes</th></tr></thead><tbody>{measureReview.map(row=><tr key={row.number}><th scope="row">{row.number}{affectedMeasures.has(row.number) ? " · changes" : ""}</th><td>{row.meter}</td><td>{row.bpm} BPM</td><td>{row.beats}</td><td>{row.notes.length?row.notes.map(item=>`${item.label}: ${item.count}`).join(" · "):"No percussion notes"}</td></tr>)}</tbody></table></div>{preview.measures.length>measureReview.length&&<small>Showing the first {measureReview.length} of {preview.measures.length} measures.</small>}<small>Notes on finer tuplets are identified in the warnings and rounded to the closest supported grid step.</small></details>
      <fieldset><legend>Map score instruments to drum voices</legend><div className="song-builder-midi-pitch-map">{preview.sources.map(source => <label key={source.id}><span>{source.label} · {source.count} notes</span><select aria-label={`Map ${source.label} to a drum voice`} value={mapping[source.id] ?? "ignore"} onChange={event => setMapping(current => ({ ...current, [source.id]: event.target.value as SongInstrument | "ignore" }))}><option value="ignore">Ignore this instrument</option>{BUILDER_VOICES.map(voice => <option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label>)}</div></fieldset>
      <details className="song-builder-musicxml-measure-review" open={changeReview.issues.length > 0}><summary>Review rounded and merged notes · {changeReview.issues.length} affected</summary>{changeReview.error ? <p role="alert">{changeReview.error}</p> : changeReview.issues.length ? <><p>Beat positions are measured from the start of each measure. Notes mapped to the same voice and step merge into one hit; the strongest velocity is retained.</p><div className="song-builder-table-scroll"><table><thead><tr><th scope="col">Measure</th><th scope="col">Voice</th><th scope="col">Original beat</th><th scope="col">Imported beat</th><th scope="col">Change</th></tr></thead><tbody>{changeReview.issues.slice(0, 100).map((issue, index) => <tr key={index}><th scope="row">{issue.measure}</th><td>{VOICE_LABEL[issue.voice]}</td><td>{issue.sourceBeat.toFixed(3)}</td><td>{issue.importedBeat.toFixed(3)}</td><td>{[issue.rounded ? "Rounded" : "", issue.merged ? "Merged" : ""].filter(Boolean).join(" · ")}</td></tr>)}</tbody></table></div>{changeReview.issues.length > 100 && <small>Showing the first 100 affected notes.</small>}</> : <p>No mapped notes will be rounded or merged.</p>}</details>
      <p>Unknown instruments start as ignored. Review the score after import; the original file is never changed.</p>
      <button type="button" disabled={!!changeReview.error || !preview.notes.some(note => mapping[note.sourceId] && mapping[note.sourceId] !== "ignore")} onClick={importSong}>Import as a personal song</button>
    </div>}
  </section>;
}
