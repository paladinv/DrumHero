"use client";

import { IMPROVISATION_KEY, IMPROVISATION_WORKSPACE_KEY, IMPROVISATION_TAKES_KEY } from "@/lib/improvisation";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { getSongCloudClient, songCloudConfigured } from "@/lib/song-cloud";
import { useProgress } from "@/components/ProgressProvider";
import { ACTIVE_LEARNER_PROFILE_KEY, createLearnerProfile, LEARNER_PROFILES_KEY, learnerStorageKey, readLearnerProfiles, type LearnerProfile } from "@/lib/learner-profiles";
import { lessons, patterns, rudiments, grooves } from "@/lib/curriculum";
import { parseProgress, STORAGE_KEY } from "@/lib/progress";
import { parseTrainerState, trainerStorageKey } from "@/lib/trainer";
import { allSongs, readSongLibrary, songPartEvidenceFingerprint, writeSongLibrary, type DrumSong } from "@/lib/song-library";
import { removeSongLibraryLearner } from "@/lib/song-library-profiles";
import { deleteTake } from "@/lib/song-recording";
import { mergeImportedProgressReport, readImportedProgressReports, readLearnerProgressReport, sharedEvidenceForLearner, TEACHER_PROGRESS_REPORT_FORMAT, TEACHER_PROGRESS_REPORT_KEY, type LearnerProgressReport } from "@/lib/teacher-progress-report";

const ASSIGNMENTS_KEY = "drum-hero:teacher-assignments:v1";
const activities = [
  ["/learn", "Lesson"], ["/practice", "Practice Pad"], ["/trainer", "Trainer"],
  ["/rudiments", "Rudiment"], ["/grooves", "Groove"], ["/play-alongs", "Play-along"], ["/song-library", "Song Library part"],
] as const;
type Assignment = { id: string; learnerId: string; title: string; activity: string; targetId?: string; targetName?: string; sectionId?: string; partId?: string; targetBpm?: number; accuracyGoal?: number; requiredRounds?: number; evidenceIds?: string[]; instructions: string; dueAt: string; assignedAt: string; completedAt?: string; completionSource?: "local-practice" | "shared-report"; feedback: string };
type CloudRoster = { user_id: string; revision: number; state: Assignment[]; device_name: string; updated_at: string };
type LearnerOverview = { id: string; name: string; assigned: number; completed: number; overdue: number; recentAccuracy: number | null; lastPracticeAt: string | null; sharedReportCount: number; latestSharedAt: string | null };

function readCloudRoster(value: unknown): CloudRoster {
  if (!value || typeof value !== "object") throw new Error("Cloud roster is missing.");
  const row = value as Record<string, unknown>;
  if (typeof row.user_id !== "string" || !Number.isInteger(row.revision) || typeof row.device_name !== "string" || typeof row.updated_at !== "string" || !Array.isArray(row.state)) throw new Error("Cloud roster is not supported.");
  return { user_id: row.user_id, revision: row.revision as number, state: readAssignments(JSON.stringify({ version: 1, assignments: row.state })), device_name: row.device_name, updated_at: row.updated_at };
}

function targetsFor(activity: string, songs: DrumSong[] = []) {
  if (activity === "/learn") return lessons.map((item) => ({ id: item.id, name: item.title }));
  if (activity === "/rudiments") return rudiments.map((item) => ({ id: item.id, name: item.name }));
  if (activity === "/grooves") return grooves.map((item) => ({ id: item.id, name: item.name }));
  if (activity === "/practice" || activity === "/trainer") return patterns.map((item) => ({ id: item.id, name: item.name }));
  if (activity === "/song-library") return songs.filter(song => !song.archived).map(song => ({ id: song.id, name: `${song.title} · ${song.artist}` }));
  return [];
}

