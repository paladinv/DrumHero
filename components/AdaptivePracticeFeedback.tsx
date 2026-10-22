"use client";

import { useEffect, useState } from "react";
import { useLocalization } from "./LocalizationProvider";

type AdaptiveMode = "seated" | "single-voice";
type FeedbackEntry = {
  id: string;
  recordedAt: string;
  mode: AdaptiveMode;
  voice: string;
  pattern: string;
  role: "player" | "educator";
  usefulness: number;
  clarity: "clear" | "unclear" | "unsure";
  movement: "less" | "same" | "more" | "unsure";
  note: string;
};

const STORAGE_KEY = "drum-hero:adaptive-practice-feedback:v1";

function readEntries(raw: string | null): FeedbackEntry[] {
  try {
    const value = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.slice(0, 100).flatMap((item): FeedbackEntry[] => {
      if (!item || typeof item !== "object") return [];
      const entry = item as Partial<FeedbackEntry>;
      if (typeof entry.id !== "string" || typeof entry.recordedAt !== "string" || !Number.isFinite(Date.parse(entry.recordedAt)) || (entry.mode !== "seated" && entry.mode !== "single-voice") || typeof entry.voice !== "string" || typeof entry.pattern !== "string" || (entry.role !== "player" && entry.role !== "educator") || !Number.isInteger(entry.usefulness) || Number(entry.usefulness) < 1 || Number(entry.usefulness) > 5 || (entry.clarity !== undefined && !["clear", "unclear", "unsure"].includes(entry.clarity)) || (entry.movement !== undefined && !["less", "same", "more", "unsure"].includes(entry.movement)) || typeof entry.note !== "string") return [];
      return [{ id: entry.id.slice(0, 100), recordedAt: entry.recordedAt, mode: entry.mode, voice: entry.voice.slice(0, 30), pattern: entry.pattern.slice(0, 120), role: entry.role, usefulness: Number(entry.usefulness), clarity: entry.clarity ?? "unsure", movement: entry.movement ?? "unsure", note: entry.note.slice(0, 500) }];
    });
  } catch {
    return [];
  }
}

function exportEntries(entries: FeedbackEntry[]) {
  const blob = new Blob([JSON.stringify({ format: "drum-hero-adaptive-feedback-v1", entries }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "drum-hero-adaptive-feedback.json";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdaptivePracticeFeedback({ mode, voice, pattern }: { mode: AdaptiveMode; voice: string; pattern: string }) {
  const { t, formatDate } = useLocalization();
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [role, setRole] = useState<FeedbackEntry["role"]>("player");
  const [usefulness, setUsefulness] = useState(4);
  const [clarity, setClarity] = useState<FeedbackEntry["clarity"]>("clear");
  const [movement, setMovement] = useState<FeedbackEntry["movement"]>("unsure");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [exportReviewed, setExportReviewed] = useState(false);

  useEffect(() => {
    setEntries(readEntries(localStorage.getItem(STORAGE_KEY)));
  }, []);

  const save = () => {
    const next = [{ id: crypto.randomUUID(), recordedAt: new Date().toISOString(), mode, voice, pattern, role, usefulness, clarity, movement, note: note.trim().slice(0, 500) }, ...entries].slice(0, 100);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setEntries(next);
      setNote("");
      setExportReviewed(false);
      setMessage(t("Feedback saved on this device."));
    } catch {
      setMessage(t("Could not save feedback. Export the existing log or free browser storage, then retry."));
    }
  };

  const clearEntries = () => {
    if (!entries.length || !window.confirm(t("Delete every locally saved adaptive-practice feedback entry? This cannot be undone."))) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      setEntries([]);
      setExportReviewed(false);
      setMessage(t("Saved feedback was deleted from this device."));
    } catch {
      setMessage(t("Could not delete the saved feedback. Check browser storage and retry."));
    }
  };

  return <details className="adaptive-feedback">
    <summary>{t("Share optional feedback about this practice option")}</summary>
    <p>{t("Record whether this variation was clear and useful. Entries stay on this device unless you export them; Drum Hero does not send this feedback.")}</p>
    <label>{t("Your perspective")}<select value={role} onChange={(event) => setRole(event.target.value as FeedbackEntry["role"])}><option value="player">{t("Player")}</option><option value="educator">{t("Drum educator")}</option></select></label>
    <label>{t("How useful was it?")} · {usefulness} {t("of 5")}<input type="range" min="1" max="5" step="1" value={usefulness} onChange={(event) => setUsefulness(Number(event.target.value))} /></label>
    <label>{t("Were the targets and instructions clear?")}<select value={clarity} onChange={(event) => setClarity(event.target.value as FeedbackEntry["clarity"])}><option value="clear">{t("Yes, clear")}</option><option value="unclear">{t("No, confusing")}</option><option value="unsure">{t("Not sure")}</option></select></label>
    <label>{t("Compared with the standard pattern, how much movement did it take?")}<select value={movement} onChange={(event) => setMovement(event.target.value as FeedbackEntry["movement"])}><option value="less">{t("Less")}</option><option value="same">{t("About the same")}</option><option value="more">{t("More")}</option><option value="unsure">{t("Not sure")}</option></select></label>
    <label>{t("What worked or was confusing?")} <span>({t("optional")})</span><textarea maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("Avoid names or private health information.")} /></label>
    <div className="song-actions"><button type="button" onClick={save}>{t("Save feedback locally")}</button></div>
    <p>{entries.length} {t("feedback entries saved")} · {t("current option")}: {mode === "seated" ? t("Seated / no kick target") : `${t("One voice")} / ${voice}`} · {pattern}</p>
    {entries.length > 0 && <details className="adaptive-feedback-review"><summary>{t("Review saved entries ({count})", { count: entries.length })}</summary><ol>{entries.slice(0, 20).map((entry) => <li key={entry.id}><strong>{formatDate(new Date(entry.recordedAt), true)} · {t(entry.role === "player" ? "Player" : "Drum educator")} · {entry.mode === "seated" ? t("Seated / no kick") : `${t("One voice")} / ${entry.voice}`}</strong><span>{t("Usefulness {score} of 5", { score: entry.usefulness })} · {t(entry.clarity)} · {t(entry.movement)} · {entry.pattern}</span>{entry.note && <p>{entry.note}</p>}</li>)}</ol>{entries.length > 20 && <small>{t("Showing the 20 most recent of {count} saved entries. The export includes all entries.", { count: entries.length })}</small>}</details>}
    <label><input type="checkbox" checked={exportReviewed} onChange={(event) => setExportReviewed(event.currentTarget.checked)} /> {t("I reviewed this log and choose to export it as a file. Notes may contain sensitive information.")}</label>
    <div className="song-actions"><button type="button" onClick={() => exportEntries(entries)} disabled={!entries.length || !exportReviewed}>{t("Export feedback log")}</button><button type="button" className="button-secondary" onClick={clearEntries} disabled={!entries.length}>{t("Delete saved feedback")}</button></div>
    <p role="status">{message}</p>
  </details>;
}
