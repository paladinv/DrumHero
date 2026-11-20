"use client";

import { AudioStorageManager } from "./AudioStorageManager";
import { useRef, useState } from "react";
import { createLocalBackup, parseLocalBackup, restoreLocalBackup } from "@/lib/local-backup";
import { createProgressTransfer, mergeProgressTransfer, parseProgressTransfer, PROGRESS_TRANSFER_MAX_BYTES, type PortableProgressTransfer } from "@/lib/progress-transfer";
import { parseTrainerPortableCoachFeedback, parseTrainerPortableCueSequences, parseTrainerState, portableTrainerRound, trainerStorageKey, updateTrainerPreferredBpm } from "@/lib/trainer";
import { parseSavedTrainerRoutine } from "@/lib/trainer-enhancements";
import { parseSavedTrainerCueSequences } from "@/lib/trainer-cue-sequences";
import { readTrainerTakes } from "@/lib/trainer-take-library";
import { useProgress } from "./ProgressProvider";
import { ProfileDataScope } from "./ProfileDataScope";
import { dailySessionStorageKey, parseDailyPracticeSession } from "@/lib/daily-practice-session";
import { learnerStorageKey } from "@/lib/learner-profiles";
import { WEEKLY_GOAL_KEY, parseWeeklyGoalJson } from "@/lib/weekly-practice-goal";
import { readSongLibrary, writeSongLibrary } from "@/lib/song-library";
import { readCustomGrooves, writeCustomGrooves } from "@/lib/custom-grooves";
import { EAR_HISTORY_KEY, parseEarHistory } from "@/lib/ear-training";

type Backup = ReturnType<typeof parseLocalBackup>;
const TRAINER_ROUTINE_KEY = "drum-hero:trainer-routine:v1";
const TRAINER_CUE_SEQUENCES_KEY = "drum-hero:trainer-cue-sequences:v1";