function withPracticeEvidence(assignments: Assignment[], profileId: string, sharedReports: LearnerProgressReport[] = []): Assignment[] {
  const progress = parseProgress(localStorage.getItem(learnerStorageKey(STORAGE_KEY, profileId)));
  const trainer = parseTrainerState(localStorage.getItem(trainerStorageKey(profileId)));
  const shared = sharedEvidenceForLearner(sharedReports, profileId);
  const localEvidence = [
    ...progress.sessions.map((item) => ({ id: item.id, patternId: item.patternId, bpm: item.bpm, accuracy: item.accuracy, playedAt: item.playedAt })),
    ...trainer.rounds.flatMap((item) => item.mode === "scored" && item.result && !item.focusedDrill && !item.learningMode && (!item.adaptation || item.adaptation === "standard")
      ? [{ id: item.id, patternId: item.patternId, bpm: item.bpm, accuracy: item.result.accuracy, playedAt: item.playedAt }]
      : []),
  ];
  return assignments.map((assignment) => {
    if (assignment.learnerId !== profileId || !assignment.targetId) return assignment;
    const hasDerivedCompletion = assignment.completionSource === "local-practice" || assignment.completionSource === "shared-report";
    if (assignment.completedAt && !hasDerivedCompletion) return assignment;
    if (assignment.activity === "/song-library") {
      const library = readSongLibrary();
      const song = allSongs(library).find(item => item.id === assignment.targetId);
      const section = song?.sections.find(item => item.id === assignment.sectionId);
      const part = section?.parts.find(item => item.id === assignment.partId);
      const fingerprint = part ? songPartEvidenceFingerprint(part) : "";
      const attempts = library.progress.filter(item => (item.learnerId ?? "default") === profileId && item.songId === assignment.targetId && item.sectionId === assignment.sectionId).flatMap(item => item.attempts ?? []).filter(attempt => attempt.partId === assignment.partId && attempt.patternFingerprint === fingerprint && attempt.completePart !== false && !["self", "unknown"].includes(attempt.inputMode) && Math.abs(attempt.bpm - (assignment.targetBpm ?? 70)) <= 5 && attempt.score >= (assignment.accuracyGoal ?? 80));
      const passed = [...new Map(attempts.map(attempt => [attempt.id, attempt])).values()].sort((a,b) => b.playedAt.localeCompare(a.playedAt));
      const evidenceIds = passed.map(attempt => attempt.id).slice(0,20);
      if (evidenceIds.length < (assignment.requiredRounds ?? 3)) return { ...assignment, evidenceIds, ...(hasDerivedCompletion ? { completedAt: undefined, completionSource: undefined } : {}) };
      return { ...assignment, evidenceIds, completedAt: passed[(assignment.requiredRounds ?? 3)-1]?.playedAt ?? new Date().toISOString(), completionSource: "local-practice" };
    }
    if (assignment.activity === "/learn") {
      const localComplete = progress.completedLessons.includes(assignment.targetId);
      const sharedComplete = shared.completedLessonIds.includes(assignment.targetId);
      if (localComplete || sharedComplete) return { ...assignment, completedAt: assignment.completedAt ?? shared.latestExportedAt ?? new Date().toISOString(), completionSource: localComplete ? "local-practice" : "shared-report" };
      return hasDerivedCompletion ? { ...assignment, completedAt: undefined, completionSource: undefined } : assignment;
    }
    const requiredRounds = assignment.requiredRounds ?? 3;
    const qualifies = (item: (typeof localEvidence)[number]) => item.patternId === assignment.targetId && item.accuracy >= (assignment.accuracyGoal ?? 80) && Math.abs(item.bpm - (assignment.targetBpm ?? 70)) <= 5;
    const localPassed = localEvidence.filter(qualifies).sort((left, right) => right.playedAt.localeCompare(left.playedAt));
    const allById = new Map<string, (typeof localEvidence)[number]>();
    for (const item of [...localEvidence, ...shared.practiceEvents]) if (qualifies(item)) {
      const previous = allById.get(item.id);
      if (!previous || item.playedAt > previous.playedAt) allById.set(item.id, item);
    }
    const passed = [...allById.values()].sort((left, right) => right.playedAt.localeCompare(left.playedAt));
    const evidenceIds = passed.map((item) => item.id).slice(0, 20);
    if (evidenceIds.length < requiredRounds) return { ...assignment, evidenceIds, ...(hasDerivedCompletion ? { completedAt: undefined, completionSource: undefined } : {}) };
    const completedAttempt = passed[requiredRounds - 1];
    return { ...assignment, evidenceIds, completedAt: completedAttempt?.playedAt ?? new Date().toISOString(), completionSource: new Set(localPassed.map((item) => item.id)).size >= requiredRounds ? "local-practice" : "shared-report" };
  });
}

function readAssignments(raw: string | null): Assignment[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as { version?: number; assignments?: unknown };
    if (value.version !== 1 || !Array.isArray(value.assignments)) return [];
    return value.assignments.slice(0, 300).flatMap((entry): Assignment[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Partial<Assignment>;
      if (typeof item.id !== "string" || typeof item.learnerId !== "string" || typeof item.title !== "string" || typeof item.activity !== "string" || !activities.some(([path]) => path === item.activity)) return [];
      const targetId = typeof item.targetId === "string" && (item.activity === "/song-library" ? item.targetId.length <= 100 : targetsFor(item.activity).some((target) => target.id === item.targetId)) ? item.targetId : undefined;
      const targetName = targetId ? targetsFor(item.activity).find((target) => target.id === targetId)?.name ?? (typeof item.targetName === "string" ? item.targetName.slice(0, 200) : undefined) : undefined;
      return [{ id: item.id.slice(0, 100), learnerId: item.learnerId.slice(0, 100), title: item.title.slice(0, 100), activity: item.activity, targetId, targetName, sectionId: item.activity === "/song-library" && typeof item.sectionId === "string" ? item.sectionId.slice(0,100) : undefined, partId: item.activity === "/song-library" && typeof item.partId === "string" ? item.partId.slice(0,100) : undefined, targetBpm: Number.isFinite(item.targetBpm) ? Math.max(40, Math.min(200, Number(item.targetBpm))) : 70, accuracyGoal: Number.isFinite(item.accuracyGoal) ? Math.max(0, Math.min(100, Number(item.accuracyGoal))) : 80, requiredRounds: Number.isInteger(item.requiredRounds) ? Math.max(1, Math.min(10, Number(item.requiredRounds))) : 3, evidenceIds: Array.isArray(item.evidenceIds) ? item.evidenceIds.filter((id): id is string => typeof id === "string").slice(0, 20) : [], instructions: typeof item.instructions === "string" ? item.instructions.slice(0, 1000) : "", dueAt: typeof item.dueAt === "string" && Number.isFinite(Date.parse(item.dueAt)) ? item.dueAt : "", assignedAt: typeof item.assignedAt === "string" && Number.isFinite(Date.parse(item.assignedAt)) ? item.assignedAt : new Date(0).toISOString(), completedAt: typeof item.completedAt === "string" && Number.isFinite(Date.parse(item.completedAt)) ? item.completedAt : undefined, completionSource: item.completionSource === "local-practice" || item.completionSource === "shared-report" ? item.completionSource : undefined, feedback: typeof item.feedback === "string" ? item.feedback.slice(0, 1000) : "" }];
    });
  } catch { return []; }
}

