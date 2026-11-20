"use client";

import { useState } from "react";
import { improvisationPhraseSettings, parseImprovisationWorkspace, type ImprovisationAssignment, type ImprovisationSummary, type ImprovisationWorkspace } from "@/lib/improvisation";
import { getSongCloudClient, readSongCloudCheckpoint } from "@/lib/song-cloud";
import { useLocalization } from "./LocalizationProvider";
import styles from "./ImprovisationStudio.module.css";

type CloudAssignment = { id: string; name: string; assignment: unknown; created_at: string };
type CloudSubmission = { id: string; learner_label: string; summary: Record<string, unknown>; created_at: string };
type CloudFeedback = { id: string; submission_id: string; phrase_index: number | null; bar_index: number | null; body: string; created_at: string };
type Role = "owner" | "editor" | "viewer" | null;

function sanitizedSessionSummary(session: ImprovisationSummary, includeReflection: boolean) {
  const phrases = session.phrases.map(phrase => {
    const section = improvisationPhraseSettings(session.settings, phrase.phrase);
    return {
      phrase: phrase.phrase + 1,
      prompt: phrase.prompt,
      meter: section.meter,
      bars: section.bars,
      bpm: section.bpm,
      hitCount: phrase.hitCount,
      timingDistanceMs: phrase.timingDistanceMs,
      entryOffsetMs: phrase.entryOffsetMs,
      backbeats: phrase.backbeats,
      voiceCompliance: phrase.voiceCompliance,
      restViolations: phrase.restViolations,
      challenge: phrase.challenge,
      ...(includeReflection && phrase.reflection ? { reflection: phrase.reflection.slice(0, 500) } : {}),
    };
  });
  return {
    version: 1,
    playedAt: session.playedAt,
    mode: session.settings.mode,
    meter: session.settings.meter,
    bpm: session.settings.bpm,
    bars: session.settings.bars,
    phraseCount: session.phrases.length,
    unscored: session.input === "unscored",
    phrases,
    ...(includeReflection && session.selfRating ? { selfRating: session.selfRating } : {}),
  };
}

