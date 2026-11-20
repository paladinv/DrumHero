"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSongCloudClient, songCloudConfigured } from "@/lib/song-cloud";
import { useProgress } from "@/components/ProgressProvider";
import { LEARNER_PROFILES_KEY, learnerStorageKey, readLearnerProfiles } from "@/lib/learner-profiles";
import { trainerStorageKey, parseTrainerPortableCoachFeedback, parseTrainerState, trainerStateForCloud, type TrainerState } from "@/lib/trainer";
import { parseSavedTrainerRoutine } from "@/lib/trainer-enhancements";
import { parseSavedTrainerCueSequences } from "@/lib/trainer-cue-sequences";
import { AUDIO_STORAGE_EVENT } from "@/lib/audio-storage";
import { readTrainerTakes } from "@/lib/trainer-take-library";
import { EAR_CHALLENGE_PACKS_KEY, EAR_HISTORY_KEY, EAR_REVIEW_KEY, parseEarChallengePacks, parseEarHistory, parseEarReviewSchedule } from "@/lib/ear-training";
import { mergePracticeCloudData, parsePracticeCloudData, practiceCloudSignature, type EarPracticeCloudData, type PracticeCloudData } from "@/lib/practice-cloud";
import { SIGHT_HISTORY_CHANGED_EVENT, SIGHT_HISTORY_KEY, mergeSightAttempts, parseSightHistory, type SightAttempt } from "@/lib/sight-reading";

type Snapshot = { user_id: string; local_profile_id: string; learner_name: string; revision: number; state: PracticeCloudData; device_name: string; updated_at: string };
type Revision = { revision: number; state: PracticeCloudData; device_name: string; created_at: string };
type Checkpoint = { revision: number; signature: string };
const TRAINER_ROUTINE_KEY = "drum-hero:trainer-routine:v1";
const TRAINER_CUE_SEQUENCES_KEY = "drum-hero:trainer-cue-sequences:v1";

function readTrainerState(profileId: string): TrainerState {
  const state = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId)));
  const routine = parseSavedTrainerRoutine(localStorage.getItem(TRAINER_ROUTINE_KEY)) ?? state.routine;
  const savedCues = parseSavedTrainerCueSequences(localStorage.getItem(TRAINER_CUE_SEQUENCES_KEY));
  const cueSequences = savedCues.length ? savedCues : state.cueSequences;
  return { ...state, ...(routine ? { routine } : {}), ...(cueSequences ? { cueSequences } : {}) };
}

function readEarTraining(profileId: string): EarPracticeCloudData {
  return {
    history: parseEarHistory(localStorage.getItem(learnerStorageKey(EAR_HISTORY_KEY, profileId))),
    reviewSchedule: parseEarReviewSchedule(localStorage.getItem(learnerStorageKey(EAR_REVIEW_KEY, profileId))),
    challengePacks: parseEarChallengePacks(localStorage.getItem(learnerStorageKey(EAR_CHALLENGE_PACKS_KEY, profileId))),
  };
}

function writeEarTraining(profileId: string, data: EarPracticeCloudData) {
  localStorage.setItem(learnerStorageKey(EAR_HISTORY_KEY, profileId), JSON.stringify({ version: 1, results: data.history.slice(-100) }));
  localStorage.setItem(learnerStorageKey(EAR_REVIEW_KEY, profileId), JSON.stringify(data.reviewSchedule));
  localStorage.setItem(learnerStorageKey(EAR_CHALLENGE_PACKS_KEY, profileId), JSON.stringify({ version: 1, packs: data.challengePacks.slice(-20) }));
  window.dispatchEvent(new Event("drum-hero:ear-training-change"));
}

function readSightReading(profileId: string): SightAttempt[] {
  return parseSightHistory(localStorage.getItem(learnerStorageKey(SIGHT_HISTORY_KEY, profileId)));
}

function writeSightReading(profileId: string, attempts: SightAttempt[]) {
  localStorage.setItem(learnerStorageKey(SIGHT_HISTORY_KEY, profileId), JSON.stringify({ version: 1, attempts: attempts.slice(-100) }));
  window.dispatchEvent(new Event(SIGHT_HISTORY_CHANGED_EVENT));
}

