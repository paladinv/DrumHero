"use client";

import { useMemo, useRef, useState } from "react";
import { BUILDER_VOICES, VOICE_LABEL } from "@/lib/song-builder";
import { createSongFromMusicXmlPreview, previewMusicXmlImport, readMusicXmlFile, reconcileMusicXmlRefresh, reviewMusicXmlChanges, type MusicXmlMapping, type MusicXmlPreview } from "@/lib/song-builder-musicxml-import";
import { compareSongDrumArrangements } from "@/lib/song-library-tools";
import { buildSongTimeline } from "@/lib/song-practice";
import type { DrumSong } from "@/lib/song-library";
import type { SongInstrument } from "@/lib/types";
import { SongLibraryNotation } from "./SongLibraryNotation";

function MusicXmlMeasureSourcePreview({ preview, measureNumber, mapping }: { preview: MusicXmlPreview; measureNumber: number; mapping: MusicXmlMapping }) {
  const measure = preview.measures[measureNumber - 1];
  const rows = preview.sources.filter(source => preview.notes.some(note => note.measure === measureNumber && note.sourceId === source.id));
  if (!measure) return <p>Choose a measure to compare its source timing.</p>;
  if (!rows.length) return <p>This source measure has no parsed percussion notes.</p>;
  const width = 820, labelWidth = 165, right = width - 24, height = 60 + rows.length * 36;
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Source percussion timing for measure ${measureNumber}`} className="musicxml-source-measure">
    <text x="12" y="18" className="musicxml-source-caption">Source measure {measureNumber} · exact parsed beat positions</text>
    {Array.from({ length: Math.ceil(measure.beats) + 1 }, (_, beat) => { const x = labelWidth + beat / measure.beats * (right - labelWidth); return <g key={`beat:${beat}`}><line x1={x} y1="28" x2={x} y2={height - 10} className="musicxml-source-beat"/><text x={x + 2} y="42" className="musicxml-source-count">{beat + 1}</text></g>; })}
    {rows.map((source, index) => { const y = 68 + index * 36, sourceNotes = preview.notes.filter(note => note.measure === measureNumber && note.sourceId === source.id); return <g key={source.id}><text x="12" y={y + 4} className="musicxml-source-label">{source.label}</text><text x="12" y={y + 17} className="musicxml-source-map">→ {mapping[source.id] === "ignore" ? "Ignored" : VOICE_LABEL[mapping[source.id] as SongInstrument] ?? "Unmapped"}</text><line x1={labelWidth} y1={y} x2={right} y2={y} className="musicxml-source-lane"/>{sourceNotes.map((note, noteIndex) => { const x = labelWidth + note.beat / measure.beats * (right - labelWidth); return <g key={`${source.id}:${noteIndex}`}><line x1={x} y1={y - 7} x2={x} y2={y + 7} className="musicxml-source-note-stem"/><ellipse cx={x} cy={y} rx="5" ry="3.5" className="musicxml-source-note"/></g>; })}</g>; })}
  </svg>;
}

async function scoreFingerprint(xml: string) {
  if (globalThis.crypto?.subtle) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(xml)));
    return Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (let index = 0; index < xml.length; index += 1) hash = Math.imul(hash ^ xml.charCodeAt(index), 16777619);
  return `fnv-${(hash >>> 0).toString(36)}-${xml.length}`;
}

export function SongBuilderMusicXmlImport({ onImport, existingSong, disabled = false }: { onImport: (song: DrumSong, noteCount: number, ignoredNoteCount: number) => void; existingSong?: DrumSong; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<MusicXmlPreview | null>(null);
  const [mapping, setMapping] = useState<MusicXmlMapping>({});
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [selectedMeasure, setSelectedMeasure] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileSource, setFileSource] = useState<{ fileName: string; fingerprint: string } | null>(null);
  const [sourceXml, setSourceXml] = useState("");
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
  const mappedSong = useMemo(() => {
    if (!preview || !preview.notes.some(note => mapping[note.sourceId] && mapping[note.sourceId] !== "ignore")) return null;
    try { return createSongFromMusicXmlPreview(preview, mapping, title, artist).song; }
    catch { return null; }
  }, [preview, mapping, title, artist]);
  const refreshSource = useMemo(() => fileSource ? { format: "musicxml" as const, ...fileSource, importedAt: new Date().toISOString(), mapping, originalXml: sourceXml.length <= 262_144 ? sourceXml : undefined } : null, [fileSource, mapping, sourceXml]);
  const refreshedSong = useMemo(() => existingSong && mappedSong && refreshSource ? reconcileMusicXmlRefresh(existingSong, mappedSong, refreshSource) : null, [existingSong, mappedSong, refreshSource]);
  const refreshDiff = useMemo(() => existingSong && refreshedSong ? compareSongDrumArrangements(existingSong, refreshedSong, 100) : [], [existingSong, refreshedSong]);
  const mappedBars = useMemo(() => mappedSong ? buildSongTimeline(mappedSong).bars : [], [mappedSong]);
  const affectedMeasures = new Set(changeReview.issues.map(issue => issue.measure));

  const load = async (file?: File) => {
    if (!file) return;
    setError(""); setPreview(null); setFileSource(null); setSourceXml(""); setBusy(true);
    try {
      const xml = await readMusicXmlFile(file);
      const parsed = previewMusicXmlImport(xml, file.name.replace(/\.(mxl|musicxml|xml)$/i, ""));
      setPreview(parsed); setSourceXml(xml); setTitle(existingSong?.title ?? parsed.title); setArtist(existingSong?.artist ?? parsed.artist); setSelectedMeasure(1);
      setFileSource({ fileName: file.name.slice(0, 180), fingerprint: await scoreFingerprint(xml) });
      setMapping(Object.fromEntries(parsed.sources.map(source => [source.id, source.defaultVoice ?? "ignore"])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read that MusicXML file.");
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const importSong = () => {
    if (!preview) return;
    try {
      const result = createSongFromMusicXmlPreview(preview, mapping, title, artist);
      const song = fileSource ? { ...result.song, musicXmlSource: { format: "musicxml" as const, ...fileSource, importedAt: new Date().toISOString(), mapping, originalXml: sourceXml.length <= 262_144 ? sourceXml : undefined }, source: { url: "", title: fileSource.fileName, attribution: artist.trim() || result.song.artist, authorization: "Imported locally; verify permission before sharing or exporting." } } : result.song;
      onImport(song, result.noteCount, result.ignoredNoteCount);
      setPreview(null); setMapping({}); setFileSource(null); setSourceXml("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not import this score."); }
  };
  const refreshSong = () => {
    if (!preview || !existingSong || !mappedSong || !refreshSource || disabled) return;
    try {
      const imported = reconcileMusicXmlRefresh(existingSong, mappedSong, refreshSource);
      const result = createSongFromMusicXmlPreview(preview, mapping, title, artist);
      onImport(imported, result.noteCount, result.ignoredNoteCount);
      setPreview(null); setMapping({}); setFileSource(null); setSourceXml("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not refresh this score."); }
  };

  return <section className="song-builder-musicxml-import" aria-label="Import MusicXML score">
    <div className="song-builder-tool-actions">
      <button type="button" className="button-secondary" disabled={busy || disabled} onClick={() => inputRef.current?.click()}>{busy ? "Reading score…" : existingSong ? "Import or refresh MusicXML" : "Import MusicXML"}</button>
      <input ref={inputRef} className="visually-hidden" type="file" accept=".mxl,.musicxml,.xml,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,application/xml,text/xml" aria-label="Choose a MusicXML score" onChange={event => void load(event.target.files?.[0])}/>
      <small>Imports .mxl, .musicxml, or .xml percussion scores. Original MusicXML up to 256 KB stays on this device for recovery and is excluded from cloud sync and shared snapshots.</small>
    </div>
    {error && <p role="alert">{error}</p>}
    {preview && <div className="card song-builder-musicxml-review">
      <div className="song-builder-section-heading"><div><span className="eyebrow">MusicXML import review</span><h3>{title || preview.title}</h3></div><button type="button" className="button-secondary" onClick={() => setPreview(null)}>Cancel</button></div>
      <p>{preview.measures.length} measures · {preview.notes.length} percussion notes · {preview.sources.length} source instruments</p>
      <div className="song-builder-tool-fields"><label>Song title<input maxLength={120} value={title} onChange={event => setTitle(event.target.value)}/></label><label>Artist<input maxLength={120} value={artist} onChange={event => setArtist(event.target.value)}/></label></div>
      {preview.warnings.length > 0 && <ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      {sourceXml.length > 262_144 && <p role="status">This source is over 256 KB. Drum Hero will import the reviewed drum arrangement, but won’t keep a local copy of the full MusicXML file.</p>}
      <section className="musicxml-visual-review" aria-label="Compare source timing with mapped drum notation">
        <div className="song-form-row"><label>Compare measure<select value={selectedMeasure} onChange={event=>setSelectedMeasure(Number(event.target.value))}>{preview.measures.map((_,index)=><option key={index+1} value={index+1}>Measure {index+1}{affectedMeasures.has(index+1)?" · mapping changes":""}</option>)}</select></label><div className="song-actions"><button type="button" disabled={selectedMeasure<=1} onClick={()=>setSelectedMeasure(value=>Math.max(1,value-1))}>Previous measure</button><button type="button" disabled={selectedMeasure>=preview.measures.length} onClick={()=>setSelectedMeasure(value=>Math.min(preview.measures.length,value+1))}>Next measure</button></div></div>
        <div className="musicxml-visual-review-panes"><section><h4>Source score timing</h4><p>Exact parsed positions, grouped by MusicXML instrument before mapping.</p><MusicXmlMeasureSourcePreview preview={preview} measureNumber={selectedMeasure} mapping={mapping}/></section><section><h4>Mapped Drum Hero score</h4>{mappedSong&&mappedBars[selectedMeasure-1]?<><p>Imported positions after applying the current drum voice mapping.</p><SongLibraryNotation song={mappedSong} barsOverride={[mappedBars[selectedMeasure-1]!]} reading showControls={false}/></>:<p>Map at least one source instrument to preview the imported drum notation.</p>}</section></div>
      </section>
      <details className="song-builder-musicxml-measure-review"><summary>Review measure timing and source voices</summary><div className="song-builder-table-scroll"><table><thead><tr><th scope="col">Measure</th><th scope="col">Meter</th><th scope="col">Tempo</th><th scope="col">Quarter-note beats</th><th scope="col">Percussion voices and notes</th></tr></thead><tbody>{measureReview.map(row=><tr key={row.number}><th scope="row">{row.number}{affectedMeasures.has(row.number) ? " · changes" : ""}</th><td>{row.meter}</td><td>{row.bpm} BPM</td><td>{row.beats}</td><td>{row.notes.length?row.notes.map(item=>`${item.label}: ${item.count}`).join(" · "):"No percussion notes"}</td></tr>)}</tbody></table></div>{preview.measures.length>measureReview.length&&<small>Showing the first {measureReview.length} of {preview.measures.length} measures.</small>}<small>Notes on finer tuplets are identified in the warnings and rounded to the closest supported grid step.</small></details>
      <fieldset><legend>Map score instruments to drum voices</legend><div className="song-builder-midi-pitch-map">{preview.sources.map(source => <label key={source.id}><span>{source.label} · {source.count} notes</span><select aria-label={`Map ${source.label} to a drum voice`} value={mapping[source.id] ?? "ignore"} onChange={event => setMapping(current => ({ ...current, [source.id]: event.target.value as SongInstrument | "ignore" }))}><option value="ignore">Ignore this instrument</option>{BUILDER_VOICES.map(voice => <option key={voice} value={voice}>{VOICE_LABEL[voice]}</option>)}</select></label>)}</div></fieldset>
      <details className="song-builder-musicxml-measure-review" open={changeReview.issues.length > 0}><summary>Review rounded and merged notes · {changeReview.issues.length} affected</summary>{changeReview.error ? <p role="alert">{changeReview.error}</p> : changeReview.issues.length ? <><p>Beat positions are measured from the start of each measure. Notes mapped to the same voice and step merge into one hit; the strongest velocity is retained.</p><div className="song-builder-table-scroll"><table><thead><tr><th scope="col">Measure</th><th scope="col">Voice</th><th scope="col">Original beat</th><th scope="col">Imported beat</th><th scope="col">Change</th></tr></thead><tbody>{changeReview.issues.slice(0, 100).map((issue, index) => <tr key={index}><th scope="row">{issue.measure}</th><td>{VOICE_LABEL[issue.voice]}</td><td>{issue.sourceBeat.toFixed(3)}</td><td>{issue.importedBeat.toFixed(3)}</td><td>{[issue.rounded ? "Rounded" : "", issue.merged ? "Merged" : ""].filter(Boolean).join(" · ")}</td></tr>)}</tbody></table></div>{changeReview.issues.length > 100 && <small>Showing the first 100 affected notes.</small>}</> : <p>No mapped notes will be rounded or merged.</p>}</details>
      {existingSong && <details className="song-builder-musicxml-measure-review" open><summary>Compare update with {existingSong.title} · {refreshDiff.length} changed items</summary>{refreshedSong ? refreshDiff.length ? <><p>Changes are grouped by matched section and part. Added or removed rows identify the bar and drum voice; matching song, section, and part IDs keep local practice history attached to the prior arrangement version.</p><ul>{refreshDiff.map((change,index)=><li key={`${change.location}:${index}`}><strong>{change.location}</strong> · {change.change} · {change.detail}</li>)}</ul></> : <p>No arrangement changes were found. The source file identity and mapping can still be refreshed.</p> : <p>Map at least one source instrument to compare this score with the selected arrangement.</p>}</details>}
      <p>Unknown instruments start as ignored. Review the score after import; the original file is never changed.</p>
      <div className="song-actions"><button type="button" disabled={!!changeReview.error || disabled || !fileSource || !preview.notes.some(note => mapping[note.sourceId] && mapping[note.sourceId] !== "ignore")} onClick={importSong}>Import as a new personal song</button>{existingSong && <button type="button" disabled={!!changeReview.error || disabled || !fileSource || !refreshedSong || !preview.notes.some(note => mapping[note.sourceId] && mapping[note.sourceId] !== "ignore")} onClick={refreshSong}>Refresh selected song from this score</button>}</div>
    </div>}
  </section>;
}