function summarizeLearners(profiles: LearnerProfile[], assignments: Assignment[], sharedReports: LearnerProgressReport[]): LearnerOverview[] {
  const now = Date.now();
  return profiles.map((profile) => {
    const learnerAssignments = assignments.filter((item) => item.learnerId === profile.id);
    const progress = parseProgress(localStorage.getItem(learnerStorageKey(STORAGE_KEY, profile.id)));
    const trainer = parseTrainerState(localStorage.getItem(trainerStorageKey(profile.id)));
    const shared = sharedEvidenceForLearner(sharedReports, profile.id);
    const scores = [
      ...progress.sessions.map((item) => ({ id: item.id, accuracy: item.accuracy, playedAt: item.playedAt })),
      ...trainer.rounds.filter((item) => item.mode === "scored" && item.result && (!item.adaptation || item.adaptation === "standard") && !item.focusedDrill && !item.learningMode).map((item) => ({ id: item.id, accuracy: item.result!.accuracy, playedAt: item.playedAt })),
      ...shared.practiceEvents.map(({ id, accuracy, playedAt }) => ({ id, accuracy, playedAt })),
    ].filter((item, index, all) => typeof item.id === "string" && Number.isFinite(item.accuracy) && item.accuracy >= 0 && item.accuracy <= 100 && Number.isFinite(Date.parse(item.playedAt)) && all.findIndex((candidate) => candidate.id === item.id) === index).sort((left, right) => right.playedAt.localeCompare(left.playedAt));
    const recent = scores.slice(0, 3);
    return {
      id: profile.id,
      name: profile.name,
      assigned: learnerAssignments.length,
      completed: learnerAssignments.filter((item) => Boolean(item.completedAt)).length,
      overdue: learnerAssignments.filter((item) => !item.completedAt && item.dueAt && Date.parse(item.dueAt) < now).length,
      recentAccuracy: recent.length ? Math.round(recent.reduce((total, item) => total + item.accuracy, 0) / recent.length) : null,
      lastPracticeAt: scores[0]?.playedAt ?? null,
      sharedReportCount: shared.reportCount,
      latestSharedAt: shared.latestExportedAt,
    };
  });
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }

