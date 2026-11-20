"use client";

import { useEffect, useState } from "react";
import type { PracticePattern } from "@/lib/types";
import { readAllTrainerContentDecisions, readAllTrainerContentReviews, trainerPatternRevision, type TrainerContentDecision, type TrainerContentReview } from "@/lib/trainer-content-reviews";

type QueueItem = { pattern: PracticePattern; reviewCount: number; status: "approved" | "changes-requested" | "stale" | "needs-review" };

export function TrainerEditorialQueue({ patterns, disabled, onSelectPattern }: {
  patterns: PracticePattern[];
  disabled: boolean;
  onSelectPattern: (patternId: string) => void;
}) {
  const [reviews, setReviews] = useState<TrainerContentReview[]>([]);
  const [decisions, setDecisions] = useState<TrainerContentDecision[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void Promise.all([readAllTrainerContentReviews(), readAllTrainerContentDecisions()]).then(([nextReviews, nextDecisions]) => {
        if (!active) return;
        setReviews(nextReviews); setDecisions(nextDecisions); setLoaded(true);
      }).catch(error => { if (active) { setLoaded(true); setMessage(error instanceof Error ? error.message : "Local review records could not be loaded."); } });
    };
    window.addEventListener("drum-hero:trainer-content-reviews-change", refresh);
    refresh();
    return () => { active = false; window.removeEventListener("drum-hero:trainer-content-reviews-change", refresh); };
  }, []);

  const items: QueueItem[] = patterns.map(pattern => {
    const decision = decisions.find(item => item.patternId === pattern.id);
    const current = decision?.patternRevision === trainerPatternRevision(pattern);
    const status: QueueItem["status"] = current && decision.status === "approved" ? "approved"
      : current && decision.status === "changes-requested" ? "changes-requested"
        : decision ? "stale" : "needs-review";
    return { pattern, reviewCount: reviews.filter(item => item.patternId === pattern.id).length, status };
  });
  const pending = items.filter(item => item.status !== "approved");
  const counts = {
    approved: items.filter(item => item.status === "approved").length,
    changes: items.filter(item => item.status === "changes-requested").length,
    stale: items.filter(item => item.status === "stale").length,
    pending: items.filter(item => item.status === "needs-review").length,
  };
  const labels: Record<QueueItem["status"], string> = {
    approved: "Approved · current revision",
    "changes-requested": "Changes requested",
    stale: "Decision is stale",
    "needs-review": "Needs editorial review",
  };

  return <details className="trainer-editorial-queue">
    <summary>Trainer content editorial queue · {loaded ? `${counts.approved}/${items.length} current approvals` : "loading"}</summary>
    <p>This browser’s queue tracks review status against a fingerprint of each pattern. Local approval is an editorial attestation; Drum Hero does not authenticate reviewer qualifications or publish the pattern.</p>
    <div className="trainer-editorial-queue-counts"><span>{counts.pending} need review</span><span>{counts.changes} request changes</span><span>{counts.stale} stale after edits</span><span>{counts.approved} approved at current revision</span></div>
    <ul>{pending.slice(0, 20).map(item => <li key={item.pattern.id}>
      <span><strong>{item.pattern.name}</strong><small>{labels[item.status]} · {item.reviewCount} local review{item.reviewCount === 1 ? "" : "s"}</small></span>
      <button type="button" className="button-secondary" disabled={disabled} onClick={() => onSelectPattern(item.pattern.id)}>Review pattern</button>
    </li>)}</ul>
    {pending.length > 20 && <p>{pending.length - 20} more patterns need review; select them from the Trainer pattern list.</p>}
    {!pending.length && items.length > 0 && <p>All patterns have a local approval for their current revision. This does not replace external player and educator review.</p>}
    {message && <p role="status">{message}</p>}
  </details>;
}