export function DataBackupPanel() {
  const { progress, profileId, replaceProgress } = useProgress();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const progressTransferInput = useRef<HTMLInputElement | null>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [progressTransfer, setProgressTransfer] = useState<PortableProgressTransfer | null>(null);
  const [progressTransferName, setProgressTransferName] = useState("");
  const [includeGuidedSession, setIncludeGuidedSession] = useState(true);
  const [includeWeeklyGoal, setIncludeWeeklyGoal] = useState(true);
  const [includeSongs, setIncludeSongs] = useState(true);
  const [includeGrooves, setIncludeGrooves] = useState(true);
  const [includeTrainer, setIncludeTrainer] = useState(true);
  const [includeEarTraining, setIncludeEarTraining] = useState(true);
  const [includeDetailedTiming, setIncludeDetailedTiming] = useState(false);
  const [includeEarTrainingOnExport, setIncludeEarTrainingOnExport] = useState(false);
  const [includeDetailedTimingOnExport, setIncludeDetailedTimingOnExport] = useState(false);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const exportProgressTransfer = async () => {
    const guidedPracticeSession = parseDailyPracticeSession(window.localStorage.getItem(dailySessionStorageKey(profileId)));
    const weeklyGoal = parseWeeklyGoalJson(window.localStorage.getItem(learnerStorageKey(WEEKLY_GOAL_KEY, profileId)));
    const library = readSongLibrary();
    const trainerState = parseTrainerState(window.localStorage.getItem(trainerStorageKey(profileId)));
    const earTraining = includeEarTrainingOnExport ? parseEarHistory(window.localStorage.getItem(learnerStorageKey(EAR_HISTORY_KEY, profileId))).slice(-100) : undefined;
    const routine = parseSavedTrainerRoutine(window.localStorage.getItem(TRAINER_ROUTINE_KEY));
    const cueSequences = parseSavedTrainerCueSequences(window.localStorage.getItem(TRAINER_CUE_SEQUENCES_KEY));
    const takes = await readTrainerTakes().catch(() => []);
    const coachFeedback = parseTrainerPortableCoachFeedback([
      ...(trainerState.coachFeedback ?? []),
      ...takes.flatMap(take => (take.coachReviews ?? []).map((review, index) => ({
        id: `${take.id}:${review.receivedAt}:${index}`, takeId: take.id,
        patternName: review.patternName, bpm: review.bpm, receivedAt: review.receivedAt, comments: review.comments,
      }))),
    ].slice(-100)) ?? [];
    const trainerPractice = {
      rounds: trainerState.rounds.slice(0, 50).map(round => portableTrainerRound(round, includeDetailedTimingOnExport)),
      ...(routine ? { routine } : {}),
      ...(cueSequences.length ? { cueSequences } : {}),
      ...(coachFeedback.length ? { coachFeedback } : {}),
    };
    const data = JSON.stringify(createProgressTransfer(progress, new Date().toISOString(), {
      guidedPracticeSession,
      weeklyGoal,
      personalSongs: library.songs.filter(song => song.bundled !== true),
      customGrooves: readCustomGrooves(),
      trainerPractice,
      earTraining
    }), null, 2);
    if (new TextEncoder().encode(data).byteLength > PROGRESS_TRANSFER_MAX_BYTES) {
      setMessage("This learning archive is larger than 32 MB. Export fewer personal songs or custom grooves and try again.");
      return;
    }
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `drum-hero-learning-archive-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setProgressTransfer(null);
    const timingNote = includeDetailedTimingOnExport ? "detailed Trainer timing" : "Trainer summaries";
    const earNote = includeEarTrainingOnExport ? "ear-training history" : "no ear-training history";
    setMessage(`Learning archive downloaded with ${timingNote} and ${earNote}. It contains no audio recordings or device calibration.`);
  };

  const chooseProgressTransfer = async (file?: File) => {
    setProgressTransfer(null);
    setProgressTransferName("");
    setIncludeGuidedSession(true);
    setIncludeWeeklyGoal(true);
    setIncludeTrainer(true);
    setIncludeEarTraining(true);
    setIncludeDetailedTiming(false);
    if (!file) return;
    if (file.size > PROGRESS_TRANSFER_MAX_BYTES) {
      setMessage("This learning archive is larger than 32 MB.");
      return;
    }
    try {
      const parsed = parseProgressTransfer(await file.text());
      setProgressTransfer(parsed);
      setIncludeGuidedSession(Boolean(parsed.guidedPracticeSession));
      setIncludeWeeklyGoal(Boolean(parsed.weeklyGoal));
      setIncludeSongs(Boolean(parsed.personalSongs?.length));
      setIncludeGrooves(Boolean(parsed.customGrooves?.length));
      setIncludeTrainer(Boolean(parsed.trainerPractice));
      setIncludeEarTraining(Boolean(parsed.earTraining?.length));
      setIncludeDetailedTiming(Boolean(parsed.trainerPractice?.rounds.some(round => round.hits?.length)));
      setProgressTransferName(file.name);
      setMessage("Review the learning archive below, then merge it into the active learner profile.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read this learning archive.");
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
    let importedSongs = 0;
    if (includeSongs && progressTransfer.personalSongs?.length) {
      try {
        const library = readSongLibrary();
        const existing = new Set(library.songs.map(song => song.id));
        const additions = progressTransfer.personalSongs.filter(song => !existing.has(song.id));
        if (additions.length) writeSongLibrary({ ...library, songs: [...library.songs, ...additions] });
        importedSongs = additions.length;
      } catch { /* Progress stays merged if the library is locked or storage is unavailable. */ }
    }
    let importedGrooves = 0;
    if (includeGrooves && progressTransfer.customGrooves?.length) {
      try {
        const current = readCustomGrooves();
        const byId = new Map(current.map(groove => [groove.id, groove]));
        for (const groove of progressTransfer.customGrooves) if (!byId.has(groove.id)) byId.set(groove.id, groove);
        if (writeCustomGrooves([...byId.values()])) importedGrooves = Math.max(0, byId.size - current.length);
      } catch { /* Other archive contents remain usable if custom grooves cannot be saved. */ }
    }
    let importedTrainerRounds = 0;
    let importedCueSequences = 0;
    let importedCoachNotes = 0;
    let importedTimingRecords = 0;
    if (includeTrainer && progressTransfer.trainerPractice) {
      try {
        const incoming = progressTransfer.trainerPractice;
        const key = trainerStorageKey(profileId);
        const current = parseTrainerState(window.localStorage.getItem(key));
        const rounds = new Map(current.rounds.map(round => [round.id, round]));
        for (const round of incoming.rounds) {
          const importedRound = includeDetailedTiming ? round : { ...round, hits: undefined };
          if (includeDetailedTiming && importedRound.hits) importedTimingRecords += importedRound.hits.length;
          const existing = rounds.get(round.id);
          if (!existing) { importedTrainerRounds += 1; rounds.set(round.id, importedRound); }
          else if (existing.summaryOnly === true) rounds.set(round.id, importedRound);
        }
        const feedback = new Map((current.coachFeedback ?? []).map(item => [item.id, item]));
        for (const item of incoming.coachFeedback ?? []) {
          if (!feedback.has(item.id)) importedCoachNotes += 1;
          feedback.set(item.id, item);
        }
        const existingCueSequences = parseSavedTrainerCueSequences(window.localStorage.getItem(TRAINER_CUE_SEQUENCES_KEY));
        let mergedCueSequences = current.cueSequences;
        if (incoming.cueSequences) {
          const existingCueIds = new Set(existingCueSequences.map(item => item.id));
          const byId = new Map(incoming.cueSequences.map(item => [item.id, item]));
          for (const item of existingCueSequences) if (!byId.has(item.id)) byId.set(item.id, item);
          mergedCueSequences = parseTrainerPortableCueSequences([...byId.values()].slice(0, 30)) ?? current.cueSequences;
          importedCueSequences = incoming.cueSequences.filter(item => !existingCueIds.has(item.id)).length;
        }
        const next = {
          ...current,
          rounds: [...rounds.values()].sort((a, b) => b.playedAt.localeCompare(a.playedAt)).slice(0, 50),
          ...(incoming.routine ? { routine: incoming.routine } : {}),
          ...(mergedCueSequences ? { cueSequences: mergedCueSequences } : {}),
          coachFeedback: [...feedback.values()].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).slice(-100),
        };
        window.localStorage.setItem(key, JSON.stringify(next));
        if (incoming.routine) window.localStorage.setItem(TRAINER_ROUTINE_KEY, JSON.stringify(incoming.routine));
        if (incoming.cueSequences) {
          window.localStorage.setItem(TRAINER_CUE_SEQUENCES_KEY, JSON.stringify(mergedCueSequences ?? incoming.cueSequences));
        }
        window.dispatchEvent(new Event("drum-hero:trainer-state-import"));
        window.dispatchEvent(new Event("drum-hero:trainer-library-change"));
      } catch { /* Other archive contents remain usable if Trainer storage is unavailable. */ }
    }
    let importedEarTraining = 0;
    if (includeEarTraining && progressTransfer.earTraining?.length) {
      try {
        const key = learnerStorageKey(EAR_HISTORY_KEY, profileId);
        const existing = parseEarHistory(window.localStorage.getItem(key));
        const byId = new Map(existing.map(result => [result.id, result]));
        for (const result of progressTransfer.earTraining) {
          if (!byId.has(result.id)) importedEarTraining += 1;
          byId.set(result.id, result);
        }
        const results = [...byId.values()].sort((a, b) => a.playedAt.localeCompare(b.playedAt)).slice(-100);
        window.localStorage.setItem(key, JSON.stringify({ version: 1, results }));
        window.dispatchEvent(new Event("drum-hero:ear-training-change"));
      } catch { /* Other archive contents remain usable when ear-training storage is unavailable. */ }
    }
    setProgressTransfer(null);
    setProgressTransferName("");
    const sessionMessage = includeGuidedSession && progressTransfer.guidedPracticeSession ? guidedSessionSaved ? "Guided session moved. " : "Guided session could not be saved on this device. " : "";
    const goalMessage = includeWeeklyGoal && progressTransfer.weeklyGoal ? weeklyGoalSaved ? "Weekly goal moved. " : "Weekly goal could not be saved on this device. " : "";
    setMessage(`Merged ${result.addedLessons} lesson completions and ${result.addedSessions} practice sessions, added ${importedTrainerRounds} Trainer round summaries, ${importedTimingRecords} detailed timing records, ${importedEarTraining} ear-training results, ${importedCueSequences} cue sequences, ${importedCoachNotes} coach notes, ${importedSongs} personal songs and ${importedGrooves} custom grooves. ${result.ignoredLessons ? `${result.ignoredLessons} lesson IDs from another app version were skipped. ` : ""}${sessionMessage}${goalMessage}Preferred tempo set to ${progressTransfer.preferredBpm} BPM.`);
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
      <summary>Move a learning archive between web and iOS</summary>
      <p>The archive includes completed lessons, recent scored practice summaries, Trainer round summaries, a personal routine, saved cue sequences, coach feedback notes, best scores, preferred tempo, this profile’s weekly goal and guided session, personal Song Library songs, and custom grooves. Ear-training history and detailed Trainer timing are optional. Progress merges into the currently active learner profile; songs and grooves with matching IDs are kept. A saved guided session stays paused until resumed. Audio recordings, account credentials, and device-specific calibration remain local; full recovery backups are platform-specific.</p>
      <div className="backup-review" aria-label="Optional learning archive details">
        <label><input type="checkbox" checked={includeEarTrainingOnExport} onChange={(event) => setIncludeEarTrainingOnExport(event.target.checked)} /> Include this learner’s last 100 ear-training results.</label>
        <label><input type="checkbox" checked={includeDetailedTimingOnExport} onChange={(event) => setIncludeDetailedTimingOnExport(event.target.checked)} /> Include up to 600 hit-timing records for each exported Trainer round.</label>
        <small>These detailed results can show musical timing and error locations. Review the file before sharing it.</small>
      </div>
      <div className="data-backup-actions">
        <button type="button" className="button-secondary" onClick={() => void exportProgressTransfer()}>Export learning archive</button>
        <input ref={progressTransferInput} type="file" accept=".json,application/json" aria-label="Choose a Drum Hero learning archive" onChange={(event) => void chooseProgressTransfer(event.currentTarget.files?.[0])} />
        <button type="button" className="button-secondary" onClick={() => progressTransferInput.current?.click()}>Choose learning archive</button>
      </div>
      {progressTransfer && <div className="backup-review" aria-label="Learning archive review">
        <h3>Review {progressTransferName}</h3>
        <p>{progressTransfer.completedLessons.length} lesson completions · {progressTransfer.practiceSessions.length} practice sessions · {progressTransfer.trainerPractice?.rounds.length ?? 0} Trainer rounds · {progressTransfer.earTraining?.length ?? 0} ear-training results · {progressTransfer.trainerPractice?.rounds.reduce((count, round) => count + (round.hits?.length ?? 0), 0) ?? 0} detailed timing records · {progressTransfer.trainerPractice?.cueSequences?.length ?? 0} cue sequences · {progressTransfer.trainerPractice?.coachFeedback?.length ?? 0} coach notes · {Object.keys(progressTransfer.bestScores).length} best scores · {progressTransfer.personalSongs?.length ?? 0} personal songs · {progressTransfer.customGrooves?.length ?? 0} custom grooves · preferred tempo {progressTransfer.preferredBpm} BPM.</p>
        {progressTransfer.guidedPracticeSession && <p>Guided session: {progressTransfer.guidedPracticeSession.completedStepIds.length} completed · {progressTransfer.guidedPracticeSession.skippedStepIds.length} skipped · {progressTransfer.guidedPracticeSession.steps.length} steps.</p>}
        {progressTransfer.weeklyGoal && <p>Weekly goal: {progressTransfer.weeklyGoal.target} {progressTransfer.weeklyGoal.type === "days" ? "practice days" : progressTransfer.weeklyGoal.type === "lessons" ? "lesson completions" : `${progressTransfer.weeklyGoal.focus} sessions`}.</p>}
        <p>This will merge into the active learner profile. Existing lessons and sessions are kept; duplicate session IDs are updated, and history is capped at 50 sessions.</p>
        {progressTransfer.guidedPracticeSession && <label><input type="checkbox" checked={includeGuidedSession} onChange={(event) => setIncludeGuidedSession(event.target.checked)} /> Replace the active profile’s saved guided session with this paused session.</label>}
        {progressTransfer.weeklyGoal && <label><input type="checkbox" checked={includeWeeklyGoal} onChange={(event) => setIncludeWeeklyGoal(event.target.checked)} /> Replace the active profile’s weekly goal with this goal.</label>}
        {progressTransfer.personalSongs?.length ? <label><input type="checkbox" checked={includeSongs} onChange={(event) => setIncludeSongs(event.target.checked)} /> Add personal songs with new IDs to the shared Song Library.</label> : null}
        {progressTransfer.customGrooves?.length ? <label><input type="checkbox" checked={includeGrooves} onChange={(event) => setIncludeGrooves(event.target.checked)} /> Add custom grooves with new IDs to this device.</label> : null}
        {progressTransfer.trainerPractice && <label><input type="checkbox" checked={includeTrainer} onChange={(event) => setIncludeTrainer(event.target.checked)} /> Merge Trainer summaries, routine, cue sequences, and coach notes. Local calibration and recordings stay on this device.</label>}
        {progressTransfer.trainerPractice?.rounds.some(round => round.hits?.length) && <label><input type="checkbox" checked={includeDetailedTiming} onChange={(event) => setIncludeDetailedTiming(event.target.checked)} /> Include the detailed Trainer timing records shown above.</label>}
        {progressTransfer.earTraining?.length ? <label><input type="checkbox" checked={includeEarTraining} onChange={(event) => setIncludeEarTraining(event.target.checked)} /> Merge ear-training results into the active learner profile.</label> : null}
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
