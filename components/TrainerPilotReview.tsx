"use client";

import { useEffect, useState } from "react";
import type { TrainerRound } from "@/lib/trainer";
import type { PracticePattern } from "@/lib/types";

type PilotNote = {
  id: string;
  createdAt: string;
  experience: "beginner" | "experienced" | "teacher";
  pattern: string;
  bpm: number;
  input: string;
  scoreSource: "built-in" | "musicxml" | "custom";
  accuracy: number | null;
  uncertainDetections: number;
  clipped: boolean;
  setupSuccess: "yes" | "no" | "not-applicable";
  notationClear: "yes" | "no" | "unsure";
  feedbackMatches: "yes" | "no" | "unsure";
  notes: string;
};

const KEY = "drum-hero:trainer-pilot-notes:v1";

function readNotes(): PilotNote[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && typeof item.id === "string" && typeof item.createdAt === "string" && typeof item.pattern === "string").slice(0, 50);
  } catch { return []; }
}

export function TrainerPilotReview({ round, pattern }: { round: TrainerRound | null; pattern?: PracticePattern & { tags?: string[] } }) {
  const [notes, setNotes] = useState<PilotNote[]>([]);
  const [experience, setExperience] = useState<PilotNote["experience"]>("beginner");
  const [setupSuccess, setSetupSuccess] = useState<PilotNote["setupSuccess"]>("yes");
  const [notationClear, setNotationClear] = useState<PilotNote["notationClear"]>("yes");
  const [feedbackMatches, setFeedbackMatches] = useState<PilotNote["feedbackMatches"]>("unsure");
  const [comment, setComment] = useState("");
  const [consented, setConsented] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { const timer = window.setTimeout(() => setNotes(readNotes()), 0); return () => window.clearTimeout(timer); }, []);

  const save = () => {
    if (!round || !consented) return;
    const entry: PilotNote = {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), experience,
      pattern: round.patternName.slice(0, 160), bpm: round.bpm, input: round.source,
      scoreSource: pattern?.tags?.includes("musicxml-import") ? "musicxml" : pattern?.id.startsWith("custom-") ? "custom" : "built-in",
      accuracy: round.mode === "scored" ? round.result?.accuracy ?? null : null,
      uncertainDetections: round.uncertainDetections ?? 0, clipped: round.inputClipped === true,
      setupSuccess, notationClear, feedbackMatches, notes: comment.trim().slice(0, 800),
    };
    const next = [entry, ...notes].slice(0, 50);
    try { localStorage.setItem(KEY, JSON.stringify(next)); setNotes(next); setComment(""); setConsented(false); setMessage("Anonymous pilot note saved on this device."); }
    catch { setMessage("Pilot note could not be saved. Export or remove older local notes first."); }
  };

  const exportNotes = () => {
    const payload = { format: "drum-hero-trainer-player-pilot", version: 2, exportedAt: new Date().toISOString(), notes,
      privacy: "Contains no names, learner IDs, device IDs, recordings, or audio. Experience band and free-text notes are user-entered." };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "drum-hero-trainer-player-pilot.json"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const clearNotes = () => { try { localStorage.removeItem(KEY); setNotes([]); setMessage("Local pilot notes deleted."); } catch { setMessage("Local pilot notes could not be deleted."); } };

  return <details className="trainer-pilot-review">
    <summary>Player validation notes · {notes.length}/50 saved</summary>
    <p>Use during an opted-in drummer or teacher pilot. Notes stay on this device. Do not enter names, contact details, or identifying information; audio is not collected here.</p>
    {round ? <>
      <p><strong>Latest round:</strong> {round.patternName} · {round.bpm} BPM · {round.source} · {pattern?.tags?.includes("musicxml-import") ? "MusicXML score" : pattern?.id.startsWith("custom-") ? "custom/imported score" : "built-in score"} · {round.result ? `${round.result.accuracy}% scored` : "self-rated"}{round.uncertainDetections ? ` · ${round.uncertainDetections} uncertain detections` : ""}{round.inputClipped ? " · clipped input" : ""}</p>
      <div className="trainer-pilot-form">
        <label>Player experience<select value={experience} onChange={event => setExperience(event.target.value as PilotNote["experience"])}><option value="beginner">Beginner</option><option value="experienced">Experienced drummer</option><option value="teacher">Drum teacher</option></select></label>
        <label>Could the player complete setup?<select value={setupSuccess} onChange={event => setSetupSuccess(event.target.value as PilotNote["setupSuccess"])}><option value="yes">Yes, without help</option><option value="no">No, help was needed</option><option value="not-applicable">Not checked</option></select></label>
        <label>Was the staff score clear and correct?<select value={notationClear} onChange={event => setNotationClear(event.target.value as PilotNote["notationClear"])}><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option></select></label>
        <label>Did early/late feedback match the player’s feel?<select value={feedbackMatches} onChange={event => setFeedbackMatches(event.target.value as PilotNote["feedbackMatches"])}><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure / not scored</option></select></label>
      </div>
      <label>What was helpful or confusing?<textarea rows={3} maxLength={800} value={comment} onChange={event => setComment(event.target.value)} placeholder="Record observations only; avoid names or identifying details." /></label>
      <label className="trainer-pilot-consent"><input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} /> The participant agreed to save this anonymous practice feedback locally.</label>
      <button type="button" className="button-secondary" disabled={!consented} onClick={save}>Save anonymous pilot note</button>
    </> : <p>Complete a round to attach feedback to the pattern, tempo, and input type.</p>}
    <div className="transport"><button type="button" className="button-secondary" disabled={!notes.length} onClick={exportNotes}>Export pilot notes</button><button type="button" className="button-secondary" disabled={!notes.length} onClick={clearNotes}>Delete pilot notes</button></div>
    {message && <p role="status">{message}</p>}
  </details>;
}