export function TeacherModePanel() {
  const { profileId } = useProgress();
  const [profiles, setProfiles] = useState<LearnerProfile[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [songLibrarySongs, setSongLibrarySongs] = useState<DrumSong[]>([]);
  const [sharedReports, setSharedReports] = useState<LearnerProgressReport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newName, setNewName] = useState("");
  const [rename, setRename] = useState("");
  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState<string>(activities[0][0]);
  const [targetId, setTargetId] = useState<string>(lessons[0].id);
  const [songSectionId, setSongSectionId] = useState("");
  const [songPartId, setSongPartId] = useState("");
  const [targetBpm, setTargetBpm] = useState(70);
  const [accuracyGoal, setAccuracyGoal] = useState(80);
  const [requiredRounds, setRequiredRounds] = useState(3);
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [message, setMessage] = useState("");
  const [shareConsentForProfile, setShareConsentForProfile] = useState<string | null>(null);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudRoster, setCloudRoster] = useState<CloudRoster | null>(null);
  const [cloudRosterReviewed, setCloudRosterReviewed] = useState(false);
  const [cloudRosterMissing, setCloudRosterMissing] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [deviceName, setDeviceName] = useState("This device");
  const [online, setOnline] = useState(true);
  const importRef = useRef<HTMLInputElement>(null);
  const profileImportRef = useRef<HTMLInputElement>(null);
  const progressReportImportRef = useRef<HTMLInputElement>(null);
  const currentProfile = profiles.find((profile) => profile.id === profileId);
  const assignmentSong = songLibrarySongs.find(song => song.id === targetId);
  const assignmentSection = assignmentSong?.sections.find(section => section.id === songSectionId) ?? assignmentSong?.sections[0];
  const shareConsentKey = currentProfile ? `${currentProfile.id}:${currentProfile.name}` : "";
  const shareConsent = Boolean(shareConsentKey && shareConsentForProfile === shareConsentKey);
  const classroomOverview = useMemo(() => loaded ? summarizeLearners(profiles, assignments, sharedReports) : [], [assignments, loaded, profiles, sharedReports]);
  const mine = useMemo(() => assignments.filter((item) => item.learnerId === profileId).sort((a, b) => (a.dueAt || "9999").localeCompare(b.dueAt || "9999")), [assignments, profileId]);

  useEffect(() => {
    const load = () => { const reports = readImportedProgressReports(localStorage.getItem(TEACHER_PROGRESS_REPORT_KEY)); setSharedReports(reports); setProfiles(readLearnerProfiles(localStorage.getItem(LEARNER_PROFILES_KEY))); setAssignments(withPracticeEvidence(readAssignments(localStorage.getItem(ASSIGNMENTS_KEY)), profileId, reports)); setLoaded(true); };
    const timer = window.setTimeout(load, 0);
    window.addEventListener("storage", load);
    window.addEventListener("drum-hero:learner-profiles-change", load);
    return () => { clearTimeout(timer); window.removeEventListener("storage", load); window.removeEventListener("drum-hero:learner-profiles-change", load); };
  }, [profileId]);
  useEffect(() => {
    const refresh = () => setSongLibrarySongs(allSongs(readSongLibrary()).filter(song => !song.archived));
    refresh();
    window.addEventListener("drum-hero:song-library-change", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("drum-hero:song-library-change", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  useEffect(() => { if (profiles.length) setRename(currentProfile?.name ?? ""); }, [currentProfile?.name, profiles.length]);
  useEffect(() => { setShareConsentForProfile(null); }, [shareConsentKey]);
  useEffect(() => { if (!loaded) return; try { localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify({ version: 1, assignments })); } catch { setMessage("Assignment changes could not be saved on this device."); } }, [assignments, loaded]);
  useEffect(() => {
    if (!loaded) return;
    setAssignments((current) => {
      const next = profiles.reduce((items, profile) => withPracticeEvidence(items, profile.id, sharedReports), current);
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
  }, [loaded, profiles, sharedReports]);
  useEffect(() => {
    if (!loaded) return;
    const refresh = () => setAssignments(current => {
      const next = withPracticeEvidence(current, profileId, sharedReports);
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
    window.addEventListener("drum-hero:song-library-change", refresh);
    return () => window.removeEventListener("drum-hero:song-library-change", refresh);
  }, [loaded, profileId, sharedReports]);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(TEACHER_PROGRESS_REPORT_KEY, JSON.stringify(sharedReports)); }
    catch { setMessage("Shared learner reports could not be saved on this device."); }
  }, [loaded, sharedReports]);
  useEffect(() => {
    if (!songCloudConfigured()) return;
    const client = getSongCloudClient(); if (!client) return;
    let live = true;
    void client.auth.getSession().then(({ data }) => { if (live) setCloudUser(data.session?.user ?? null); });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!live) return;
      setCloudUser(session?.user ?? null); setCloudRoster(null); setCloudRosterReviewed(false); setCloudRosterMissing(false);
    });
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => { setOnline(navigator.onLine); const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener("online", on); window.addEventListener("offline", off); return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); }; }, []);

  const addProfile = (event: FormEvent) => {
    event.preventDefault();
    const profile = createLearnerProfile(newName, profiles);
    if (!profile) { setMessage("Enter a name. This device can hold up to 25 learner profiles."); return; }
    const next = [...profiles, profile];
    try { localStorage.setItem(LEARNER_PROFILES_KEY, JSON.stringify(next.filter((item) => item.id !== "default"))); setProfiles(next); setNewName(""); window.dispatchEvent(new Event("drum-hero:learner-profiles-change")); localStorage.setItem(ACTIVE_LEARNER_PROFILE_KEY, profile.id); window.dispatchEvent(new CustomEvent("drum-hero:learner-profile-change", { detail: { profileId: profile.id } })); setMessage(`${profile.name} is ready. Their lesson, Trainer, and Song Library practice history are separate.`); }
    catch { setMessage("The learner profile could not be saved. Check browser storage."); }
  };

  const saveRename = () => {
    if (!currentProfile || currentProfile.id === "default" || !rename.trim()) return;
    const next = profiles.map((profile) => profile.id === profileId ? { ...profile, name: rename.trim().slice(0, 60) } : profile);
    try { localStorage.setItem(LEARNER_PROFILES_KEY, JSON.stringify(next.filter((item) => item.id !== "default"))); setProfiles(next); window.dispatchEvent(new Event("drum-hero:learner-profiles-change")); setMessage("Learner name updated."); } catch { setMessage("The learner name could not be saved."); }
  };

  const removeCurrentProfile = async () => {
    if (!currentProfile || profileId === "default" || !window.confirm(`Delete ${currentProfile.name}'s local progress, Trainer and improvisation history, Song Library practice history, personal notes and recordings, assignments, and imported shared reports from this browser? Shared song charts will remain.`)) return;
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
    const nextAssignments = assignments.filter((item) => item.learnerId !== profileId);
    const nextSharedReports = sharedReports.filter((report) => report.learner.id !== profileId);
    try {
      const songLibrary = readSongLibrary();
      const recordingIds = [...songLibrary.recordings, ...(songLibrary.referenceTracks ?? [])].filter((item) => item.learnerId === profileId).map((item) => item.id);
      await Promise.all(recordingIds.map((id) => deleteTake(id)));
      writeSongLibrary(removeSongLibraryLearner(songLibrary, profileId));
      localStorage.removeItem(learnerStorageKey(STORAGE_KEY, profileId)); localStorage.removeItem(trainerStorageKey(profileId)); for (const key of [IMPROVISATION_KEY, IMPROVISATION_WORKSPACE_KEY, IMPROVISATION_TAKES_KEY]) localStorage.removeItem(learnerStorageKey(key, profileId));
      localStorage.setItem(LEARNER_PROFILES_KEY, JSON.stringify(nextProfiles.filter((item) => item.id !== "default")));
      localStorage.setItem(ASSIGNMENTS_KEY, JSON.stringify({ version: 1, assignments: nextAssignments }));
      localStorage.setItem(TEACHER_PROGRESS_REPORT_KEY, JSON.stringify(nextSharedReports));
      setAssignments(nextAssignments); setProfiles(nextProfiles); setSharedReports(nextSharedReports); localStorage.setItem(ACTIVE_LEARNER_PROFILE_KEY, "default");
      window.dispatchEvent(new Event("drum-hero:learner-profiles-change")); window.dispatchEvent(new CustomEvent("drum-hero:learner-profile-change", { detail: { profileId: "default" } })); setMessage(`${currentProfile.name}'s local profile was deleted.`);
    } catch { setMessage("The profile could not be fully removed. Check browser storage."); }
  };

  const addAssignment = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const target = targetsFor(activity, songLibrarySongs).find((item) => item.id === targetId);
    const section = activity === "/song-library" ? assignmentSection : undefined;
    const part = section?.parts.find(item => item.id === songPartId);
    const item: Assignment = { id: crypto.randomUUID(), learnerId: profileId, title: title.trim().slice(0, 100), activity, targetId: target?.id, targetName: activity === "/song-library" && assignmentSong ? `${assignmentSong.title} · ${section?.name ?? "Song"}${part ? ` · ${part.name}` : ""}` : target?.name, sectionId: section?.id, partId: part?.id, targetBpm, accuracyGoal, requiredRounds, evidenceIds: [], instructions: instructions.trim().slice(0, 1000), dueAt: dueAt ? new Date(dueAt).toISOString() : "", assignedAt: new Date().toISOString(), feedback: "" };
    const assignmentWithEvidence = withPracticeEvidence([item], profileId, sharedReports)[0] ?? item;
    setAssignments((items) => [assignmentWithEvidence, ...items].slice(0, 300)); setTitle(""); setInstructions(""); setDueAt(""); setMessage(assignmentWithEvidence.completedAt ? "Assignment saved with matching practice evidence already on this device." : "Assignment saved on this device.");
  };

  const importPack = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Assignment pack is too large.");
      const parsed = JSON.parse(await file.text()) as { format?: string; assignments?: unknown };
      const incoming = readAssignments(JSON.stringify({ version: 1, assignments: parsed.assignments }));
      if (parsed.format !== "drum-hero-assignment-pack-v1" || !incoming.length) throw new Error("Choose a Drum Hero assignment pack.");
      const copies = withPracticeEvidence(incoming.map((item) => ({ ...item, id: crypto.randomUUID(), learnerId: profileId, assignedAt: new Date().toISOString(), evidenceIds: [], completedAt: undefined, completionSource: undefined })), profileId, sharedReports);
      setAssignments((items) => [...copies, ...items].slice(0, 300)); setMessage(`${copies.length} assignment${copies.length === 1 ? "" : "s"} imported for ${currentProfile?.name ?? "this learner"}.`);
    } catch { setMessage("That assignment pack could not be imported."); }
    finally { if (importRef.current) importRef.current.value = ""; }
  };

  const importProfile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error("Profile file is too large.");
      const parsed = JSON.parse(await file.text()) as { format?: string; profile?: Partial<LearnerProfile> };
      const incoming = parsed.profile;
      if (parsed.format !== "drum-hero-learner-profile-v1" || !incoming || typeof incoming.id !== "string" || !/^[a-z0-9-]{1,80}$/i.test(incoming.id) || incoming.id === "default" || typeof incoming.name !== "string" || !incoming.name.trim() || incoming.name.length > 60) throw new Error("Choose a Drum Hero learner profile file.");
      if (profiles.some((profile) => profile.id === incoming.id)) { setMessage(`${incoming.name} is already on this device. Select that profile to use its sync identity.`); return; }
      if (profiles.length >= 25) { setMessage("This device can hold up to 25 learner profiles."); return; }
      const profile: LearnerProfile = { id: incoming.id, name: incoming.name.trim(), createdAt: typeof incoming.createdAt === "string" && Number.isFinite(Date.parse(incoming.createdAt)) ? incoming.createdAt : new Date().toISOString() };
      const next = [...profiles, profile];
      localStorage.setItem(LEARNER_PROFILES_KEY, JSON.stringify(next.filter((item) => item.id !== "default")));
      setProfiles(next); window.dispatchEvent(new Event("drum-hero:learner-profiles-change"));
      setMessage(`${profile.name}’s profile identity was added. Select it, then review cloud progress to sync on this device.`);
    } catch { setMessage("That learner profile file could not be imported."); }
    finally { if (profileImportRef.current) profileImportRef.current.value = ""; }
  };

  const exportReport = () => {
    const rows = [["Learner", "Assignment", "Activity", "Target", "Tempo goal", "Accuracy goal", "Evidence rounds", "Due date", "Status", "Feedback"], ...assignments.map((item) => [profiles.find((profile) => profile.id === item.learnerId)?.name ?? "Deleted learner", item.title, activities.find(([path]) => path === item.activity)?.[1] ?? item.activity, item.targetName ?? "", item.targetBpm ?? "", item.accuracyGoal ?? "", item.evidenceIds?.length ?? 0, item.dueAt ? new Date(item.dueAt).toLocaleDateString() : "", item.completedAt ? "Complete" : "Open", item.feedback])];
    downloadFile("drum-hero-assignment-report.csv", rows.map((row) => row.map((cell) => csvCell(String(cell))).join(",")).join("\r\n"), "text/csv;charset=utf-8");
  };

  const exportLearnerProgressReport = () => {
    if (!currentProfile || currentProfile.id === "default" || !shareConsent) return;
    const progress = parseProgress(localStorage.getItem(learnerStorageKey(STORAGE_KEY, currentProfile.id)));
    const trainer = parseTrainerState(localStorage.getItem(trainerStorageKey(currentProfile.id)));
    const events = [
      ...progress.sessions.map((item) => ({ id: item.id, patternId: item.patternId, bpm: item.bpm, accuracy: item.accuracy, playedAt: item.playedAt, source: "practice" as const })),
      ...trainer.rounds.flatMap((item) => item.mode === "scored" && item.result && !item.focusedDrill && !item.learningMode && (!item.adaptation || item.adaptation === "standard")
        ? [{ id: item.id, patternId: item.patternId, bpm: item.bpm, accuracy: item.result.accuracy, playedAt: item.playedAt, source: "trainer" as const }]
        : []),
    ].filter((item) => typeof item.id === "string" && typeof item.patternId === "string" && Number.isFinite(item.bpm) && Number.isFinite(item.accuracy) && Number.isFinite(Date.parse(item.playedAt)))
      .sort((left, right) => right.playedAt.localeCompare(left.playedAt))
      .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
      .slice(0, 100);
    const report: LearnerProgressReport = {
      format: TEACHER_PROGRESS_REPORT_FORMAT,
      version: 1,
      reportId: crypto.randomUUID(),
      learner: { id: currentProfile.id, name: currentProfile.name },
      exportedAt: new Date().toISOString(),
      completedLessonIds: progress.completedLessons,
      practiceEvents: events,
    };
    downloadFile(`drum-hero-progress-${currentProfile.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "learner"}.json`, JSON.stringify(report, null, 2), "application/json");
    setShareConsentForProfile(null);
    setMessage(`Progress report prepared for ${currentProfile.name}. It contains lesson completion and scored practice summaries, with no audio recordings.`);
  };

  const importLearnerProgressReport = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error("Progress report is too large.");
      const report = readLearnerProgressReport(await file.text());
      if (!report) throw new Error("Choose a valid Drum Hero learner progress report.");
      const learner = profiles.find((profile) => profile.id === report.learner.id);
      if (!learner) throw new Error("Import this learner’s sync identity first so the report can be matched to the right classroom profile.");
      const next = mergeImportedProgressReport(sharedReports, report);
      if (next === sharedReports) { setMessage(`This report from ${learner.name} was already imported.`); return; }
      setSharedReports(next);
      setMessage(`Imported ${report.practiceEvents.length} scored practice records and ${report.completedLessonIds.length} lesson completions for ${learner.name}. No recordings are included.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import the learner progress report."); }
    finally { if (progressReportImportRef.current) progressReportImportRef.current.value = ""; }
  };

  const reviewCloudRoster = async () => {
    const client = getSongCloudClient(); if (!client || !cloudUser || !online) return;
    setCloudBusy(true); setCloudRosterReviewed(false); setMessage("Reviewing the private teacher roster…");
    try {
      const { data, error } = await client.from("drum_teacher_rosters").select("*").eq("user_id", cloudUser.id).maybeSingle();
      if (error) throw error;
      if (!data) { setCloudRoster(null); setCloudRosterMissing(true); setMessage("No cloud roster exists yet. Upload this device’s roster to create one."); }
      else { const saved = readCloudRoster(data); setCloudRoster(saved); setCloudRosterMissing(false); setMessage(`Reviewed roster revision ${saved.revision}: ${saved.state.length} assignments.`); }
      setCloudRosterReviewed(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not review the teacher roster."); }
    finally { setCloudBusy(false); }
  };

  const saveCloudRoster = async () => {
    const client = getSongCloudClient(); if (!client || !cloudUser || !cloudRosterReviewed || !online) return;
    setCloudBusy(true); setMessage("Saving this device’s assignment roster as a new revision…");
    try {
      const cloudAssignments = assignments.map((item) => item.completionSource === "shared-report" ? { ...item, completedAt: undefined, completionSource: undefined, evidenceIds: [] } : { ...item, evidenceIds: [] });
      const { data, error } = await client.rpc("save_drum_teacher_roster", { p_expected_revision: cloudRoster?.revision ?? 0, p_state: cloudAssignments, p_device_name: deviceName.trim().slice(0, 80) });
      if (error) throw error;
      const saved = readCloudRoster(Array.isArray(data) ? data[0] : data); setCloudRoster(saved); setCloudRosterMissing(false); setCloudRosterReviewed(true); setMessage(`Roster saved at revision ${saved.revision}. Other devices can review it before loading.`);
    } catch (error) {
      if ((error as { code?: string }).code === "40001") { setCloudRosterReviewed(false); setMessage("The cloud roster changed elsewhere. Review it before saving again."); }
      else setMessage(error instanceof Error ? error.message : "Could not save the teacher roster.");
    } finally { setCloudBusy(false); }
  };

  const loadCloudRoster = () => {
    if (!cloudRoster || !window.confirm(`Replace assignments on this device with cloud roster revision ${cloudRoster.revision}? Export this device’s report first if you need a copy.`)) return;
    setAssignments(cloudRoster.state); setMessage(`Loaded ${cloudRoster.state.length} assignments from cloud revision ${cloudRoster.revision}.`);
  };

  return <section className="teacher-mode-panel card" aria-labelledby="teacher-mode-heading">
    <span className="eyebrow">Shared device tools</span><h2 id="teacher-mode-heading">Learners and assignments</h2>
    <p>Profiles keep lesson progress and Trainer history separate in this browser. Assignments and notes stay on this device unless you export them.</p>
    <p><Link href="/improvisation#improvisation-assignments">Create and review improvisation practice sequences for the active learner</Link></p>
    <form className="teacher-profile-form" onSubmit={addProfile}><label>Add learner profile<input maxLength={60} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Learner name" /></label><button type="submit" disabled={!newName.trim() || profiles.length >= 25}>Add learner</button></form>
    {currentProfile && currentProfile.id !== "default" && <div className="teacher-profile-form"><label>Active learner name<input maxLength={60} value={rename} onChange={(event) => setRename(event.target.value)} /></label><button type="button" onClick={saveRename} disabled={!rename.trim() || rename.trim() === currentProfile.name}>Save name</button><button className="button-secondary" type="button" onClick={removeCurrentProfile}>Delete this profile</button></div>}
    <details className="teacher-classroom-overview"><summary>Classroom overview · {classroomOverview.length} learner profiles</summary><p>Practice summaries combine this device’s saved work with reports that a learner or guardian explicitly exported and shared. Reports contain lesson completion and scored practice summaries, never recordings. Cloud roster sync still transfers assignments only.</p><div className="teacher-classroom-totals"><span><strong>{assignments.length}</strong> assignments</span><span><strong>{assignments.filter((item) => item.completedAt).length}</strong> completed</span><span><strong>{classroomOverview.reduce((total, item) => total + item.overdue, 0)}</strong> overdue</span></div><div className="teacher-classroom-table"><table><thead><tr><th scope="col">Learner</th><th scope="col">Assignments</th><th scope="col">Overdue</th><th scope="col">Recent accuracy</th><th scope="col">Last practice</th><th scope="col">Shared reports</th></tr></thead><tbody>{classroomOverview.map((learner) => <tr key={learner.id}><th scope="row">{learner.name}</th><td>{learner.completed} of {learner.assigned} complete</td><td>{learner.overdue}</td><td>{learner.recentAccuracy === null ? "No scored rounds" : `${learner.recentAccuracy}% · last 3`}</td><td>{learner.lastPracticeAt ? new Date(learner.lastPracticeAt).toLocaleDateString() : "No practice yet"}</td><td>{learner.sharedReportCount ? <>{learner.sharedReportCount} file{learner.sharedReportCount === 1 ? "" : "s"}{learner.latestSharedAt ? ` · ${new Date(learner.latestSharedAt).toLocaleDateString()}` : ""} <button type="button" className="button-secondary" aria-label={`Remove shared reports for ${learner.name}`} onClick={() => setSharedReports((items) => items.filter((report) => report.learner.id !== learner.id))}>Remove</button></> : "None"}</td></tr>)}</tbody></table></div></details>
    <details className="teacher-progress-sharing"><summary>Share learner progress across devices</summary><p>On the learner’s device, export a progress report after reviewing its contents with the learner or guardian. Import it here to update this classroom overview and matching assignment evidence. Reports stay on this device unless you export them again. They include the learner name and profile ID, lesson completions, pattern IDs, practice source, tempo, accuracy, and practice dates. They exclude audio, recordings, settings, and account details.</p>{currentProfile && currentProfile.id !== "default" ? <label className="teacher-report-consent"><input type="checkbox" checked={shareConsent} onChange={(event) => setShareConsentForProfile(event.target.checked ? shareConsentKey : null)} /> I have the learner’s or guardian’s permission to export {currentProfile.name}’s progress summary.</label> : <p>Create or import a named learner profile before exporting progress. This prevents unrelated “This device” records from being merged across devices.</p>}<div className="song-actions"><button type="button" onClick={exportLearnerProgressReport} disabled={!currentProfile || currentProfile.id === "default" || !shareConsent}>Export active learner progress report</button><button type="button" onClick={() => progressReportImportRef.current?.click()}>Import learner progress report</button><input ref={progressReportImportRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importLearnerProgressReport(event.target.files?.[0])} /></div><p>To match a report, import that learner’s sync identity on this device first. Imported reports can be removed from the classroom overview.</p></details>
    <div className="teacher-assignment-columns"><form onSubmit={addAssignment}><h3>Assign work to {currentProfile?.name ?? "this learner"}</h3><label>Assignment title<input required maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Steady eighth notes" /></label><label>Open activity<select value={activity} onChange={(event) => { const next = event.target.value; setActivity(next); const nextTarget=targetsFor(next,songLibrarySongs)[0]; setTargetId(nextTarget?.id ?? ""); const nextSong=songLibrarySongs.find(song=>song.id===nextTarget?.id); setSongSectionId(nextSong?.sections[0]?.id??""); setSongPartId(nextSong?.sections[0]?.parts[0]?.id??""); }}>{activities.map(([path, label]) => <option key={path} value={path}>{label}</option>)}</select></label>{activity === "/song-library" ? <><label>Song<select value={targetId} onChange={event => { const id=event.target.value, song=songLibrarySongs.find(item=>item.id===id); setTargetId(id); setSongSectionId(song?.sections[0]?.id??""); setSongPartId(song?.sections[0]?.parts[0]?.id??""); }}>{targetsFor(activity,songLibrarySongs).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{assignmentSong&&<><label>Song section<select value={assignmentSection?.id??""} onChange={event=>{setSongSectionId(event.target.value);setSongPartId(assignmentSong.sections.find(section=>section.id===event.target.value)?.parts[0]?.id??"");}}>{assignmentSong.sections.map(section=><option key={section.id} value={section.id}>{section.name}</option>)}</select></label><label>Drum part<select value={assignmentSection?.parts.some(part=>part.id===songPartId)?songPartId:assignmentSection?.parts[0]?.id??""} onChange={event=>setSongPartId(event.target.value)}>{assignmentSection?.parts.map(part=><option key={part.id} value={part.id}>{part.name}</option>)}</select></label></>}</> : targetsFor(activity).length > 0 && <label>Specific lesson or pattern<select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targetsFor(activity).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{activity !== "/learn" && (activity === "/song-library" ? Boolean(assignmentSection?.parts.length) : targetsFor(activity).length > 0) && <div className="teacher-goal-fields"><label>Target tempo · BPM<input type="number" min="40" max="200" value={targetBpm} onChange={(event) => setTargetBpm(Number(event.target.value))} /></label><label>Minimum accuracy · %<select value={accuracyGoal} onChange={(event) => setAccuracyGoal(Number(event.target.value))}>{[70, 80, 85, 90, 95].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label><label>Successful scored rounds<select value={requiredRounds} onChange={(event) => setRequiredRounds(Number(event.target.value))}>{[1, 2, 3, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>}<label>Instructions<textarea maxLength={1000} rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Tempo, repetitions, or teacher notes" /></label><label>Due date<input type="date" value={dueAt.slice(0, 10)} onChange={(event) => setDueAt(event.target.value ? `${event.target.value}T12:00` : "")} /></label><button className="button" type="submit" disabled={!title.trim() || (activity === "/song-library" && (!assignmentSong || !assignmentSection?.parts.some(part=>part.id===songPartId)))}>Save assignment</button></form>
      <div><h3>Current assignments · {mine.length}</h3>{mine.length ? <ul className="teacher-assignment-list">{mine.map((item) => { const complete = Boolean(item.completedAt); const targetRoute = item.activity === "/learn" ? "/learn" : item.activity === "/rudiments" || item.activity === "/grooves" ? "/trainer" : item.activity; const href = item.activity === "/song-library" && item.targetId ? `/song-library?song=${encodeURIComponent(item.targetId)}${item.sectionId ? `&section=${encodeURIComponent(item.sectionId)}` : ""}${item.partId ? `&part=${encodeURIComponent(item.partId)}` : ""}${item.targetBpm ? `&bpm=${item.targetBpm}` : ""}` : item.targetId ? `${targetRoute}?${item.activity === "/learn" ? "lesson" : "pattern"}=${encodeURIComponent(item.targetId)}` : item.activity; const evidenceCount = item.evidenceIds?.length ?? 0; return <li key={item.id}><div className="teacher-assignment-heading"><strong>{item.title}</strong><Link href={href}>Open target</Link></div><p>{activities.find(([path]) => path === item.activity)?.[1]}{item.targetName ? ` · ${item.targetName}` : ""}{item.dueAt ? ` · Due ${new Date(item.dueAt).toLocaleDateString()}` : ""}</p>{item.activity === "/learn" ? <p>{complete ? "Lesson completed" : "Complete the lesson checkpoints to finish this assignment."}</p> : item.targetId ? <p>{complete ? `Completed ${new Date(item.completedAt!).toLocaleDateString()}` : `${evidenceCount} of ${item.requiredRounds ?? 3} successful scored rounds · ${item.targetBpm ?? 70} BPM ±5 · ${item.accuracyGoal ?? 80}% accuracy`}</p> : complete && <p>Completed {new Date(item.completedAt!).toLocaleDateString()}</p>}{item.instructions && <p>{item.instructions}</p>}{!complete && item.activity === "/play-alongs" && <button type="button" className="button-secondary" onClick={() => setAssignments((items) => items.map((assignment) => assignment.id === item.id ? { ...assignment, completedAt: new Date().toISOString() } : assignment))}>Mark play-along complete</button>}<label>Feedback / reflection<textarea maxLength={1000} rows={2} value={item.feedback} onChange={(event) => setAssignments((items) => items.map((assignment) => assignment.id === item.id ? { ...assignment, feedback: event.target.value } : assignment))} /></label><button type="button" className="button-secondary" onClick={() => setAssignments((items) => items.filter((assignment) => assignment.id !== item.id))}>Remove assignment</button></li>; })}</ul> : <p>No assignments for this learner yet.</p>}</div></div>
    <div className="song-actions"><button type="button" onClick={() => downloadFile("drum-hero-assignment-pack.json", JSON.stringify({ format: "drum-hero-assignment-pack-v1", assignments: mine.map(({ completedAt: _completedAt, completionSource: _completionSource, ...item }) => ({ ...item, learnerId: "exported", evidenceIds: [] })) }, null, 2), "application/json")}>Export this learner’s assignments</button><button type="button" onClick={() => importRef.current?.click()}>Import assignment pack for active learner</button><button type="button" onClick={exportReport} disabled={!assignments.length}>Export roster report (CSV)</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importPack(event.target.files?.[0])} />{currentProfile && currentProfile.id !== "default" && <><button type="button" onClick={() => downloadFile("drum-hero-learner-profile.json", JSON.stringify({ format: "drum-hero-learner-profile-v1", profile: currentProfile }, null, 2), "application/json")}>Export learner sync identity</button><button type="button" onClick={() => profileImportRef.current?.click()}>Import learner sync identity</button><input ref={profileImportRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importProfile(event.target.files?.[0])} /></>}</div>
    {songCloudConfigured() && <details className="teacher-cloud-roster"><summary>Sync teacher roster across devices</summary><p>Private to the signed-in account. Review remote data before loading it. This syncs assignments and feedback, not learner progress or recordings.</p>{cloudUser ? <><p>Signed in as {cloudUser.email ?? "account"}{cloudRoster ? ` · cloud revision ${cloudRoster.revision} from ${cloudRoster.device_name || "Unnamed device"}` : cloudRosterMissing ? " · no roster saved" : ""} · {online ? "Online" : "Offline; local assignments are retained"}</p><label>Device label<input maxLength={80} value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /></label><div className="song-actions"><button type="button" disabled={cloudBusy || !online} onClick={() => void reviewCloudRoster()}>Review cloud roster</button><button type="button" disabled={cloudBusy || !cloudRosterReviewed || !online} onClick={() => void saveCloudRoster()}>{cloudRosterMissing ? "Create cloud roster from this device" : "Upload this device’s roster"}</button><button type="button" disabled={cloudBusy || !cloudRosterReviewed || !cloudRoster} onClick={loadCloudRoster}>Load reviewed cloud roster</button></div>{cloudRoster && cloudRosterReviewed && <p>Last updated {new Date(cloudRoster.updated_at).toLocaleString()} · {cloudRoster.state.length} assignments. Up to 20 previous roster revisions are retained.</p>}</> : <p>Sign in with the account panel on this Progress page to enable private roster sync.</p>}<p role="status">{cloudBusy ? "Working…" : ""}</p></details>}
    <p role="status">{message}</p>
  </section>;
}
