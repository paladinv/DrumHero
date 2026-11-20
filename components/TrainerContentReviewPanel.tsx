"use client";

import { useEffect, useState } from "react";
import type { PracticePattern } from "@/lib/types";
import { deleteTrainerContentReview, readTrainerContentDecision, readTrainerContentReviews, saveTrainerContentDecision, saveTrainerContentReview, trainerPatternRevision, type TrainerContentDecision, type TrainerContentReview } from "@/lib/trainer-content-reviews";

type DemoUrl = TrainerContentReview & { demoUrl: string };

export function TrainerContentReviewPanel({ pattern, disabled }: { pattern: PracticePattern; disabled: boolean }) {
  const [reviews, setReviews] = useState<TrainerContentReview[]>([]);
  const [decision, setDecision] = useState<TrainerContentDecision | null>(null);
  const [editorName, setEditorName] = useState("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [editorConfirmed, setEditorConfirmed] = useState(false);
  const [reviewerRole, setReviewerRole] = useState<TrainerContentReview["reviewerRole"]>("drum-teacher");
  const [musicalAccuracy, setMusicalAccuracy] = useState<TrainerContentReview["musicalAccuracy"]>("accurate");
  const [levelFit, setLevelFit] = useState<TrainerContentReview["levelFit"]>("right");
  const [notationClarity, setNotationClarity] = useState<TrainerContentReview["notationClarity"]>("clear");
  const [stickingClarity, setStickingClarity] = useState<TrainerContentReview["stickingClarity"]>("clear");
  const [notes, setNotes] = useState("");
  const [attribution, setAttribution] = useState("");
  const [demo, setDemo] = useState<Blob | undefined>();
  const [demoName, setDemoName] = useState("");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [demoUrls, setDemoUrls] = useState<DemoUrl[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([readTrainerContentReviews(pattern.id), readTrainerContentDecision(pattern.id)]).then(([items, nextDecision]) => {
      if (!active) return;
      setReviews(items); setDecision(nextDecision); setEditorName(nextDecision?.reviewedBy ?? ""); setDecisionNotes(nextDecision?.notes ?? ""); setEditorConfirmed(false);
    }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Could not load local content reviews."); });
    return () => { active = false; };
  }, [pattern.id]);

  useEffect(() => {
    let active = true;
    let next: DemoUrl[] = [];
    const timer = window.setTimeout(() => {
      next = reviews.flatMap(item => item.demo ? [{ ...item, demoUrl: URL.createObjectURL(item.demo) }] : []);
      if (active) setDemoUrls(next);
      else next.forEach(item => URL.revokeObjectURL(item.demoUrl));
    }, 0);
    return () => { active = false; window.clearTimeout(timer); next.forEach(item => URL.revokeObjectURL(item.demoUrl)); };
  }, [reviews]);

  const revision = trainerPatternRevision(pattern);
  const decisionIsCurrent = decision?.patternRevision === revision;
  const status = decisionIsCurrent
    ? decision.status === "approved" ? `Locally approved for this pattern revision by ${decision.reviewedBy}. Reviewer identity is not independently verified.` : `Changes requested by ${decision.reviewedBy}; this decision applies to the current pattern revision.`
    : decision ? "The pattern changed after its last editorial decision; review this revision again."
      : reviews.length ? "Local review feedback exists; no current-revision editorial decision is recorded." : "No local educator review has been submitted for this pattern.";

  const exportReview = (item: TrainerContentReview) => {
    const { demo: _demo, ...metadata } = item;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: "drum-hero-trainer-content-review", version: 1, review: metadata }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `trainer-review-${item.patternId}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const submit = async () => {
    if (!reviewerRole || (demo && (!permissionConfirmed || !attribution.trim()))) return;
    if (demo && (!demo.type.startsWith("audio/") || demo.size > 20 * 1024 * 1024)) { setMessage("Choose an audio demo smaller than 20 MB."); return; }
    const review: TrainerContentReview = {
      id: crypto.randomUUID(), patternId: pattern.id, patternName: pattern.name, reviewerRole,
      musicalAccuracy, levelFit, notationClarity, stickingClarity, notes: notes.trim().slice(0, 1200),
      attribution: attribution.trim().slice(0, 300), demoName: demo ? demoName.trim().slice(0, 120) || "Educator performance demo" : undefined,
      demo, createdAt: new Date().toISOString(),
    };
    setBusy(true);
    try {
      await saveTrainerContentReview(review);
      const next = await readTrainerContentReviews(pattern.id);
      window.dispatchEvent(new Event("drum-hero:trainer-content-reviews-change"));
      setReviews(next); setNotes(""); setDemo(undefined); setDemoName(""); setPermissionConfirmed(false);
      setMessage("Review saved on this device. It has not been independently verified or shared.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The review could not be saved locally."); }
    finally { setBusy(false); }
  };

  const saveDecision = async (nextStatus: TrainerContentDecision["status"]) => {
    if (!editorConfirmed || !editorName.trim()) return;
    const criticalFeedback = reviews.some(item => item.musicalAccuracy === "needs-changes" || item.notationClarity === "needs-changes" || item.stickingClarity === "needs-changes");
    if (nextStatus === "approved" && !reviews.some(item => item.reviewerRole !== "learner")) { setMessage("Import or submit at least one teacher or experienced-drummer review before approving this revision."); return; }
    if (nextStatus === "approved" && criticalFeedback && !decisionNotes.trim()) { setMessage("Add a note explaining how the reported changes were resolved before approving."); return; }
    const nextDecision: TrainerContentDecision = {
      patternId: pattern.id, patternRevision: revision, status: nextStatus,
      reviewedBy: editorName.trim().slice(0, 100), notes: decisionNotes.trim().slice(0, 1200), reviewedAt: new Date().toISOString(),
    };
    setBusy(true);
    try {
      await saveTrainerContentDecision(nextDecision); window.dispatchEvent(new Event("drum-hero:trainer-content-reviews-change")); setDecision(nextDecision); setEditorConfirmed(false);
      setMessage("Editorial decision saved locally for this exact pattern revision.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The editorial decision could not be saved."); }
    finally { setBusy(false); }
  };

  const importReviews = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let imported = 0;
    let importedDecision: TrainerContentDecision | null = null;
    try {
      const importOneReview = async (value: unknown, source: string) => {
        if (!value || typeof value !== "object") throw new Error(`${source} has no review record.`);
        const raw = value as Partial<TrainerContentReview>;
        if (raw.patternId !== pattern.id) throw new Error(`${source} belongs to a different pattern.`);
        if (!("drum-teacher experienced-drummer learner".split(" ")).includes(String(raw.reviewerRole)) || !["accurate", "needs-changes"].includes(String(raw.musicalAccuracy)) || !["right", "too-easy", "too-hard"].includes(String(raw.levelFit)) || !["clear", "needs-changes"].includes(String(raw.notationClarity)) || !["clear", "needs-changes"].includes(String(raw.stickingClarity))) throw new Error(`${source} contains unsupported review values.`);
        await saveTrainerContentReview({
          id: typeof raw.id === "string" && raw.id.length <= 100 ? raw.id : crypto.randomUUID(), patternId: pattern.id, patternName: pattern.name,
          reviewerRole: raw.reviewerRole!, musicalAccuracy: raw.musicalAccuracy!, levelFit: raw.levelFit!,
          notationClarity: raw.notationClarity!, stickingClarity: raw.stickingClarity!,
          notes: typeof raw.notes === "string" ? raw.notes.slice(0, 1200) : "", attribution: typeof raw.attribution === "string" ? raw.attribution.slice(0, 300) : "",
          createdAt: typeof raw.createdAt === "string" && Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : new Date().toISOString(),
        });
        imported += 1;
      };
      for (const file of Array.from(files).slice(0, 25)) {
        if (file.size > 200_000) throw new Error("Review records and editorial bundles must be smaller than 200 KB each.");
        const document: unknown = JSON.parse(await file.text());
        if (!document || typeof document !== "object" || (document as { version?: unknown }).version !== 1) throw new Error(`${file.name} is not a supported Trainer review record or editorial bundle.`);
        const format = (document as { format?: unknown }).format;
        if (format === "drum-hero-trainer-content-review") {
          await importOneReview((document as { review?: unknown }).review, file.name);
        } else if (format === "drum-hero-trainer-editorial-bundle") {
          const bundle = document as { pattern?: { id?: unknown; revision?: unknown }; reviews?: unknown; decision?: unknown };
          if (bundle.pattern?.id !== pattern.id || bundle.pattern.revision !== revision) throw new Error(`${file.name} was exported for a different pattern revision.`);
          if (!Array.isArray(bundle.reviews) || bundle.reviews.length > 100) throw new Error(`${file.name} contains an invalid review list.`);
          for (const review of bundle.reviews) await importOneReview(review, file.name);
          if (bundle.decision !== null && bundle.decision !== undefined) {
            const raw = bundle.decision as Partial<TrainerContentDecision>;
            if (raw.patternId !== pattern.id || typeof raw.patternRevision !== "string" || !/^[a-f0-9]{8}$/i.test(raw.patternRevision) || !["approved", "changes-requested"].includes(String(raw.status)) || typeof raw.reviewedBy !== "string" || !raw.reviewedBy.trim() || typeof raw.reviewedAt !== "string" || !Number.isFinite(Date.parse(raw.reviewedAt))) throw new Error(`${file.name} contains an invalid editorial decision.`);
            importedDecision = { patternId: pattern.id, patternRevision: raw.patternRevision, status: raw.status!, reviewedBy: raw.reviewedBy.slice(0, 100), notes: typeof raw.notes === "string" ? raw.notes.slice(0, 1200) : "", reviewedAt: raw.reviewedAt };
          }
        } else throw new Error(`${file.name} is not a supported Trainer review record or editorial bundle.`);
      }
      if (importedDecision) await saveTrainerContentDecision(importedDecision);
      const [nextReviews, nextDecision] = await Promise.all([readTrainerContentReviews(pattern.id), readTrainerContentDecision(pattern.id)]);
      setReviews(nextReviews); setDecision(nextDecision);
      window.dispatchEvent(new Event("drum-hero:trainer-content-reviews-change"));
      setMessage(`${imported} review record${imported === 1 ? "" : "s"} imported${importedDecision ? " with its versioned editorial decision" : ""}. Reviewer roles remain self-reported.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review records could not be imported."); }
    finally { setBusy(false); }
  };

  const exportEditorialBundle = () => {
    const exportedReviews = reviews.map(({ demo: _demo, ...item }) => item);
    const bundle = { format: "drum-hero-trainer-editorial-bundle", version: 1, exportedAt: new Date().toISOString(),
      pattern: { id: pattern.id, name: pattern.name, revision }, decision, reviews: exportedReviews,
      limitation: "Reviewer roles and local editorial decisions are user-entered and are not independently authenticated. Audio demos are omitted from this metadata bundle." };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `trainer-editorial-${pattern.id}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const remove = async (id: string) => {
    try { await deleteTrainerContentReview(id); setReviews(await readTrainerContentReviews(pattern.id)); window.dispatchEvent(new Event("drum-hero:trainer-content-reviews-change")); setMessage("Local review removed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove the review."); }
  };

  return <details className="trainer-content-review">
    <summary>Educator review & performance demos · {reviews.length} local record{reviews.length === 1 ? "" : "s"}</summary>
    <p><strong>{pattern.name}</strong> · {status}</p>
    <p>Collect a musician’s review of style accuracy, level, notation, and sticking. A reviewer role is self-reported. Reviews and optional audio demos stay in this browser until you export them; local approval does not publish a pattern. Use the authenticated catalog section below for account-verified review and publishing.</p>
    <div className="trainer-content-review-form">
      <label>Reviewer role<select value={reviewerRole} disabled={disabled || busy} onChange={event => setReviewerRole(event.target.value as TrainerContentReview["reviewerRole"])}><option value="drum-teacher">Drum teacher</option><option value="experienced-drummer">Experienced drummer</option><option value="learner">Learner</option></select></label>
      <label>Musical accuracy<select value={musicalAccuracy} disabled={disabled || busy} onChange={event => setMusicalAccuracy(event.target.value as TrainerContentReview["musicalAccuracy"])}><option value="accurate">Pattern sounds musically accurate</option><option value="needs-changes">Needs musical changes</option></select></label>
      <label>Difficulty fit<select value={levelFit} disabled={disabled || busy} onChange={event => setLevelFit(event.target.value as TrainerContentReview["levelFit"])}><option value="right">Level seems right</option><option value="too-easy">Too easy</option><option value="too-hard">Too hard</option></select></label>
      <label>Notation<select value={notationClarity} disabled={disabled || busy} onChange={event => setNotationClarity(event.target.value as TrainerContentReview["notationClarity"])}><option value="clear">Score is clear and correct</option><option value="needs-changes">Score needs changes</option></select></label>
      <label>Sticking<select value={stickingClarity} disabled={disabled || busy} onChange={event => setStickingClarity(event.target.value as TrainerContentReview["stickingClarity"])}><option value="clear">Sticking guidance is clear</option><option value="needs-changes">Sticking needs changes</option></select></label>
      <label>Review notes<textarea rows={3} maxLength={1200} value={notes} disabled={disabled || busy} onChange={event => setNotes(event.target.value)} placeholder="Which accent, sticking, or transition should be reviewed?" /></label>
      <label>Optional performance demo<input type="file" accept="audio/*" disabled={disabled || busy} onChange={event => { setDemo(event.target.files?.[0]); setDemoName(event.target.files?.[0]?.name ?? ""); }} /></label>
      {demo && <><label>Demo attribution and usage permission<input maxLength={300} value={attribution} disabled={busy} onChange={event => setAttribution(event.target.value)} placeholder="Performer · source · permission or licence" /></label><label className="trainer-content-review-consent"><input type="checkbox" checked={permissionConfirmed} disabled={busy} onChange={event => setPermissionConfirmed(event.target.checked)} /> I have permission to keep this demo locally and share it only under its stated attribution.</label></>}
    </div>
    <button type="button" className="button-secondary" disabled={disabled || busy || Boolean(demo && (!permissionConfirmed || !attribution.trim()))} onClick={() => void submit()}>Save local review</button>
    <section className="trainer-editorial-decision" aria-label="Versioned editorial decision">
      <h4>Editorial decision for revision {revision}</h4>
      <p>{status} Review evidence remains local unless you export the bundle.</p>
      <label>Editor name or review code<input maxLength={100} value={editorName} disabled={disabled || busy} onChange={event => setEditorName(event.target.value)} /></label>
      <label>Decision notes<textarea rows={2} maxLength={1200} value={decisionNotes} disabled={disabled || busy} onChange={event => setDecisionNotes(event.target.value)} placeholder="Required changes, accepted interpretation, or follow-up." /></label>
      <label className="trainer-content-review-consent"><input type="checkbox" checked={editorConfirmed} disabled={disabled || busy} onChange={event => setEditorConfirmed(event.target.checked)} /> I reviewed this exact score revision and the submitted feedback.</label>
      <div className="transport"><button type="button" className="button-secondary" disabled={disabled || busy || !editorConfirmed || !editorName.trim()} onClick={() => void saveDecision("approved")}>Approve this revision locally</button><button type="button" className="button-secondary" disabled={disabled || busy || !editorConfirmed || !editorName.trim()} onClick={() => void saveDecision("changes-requested")}>Request changes</button><button type="button" className="button-secondary" disabled={!reviews.length || busy} onClick={exportEditorialBundle}>Export editorial bundle</button></div>
      <label>Import reviews or an editorial bundle<input type="file" accept=".json,application/json" multiple disabled={disabled || busy} onChange={event => { void importReviews(event.currentTarget.files); event.currentTarget.value = ""; }} /></label>
    </section>
    {reviews.length > 0 && <ul className="trainer-content-review-list">{reviews.map(item => {
      const demoEntry = demoUrls.find(row => row.id === item.id);
      return <li key={item.id}><strong>{item.reviewerRole.replaceAll("-", " ")} · {new Date(item.createdAt).toLocaleDateString()}</strong><span>{item.musicalAccuracy} · {item.levelFit} · notation {item.notationClarity} · sticking {item.stickingClarity}</span>{item.notes && <p>{item.notes}</p>}{demoEntry && <div><audio controls preload="none" src={demoEntry.demoUrl} aria-label={`${item.demoName ?? "Educator demo"} for ${pattern.name}`} /><small>{item.demoName} · attribution: {item.attribution}</small><a href={demoEntry.demoUrl} download={item.demoName || "trainer-demo.webm"}>Download demo</a></div>}<div className="transport"><button type="button" className="button-secondary" onClick={() => exportReview(item)}>Export review record</button><button type="button" className="button-secondary" disabled={busy} onClick={() => void remove(item.id)}>Delete local record</button></div></li>;
    })}</ul>}
    {message && <p role="status">{message}</p>}
  </details>;
}
