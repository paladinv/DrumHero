"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { getSongCloudClient, songCloudConfigured } from "@/lib/song-cloud";

type Classroom = { id: string; name: string; owner_id: string; created_at: string };
type Member = { classroom_id: string; user_id: string; display_name: string; joined_at: string };
type Assignment = { id: string; classroom_id: string; title: string; activity: string; instructions: string; due_at: string | null; created_at: string };
type Submission = { assignment_id: string; user_id: string; note: string; submitted_at: string };
type InviteNotice = { classroomId: string; code: string; expiresAt?: string };

const activities = [
  ["/learn", "Learn"], ["/practice", "Practice"], ["/trainer", "Trainer"],
  ["/rudiments", "Rudiments"], ["/grooves", "Grooves"], ["/ear-training", "Ear Training"],
  ["/play-alongs", "Play-Alongs"], ["/song-library", "Song Library"], ["/sight-reading", "Sight Reading"],
] as const;

function sightReadingResult(note: string): { accuracy: number; score: number; level?: string; meter?: string; bpm?: number } | null {
  const code = note.match(/DH-SUB1:([A-Za-z0-9_-]+)/)?.[1];
  if (!code) return null;
  try {
    const base64 = code.replaceAll("-", "+").replaceAll("_", "/").padEnd(code.length + ((4 - code.length % 4) % 4), "=");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    if (value.version !== 1 || typeof value.accuracy !== "number" || !Number.isInteger(value.accuracy) || value.accuracy < 0 || value.accuracy > 100 || typeof value.score !== "number" || !Number.isInteger(value.score) || value.score < 0 || value.score > 100) return null;
    return { accuracy: value.accuracy, score: value.score, level: typeof value.level === "string" ? value.level : undefined, meter: typeof value.meter === "string" ? value.meter : undefined, bpm: typeof value.bpm === "number" ? value.bpm : undefined };
  } catch { return null; }
}

function messageFrom(error: unknown) {
  return error && typeof error === "object" && "message" in error && typeof error.message === "string"
    ? error.message : "The classroom request could not be completed.";
}