function readSnapshot(value: unknown): Snapshot {
  if (!value || typeof value !== "object") throw new Error("Cloud response is missing.");
  const row = value as Record<string, unknown>;
  if (typeof row.user_id !== "string" || typeof row.local_profile_id !== "string" || typeof row.learner_name !== "string" || !Number.isInteger(row.revision) || typeof row.device_name !== "string" || typeof row.updated_at !== "string") throw new Error("Cloud response is not a practice snapshot.");
  return { user_id: row.user_id, local_profile_id: row.local_profile_id, learner_name: row.learner_name, revision: row.revision as number, state: parsePracticeCloudData(row.state), device_name: row.device_name, updated_at: row.updated_at };
}

function readRevision(value: unknown): Revision {
  if (!value || typeof value !== "object") throw new Error("Cloud revision is missing.");
  const row = value as Record<string, unknown>;
  if (!Number.isInteger(row.revision) || typeof row.device_name !== "string" || typeof row.created_at !== "string") throw new Error("Cloud revision is not supported.");
  return { revision: row.revision as number, state: parsePracticeCloudData(row.state), device_name: row.device_name, created_at: row.created_at };
}

function downloadSnapshot(data: PracticeCloudData, profileName: string) {
  const blob = new Blob([JSON.stringify({ application: "Drum Hero", format: "drum-hero-practice-snapshot", version: 1, profileName, data }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `drum-hero-practice-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
}

export function PracticeCloudPanel() {
  const { profileId, progress, hydrated, replaceProgress } = useProgress();
  const [trainer, setTrainer] = useState<TrainerState>(() => parseTrainerState(null));
  const [trainerLoaded, setTrainerLoaded] = useState(false);
  const [takeCoachFeedback, setTakeCoachFeedback] = useState<NonNullable<TrainerState["coachFeedback"]>>([]);
  const [earTraining, setEarTraining] = useState<EarPracticeCloudData>({ history: [], reviewSchedule: [], challengePacks: [] });
  const [earTrainingLoaded, setEarTrainingLoaded] = useState(false);
  const [sightReading, setSightReading] = useState<SightAttempt[]>([]);
  const [sightReadingLoaded, setSightReadingLoaded] = useState(false);
  const [profileName, setProfileName] = useState("This device");
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deviceName, setDeviceName] = useState("This device");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [remote, setRemote] = useState<Revision | null>(null);
  const [history, setHistory] = useState<Revision[]>([]);
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [missingRemote, setMissingRemote] = useState(false);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saveCycle, setSaveCycle] = useState(0);
  const generation = useRef(0);
  const saving = useRef(false);

  const localData = useMemo<PracticeCloudData>(() => ({ version: 1, progress, trainer, earTraining, ...(sightReading.length ? { sightReading } : {}) }), [progress, trainer, earTraining, sightReading]);
  const cloudData = useMemo<PracticeCloudData>(() => {
    const portableTrainer = trainerStateForCloud(localData.trainer);
    const feedbackById = new Map([...(portableTrainer.coachFeedback ?? []), ...takeCoachFeedback].map(item => [item.id, item]));
    const feedback = parseTrainerPortableCoachFeedback([...feedbackById.values()].sort((left, right) => left.receivedAt.localeCompare(right.receivedAt)).slice(-100)) ?? portableTrainer.coachFeedback ?? [];
    return { ...localData, trainer: { ...portableTrainer, ...(feedback.length ? { coachFeedback: feedback.slice(-100) } : {}) } };
  }, [localData, takeCoachFeedback]);
  const localSignature = practiceCloudSignature(cloudData);
  const hasPendingChanges = Boolean(checkpoint && checkpoint.signature !== localSignature);

  useEffect(() => {
    const load = () => {
      generation.current += 1;
      setTrainer(readTrainerState(profileId));
      setEarTraining(readEarTraining(profileId)); setEarTrainingLoaded(true);
      setSightReading(readSightReading(profileId)); setSightReadingLoaded(true);
      const profiles = readLearnerProfiles(localStorage.getItem(LEARNER_PROFILES_KEY));
      setProfileName(profiles.find((profile) => profile.id === profileId)?.name ?? "This device");
      setTrainerLoaded(true); setSnapshot(null); setRemote(null); setHistory([]); setCheckpoint(null); setSyncEnabled(false); setMissingRemote(false);
    };
    const reloadTrainer = () => setTrainer(readTrainerState(profileId));
    setTrainerLoaded(false);
    setEarTrainingLoaded(false); setSightReadingLoaded(false);
    const timer = window.setTimeout(load, 0);
    window.addEventListener("drum-hero:trainer-state-import", reloadTrainer);
    const reloadEarTraining = () => setEarTraining(readEarTraining(profileId));
    window.addEventListener("drum-hero:ear-training-change", reloadEarTraining);
    const reloadSightReading = () => setSightReading(readSightReading(profileId));
    window.addEventListener(SIGHT_HISTORY_CHANGED_EVENT, reloadSightReading);
    return () => { clearTimeout(timer); window.removeEventListener("drum-hero:trainer-state-import", reloadTrainer); window.removeEventListener("drum-hero:ear-training-change", reloadEarTraining); window.removeEventListener(SIGHT_HISTORY_CHANGED_EVENT, reloadSightReading); };
  }, [profileId]);

  useEffect(() => {
    let active = true;
    const refreshCoachFeedback = () => { void readTrainerTakes().then(takes => {
      if (!active) return;
      const feedback = takes.flatMap(take => (take.coachReviews ?? []).map((review, index) => ({
        id: `${take.id}:${review.receivedAt}:${index}`, takeId: take.id,
        patternName: review.patternName, bpm: review.bpm, receivedAt: review.receivedAt, comments: review.comments,
      })));
      setTakeCoachFeedback(parseTrainerPortableCoachFeedback(feedback) ?? []);
    }).catch(() => { if (active) setTakeCoachFeedback([]); }); };
    refreshCoachFeedback();
    window.addEventListener(AUDIO_STORAGE_EVENT, refreshCoachFeedback);
    return () => { active = false; window.removeEventListener(AUDIO_STORAGE_EVENT, refreshCoachFeedback); };
  }, []);

  useEffect(() => { setOnline(navigator.onLine); const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener("online", on); window.addEventListener("offline", off); return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); }; }, []);

  useEffect(() => {
    if (!connected) return;
    const client = getSongCloudClient(); if (!client) return;
    let live = true;
    void client.auth.getSession().then(({ data }) => { if (live) setUser(data.session?.user ?? null); });
    const { data } = client.auth.onAuthStateChange((_event, session) => { if (!live) return; generation.current += 1; setUser(session?.user ?? null); setSnapshot(null); setRemote(null); setCheckpoint(null); setSyncEnabled(false); });
    return () => { live = false; data.subscription.unsubscribe(); };
  }, [connected]);

  const reviewCloud = useCallback(async () => {
    if (!user || !online) return;
    const client = getSongCloudClient(); if (!client) return;
    setBusy(true); setSyncEnabled(false); setMessage("Reviewing this learner’s cloud snapshot…");
    try {
      const { data, error } = await client.from("drum_practice_snapshots").select("*").eq("user_id", user.id).eq("local_profile_id", profileId).maybeSingle();
      if (error) throw error;
      if (!data) { setSnapshot(null); setRemote(null); setMissingRemote(true); setMessage("No cloud snapshot exists for this learner yet. Create one from this device when you are ready."); }
      else { const saved = readSnapshot(data); setSnapshot(saved); setRemote({ revision: saved.revision, state: saved.state, device_name: saved.device_name, created_at: saved.updated_at }); setMissingRemote(false); setMessage(`Review cloud revision ${saved.revision} before enabling sync.`); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not review the cloud snapshot."); }
    finally { setBusy(false); }
  }, [online, profileId, user]);

  const createSnapshot = async () => {
    const client = getSongCloudClient(); if (!client || !user || !online) return;
    setBusy(true); setMessage("Creating a private cloud snapshot…");
    try {
      const { data, error } = await client.rpc("save_drum_practice_snapshot", { p_local_profile_id: profileId, p_expected_revision: 0, p_learner_name: profileName.slice(0, 60), p_state: cloudData, p_device_name: deviceName.slice(0, 80) });
      if (error) throw error;
      const saved = readSnapshot(Array.isArray(data) ? data[0] : data); setSnapshot(saved); setCheckpoint({ revision: saved.revision, signature: practiceCloudSignature(saved.state) }); setSyncEnabled(true); setMissingRemote(false); setMessage(`Private snapshot created at revision ${saved.revision}. Sync is enabled for this learner.`);
    } catch (error) {
      if ((error as { code?: string }).code === "40001") { setMessage("Another device created this snapshot first. Review its cloud data before syncing."); void reviewCloud(); }
      else setMessage(error instanceof Error ? error.message : "Could not create a cloud snapshot.");
    } finally { setBusy(false); }
  };

  const saveSnapshot = useCallback(async (expectedRevision: number, dataToSave: PracticeCloudData, requestGeneration: number) => {
    const client = getSongCloudClient(); if (!client || !user) return;
    const { data, error } = await client.rpc("save_drum_practice_snapshot", { p_local_profile_id: profileId, p_expected_revision: expectedRevision, p_learner_name: profileName.slice(0, 60), p_state: dataToSave, p_device_name: deviceName.slice(0, 80) });
    if (error) throw error;
    const saved = readSnapshot(Array.isArray(data) ? data[0] : data);
    if (requestGeneration === generation.current) { setSnapshot(saved); setCheckpoint({ revision: saved.revision, signature: practiceCloudSignature(saved.state) }); setMessage(`Synced private practice snapshot at revision ${saved.revision}.`); }
  }, [deviceName, profileId, profileName, user]);

  useEffect(() => {
    if (!user || !hydrated || !trainerLoaded || !earTrainingLoaded || !sightReadingLoaded || !syncEnabled || !checkpoint || snapshot?.local_profile_id !== profileId || !online || checkpoint.signature === localSignature) return;
    const timer = window.setTimeout(() => {
      if (saving.current) return;
      const client = getSongCloudClient(); if (!client) return;
      saving.current = true; setBusy(true); const requestedGeneration = generation.current;
      void saveSnapshot(checkpoint.revision, cloudData, requestedGeneration).catch(async (error: unknown) => {
        if (requestedGeneration !== generation.current) return;
        if ((error as { code?: string })?.code === "40001") { setSyncEnabled(false); setMessage("The cloud snapshot changed elsewhere. Review it before continuing sync."); await reviewCloud(); }
        else { setSyncEnabled(false); setMessage(error instanceof Error ? error.message : "Sync failed. Local practice data is still available."); }
      }).finally(() => { saving.current = false; setSaveCycle((cycle) => cycle + 1); if (requestedGeneration === generation.current) setBusy(false); });
    }, 1300);
    return () => window.clearTimeout(timer);
  }, [checkpoint, generation, hydrated, earTrainingLoaded, sightReadingLoaded, cloudData, localSignature, online, profileId, reviewCloud, saveCycle, saveSnapshot, snapshot?.local_profile_id, syncEnabled, trainerLoaded, user]);

  const applyTrainer = (value: TrainerState) => {
    const localDeviceSettings = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId)));
    const merged = { ...value, latencyMs: localDeviceSettings.latencyMs, midiMap: localDeviceSettings.midiMap, deviceProfiles: localDeviceSettings.deviceProfiles };
    setTrainer(merged);
    try {
      localStorage.setItem(trainerStorageKey(profileId), JSON.stringify(merged));
      if (merged.routine) localStorage.setItem(TRAINER_ROUTINE_KEY, JSON.stringify(merged.routine));
      else localStorage.removeItem(TRAINER_ROUTINE_KEY);
      if (merged.cueSequences) localStorage.setItem(TRAINER_CUE_SEQUENCES_KEY, JSON.stringify(merged.cueSequences));
      else localStorage.removeItem(TRAINER_CUE_SEQUENCES_KEY);
      window.dispatchEvent(new Event("drum-hero:trainer-state-import"));
      window.dispatchEvent(new Event("drum-hero:trainer-library-change"));
    }
    catch { setMessage("Trainer settings could not be saved locally."); }
  };

  const applyEarTraining = (value?: EarPracticeCloudData) => {
    if (!value) return;
    try { writeEarTraining(profileId, value); setEarTraining(value); }
    catch { setMessage("Ear-training sync could not be saved locally. Your existing local data is still available."); }
  };

  const applySightReading = (value?: SightAttempt[]) => {
    if (!value) return;
    try { writeSightReading(profileId, value); setSightReading(value); }
    catch { setMessage("Sight-reading history could not be saved locally. Your existing local history is still available."); }
  };

  const chooseVersion = (mode: "cloud" | "device" | "merge") => {
    if (!snapshot || !remote) return;
    const mergeSource = { ...localData, trainer: { ...localData.trainer, coachFeedback: cloudData.trainer.coachFeedback ?? localData.trainer.coachFeedback } };
    const next = mode === "cloud" ? remote.state : mode === "merge" ? mergePracticeCloudData(mergeSource, remote.state) : localData;
    if (mode !== "device") { replaceProgress(next.progress); applyTrainer(next.trainer); applyEarTraining(mode === "cloud" ? remote.state.earTraining : next.earTraining); applySightReading(mode === "cloud" ? remote.state.sightReading : next.sightReading); }
    setCheckpoint({ revision: snapshot.revision, signature: practiceCloudSignature(snapshot.state) }); setRemote(null); setSyncEnabled(true);
    setMessage(mode === "cloud" ? `Revision ${remote.revision} is now active on this device.` : mode === "merge" ? "Local and cloud progress were merged. The merged snapshot will sync as a new revision." : "Device data retained. Sync is enabled and will upload local changes as a new revision.");
  };

  const loadHistory = async () => {
    const client = getSongCloudClient(); if (!client || !user || !online) return;
    setBusy(true); setMessage("Loading the last 20 cloud revisions…");
    try {
      const { data, error } = await client.from("drum_practice_snapshot_revisions").select("revision,state,device_name,created_at").eq("user_id", user.id).eq("local_profile_id", profileId).order("revision", { ascending: false }).limit(20);
      if (error) throw error;
      setHistory((data ?? []).map(readRevision)); setMessage(data?.length ? "Choose a revision to review. Recovery syncs it as a new revision." : "No earlier cloud revisions yet.");
    } catch { setMessage("Revision history is unavailable. Apply migration 202610210001 and review the latest snapshot first."); }
    finally { setBusy(false); }
  };

  const deleteCloudSnapshot = async () => {
    if (!user || !window.confirm(`Delete ${profileName}’s cloud practice snapshot and its revision history? Local data stays on this device.`)) return;
    const client = getSongCloudClient(); if (!client) return;
    setBusy(true);
    try {
      const { error } = await client.from("drum_practice_snapshots").delete().eq("user_id", user.id).eq("local_profile_id", profileId);
      if (error) throw error;
      setSnapshot(null); setRemote(null); setCheckpoint(null); setSyncEnabled(false); setHistory([]); setMessage("Cloud snapshot deleted. Local learner, Trainer, and ear-training data remain on this device.");
    } catch { setMessage("Could not delete the cloud snapshot. Check your account access and connection."); }
    finally { setBusy(false); }
  };

  if (!songCloudConfigured()) return <section className="practice-cloud-panel card"><h2>Optional practice sync</h2><p>Add the Supabase settings and apply migration 202610210001 to enable private progress sync. Local practice remains available without an account.</p></section>;
  return <section className="practice-cloud-panel card" aria-labelledby="practice-cloud-heading">
    <span className="eyebrow">Optional · private · revisioned</span><h2 id="practice-cloud-heading">Sync progress across devices</h2>
    <p>Sync lesson completion, practice scores, Trainer round summaries, routines, cue sequences, coach notes, ear-training history, sight-reading attempts, review schedules, and challenge packs for {profileName}. Audio, per-hit timing, recordings, and device calibration stay on this device. Sync is opt-in and profile-specific.</p>
    {!connected ? <button type="button" onClick={() => setConnected(true)}>Connect account</button> : !user ? <form onSubmit={(event) => { event.preventDefault(); const client = getSongCloudClient(); if (!client) return; setBusy(true); void client.auth.signInWithPassword({ email, password }).then(({ error }) => { if (error) throw error; setPassword(""); setMessage("Signed in. Review a snapshot before enabling sync."); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Sign in failed.")).finally(() => setBusy(false)); }}><label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input required type="password" autoComplete="current-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="song-actions"><button type="submit" disabled={busy}>Sign in</button><button type="button" disabled={busy || !email || password.length < 12} onClick={() => { const client = getSongCloudClient(); if (!client) return; setBusy(true); void client.auth.signUp({ email, password }).then(({ error }) => { if (error) throw error; setPassword(""); setMessage("Account created. Confirm your email if requested, then sign in."); }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Account creation failed.")).finally(() => setBusy(false)); }}>Create account</button></div></form> : <>
      <p>Signed in as {user.email} · {online ? "Online" : "Offline; local changes are retained"}</p>
      <p>For native iOS sync, use this learner profile code: <code>{profileId}</code>. The default profile code is <code>default</code>.</p>
      <label>Device label<input maxLength={80} value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /></label>
      <div className="song-actions"><button type="button" disabled={busy || !online || !earTrainingLoaded || !sightReadingLoaded} onClick={() => void reviewCloud()}>Review cloud snapshot</button><button type="button" disabled={!checkpoint || busy} onClick={() => setSyncEnabled((enabled) => !enabled)}>{syncEnabled ? "Pause sync" : "Resume sync"}</button><button type="button" disabled={!earTrainingLoaded || !sightReadingLoaded} onClick={() => downloadSnapshot(cloudData, profileName)}>Export this learner’s snapshot</button><button type="button" disabled={!snapshot || busy || !online} onClick={() => void deleteCloudSnapshot()}>Delete cloud snapshot</button></div>
      {missingRemote && <button type="button" className="button" disabled={busy || !online || !earTrainingLoaded || !sightReadingLoaded} onClick={() => void createSnapshot()}>Create private cloud snapshot from this device</button>}
      <p>Cloud revision: {snapshot ? `${snapshot.revision} · last updated ${new Date(snapshot.updated_at).toLocaleString()} · ${snapshot.device_name || "Unnamed device"}` : "Not reviewed"}{checkpoint ? ` · ${syncEnabled ? "sync on" : "sync paused"}` : ""}{hasPendingChanges ? ` · ${online ? "local changes waiting for sync" : "local changes saved on this device; reconnect to sync"}` : ""}</p>
      {remote && snapshot && <div className="song-cloud-review"><h3>Review revision {remote.revision} · {remote.device_name || "Unnamed device"}</h3><p>Cloud: {remote.state.progress.sessions.length} Practice Pad sessions, {remote.state.trainer.rounds.length} Trainer rounds, {remote.state.earTraining?.history.length ?? 0} ear-training attempts, {remote.state.sightReading?.length ?? 0} sight-reading attempts, and {remote.state.earTraining?.challengePacks.length ?? 0} challenge packs. Device: {progress.sessions.length} Practice Pad sessions, {trainer.rounds.length} Trainer rounds, {earTraining.history.length} ear-training attempts, {sightReading.length} sight-reading attempts, and {earTraining.challengePacks.length} challenge packs.</p><div className="song-actions"><button type="button" onClick={() => chooseVersion("cloud")}>Use reviewed cloud data</button><button type="button" onClick={() => chooseVersion("device")}>Keep device data and sync</button><button type="button" onClick={() => chooseVersion("merge")}>Merge both histories</button><button type="button" onClick={() => setRemote(null)}>Cancel</button></div></div>}
      {snapshot && <details><summary>Revision history</summary><p>The previous 20 snapshots are available to review. Recovery creates a new revision; it never overwrites history.</p><button type="button" disabled={busy || !online} onClick={() => void loadHistory()}>Load revision history</button>{history.map((item) => <p key={item.revision}>Revision {item.revision} · {new Date(item.created_at).toLocaleString()} · {item.device_name || "Unnamed device"} <button type="button" disabled={busy} onClick={() => { setRemote(item); setMessage(`Reviewing revision ${item.revision}. Applying it will create a new cloud revision.`); }}>Review for recovery</button></p>)}</details>}
      <button type="button" className="button-secondary" disabled={busy} onClick={() => { generation.current += 1; setSyncEnabled(false); setCheckpoint(null); void getSongCloudClient()?.auth.signOut().then(({ error }) => { if (error) setMessage("Could not sign out. Please retry."); }); }}>Sign out</button>
    </>}
    <p role="status">{busy ? "Working…" : message}</p>
  </section>;
}
