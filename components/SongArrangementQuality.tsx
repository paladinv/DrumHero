"use client";
import { useMemo } from "react";
import { nativeSongVoiceCompatibility, reviewSongArrangement } from "@/lib/song-library-quality";
import type { DrumSong } from "@/lib/song-library";

export function SongArrangementQuality({ song, onSelect, onExport, onReviewSource }: { song: DrumSong; onSelect: (sectionId: string, partId?: string) => void; onExport: () => void; onReviewSource: () => void }) {
  const issues = useMemo(() => reviewSongArrangement(song), [song]);
  const nativeLimitations = useMemo(() => nativeSongVoiceCompatibility(song), [song]);
  const reviewIssue = (sectionId?: string, partId?: string) => {
    if (!sectionId) return;
    onSelect(sectionId, partId);
    window.setTimeout(() => document.getElementById("song-arrangement-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  return <section className="song-arrangement-quality" aria-labelledby="song-arrangement-quality-heading">
    <div>
      <h3 id="song-arrangement-quality-heading">Chart and transfer review</h3>
      <p>These checks look for common editing and handoff problems. They are suggestions; intentional pickups, rests, and shared-hand techniques can still be correct.</p>
    </div>
    <section aria-label="Arrangement checks">
      <h4>Arrangement checks · {issues.length ? `${issues.length} item${issues.length === 1 ? "" : "s"} to review` : "looks ready"}</h4>
      {issues.length ? <ul>{issues.map(issue => <li key={issue.id}>
        <div><strong>{issue.title}</strong> <small>{issue.severity === "review" ? "Review" : "Note"}</small><p>{issue.detail}</p></div>
        {issue.sectionId && <button type="button" onClick={() => reviewIssue(issue.sectionId, issue.partId)}>Select {song.sections.find(section => section.id === issue.sectionId)?.name ?? "section"}{issue.partId ? ` / ${song.sections.find(section => section.id === issue.sectionId)?.parts.find(part => part.id === issue.partId)?.name ?? "part"}` : ""}</button>}
        {(issue.id === "song:source-url" || issue.id === "song:attribution" || issue.id === "song:authorization") && <button type="button" onClick={onReviewSource}>Review source details</button>}
      </li>)}</ul> : <p>No common grid, meter, section, or source metadata issues were found.</p>}
    </section>
    <section aria-label="iOS transfer compatibility">
      <h4>iOS transfer · {nativeLimitations.length ? "review voice compatibility" : "voice-compatible"}</h4>
      <p>Native Song Library currently practices kick, snare, hi-hat, tom, and crash. Web-only voices are retained in this web arrangement, but the current iOS importer rejects a song containing unsupported voices. Select an affected part, then use Kit compatibility to create a supported variation while keeping the full web part.</p>
      {nativeLimitations.length ? <ul>{nativeLimitations.map(item => <li key={item.voice}><strong>{item.voice}</strong><ul>{item.locations.map(location => <li key={`${location.sectionId}:${location.partId}`}><button type="button" onClick={() => reviewIssue(location.sectionId, location.partId)}>Select {location.label}</button></li>)}</ul></li>)}</ul> : <p>This arrangement uses voices supported by the current iOS Song Library.</p>}
      <ol className="song-transfer-steps"><li>Export a single-song JSON file below.</li><li>On iOS, choose <strong>Song Library → Add song → Import song JSON</strong>.</li><li>To move a song back, export it from its iOS detail screen, then review the JSON in the web Song Library import panel.</li></ol>
      <button type="button" onClick={onExport}>Export song JSON for transfer</button>
    </section>
  </section>;
}
