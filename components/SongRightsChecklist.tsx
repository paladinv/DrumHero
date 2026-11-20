"use client";
import { useEffect, useState } from "react";
import { makeSongRightsReview, songRightsReviewCurrent, songRightsSourceSignature, SONG_RIGHTS_CHECKS } from "@/lib/song-library-rights";
import type { DrumSong, SongRightsReview } from "@/lib/song-library";

const emptyChecks: SongRightsReview["checks"] = { sourceIdentified: false, attributionConfirmed: false, permissionConfirmed: false, redistributionConfirmed: false };

export function SongRightsChecklist({ song, onSave, showSourceFields = false }: { song: DrumSong; onSave: (song: DrumSong) => void; showSourceFields?: boolean }) {
  const signature = songRightsSourceSignature(song);
  const checksSignature = JSON.stringify(song.rightsReview?.checks ?? emptyChecks);
  const [checks, setChecks] = useState<SongRightsReview["checks"]>(emptyChecks);
  useEffect(() => {
    setChecks(song.rightsReview?.sourceSignature === signature ? song.rightsReview.checks : emptyChecks);
  }, [song.id, signature, song.rightsReview?.reviewedAt, song.rightsReview?.sourceSignature, checksSignature]);
  const fieldsComplete = !!song.source?.attribution.trim() && !!song.source?.authorization.trim() && !!(song.source?.title.trim() || song.source?.url.trim());
  const complete = Object.values(checks).every(Boolean) && fieldsComplete;
  const update = (key: keyof SongRightsReview["checks"], checked: boolean) => {
    const next = { ...checks, [key]: checked };
    setChecks(next);
    onSave({ ...song, rightsReview: makeSongRightsReview(song, next) });
  };
  const updateSource = (key: "url" | "title" | "attribution" | "authorization", value: string) => {
    onSave({ ...song, source: { ...song.source, [key]: value } });
  };
  return <section className="song-rights-checklist" aria-label="Sharing and export rights review">
    <h3>Rights checklist for sharing or export</h3>
    <p>Review the source, attribution, permission, and redistribution terms before sharing a snapshot or exporting this score. Drum Hero records your review; it cannot verify rights.</p>
    {showSourceFields && <fieldset><legend>Source and attribution</legend><label>Source title or rights holder<input maxLength={160} value={song.source?.title ?? ""} onChange={event=>updateSource("title",event.target.value)}/></label><label>Source URL<input type="url" maxLength={2000} key={`source-url:${song.id}:${song.source?.url ?? ""}`} defaultValue={song.source?.url ?? ""} onBlur={event=>updateSource("url",event.currentTarget.value)}/></label><label>Attribution<input maxLength={500} value={song.source?.attribution ?? ""} onChange={event=>updateSource("attribution",event.target.value)}/></label><label>Authorization or license<textarea maxLength={1000} value={song.source?.authorization ?? ""} onChange={event=>updateSource("authorization",event.target.value)}/></label></fieldset>}
    <div>{SONG_RIGHTS_CHECKS.map(([key, label]) => <label key={key}><input type="checkbox" checked={checks[key]} onChange={event => update(key, event.target.checked)} />{label}</label>)}</div>
    {!fieldsComplete && <p role="status">{showSourceFields ? "Complete the source or rights holder, attribution, and permission fields above before this review can clear." : "Fill in the source or rights holder, attribution, and permission fields in the Source and attribution panel below before this review can clear."}</p>}
    <p role="status">{songRightsReviewCurrent(song) ? `Reviewed ${new Date(song.rightsReview!.reviewedAt).toLocaleDateString()}. Sharing and score export are enabled for the current source details.` : complete ? "Saving your rights review…" : "Review is incomplete or the source details changed. Sharing and score export stay disabled."}</p>
  </section>;
}
