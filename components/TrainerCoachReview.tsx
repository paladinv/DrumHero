"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { changeTrainerTake, type SavedTrainerTake } from "@/lib/trainer-take-library";
import { parseCoachFeedback, parseCoachTakePackage, TRAINER_COACH_MAX_BYTES, type CoachComment, type CoachFeedback, type CoachTakePackage } from "@/lib/trainer-coach-review";

type ReviewPackage = Omit<CoachTakePackage, "audioBase64"> & { blob: Blob };

export function TrainerCoachReview({ takes, onFeedbackApplied }: { takes: SavedTrainerTake[]; onFeedbackApplied: (takes: SavedTrainerTake[]) => void }) {
  const packageInput = useRef<HTMLInputElement>(null);
  const responseInput = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [review, setReview] = useState<ReviewPackage | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [playheadMs, setPlayheadMs] = useState(0);
  const [note, setNote] = useState("");
  const [comments, setComments] = useState<CoachComment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const markerDurationMs = useMemo(() => review ? Math.max(1,
    review.expectedMarkersMs.reduce((maximum, value) => Math.max(maximum, value), 0),
    review.actualMarkersMs.reduce((maximum, value) => Math.max(maximum, value), 0)) : 1, [review]);
  const visibleMarkers = useMemo(() => {
    if (!review) return [];
    const sample = (values: number[]) => values.length <= 250
      ? values
      : Array.from({ length: 250 }, (_, index) => values[Math.round(index * (values.length - 1) / 249)]);
    return [
      ...sample(review.expectedMarkersMs).map(timeMs => ({ timeMs, kind: "Target" as const })),
      ...sample(review.actualMarkersMs).map(timeMs => ({ timeMs, kind: "Played hit" as const }))
    ];
  }, [review]);

  useEffect(() => {
    if (!review) { setAudioUrl(""); return; }
    const url = URL.createObjectURL(review.blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [review]);

  const openPackage = async (file?: File) => {
    setReview(null); setComments([]); setNote(""); setPlayheadMs(0); setMessage("");
    if (!file) return;
    if (file.size > TRAINER_COACH_MAX_BYTES) { setMessage("This coach package is larger than 24 MB."); return; }
    try { setReview(parseCoachTakePackage(await file.text())); setMessage("Coach package opened on this device. Add timestamped notes, then export a response file for the learner."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not open this coach package."); }
    finally { if (packageInput.current) packageInput.current.value = ""; }
  };

  const addComment = () => {
    if (!review || !note.trim() || comments.length >= 100) return;
    setComments(items => [...items, { id: crypto.randomUUID(), timeMs: Math.round(playheadMs), note: note.trim().slice(0, 600), createdAt: new Date().toISOString() }].sort((a, b) => a.timeMs - b.timeMs));
    setNote("");
  };

  const exportFeedback = () => {
    if (!review || !comments.length) return;
    const feedback: CoachFeedback = { application: "Drum Hero", format: "drum-hero-trainer-coach-feedback-v1", version: 1, takeId: review.takeId, patternName: review.patternName, bpm: review.bpm, comments };
    const url = URL.createObjectURL(new Blob([JSON.stringify(feedback, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `drum-hero-coach-feedback-${review.takeId.slice(0, 12)}.json`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Feedback file downloaded. Send it back to the learner; it contains your comments and timing references, not the audio.");
  };

  const importFeedback = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const feedback = parseCoachFeedback(await file.text());
      const take = takes.find(item => item.id === feedback.takeId);
      if (!take) throw new Error("This response refers to a take that is not saved in this browser.");
      const updated = { ...take, coachReviews: [...(take.coachReviews ?? []), {
        patternName: feedback.patternName,
        bpm: feedback.bpm,
        receivedAt: new Date().toISOString(),
        comments: feedback.comments
      }].slice(-10) };
      await changeTrainerTake("update", updated);
      onFeedbackApplied(takes.map(item => item.id === take.id ? updated : item));
      setMessage(`Added ${feedback.comments.length} time-coded coach comments to “${take.name}”.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import this coach response."); }
    finally { setBusy(false); if (responseInput.current) responseInput.current.value = ""; }
  };

  return <details className="trainer-coach-review">
    <summary>Coach review by file</summary>
    <p>Export a selected take as a review package, share it yourself, then import the coach’s timestamped response. Audio is included only after you choose to export the package; no account upload is used.</p>
    <input ref={packageInput} type="file" accept=".json,application/json" aria-label="Choose a Drum Hero coach review package" onChange={event => void openPackage(event.currentTarget.files?.[0])} />
    <button type="button" className="button-secondary" onClick={() => packageInput.current?.click()}>Open take review package</button>
    <input ref={responseInput} type="file" accept=".json,application/json" aria-label="Choose a Drum Hero coach response" onChange={event => void importFeedback(event.currentTarget.files?.[0])} />
    <button type="button" className="button-secondary" disabled={busy} onClick={() => responseInput.current?.click()}>Import coach response</button>
    {review && <div className="trainer-coach-review-card">
      <h3>{review.takeName}</h3><p>{review.patternName} · {review.bpm} BPM · {review.expectedMarkersMs.length} score targets · {review.actualMarkersMs.length} recorded hits</p>
      {audioUrl && <audio ref={audioRef} controls preload="metadata" src={audioUrl} aria-label={`Coach review audio: ${review.takeName}`} onTimeUpdate={event => setPlayheadMs(event.currentTarget.currentTime * 1000)} />}
      <div className="trainer-coach-marker-track" aria-label="Score target and played-hit timeline">
        {visibleMarkers.map((marker, index) => <span key={`${marker.kind}-${index}`} title={`${marker.kind} at ${(marker.timeMs / 1000).toFixed(2)} seconds`} aria-label={`${marker.kind} at ${(marker.timeMs / 1000).toFixed(2)} seconds`} className={marker.kind === "Target" ? "is-target" : "is-played"} style={{ left: `${Math.max(0, Math.min(100, marker.timeMs / markerDurationMs * 100))}%` }} />)}
      </div>
      <label>Feedback at { (playheadMs / 1000).toFixed(1) } s<textarea rows={2} maxLength={600} value={note} onChange={event => setNote(event.target.value)} placeholder="Add one clear observation or next step." /></label>
      <button type="button" disabled={!note.trim() || comments.length >= 100} onClick={addComment}>Add comment at current audio time</button>
      {comments.length > 0 && <ol>{comments.map(comment => <li key={comment.id}><strong>{(comment.timeMs / 1000).toFixed(1)} s</strong> · {comment.note} <button type="button" onClick={() => setComments(items => items.filter(item => item.id !== comment.id))}>Remove</button></li>)}</ol>}
      <button type="button" className="button" disabled={!comments.length} onClick={exportFeedback}>Download feedback for learner</button>
    </div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
