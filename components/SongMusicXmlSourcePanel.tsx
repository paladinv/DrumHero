"use client";

import type { DrumSong } from "@/lib/song-library";
import { songRightsReviewCurrent } from "@/lib/song-library-rights";

export function SongMusicXmlSourcePanel({ song }: { song: DrumSong }) {
  const source = song.musicXmlSource;
  if (!source) return null;
  const exportSource = () => {
    if (!source.originalXml || !songRightsReviewCurrent(song)) return;
    const blob = new Blob([source.originalXml], { type: "application/vnd.recordare.musicxml+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = source.fileName.replace(/\.mxl$/i, ".musicxml");
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section className="song-tool-panel" aria-labelledby="song-original-notation-title">
    <h3 id="song-original-notation-title">Original notation source</h3>
    <p>{source.fileName} · imported {new Date(source.importedAt).toLocaleString()} · {Object.keys(source.mapping).length} instrument mappings.</p>
    <p>The exact MusicXML is retained on this device for smaller imports. It is excluded from account sync and shared snapshots.</p>
    {source.originalXml ? <button type="button" disabled={!songRightsReviewCurrent(song)} onClick={exportSource}>Export original MusicXML</button> : <p>The source exceeded the 256 KB local retention limit. Reimport it if you need the original file.</p>}
  </section>;
}
