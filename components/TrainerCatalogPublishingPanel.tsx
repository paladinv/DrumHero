"use client";

import { useCallback, useEffect, useState } from "react";
import type { PracticePattern } from "@/lib/types";
import {
  loadTrainerCatalogSnapshot,
  publishTrainerCatalogRevision,
  recordTrainerCatalogReview,
  submitTrainerCatalogDraft,
  trainerCatalogPatternHash,
  type TrainerCatalogSnapshot,
} from "@/lib/trainer-catalog";

export function TrainerCatalogPublishingPanel({ pattern, disabled }: { pattern: PracticePattern; disabled: boolean }) {
  const [snapshot, setSnapshot] = useState<TrainerCatalogSnapshot | null>(null);
  const [revisionHash, setRevisionHash] = useState("");
  const [sourceAttribution, setSourceAttribution] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [rightsLicense, setRightsLicense] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const next = await loadTrainerCatalogSnapshot(pattern.id);
    setSnapshot(next);
    setRevisionHash(next.signedIn ? await trainerCatalogPatternHash(pattern) : "");
  }, [pattern]);

  useEffect(() => {
    let active = true;
    void refresh().catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Could not load the published catalog status."); });
    return () => { active = false; };
  }, [refresh]);

  const draft = snapshot?.draft;
  const currentDraft = Boolean(revisionHash && draft?.revision_hash === revisionHash);
  const currentPublication = Boolean(revisionHash && snapshot?.publication?.revision_hash === revisionHash);
  const approvals = new Set((snapshot?.reviews ?? []).filter(item => item.decision === "approved" && item.reviewer_id !== draft?.submitted_by).map(item => item.reviewer_id)).size;

  const act = async (operation: () => Promise<void>, success: string) => {
    setBusy(true);
    setMessage("");
    try { await operation(); await refresh(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The catalog action could not be completed."); }
    finally { setBusy(false); }
  };

  const submitDraft = () => {
    if (!snapshot?.role || !sourceAttribution.trim() || !rightsLicense.trim()) return;
    void act(() => submitTrainerCatalogDraft({
      patternId: pattern.id,
      title: pattern.name,
      pattern,
      sourceAttribution: sourceAttribution.trim(),
      sourceUrl: sourceUrl.trim(),
      rightsLicense: rightsLicense.trim(),
    }), "Draft submitted for this exact score revision.");
  };

  return <details className="trainer-catalog-publishing">
    <summary>Authenticated catalog publishing</summary>
    {!snapshot && <p>Loading account and publishing status…</p>}
    {snapshot && !snapshot.configured && <p>Cloud services are not configured for this deployment. The local educator review remains on this device.</p>}
    {snapshot?.publication && <p>Published catalog copy: <strong>{snapshot.publication.title}</strong> · revision {snapshot.publication.revision_hash} · {snapshot.publication.source_attribution} · rights: {snapshot.publication.rights_license}{snapshot.publication.source_url ? <> · <a href={snapshot.publication.source_url} target="_blank" rel="noreferrer">source</a></> : null}</p>}
    {snapshot?.configured && !snapshot.signedIn && <p>Sign in with your Drum Hero account to use the cloud editorial workflow.</p>}
    {snapshot?.signedIn && !snapshot.role && <p>Your account is signed in, but it has no editorial role. An administrator must assign reviewer, editor, or admin access; roles cannot be self-selected here.</p>}
    {snapshot?.role && <>
      <p>Signed in editorial role: <strong>{snapshot.role}</strong>. Review and publishing actions are attached to your authenticated account.</p>
      <p>Pattern revision: <code>{revisionHash || "Unavailable until cloud access is ready"}</code>{currentPublication ? " · This exact revision is published." : snapshot.publication ? ` · Published catalog is on revision ${snapshot.publication.revision_hash}.` : " · No revision has been published yet."}</p>
      <fieldset disabled={disabled || busy}>
        <legend>Submit a versioned draft</legend>
        <label>Source attribution<input maxLength={500} value={sourceAttribution} onChange={event => setSourceAttribution(event.target.value)} placeholder="Original work, author, or source credit" /></label>
        <label>Source URL, if available<input type="url" maxLength={500} value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
        <label>Rights or licence<input maxLength={500} value={rightsLicense} onChange={event => setRightsLicense(event.target.value)} placeholder="Original Drum Hero composition · CC BY 4.0 · permission record" /></label>
        <button type="button" className="button-secondary" disabled={!sourceAttribution.trim() || !rightsLicense.trim() || !revisionHash} onClick={submitDraft}>{currentDraft ? "Update draft revision" : "Submit this revision as a draft"}</button>
      </fieldset>
      {draft && <section className="trainer-editorial-cloud-review">
        <h4>Cloud draft · {draft.revision_hash} · {draft.status}</h4>
        <p>{currentDraft ? "The draft matches the score currently shown." : "A newer score is open. Submit it as a new revision before reviewing or publishing it."} Independent approvals for this exact revision: {approvals} of 2 required.</p>
        {snapshot.reviews.map(review => <p key={review.reviewer_id}><strong>{review.decision === "approved" ? "Approved" : "Changes requested"}</strong> · {review.notes || "No notes"}</p>)}
        <label>Review notes<textarea rows={2} maxLength={1200} value={reviewNotes} disabled={disabled || busy || !currentDraft} onChange={event => setReviewNotes(event.target.value)} placeholder="Musical accuracy, notation, sticking, or rights concerns." /></label>
        <div className="transport">
          <button type="button" className="button-secondary" disabled={disabled || busy || !currentDraft || !draft} onClick={() => void act(() => recordTrainerCatalogReview({ patternId: pattern.id, revisionHash: draft!.revision_hash, decision: "approved", notes: reviewNotes.trim() }), "Authenticated approval saved for this revision.")}>Approve revision</button>
          <button type="button" className="button-secondary" disabled={disabled || busy || !currentDraft || !draft} onClick={() => void act(() => recordTrainerCatalogReview({ patternId: pattern.id, revisionHash: draft!.revision_hash, decision: "changes-requested", notes: reviewNotes.trim() }), "Change request saved for this revision.")}>Request changes</button>
          {(snapshot.role === "editor" || snapshot.role === "admin") && <button type="button" className="button-secondary" disabled={disabled || busy || !currentDraft || !draft} onClick={() => void act(() => publishTrainerCatalogRevision(pattern.id, draft!.revision_hash), "Published to the authenticated Trainer catalog.")}>Publish after review</button>}
        </div>
      </section>}
    </>}
    {message && <p role="status">{message}</p>}
  </details>;
}
