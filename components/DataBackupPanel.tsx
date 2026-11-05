"use client";

import { AudioStorageManager } from "./AudioStorageManager";
import { useRef, useState } from "react";
import { createLocalBackup, parseLocalBackup, restoreLocalBackup } from "@/lib/local-backup";
import { createProgressTransfer, mergeProgressTransfer, parseProgressTransfer, PROGRESS_TRANSFER_MAX_BYTES, type PortableProgressTransfer } from "@/lib/progress-transfer";
import { updateTrainerPreferredBpm } from "@/lib/trainer";
import { useProgress } from "./ProgressProvider";
import { ProfileDataScope } from "./ProfileDataScope";
import { dailySessionStorageKey, parseDailyPracticeSession } from "@/lib/daily-practice-session";
import { learnerStorageKey } from "@/lib/learner-profiles";
import { WEEKLY_GOAL_KEY, parseWeeklyGoalJson } from "@/lib/weekly-practice-goal";

type Backup = ReturnType<typeof parseLocalBackup>;

export function DataBackupPanel() {
  const { progress, profileId, replaceProgress } = useProgress();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const progressTransferInput = useRef<HTMLInputElement | null>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [progressTransfer, setProgressTransfer] = useState<PortableProgressTransfer | null>(null);
  const [progressTransferName, setProgressTransferName] = useState("");
  const [includeGuidedSession, setIncludeGuidedSession] = useState(true);
  const [includeWeeklyGoal, setIncludeWeeklyGoal] = useState(true);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const exportProgressTransfer = () => {
    const guidedPracticeSession = parseDailyPracticeSession(window.localStorage.getItem(dailySessionStorageKey(profileId)));
    const weeklyGoal = parseWeeklyGoalJson(window.localStorage.getItem(learnerStorageKey(WEEKLY_GOAL_KEY, profileId)));
    const data = JSON.stringify(createProgressTransfer(progress, new Date().toISOString(), { guidedPracticeSession, weeklyGoal }), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `drum-hero-progress-transfer-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setProgressTransfer(null);
    setMessage("Progress transfer downloaded. It contains lesson completions, recent scored practice summaries, best scores, preferred tempo, your weekly goal, and any saved guided session; it contains no audio.");
  };

  const chooseProgressTransfer = async (file?: File) => {
    setProgressTransfer(null);
    setProgressTransferName("");
    setIncludeGuidedSession(true);
    setIncludeWeeklyGoal(true);
    if (!file) return;
    if (file.size > PROGRESS_TRANSFER_MAX_BYTES) {
      setMessage("This progress transfer is larger than 4 MB.");
      return;
    }
    try {
      const parsed = parseProgressTransfer(await file.text());
      setProgressTransfer(parsed);
      setIncludeGuidedSession(Boolean(parsed.guidedPracticeSession));
      setIncludeWeeklyGoal(Boolean(parsed.weeklyGoal));
      setProgressTransferName(file.name);
      setMessage("Review the progress summary below, then merge it into the active learner profile.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read this progress transfer.");
    } finally { if (progressTransferInput.current) progressTransferInput.current.value = ""; }
  };

  const mergeImportedProgress = () => {
    if (!progressTransfer) return;
    const result = mergeProgressTransfer(progress, progressTransfer);
    updateTrainerPreferredBpm(progressTransfer.preferredBpm);
    replaceProgress(result.progress);
    let guidedSessionSaved = false;
    let weeklyGoalSaved = false;
    if (includeGuidedSession && progressTransfer.guidedPracticeSession) {
      try {
        window.localStorage.setItem(dailySessionStorageKey(profileId), JSON.stringify(progressTransfer.guidedPracticeSession));
        window.dispatchEvent(new Event("drum-hero:daily-session-change"));
        guidedSessionSaved = true;
      } catch { /* The rest of the progress can still be merged. */ }
    }
    if (includeWeeklyGoal && progressTransfer.weeklyGoal) {
      try {
        window.localStorage.setItem(learnerStorageKey(WEEKLY_GOAL_KEY, profileId), JSON.stringify(progressTransfer.weeklyGoal));
        window.dispatchEvent(new Event("drum-hero:weekly-goal-change"));
        weeklyGoalSaved = true;
      } catch { /* The rest of the progress can still be merged. */ }
    }
    setProgressTransfer(null);
    setProgressTransferName("");
    const sessionMessage = includeGuidedSession && progressTransfer.guidedPracticeSession ? guidedSessionSaved ? "Guided session moved. " : "Guided session could not be saved on this device. " : "";
    const goalMessage = includeWeeklyGoal && progressTransfer.weeklyGoal ? weeklyGoalSaved ? "Weekly goal moved. " : "Weekly goal could not be saved on this device. " : "";
    setMessage(`Merged ${result.addedLessons} lesson completions and ${result.addedSessions} practice sessions. ${result.ignoredLessons ? `${result.ignoredLessons} lesson IDs from another app version were skipped. ` : ""}${sessionMessage}${goalMessage}Preferred tempo set to ${progressTransfer.preferredBpm} BPM.`);
  };

  const exportBackup = async () => {
    setBusy(true);
    setMessage("Preparing your backup…");
    try {
      const data = await createLocalBackup();
      const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `drum-hero-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Backup downloaded. Keep it somewhere safe; it contains your private local practice data and audio.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the backup.");
    } finally { setBusy(false); }
  };

  const chooseBackup = async (file?: File) => {
    setBackup(null);
    setFileName("");
    setMessage("");
    if (!file) return;
    if (file.size > 128 * 1024 * 1024) {
      setMessage("This file is larger than the 128 MB restore limit.");
      return;
    }
    try {
      const parsed = parseLocalBackup(await file.text());
      setBackup(parsed);
      setFileName(file.name);
      setMessage(`Ready to restore ${Object.keys(parsed.localStorage).length} local data groups, including ${parsed.trainerRecordings?.length ?? 0} Trainer recordings, ${parsed.songRecordings.length} song recordings and ${parsed.customSamples.length} custom audio samples.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read this backup.");
    } finally { if (fileInput.current) fileInput.current.value = ""; }
  };

  const restore = async () => {
    if (!backup || !window.confirm("Restore this backup? It will replace the Drum Hero data currently stored in this browser.")) return;
    setBusy(true);
    setMessage("Restoring your backup…");
    try {
      await restoreLocalBackup(backup);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not restore this backup.");
      setBusy(false);
    }
  };

  return <section id="data-backup" className="data-backup card" aria-labelledby="data-backup-heading">
    <div><span className="eyebrow">Your data</span><h2 id="data-backup-heading">Back up or move your work</h2><p>Save lessons, practice history, Trainer settings, custom grooves, songs, local samples, and saved song takes and reference audio in one file. The downloaded file is not password-protected, so store and share it carefully.</p></div>
    <details className="portable-progress-transfer">
      <summary>Move learning progress between web and iOS</summary>
      <p>Export completed lessons, recent scored practice summaries, best scores, preferred tempo, this profile’s weekly goal, and its saved guided session. An imported session stays paused until you resume it. Progress merges into the currently active learner profile; you can choose whether to replace that profile’s saved session and weekly goal. Transfers contain no audio, Trainer calibration, Song Library projects, recordings, or account credentials. Transfer a personal song separately with the Song Library’s single-song JSON export. Full backups are platform-specific.</p>
      <div className="data-backup-actions">
        <button type="button" className="button-secondary" onClick={exportProgressTransfer}>Export progress transfer</button>
        <input ref={progressTransferInput} type="file" accept=".json,application/json" aria-label="Choose a Drum Hero progress transfer" onChange={(event) => void chooseProgressTransfer(event.currentTarget.files?.[0])} />
        <button type="button" className="button-secondary" onClick={() => progressTransferInput.current?.click()}>Choose progress transfer</button>
      </div>
      {progressTransfer && <div className="backup-review" aria-label="Progress transfer review">
        <h3>Review {progressTransferName}</h3>
        <p>{progressTransfer.completedLessons.length} lesson completions · {progressTransfer.practiceSessions.length} practice sessions · {Object.keys(progressTransfer.bestScores).length} best scores · preferred tempo {progressTransfer.preferredBpm} BPM.</p>
        {progressTransfer.guidedPracticeSession && <p>Guided session: {progressTransfer.guidedPracticeSession.completedStepIds.length} completed · {progressTransfer.guidedPracticeSession.skippedStepIds.length} skipped · {progressTransfer.guidedPracticeSession.steps.length} steps.</p>}
        {progressTransfer.weeklyGoal && <p>Weekly goal: {progressTransfer.weeklyGoal.target} {progressTransfer.weeklyGoal.type === "days" ? "practice days" : progressTransfer.weeklyGoal.type === "lessons" ? "lesson completions" : `${progressTransfer.weeklyGoal.focus} sessions`}.</p>}
        <p>This will merge into the active learner profile. Existing lessons and sessions are kept; duplicate session IDs are updated, and history is capped at 50 sessions.</p>
        {progressTransfer.guidedPracticeSession && <label><input type="checkbox" checked={includeGuidedSession} onChange={(event) => setIncludeGuidedSession(event.target.checked)} /> Replace the active profile’s saved guided session with this paused session.</label>}
        {progressTransfer.weeklyGoal && <label><input type="checkbox" checked={includeWeeklyGoal} onChange={(event) => setIncludeWeeklyGoal(event.target.checked)} /> Replace the active profile’s weekly goal with this goal.</label>}
        <button type="button" className="button" onClick={mergeImportedProgress}>Merge reviewed progress</button>
        <button type="button" className="button-secondary" onClick={() => { setProgressTransfer(null); setProgressTransferName(""); setMessage("Progress transfer cancelled."); }}>Cancel</button>
      </div>}
    </details>
    <div className="data-backup-actions">
      <button type="button" className="button" onClick={() => void exportBackup()} disabled={busy}>{busy ? "Working…" : "Download full backup"}</button>
      <div className="data-backup-restore">
        <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Choose a Drum Hero backup file" onChange={(event) => void chooseBackup(event.currentTarget.files?.[0])} />
        <button type="button" className="button-secondary" onClick={() => fileInput.current?.click()} disabled={busy}>Choose backup to restore</button>
        {backup && <button type="button" className="button" onClick={() => void restore()} disabled={busy}>Restore {fileName}</button>}
      </div>
    </div>
    <ProfileDataScope />
    <AudioStorageManager />
    <p className="data-backup-message" role="status">{message || "Restore replaces the Drum Hero data in this browser. Export a backup first if you want to keep both copies."}</p>
  </section>;
}
