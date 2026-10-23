"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { detailedImportChanges, findSongImportCandidates, parseLibrarySongImport, replaceImportedSong, songImportChanges, type SongImportReview } from "@/lib/song-library-import";
import { readSongBuilderSettings, writeSongBuilderSettings } from "@/lib/song-builder-settings";
import { saveCustomSampleBlob } from "@/lib/song-builder-samples";
import type { DrumSong } from "@/lib/song-library";
import type { SongInstrument } from "@/lib/types";
import { importMidiSong } from "@/lib/song-builder-import";
import { arrangementMidi } from "@/lib/song-builder-export";
import { buildArrangementBars } from "@/lib/song-builder";

const Preview = dynamic(() => import("./SongSessionPlayer").then((module) => module.SongSessionPlayer));

export function SongImportPanel({ songs, onSave, selectedSong }: { songs: DrumSong[]; onSave: (song: DrumSong) => void; selectedSong?: DrumSong }) {
  const [changePage, setChangePage] = useState(0);
  const [listen, setListen] = useState(false);
  const [text, setText] = useState("");
  const [review, setReview] = useState<SongImportReview | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [message, setMessage] = useState("");
  const [applyKit, setApplyKit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [midiStats, setMidiStats] = useState<{ noteCount: number; ignoredNoteCount: number } | null>(null);
  const duplicateCandidates = useMemo(() => review ? findSongImportCandidates(songs, review.song) : [], [review, songs]);
  const duplicate = duplicateCandidates.find((candidate) => candidate.song.id === selectedMatchId) ?? duplicateCandidates[0];
  const changes = useMemo(() => duplicate && review ? detailedImportChanges(duplicate.song, review.song) : [], [duplicate, review]);

  const inspect = (content: string) => {
    try {
      const parsed = parseLibrarySongImport(content);
      setReview(parsed); setSelectedMatchId(""); setMidiStats(null); setChangePage(0); setListen(false); setApplyKit(false);
      setMessage("Review this import before saving.");
    } catch (error) {
      setReview(null); setMidiStats(null);
      setMessage(`${error instanceof Error ? error.message : "Invalid song file."} Choose a Drum Hero song JSON export or paste its complete contents, then review again. Your songs have not changed.`);
    }
  };

  const file = async (input?: File) => {
    if (!input) return;
    if (input.size > 40 * 1024 * 1024) { setMessage("Song files must be 40 MB or smaller."); return; }
    try {
      if (/\.midi?$/i.test(input.name) || input.type === "audio/midi" || input.type === "audio/x-midi") {
        if (input.size > 16 * 1024 * 1024) throw new Error("MIDI files must be 16 MB or smaller.");
        const result = importMidiSong(await input.arrayBuffer(), input.name.replace(/\.midi?$/i, ""));
        setReview({ song: result.song }); setSelectedMatchId(""); setMidiStats({ noteCount: result.noteCount, ignoredNoteCount: result.ignoredNoteCount }); setChangePage(0); setListen(false); setApplyKit(false);
        setMessage(`Review ${result.noteCount} imported drum notes${result.ignoredNoteCount ? `; ${result.ignoredNoteCount} unrecognized pitches were skipped` : ""}.`);
        return;
      }
      const content = await input.text(); setText(content); inspect(content);
    } catch (error) {
      setReview(null); setMidiStats(null);
      setMessage(`${error instanceof Error ? error.message : "The selected file could not be read."} Your library has not changed.`);
    }
  };

  const exportMidi = () => {
    if (!selectedSong) return;
    try {
      const blob = arrangementMidi(buildArrangementBars(selectedSong), selectedSong.title);
      const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url;
      link.download = `${selectedSong.title.replace(/[^a-z0-9]+/gi, "-") || "drum-arrangement"}.mid`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage("Standard MIDI arrangement exported.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not export MIDI."); }
  };

  const confirm = async (replace: boolean) => {
    if (!review || busy) return;
    if (replace && duplicate?.song.arrangementLocked) {
      setMessage("This song has an approved arrangement lock. Unlock it in Arrangement before replacing it, or import a separate copy.");
      return;
    }
    setBusy(true);
    try {
      if (applyKit && review.project) {
        const settings = readSongBuilderSettings();
        for (const [voice, sample] of Object.entries(review.project.customSamples ?? {})) {
          const bytes = Uint8Array.from(atob(sample.base64), (char) => char.charCodeAt(0));
          await saveCustomSampleBlob(voice as SongInstrument, sample.name, new Blob([bytes], { type: sample.type }));
        }
        if (!writeSongBuilderSettings({ ...settings, mix: review.project.mix, midiNotes: review.project.midiNotes })) throw new Error("Kit settings could not be saved. Import again with kit settings unchecked.");
      }
      onSave(replace && duplicate ? replaceImportedSong(duplicate.song, review.song) : { ...review.song, id: crypto.randomUUID(), bundled: false });
      setReview(null); setSelectedMatchId(""); setText(""); setMessage("Song imported. Saved on this device.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The import could not be saved."); }
    finally { setBusy(false); }
  };

  return <section className="song-import-panel" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void file(event.dataTransfer.files[0]); }}>
    <h3>Import and export songs</h3>
    <p>Drop a Song Builder project, song JSON, or Standard MIDI file here, or choose a file. MIDI uses General MIDI drum note mapping.</p>
    <label>Song file<input type="file" accept=".json,.mid,.midi,application/json,audio/midi,audio/x-midi" onChange={(event) => { void file(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {selectedSong && <button type="button" onClick={exportMidi}>Export {selectedSong.title} as MIDI</button>}
    <details><summary>Paste song JSON</summary><textarea aria-label="Song JSON" value={text} onChange={(event) => setText(event.target.value)} /><button type="button" onClick={() => inspect(text)}>Review import</button></details>
    {review && <div className="song-import-review">
      <h4>Review song metadata</h4>
      <label>Song title<input maxLength={120} value={review.song.title} onChange={(event) => setReview({ ...review, song: { ...review.song, title: event.target.value } })} /></label>
      <label>Artist or source name<input maxLength={120} value={review.song.artist} onChange={(event) => setReview({ ...review, song: { ...review.song, artist: event.target.value } })} /></label>
      <p>{review.song.sections.length} sections · {review.song.bpm} BPM · {review.song.meter}</p>
      {midiStats && <p>MIDI review: {midiStats.noteCount} drum notes mapped to kit voices · {midiStats.ignoredNoteCount} unsupported pitches skipped. Tempo and meter use the first supported MIDI values.</p>}
      {duplicateCandidates.length > 0 && <>
        <label>Possible existing match
          <select value={duplicate?.song.id ?? ""} onChange={(event) => setSelectedMatchId(event.target.value)}>
            {duplicateCandidates.map((candidate) => <option key={candidate.song.id} value={candidate.song.id}>{candidate.song.title} · {candidate.song.artist} · {candidate.score}% similarity</option>)}
          </select>
        </label>
        {duplicate && <p>Matched by {duplicate.reasons.join(", ") || "title, artist, and arrangement structure"}. Similarity is a review hint; inspect the changes before replacing anything.</p>}
      </>}
      <button type="button" onClick={() => setListen(!listen)}>{listen ? "Close import rehearsal" : "Rehearse import before saving"}</button>
      {listen && <><Preview key={review.song.id} song={review.song} preview />{duplicate && <details><summary>Listen to possible existing match</summary><Preview song={duplicate.song} preview /></details>}</>}
      <p>Attribution: {review.song.source?.attribution || "No attribution supplied"}</p>
      {duplicate && <>
        <p>Review this possible match before saving. You can keep both songs or replace the selected match. {duplicate.song.arrangementLocked ? "Its approved arrangement is locked; unlock it before replacing." : ""}</p>
        <ul>{songImportChanges(duplicate.song, review.song).map((change) => <li key={change}>{change}</li>)}</ul>
        <details><summary>Exact replacement changes</summary>
          <p>{changes.length} changed values. Paths use zero-based section, part and hit indices.</p>
          <table><thead><tr><th>Field</th><th>Existing</th><th>Imported</th></tr></thead><tbody>{changes.slice(changePage * 200, (changePage + 1) * 200).map((change, index) => <tr key={index}><td>{change.path}</td><td>{JSON.stringify(change.before) ?? "Absent"}</td><td>{JSON.stringify(change.after) ?? "Absent"}</td></tr>)}</tbody></table>
          <div className="song-actions"><button type="button" disabled={changePage === 0} onClick={() => setChangePage(changePage - 1)}>Previous change page</button><span>Change page {changePage + 1} / {Math.max(1, Math.ceil(changes.length / 200))}</span><button type="button" disabled={(changePage + 1) * 200 >= changes.length} onClick={() => setChangePage(changePage + 1)}>Next change page</button></div>
        </details>
      </>}
      {review.project && <label><input type="checkbox" checked={applyKit} onChange={(event) => setApplyKit(event.target.checked)} /> Also replace this device’s Song Builder mix, MIDI mapping, and included custom samples</label>}
      <div className="song-actions">
        <button type="button" disabled={busy} onClick={() => void confirm(false)}>{duplicate ? "Import separate copy" : "Save reviewed song"}</button>
        {duplicate && <button type="button" disabled={busy || duplicate.song.arrangementLocked} onClick={() => void confirm(true)}>{duplicate.song.arrangementLocked ? "Unlock before replacing" : "Replace selected match"}</button>}
        <button type="button" disabled={busy} onClick={() => { setReview(null); setSelectedMatchId(""); }}>Cancel</button>
      </div>
    </div>}
    <p role="status">{message}</p>
  </section>;
}