export function TeacherClassroomGroups() {
  const [client, setClient] = useState<ReturnType<typeof getSongCloudClient>>(null);
  const [user, setUser] = useState<User | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [className, setClassName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinConsent, setJoinConsent] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentActivity, setAssignmentActivity] = useState<string>("/practice");
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [assignmentDueAt, setAssignmentDueAt] = useState("");
  const [submissionDrafts, setSubmissionDrafts] = useState<Record<string, string>>({});
  const [inviteNotice, setInviteNotice] = useState<InviteNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { setClient(getSongCloudClient()); }, []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data }) => { if (active) setUser(data.session?.user ?? null); });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setClassrooms([]); setMembers([]); setAssignments([]); setSubmissions([]);
      setInviteNotice(null); setMessage("");
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [client]);

  const refresh = useCallback(async () => {
    if (!client || !user) return;
    setLoading(true);
    try {
      const roomResult = await client.from("drum_classrooms")
        .select("id,name,owner_id,created_at").order("created_at", { ascending: false });
      if (roomResult.error) throw roomResult.error;
      const rooms = (roomResult.data ?? []) as Classroom[];
      setClassrooms(rooms);
      const roomIds = rooms.map((room) => room.id);
      if (!roomIds.length) {
        setMembers([]); setAssignments([]); setSubmissions([]);
        return;
      }
      const [memberResult, assignmentResult] = await Promise.all([
        client.from("drum_classroom_memberships").select("classroom_id,user_id,display_name,joined_at").in("classroom_id", roomIds),
        client.from("drum_classroom_assignments").select("id,classroom_id,title,activity,instructions,due_at,created_at").in("classroom_id", roomIds).order("created_at", { ascending: false }),
      ]);
      if (memberResult.error) throw memberResult.error;
      if (assignmentResult.error) throw assignmentResult.error;
      const memberRows = (memberResult.data ?? []) as Member[];
      const assignmentRows = (assignmentResult.data ?? []) as Assignment[];
      setMembers(memberRows); setAssignments(assignmentRows);
      const assignmentIds = assignmentRows.map((assignment) => assignment.id);
      if (!assignmentIds.length) { setSubmissions([]); return; }
      const submissionResult = await client.from("drum_classroom_submissions")
        .select("assignment_id,user_id,note,submitted_at").in("assignment_id", assignmentIds);
      if (submissionResult.error) throw submissionResult.error;
      setSubmissions((submissionResult.data ?? []) as Submission[]);
    } catch (error) {
      setMessage(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }, [client, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createClassroom = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || !user || !className.trim()) return;
    setBusy(true); setMessage(""); setInviteNotice(null);
    try {
      const { data, error } = await client.rpc("create_drum_classroom", { p_name: className.trim() });
      if (error) throw error;
      if (!data || typeof data !== "object" || !("id" in data) || !("invite_code" in data)) throw new Error("The classroom was created, but its invite code was not returned. Refresh the list and rotate the invite.");
      const result = data as { id: string; invite_code: string; expires_at?: string };
      setClassName(""); setInviteNotice({ classroomId: result.id, code: result.invite_code, expiresAt: result.expires_at });
      setMessage("Classroom created. Share the invite code only with people who should join.");
      await refresh();
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  };

  const joinClassroom = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || !user || !joinConsent) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await client.rpc("join_drum_classroom", {
        p_join_code: joinCode, p_display_name: displayName.trim(), p_consent: joinConsent,
      });
      if (error) throw error;
      setJoinCode(""); setDisplayName(""); setJoinConsent(false);
      setMessage("You joined the classroom. Its assignments and your completion notes are shared with the teacher.");
      await refresh();
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  };

  const rotateInvite = async (classroom: Classroom) => {
    if (!client) return;
    setBusy(true); setMessage(""); setInviteNotice(null);
    try {
      const { data, error } = await client.rpc("rotate_drum_classroom_invite", { p_classroom_id: classroom.id });
      if (error) throw error;
      if (!data || typeof data !== "object" || !("invite_code" in data)) throw new Error("No invite code was returned. Try rotating it again.");
      const result = data as { invite_code: string; expires_at?: string };
      setInviteNotice({ classroomId: classroom.id, code: result.invite_code, expiresAt: result.expires_at });
      setMessage("A new invite code is ready. The previous code has been revoked.");
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  };

  const createAssignment = async (event: FormEvent, classroom: Classroom) => {
    event.preventDefault();
    if (!client || !user || !assignmentTitle.trim()) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await client.from("drum_classroom_assignments").insert({
        classroom_id: classroom.id, created_by: user.id, title: assignmentTitle.trim(),
        activity: assignmentActivity, instructions: assignmentInstructions.trim(), due_at: assignmentDueAt || null,
      });
      if (error) throw error;
      setAssignmentTitle(""); setAssignmentInstructions(""); setAssignmentDueAt("");
      setMessage(`Assignment added to ${classroom.name}.`);
      await refresh();
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  };

  const submitCompletion = async (assignment: Assignment) => {
    if (!client || !user) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await client.from("drum_classroom_submissions").upsert({
        assignment_id: assignment.id, user_id: user.id, note: (submissionDrafts[assignment.id] ?? "").trim(),
      }, { onConflict: "assignment_id,user_id" });
      if (error) throw error;
      setMessage("Assignment completion shared with the teacher.");
      await refresh();
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  };

  const leaveClassroom = async (classroom: Classroom) => {
    if (!client || !window.confirm(`Leave ${classroom.name}? Your submissions for this classroom will be removed.`)) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await client.rpc("leave_drum_classroom", { p_classroom_id: classroom.id });
      if (error) throw error;
      setMessage(`You left ${classroom.name}.`); await refresh();
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  };

  const removeMember = async (classroom: Classroom, member: Member) => {
    if (!client || !window.confirm(`Remove ${member.display_name} from ${classroom.name}? Their class submissions will be deleted.`)) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await client.rpc("remove_drum_classroom_member", { p_classroom_id: classroom.id, p_user_id: member.user_id });
      if (error) throw error;
      setMessage(`${member.display_name} was removed.`); await refresh();
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  };

  const deleteClassroom = async (classroom: Classroom) => {
    if (!client || !window.confirm(`Delete ${classroom.name}, its assignments, members, and submissions? This cannot be undone.`)) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await client.from("drum_classrooms").delete().eq("id", classroom.id);
      if (error) throw error;
      setMessage(`${classroom.name} was deleted.`); await refresh();
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  };

  const deleteAssignment = async (assignment: Assignment) => {
    if (!client || !window.confirm(`Delete “${assignment.title}” and its submissions? This cannot be undone.`)) return;
    setBusy(true); setMessage("");
    try {
      const { error } = await client.from("drum_classroom_assignments").delete().eq("id", assignment.id);
      if (error) throw error;
      setMessage("Assignment and its submissions were deleted."); await refresh();
    } catch (error) { setMessage(messageFrom(error)); }
    finally { setBusy(false); }
  };

  const copyInvite = async () => {
    if (!inviteNotice) return;
    try { await navigator.clipboard.writeText(inviteNotice.code); setMessage("Invite code copied."); }
    catch { setMessage("Copy was unavailable. Select and copy the displayed invite code."); }
  };

  if (!songCloudConfigured()) return <details className="teacher-classroom-groups"><summary>Classrooms across devices</summary><p>Configure the app’s sign-in service to create or join shared classrooms.</p></details>;

  return <details className="teacher-classroom-groups">
    <summary>Shared classrooms and assignments</summary>
    <p>Sign in with the account panel on this Progress page to create or join a classroom. Only classroom names, assignment titles, due dates, member display names, and short completion notes are shared. Scores, practice history, learner profiles, audio, and recordings stay private unless a learner chooses to paste a sight-reading result code into a class submission.</p>
    {user ? <>
      <p>Signed in as {user.email ?? "your account"}. Your classroom access is tied to this account.</p>
      <div className="teacher-classroom-forms">
        <form onSubmit={createClassroom}>
          <h3>Create a classroom</h3>
          <label>Classroom name<input value={className} onChange={(event) => setClassName(event.target.value)} maxLength={80} required /></label>
          <button type="submit" disabled={busy || !className.trim()}>Create and get invite code</button>
        </form>
        <form onSubmit={joinClassroom}>
          <h3>Join a classroom</h3>
          <label>Invite code<input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} maxLength={20} autoCapitalize="characters" autoComplete="off" required /></label>
          <label>Your classroom display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} required /></label>
          <label className="teacher-report-consent"><input type="checkbox" checked={joinConsent} onChange={(event) => setJoinConsent(event.target.checked)} /> I have permission to share this display name and assignment status with the classroom teacher.</label>
          <button type="submit" disabled={busy || !joinCode.trim() || !displayName.trim() || !joinConsent}>Join classroom</button>
        </form>
      </div>
      {inviteNotice && <div className="teacher-classroom-invite" role="status"><strong>New invite code</strong><code>{inviteNotice.code}</code><button type="button" onClick={() => void copyInvite()}>Copy code</button>{inviteNotice.expiresAt && <span>Expires {new Date(inviteNotice.expiresAt).toLocaleDateString()}</span>}<p>Share this once with invited learners. The code cannot be viewed again after leaving this page.</p></div>}
      <div className="teacher-classroom-heading"><h3>Your classrooms · {classrooms.length}</h3><button type="button" className="button-secondary" onClick={() => void refresh()} disabled={loading || busy}>{loading ? "Refreshing…" : "Refresh"}</button></div>
      {!classrooms.length ? <p>{loading ? "Loading classrooms…" : "No classrooms yet."}</p> : classrooms.map((classroom) => {
        const isOwner = classroom.owner_id === user.id;
        const ownMembership = members.find((member) => member.classroom_id === classroom.id && member.user_id === user.id);
        const roomMembers = members.filter((member) => member.classroom_id === classroom.id);
        const roomAssignments = assignments.filter((assignment) => assignment.classroom_id === classroom.id);
        const inviteForRoom = inviteNotice?.classroomId === classroom.id;
        return <article className="teacher-classroom-card" key={classroom.id}>
          <div className="teacher-classroom-heading"><div><h3>{classroom.name}</h3><p>{isOwner ? `Teacher · ${roomMembers.length} learner${roomMembers.length === 1 ? "" : "s"}` : `Learner · ${ownMembership?.display_name ?? "member"}`}</p></div>
            {isOwner ? <div className="teacher-classroom-actions"><button type="button" onClick={() => void rotateInvite(classroom)} disabled={busy}>Create new invite code</button><button type="button" className="button-secondary" onClick={() => void deleteClassroom(classroom)} disabled={busy}>Delete classroom</button></div> : <button type="button" className="button-secondary" onClick={() => void leaveClassroom(classroom)} disabled={busy}>Leave classroom</button>}
          </div>
          {inviteForRoom && <p>The invite code is displayed above. Rotating the code invalidates the old one.</p>}
          {isOwner && <>
            <details className="teacher-classroom-members"><summary>Learners · {roomMembers.length}</summary>{roomMembers.length ? <ul>{roomMembers.map((member) => <li key={member.user_id}><span>{member.display_name}</span><button type="button" className="button-secondary" onClick={() => void removeMember(classroom, member)} disabled={busy}>Remove</button></li>)}</ul> : <p>No learners have joined.</p>}</details>
            <form className="teacher-classroom-assignment-form" onSubmit={(event) => void createAssignment(event, classroom)}>
              <h4>Assign work</h4>
              <label>Assignment title<input value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} maxLength={100} required /></label>
              <label>Activity<select value={assignmentActivity} onChange={(event) => setAssignmentActivity(event.target.value)}>{activities.map(([path, label]) => <option key={path} value={path}>{label}</option>)}</select></label>
              <label>Instructions<textarea value={assignmentInstructions} onChange={(event) => setAssignmentInstructions(event.target.value)} maxLength={1000} rows={2} placeholder={assignmentActivity === "/sight-reading" ? "Optional: paste a DH-SA1 exercise code for a shared seeded exercise." : undefined} /></label>
              {assignmentActivity === "/sight-reading" && <small>For a shared exercise, paste its DH-SA1 code here. Learners can open the exercise, then paste their DH-SUB1 result into the class completion note.</small>}
              <label>Due date<input type="date" value={assignmentDueAt} onChange={(event) => setAssignmentDueAt(event.target.value)} /></label>
              <button type="submit" disabled={busy || !assignmentTitle.trim()}>Publish assignment</button>
            </form>
          </>}
          <h4>Assignments · {roomAssignments.length}</h4>
          {roomAssignments.length ? <ul className="teacher-classroom-assignment-list">{roomAssignments.map((assignment) => {
            const ownSubmission = submissions.find((item) => item.assignment_id === assignment.id && item.user_id === user.id);
            const assignmentSubmissions = submissions.filter((item) => item.assignment_id === assignment.id);
            const scoredReads = assignmentSubmissions.map(item => sightReadingResult(item.note)).filter((item): item is NonNullable<ReturnType<typeof sightReadingResult>> => item !== null);
            const averageReadingAccuracy = scoredReads.length ? Math.round(scoredReads.reduce((sum, item) => sum + item.accuracy, 0) / scoredReads.length) : null;
            const path = assignment.activity as (typeof activities)[number][0];
            const activityName = activities.find(([activityPath]) => activityPath === path)?.[1] ?? "Practice";
            return <li key={assignment.id}>
              <strong>{assignment.title}</strong><p>{activityName}{assignment.due_at ? ` · Due ${new Date(`${assignment.due_at}T00:00:00`).toLocaleDateString()}` : ""}</p>
              {assignment.instructions && <p>{assignment.instructions}</p>}
              {assignment.activity === "/sight-reading" && <p className="teacher-classroom-reading-summary">Class status · {assignmentSubmissions.length}/{roomMembers.length} submitted{averageReadingAccuracy === null ? " · no result codes shared" : ` · ${averageReadingAccuracy}% average across ${scoredReads.length} shared result${scoredReads.length === 1 ? "" : "s"}`}</p>}
              <Link href={path}>Open {activityName}</Link>
              {isOwner && <button type="button" className="button-secondary" onClick={() => void deleteAssignment(assignment)} disabled={busy}>Delete assignment</button>}
              {isOwner ? <ul className="teacher-classroom-submissions">{assignmentSubmissions.map((submission) => { const read = sightReadingResult(submission.note); return <li key={submission.user_id}><strong>{roomMembers.find((member) => member.user_id === submission.user_id)?.display_name ?? "Learner"}</strong><span>Completed {new Date(submission.submitted_at).toLocaleString()}</span>{read && <p>Sight reading · {read.accuracy}% accuracy · {read.score} score{read.level ? ` · ${read.level}` : ""}{read.meter ? ` · ${read.meter}` : ""}{read.bpm ? ` · ${read.bpm} BPM` : ""}</p>}{submission.note && <p>{submission.note}</p>}</li>; })}{!assignmentSubmissions.length && <li>No submissions yet.</li>}</ul>
                : <div className="teacher-classroom-submit"><label>Completion note (optional)<textarea value={submissionDrafts[assignment.id] ?? ownSubmission?.note ?? ""} onChange={(event) => setSubmissionDrafts((current) => ({ ...current, [assignment.id]: event.target.value }))} maxLength={500} rows={2} placeholder={assignment.activity === "/sight-reading" ? "Paste a DH-SUB1 result code to share your score." : undefined} /></label><button type="button" onClick={() => void submitCompletion(assignment)} disabled={busy}>{ownSubmission ? "Update completion" : "Mark complete and share"}</button>{ownSubmission && <span>Shared {new Date(ownSubmission.submitted_at).toLocaleString()}</span>}</div>}
            </li>;
          })}</ul> : <p>No assignments yet.</p>}
        </article>;
      })}
    </> : <p>Sign in with the existing account panel to access your classrooms. You can leave classroom membership at any time.</p>}
    <p className="teacher-classroom-note">Classroom membership requires an explicit confirmation. The app records consent time, but it cannot verify a learner’s age or guardian permission. Teachers can remove members; removal deletes that learner’s classroom submissions.</p>
    <p role="status" aria-live="polite">{message || (loading ? "Loading classroom data…" : "")}</p>
  </details>;
}
