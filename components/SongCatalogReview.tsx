"use client";

import { useState } from "react";
import { songArrangementFingerprint, type DrumSong } from "@/lib/song-library";

const checklistItems = [
  ["notation", "Score notation matches the written drum part"],
  ["meter", "Meter, subdivision, counts, and tempo are clear"],
  ["sticking", "Sticking, dynamics, and articulations are playable"],
  ["skillMetadata", "Difficulty and skill tags match the written part"],
] as const;

export function SongCatalogReview({ song, onSave }: { song: DrumSong; onSave: (song: DrumSong) => void }) {
  const [reviewer, setReviewer] = useState("");
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<Record<(typeof checklistItems)[number][0], boolean>>({ notation: false, meter: false, sticking: false, skillMetadata: false });
  const fingerprint = songArrangementFingerprint(song);
  const reviewMatches = song.catalogReview?.arrangementFingerprint === fingerprint;
  const reviewChecklistComplete = checklistItems.every(([key]) => song.catalogReview?.checklist[key] === true);
  const current = reviewMatches && reviewChecklistComplete;
  const reviewStatus = !song.catalogReview ? "review pending" : current ? "review recorded for this arrangement" : !reviewMatches ? "arrangement changed since review" : "review checklist incomplete";
  const complete = checklistItems.every(([key]) => checks[key]);

  return <details className="song-tool-panel song-catalog-review">
    <summary>Catalog review · {reviewStatus}</summary>
    <p>Record a human educator’s review of this song’s score and catalog metadata. Editing the arrangement or reviewed metadata automatically makes the review record stale. This stores the reviewer’s assertion; it does not verify credentials.</p>
    {song.catalogReview && <p><strong>Last review:</strong> {song.catalogReview.reviewer} · {new Date(song.catalogReview.reviewedAt).toLocaleDateString()}{current ? " · current arrangement" : !reviewMatches ? " · needs a new review" : " · checklist incomplete"}{song.catalogReview.notes ? ` · ${song.catalogReview.notes}` : ""}</p>}
    <label>Educator reviewer<input maxLength={80} value={reviewer} onChange={event => setReviewer(event.target.value)} placeholder="Name or educator ID" /></label>
    <fieldset>
      <legend>Review checklist</legend>
      {checklistItems.map(([key, label]) => <label key={key}><input type="checkbox" checked={checks[key]} onChange={event => setChecks(previous => ({ ...previous, [key]: event.target.checked }))} /> {label}</label>)}
    </fieldset>
    <label>Review notes · optional<textarea maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Corrections, teaching notes, or prerequisite guidance" /></label>
    <button type="button" disabled={!reviewer.trim() || !complete} onClick={() => onSave({ ...song, catalogReview: { reviewer: reviewer.trim().slice(0, 80), reviewedAt: new Date().toISOString(), arrangementFingerprint: fingerprint, notes: notes.trim().slice(0, 1000), checklist: { ...checks } } })}>Record educator review</button>
  </details>;
}
