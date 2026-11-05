"use client";
import { useState, type FormEvent } from "react";
import { grooves } from "@/lib/curriculum";
import { newSong, type DrumSong, type SongSection } from "@/lib/song-library";
import { grooveToPart } from "@/lib/song-builder";

const starterGrooves = grooves.filter((groove) => !/fill|transition/i.test(groove.name));

export function SongQuickStart({ onSave }: { onSave: (song: DrumSong) => void }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [grooveId, setGrooveId] = useState("straight-pop");
  const [message, setMessage] = useState("");
  const selected = starterGrooves.find((groove) => groove.id === grooveId) ?? starterGrooves[0];

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !artist.trim() || !selected) return;
    const song = newSong(title.trim(), artist.trim());
    song.difficulty = selected.level;
    song.bpm = selected.defaultBpm;
    song.meter = selected.meter ?? `${selected.beats}/4`;
    song.tags = [selected.style.toLocaleLowerCase(), "starter groove"];
    const part = grooveToPart(selected, selected.defaultBpm);
    const section: SongSection = {
      id: crypto.randomUUID(), name: "Verse", kind: "verse", notes: selected.description,
      bpm: selected.defaultBpm, meter: song.meter, parts: [part],
      clips: [{ id: crypto.randomUUID(), partId: part.id, repeats: 4 }]
    };
    song.sections = [section];
    song.updatedAt = new Date().toISOString();
    onSave(song);
    setMessage(`${song.title} created with a four-bar ${selected.name} groove. You can edit it in Arrangement.`);
    setTitle(""); setArtist("");
  };

  return <details id="song-quick-start" className="song-tool-panel song-quick-start">
    <summary>Quick-start a song from an original groove</summary>
    <p>Choose a groove to start with a playable four-bar verse. You can add sections and change the part later.</p>
    <form onSubmit={create}>
      <label>Song title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Artist or project<input required maxLength={120} value={artist} onChange={(event) => setArtist(event.target.value)} /></label>
      <label>Starter groove<select value={grooveId} onChange={(event) => setGrooveId(event.target.value)}>{starterGrooves.map((groove) => <option key={groove.id} value={groove.id}>{groove.name} · {groove.level} · {groove.defaultBpm} BPM</option>)}</select></label>
      {selected && <p>{selected.description}</p>}
      <button type="submit" disabled={!selected}>Create playable song</button>
    </form>
    <p role="status">{message}</p>
  </details>;
}
