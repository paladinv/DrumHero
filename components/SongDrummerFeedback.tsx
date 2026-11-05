"use client";
import { useEffect, useState } from "react";
import type { DrumSong } from "@/lib/song-library";

const tasks = [
  "Find or organize a song",
  "Create a song from a starter groove",
  "Edit or import a drum arrangement",
  "Read notation or edit the step grid",
  "Practice a section and understand its score",
  "Prepare, run, or debrief a setlist",
  "Transfer a song between web and iOS",
  "Use Song Library with a keyboard or assistive technology",
  "Song Library overall",
] as const;
const surfaces = ["Web desktop", "Web phone or tablet", "Native iOS", "Not recorded"] as const;
const inputMethods = ["Mouse and keyboard", "Touch", "MIDI or electronic kit", "Acoustic drums with audio input", "Assistive technology", "Combination or not applicable"] as const;
const experienceLevels = ["Learning drums", "Intermediate drummer", "Experienced drummer", "Drum educator", "Not recorded"] as const;
type Review = {
  id: string;
  createdAt: string;
  songId?: string;
  songTitle: string;
  task: string;
  rating: number;
  completed: boolean;
  durationMinutes?: number;
  surface: string;
  inputMethod: string;
  experience: string;
  permissionConfirmed: boolean;
  notes: string;
};
const KEY = "drum-hero:song-library-usability:v1";
const choice = (value: unknown, options: readonly string[], fallback: string) => typeof value === "string" && options.includes(value) ? value : fallback;

function readReviews(): Review[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === "string" && item.id.length <= 100 && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt)) && typeof item.task === "string" && typeof item.rating === "number" && item.rating >= 1 && item.rating <= 5 && typeof item.notes === "string").slice(-100).map(item => ({
      id: item.id,
      createdAt: item.createdAt,
      songId: typeof item.songId === "string" ? item.songId.slice(0, 100) : undefined,
      songTitle: typeof item.songTitle === "string" ? item.songTitle.slice(0, 120) : "Song Library overall",
      task: item.task.slice(0, 120),
      rating: item.rating,
      completed: item.completed === true,
      durationMinutes: typeof item.durationMinutes === "number" && Number.isFinite(item.durationMinutes) ? Math.max(0, Math.min(240, Math.round(item.durationMinutes))) : undefined,
      surface: choice(item.surface, surfaces, "Not recorded"),
      inputMethod: choice(item.inputMethod, inputMethods, "Combination or not applicable"),
      experience: choice(item.experience, experienceLevels, "Not recorded"),
      permissionConfirmed: item.permissionConfirmed === true,
      notes: item.notes.slice(0, 1500),
    })) : [];
  } catch { return []; }
}

export function SongDrummerFeedback({ song }: { song?: DrumSong }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [task, setTask] = useState<string>(tasks[0]);
  const [rating, setRating] = useState(4);
  const [completed, setCompleted] = useState(true);
  const [durationMinutes, setDurationMinutes] = useState("");
  const [surface, setSurface] = useState<string>(surfaces[0]);
  const [inputMethod, setInputMethod] = useState<string>(inputMethods[0]);
  const [experience, setExperience] = useState<string>(experienceLevels[0]);
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { setReviews(readReviews()); }, []);

  const saveReview = () => {
    if (!permissionConfirmed) return;
    const review: Review = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      songId: song?.id,
      songTitle: song?.title ?? "Song Library overall",
      task,
      rating,
      completed,
      durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
      surface,
      inputMethod,
      experience,
      permissionConfirmed,
      notes: notes.trim().slice(0, 1500),
    };
    const next = [...readReviews(), review].slice(-100);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setReviews(next);
      setNotes("");
      setDurationMinutes("");
      setPermissionConfirmed(false);
      setMessage("Anonymous usability review saved on this device.");
    } catch { setMessage("Could not save the review. Check available browser storage."); }
  };

  const exportReviews = () => {
    const blob = new Blob([JSON.stringify({ format: "drum-hero-song-library-usability-v3", reviews }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "drum-hero-song-library-usability-review.json";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Review file exported. It was not uploaded.");
  };

  const clearReviews = () => {
    if (!window.confirm("Delete all saved Song Library usability reviews from this device?")) return;
    try { localStorage.removeItem(KEY); setReviews([]); setMessage("Saved usability reviews deleted from this device."); }
    catch { setMessage("Could not delete saved reviews."); }
  };

  return <details className="song-tool-panel song-usability-feedback">
    <summary>Drummer usability review ({reviews.length})</summary>
    <p>Use this structured form during player sessions. Reviews stay in this browser until you export the JSON file; they are not included in library sync or backups. Save only anonymous observations after the drummer agrees. Do not enter names, contact details, or other identifying information.</p>
    <label>Task observed<select value={task} onChange={event => setTask(event.target.value)}>{tasks.map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Test surface<select value={surface} onChange={event => setSurface(event.target.value)}>{surfaces.map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Input setup<select value={inputMethod} onChange={event => setInputMethod(event.target.value)}>{inputMethods.map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Drummer experience<select value={experience} onChange={event => setExperience(event.target.value)}>{experienceLevels.map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Ease of use (1 is difficult, 5 is easy)<select value={rating} onChange={event => setRating(Number(event.target.value))}>{[1, 2, 3, 4, 5].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <label><input type="checkbox" checked={completed} onChange={event => setCompleted(event.target.checked)} /> Drummer completed this task without help</label>
    <label>Approximate task time<select value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)}><option value="">Not timed</option>{[1, 3, 5, 10, 15, 20, 30, 60].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
    <label>What slowed them down or worked well?<textarea maxLength={1500} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Note the step that caused friction and what the drummer expected to happen." /></label>
    <label><input type="checkbox" checked={permissionConfirmed} onChange={event => setPermissionConfirmed(event.target.checked)} /> The drummer is taking part voluntarily and agrees to save these anonymous notes</label>
    <button type="button" disabled={!permissionConfirmed} onClick={saveReview}>Save local review</button>
    <div className="song-actions"><button type="button" disabled={!reviews.length} onClick={exportReviews}>Export review file</button><button type="button" disabled={!reviews.length} onClick={clearReviews}>Delete saved reviews</button></div>
    {reviews.slice(-5).reverse().map(review => <p key={review.id}><strong>{review.rating}/5 · {review.completed ? "completed" : "needed help"}{review.durationMinutes ? ` · ${review.durationMinutes} min` : ""}</strong> · {review.songTitle} · {review.task} · {review.surface} · {review.inputMethod} · {review.experience}{review.notes ? ` · ${review.notes}` : ""}</p>)}
    <p role="status" aria-live="polite">{message}</p>
  </details>;
}