export function ImprovisationCloudAssignments({ workspace, history, disabled, onSave }: { workspace: ImprovisationWorkspace; history: ImprovisationSummary[]; disabled: boolean; onSave: (workspace: ImprovisationWorkspace) => void }) {
  const { t, formatDate } = useLocalization();
  const [cloudAssignments, setCloudAssignments] = useState<CloudAssignment[]>([]), [submissions, setSubmissions] = useState<CloudSubmission[]>([]), [feedback, setFeedback] = useState<CloudFeedback[]>([]), [feedbackSessions, setFeedbackSessions] = useState<Record<string, string>>({});
  const [role, setRole] = useState<Role>(null), [selectedLocalId, setSelectedLocalId] = useState(""), [selectedCloudId, setSelectedCloudId] = useState(""), [selectedSessionId, setSelectedSessionId] = useState(history[0]?.id ?? "");
  const [learnerLabel, setLearnerLabel] = useState("Learner"), [includeReflection, setIncludeReflection] = useState(false), [consent, setConsent] = useState(false), [status, setStatus] = useState("");
  const [feedbackSubmission, setFeedbackSubmission] = useState(""), [feedbackBody, setFeedbackBody] = useState(""), [feedbackPhrase, setFeedbackPhrase] = useState(""), [feedbackBar, setFeedbackBar] = useState("");
  const assignments = workspace.assignments ?? [];
  const selectedCloud = cloudAssignments.find(item => item.id === selectedCloudId);
  const selectedSession = history.find(item => item.id === selectedSessionId);
  const clientForLibrary = async () => {
    const client = getSongCloudClient(), checkpoint = readSongCloudCheckpoint();
    if (!client || !checkpoint) throw new Error(t("Open Song Builder cloud sharing and review a shared library first."));
    const { data, error } = await client.auth.getSession();
    const user = data.session?.user;
    if (error || !user || user.id !== checkpoint.accountId) throw new Error(t("Sign in and review the shared cloud library on this device first."));
    const { data: libraryRole, error: roleError } = await client.rpc("drum_library_role", { p_library_id: checkpoint.libraryId });
    if (roleError || !libraryRole) throw new Error(t("This account no longer has access to the reviewed cloud library."));
    setRole(libraryRole as Role);
    return { client, checkpoint, user, libraryRole: libraryRole as Role };
  };
  const refreshCloud = async () => {
    try {
      const { client, checkpoint } = await clientForLibrary();
      const { data, error } = await client.from("drum_improvisation_assignments").select("id,name,assignment,created_at").eq("library_id", checkpoint.libraryId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      const rows = (data ?? []) as CloudAssignment[];
      setCloudAssignments(rows);
      if (!rows.some(item => item.id === selectedCloudId)) setSelectedCloudId(rows[0]?.id ?? "");
      setStatus(t("Loaded {count} shared improvisation assignments.", { count: rows.length }));
    } catch (error) { setStatus(error instanceof Error ? error.message : t("Could not load shared assignments.")); }
  };
  const publishLocal = async () => {
    const selected = assignments.find(item => item.id === selectedLocalId);
    if (!selected) return;
    try {
      const { client, checkpoint, user, libraryRole } = await clientForLibrary();
      if (libraryRole !== "owner" && libraryRole !== "editor") throw new Error(t("Only library owners and editors can publish teacher assignments."));
      const serialized = JSON.stringify(selected);
      if (new TextEncoder().encode(serialized).length > 900_000) throw new Error(t("This assignment is too large to share."));
      const { error } = await client.from("drum_improvisation_assignments").insert({ library_id: checkpoint.libraryId, creator_id: user.id, name: selected.name.slice(0, 80), assignment: selected });
      if (error) throw error;
      await refreshCloud();
      setStatus(t("Published {name} to the shared library.", { name: selected.name }));
    } catch (error) { setStatus(error instanceof Error ? error.message : t("Could not publish this assignment.")); }
  };
  const importCloud = () => {
    if (!selectedCloud) return;
    if (assignments.length >= 12) { setStatus(t("Delete a local playlist before importing another.")); return; }
    try {
      const parsed = parseImprovisationWorkspace(JSON.stringify({ version: 1, assignments: [selectedCloud.assignment], presets: [], completedSteps: [] })).assignments?.[0];
      if (!parsed) throw new Error(t("This shared assignment has invalid settings."));
      const imported: ImprovisationAssignment = { ...parsed, id: crypto.randomUUID(), name: selectedCloud.name, steps: parsed.steps.map(step => ({ ...step, id: crypto.randomUUID() })) };
      onSave({ ...workspace, assignments: [...assignments, imported] });
      setStatus(t("Imported shared assignment: {name}.", { name: imported.name }));
    } catch (error) { setStatus(error instanceof Error ? error.message : t("Could not import this shared assignment.")); }
  };
  const submitSummary = async () => {
    if (!selectedCloud || !selectedSession || !consent) return;
    const label = learnerLabel.trim().slice(0, 48);
    if (!label) { setStatus(t("Enter a display name for the teacher summary.")); return; }
    try {
      const { client, user } = await clientForLibrary();
      const summary = sanitizedSessionSummary(selectedSession, includeReflection);
      const { error } = await client.from("drum_improvisation_submissions").insert({ assignment_id: selectedCloud.id, learner_id: user.id, learner_label: label, summary });
      if (error) throw error;
      setConsent(false);
      setStatus(t("Submitted the selected session summary. No raw hits, audio, device details, or calibration data were included."));
    } catch (error) { setStatus(error instanceof Error ? error.message : t("Could not submit this session summary.")); }
  };
  const loadSubmissions = async () => {
    if (!selectedCloud) return;
    try {
      const { client, libraryRole } = await clientForLibrary();
      if (libraryRole !== "owner" && libraryRole !== "editor") throw new Error(t("Teacher review is available to library owners and editors."));
      const { data, error } = await client.from("drum_improvisation_submissions").select("id,learner_label,summary,created_at").eq("assignment_id", selectedCloud.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      const rows = (data ?? []) as CloudSubmission[];
      setSubmissions(rows);
      setFeedbackSessions(Object.fromEntries(rows.map(row => [row.id, row.created_at])));
      if (rows.length) {
        const { data: comments, error: commentError } = await client.from("drum_improvisation_feedback").select("id,submission_id,phrase_index,bar_index,body,created_at").in("submission_id", rows.map(row => row.id)).order("created_at", { ascending: true }).limit(1000);
        if (commentError) throw commentError;
        setFeedback((comments ?? []) as CloudFeedback[]);
      } else setFeedback([]);
      setStatus(t("Loaded {count} learner summaries. Only summary metrics are stored.", { count: data?.length ?? 0 }));
    } catch (error) { setStatus(error instanceof Error ? error.message : t("Could not load learner summaries.")); }
  };
  const loadMyFeedback = async () => {
    if (!selectedCloud) return;
    try {
      const { client, user } = await clientForLibrary();
      const { data: own, error: ownError } = await client.from("drum_improvisation_submissions").select("id,created_at").eq("assignment_id", selectedCloud.id).eq("learner_id", user.id).order("created_at", { ascending: false }).limit(50);
      if (ownError) throw ownError;
      const ids = (own ?? []).map(row => row.id);
      if (!ids.length) { setFeedback([]); setStatus(t("No submitted sessions are linked to this account for this assignment yet.")); return; }
      setFeedbackSessions(Object.fromEntries((own ?? []).map(row => [row.id, row.created_at])));
      const { data, error } = await client.from("drum_improvisation_feedback").select("id,submission_id,phrase_index,bar_index,body,created_at").in("submission_id", ids).order("created_at", { ascending: true }).limit(500);
      if (error) throw error;
      setFeedback((data ?? []) as CloudFeedback[]);
      setStatus(t("Loaded {count} teacher comments for your submitted sessions.", { count: data?.length ?? 0 }));
    } catch (error) { setStatus(error instanceof Error ? error.message : t("Could not load teacher feedback.")); }
  };
  const postFeedback = async (submission: CloudSubmission) => {
    const body = feedbackBody.trim().slice(0, 1000);
    if (!selectedCloud || !body) return;
    try {
      const { client, user, libraryRole } = await clientForLibrary();
      if (libraryRole !== "owner" && libraryRole !== "editor") throw new Error(t("Only library owners and editors can comment on learner work."));
      const phrase = feedbackPhrase.trim() ? Number(feedbackPhrase) : null, bar = feedbackBar.trim() ? Number(feedbackBar) : null;
      if (phrase !== null && (!Number.isInteger(phrase) || phrase < 1 || phrase > 1000)) throw new Error(t("Phrase number must be between 1 and 1000."));
      if (bar !== null && (!Number.isInteger(bar) || bar < 1 || bar > 32)) throw new Error(t("Bar number must be between 1 and 32."));
      const { error } = await client.from("drum_improvisation_feedback").insert({ submission_id: submission.id, assignment_id: selectedCloud.id, author_id: user.id, phrase_index: phrase, bar_index: bar, body });
      if (error) throw error;
      setFeedbackBody(""); setFeedbackPhrase(""); setFeedbackBar(""); setFeedbackSubmission("");
      await loadSubmissions();
      setStatus(t("Feedback saved and available to this learner."));
    } catch (error) { setStatus(error instanceof Error ? error.message : t("Could not save teacher feedback.")); }
  };
  const preview = selectedSession ? sanitizedSessionSummary(selectedSession, includeReflection) : null;

  return <section className="card" aria-label={t("Shared improvisation assignments")}>
    <h2>{t("Shared teacher assignments")}</h2>
    <p>{t("Publish practice playlists to the reviewed Song Builder library. Learners can import a copy and explicitly submit a session summary; raw hits and audio are never shared.")}</p>
    <div className={styles.transport}><button type="button" className="button-secondary" disabled={disabled} onClick={() => void refreshCloud()}>{t("Load shared assignments")}</button></div>
    {(role === "owner" || role === "editor") && <div className={styles.settings}>
      <label>{t("Local assignment to publish")}<select value={selectedLocalId} onChange={event => setSelectedLocalId(event.target.value)}><option value="">{t("Choose an assignment")}</option>{assignments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <button type="button" className="button-secondary" disabled={disabled || !selectedLocalId} onClick={() => void publishLocal()}>{t("Publish to shared library")}</button>
    </div>}
    {cloudAssignments.length > 0 && <div className={styles.settings}>
      <label>{t("Shared assignment")}<select value={selectedCloudId} onChange={event => { setSelectedCloudId(event.target.value); setSubmissions([]); setFeedback([]); setFeedbackSessions({}); }}><option value="">{t("Choose an assignment")}</option>{cloudAssignments.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <button type="button" className="button-secondary" disabled={disabled || !selectedCloud} onClick={importCloud}>{t("Import to local playlists")}</button>
    </div>}
    {selectedCloud && <details><summary>{t("Submit a session summary")}</summary>
      <p>{t("Review the summary below, then check consent and submit. No raw hits, audio, device details, input mapping, or calibration data are sent.")}</p>
      <fieldset disabled={disabled} className={styles.settings}><legend>{t("Summary submission")}</legend>
        <label>{t("Session to share")}<select value={selectedSession?.id ?? ""} onChange={event => setSelectedSessionId(event.target.value)}><option value="">{t("Choose a completed session")}</option>{history.map(item => <option value={item.id} key={item.id}>{formatDate(new Date(item.playedAt), true)} · {t(item.settings.mode)} · {item.settings.bpm} BPM</option>)}</select></label>
        <label>{t("Display name for teacher")}<input value={learnerLabel} maxLength={48} onChange={event => setLearnerLabel(event.target.value)} /></label>
        <label className={styles.check}><input type="checkbox" checked={includeReflection} onChange={event => setIncludeReflection(event.target.checked)} />{t("Include my optional reflections and self-rating")}</label>
        {preview && <pre className={styles.summaryPreview}>{JSON.stringify(preview, null, 2)}</pre>}
        <label className={styles.check}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />{t("I reviewed this summary and agree to share it with the shared library teachers.")}</label>
        <button type="button" className="button" disabled={disabled || !consent || !selectedSession} onClick={() => void submitSummary()}>{t("Submit summary")}</button>
      </fieldset>
    </details>}
    {selectedCloud && role !== "owner" && role !== "editor" && <details><summary>{t("Teacher feedback")}</summary><p>{t("Teachers can attach plain-language comments to a phrase and bar. Comments are shared only with the learner who submitted the summary and the library teachers.")}</p><button type="button" className="button-secondary" disabled={disabled} onClick={() => void loadMyFeedback()}>{t("Load my teacher feedback")}</button>{feedback.filter(comment => feedbackSessions[comment.submission_id]).map(comment => <article className={styles.feedbackComment} key={comment.id}><small>{t("Your session")}: {formatDate(new Date(feedbackSessions[comment.submission_id]), true)} · {formatDate(new Date(comment.created_at), true)}{comment.phrase_index ? ` · ${t("Phrase {number}", { number: comment.phrase_index })}` : ""}{comment.bar_index ? ` · ${t("Bar {number}", { number: comment.bar_index })}` : ""}</small><p>{comment.body}</p></article>)}</details>}
    {(role === "owner" || role === "editor") && selectedCloud && <details><summary>{t("Review learner summaries")}</summary><button type="button" className="button-secondary" disabled={disabled} onClick={() => void loadSubmissions()}>{t("Load learner summaries")}</button><ul>{submissions.map(submission => <li key={submission.id}><strong>{submission.learner_label}</strong> · {formatDate(new Date(submission.created_at), true)}<pre className={styles.summaryPreview}>{JSON.stringify(submission.summary, null, 2)}</pre><h4>{t("Feedback for learner")}</h4>{feedback.filter(comment => comment.submission_id === submission.id).map(comment => <article className={styles.feedbackComment} key={comment.id}><small>{formatDate(new Date(comment.created_at), true)}{comment.phrase_index ? ` · ${t("Phrase {number}", { number: comment.phrase_index })}` : ""}{comment.bar_index ? ` · ${t("Bar {number}", { number: comment.bar_index })}` : ""}</small><p>{comment.body}</p></article>)}<button type="button" className="button-secondary" disabled={disabled} onClick={() => setFeedbackSubmission(current => current === submission.id ? "" : submission.id)}>{t(feedbackSubmission === submission.id ? "Close feedback form" : "Add teacher feedback")}</button>{feedbackSubmission === submission.id && <fieldset className={styles.settings}><legend>{t("Feedback comment")}</legend><label>{t("Phrase number (optional)")}<input type="number" min="1" max="1000" value={feedbackPhrase} onChange={event => setFeedbackPhrase(event.target.value)} /></label><label>{t("Bar number (optional)")}<input type="number" min="1" max="32" value={feedbackBar} onChange={event => setFeedbackBar(event.target.value)} /></label><label>{t("Comment")}<textarea maxLength={1000} rows={3} value={feedbackBody} onChange={event => setFeedbackBody(event.target.value)} /></label><button type="button" className="button" disabled={disabled || !feedbackBody.trim()} onClick={() => void postFeedback(submission)}>{t("Save feedback")}</button></fieldset>}</li>)}</ul></details>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}
