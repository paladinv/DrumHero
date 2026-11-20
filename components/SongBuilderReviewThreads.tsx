"use client";

import { useState } from "react";
import type { SongReviewComment, SongReviewReply, SongSection } from "@/lib/song-library";

const makeId = () => crypto.randomUUID();

export function SongBuilderReviewThreads({ section, measureCount, onChange }: { section: SongSection; measureCount: number; onChange: (comments: SongReviewComment[]) => void }) {
  const [author, setAuthor] = useState("Drummer");
  const [measure, setMeasure] = useState(1);
  const [beat, setBeat] = useState(1);
  const [draft, setDraft] = useState("");
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [showResolved, setShowResolved] = useState(false);
  const comments = section.reviewComments ?? [];
  const visible = comments.filter(comment => showResolved || comment.status === "open");

  const setReviewer = (value: string) => {
    const next = value.slice(0, 80); setAuthor(next);
  };
  const post = () => {
    const text = draft.trim().slice(0, 1200), cleanAuthor = author.trim().slice(0, 80);
    if (!text || !cleanAuthor) return;
    const now = new Date().toISOString();
    const comment: SongReviewComment = { id: makeId(), measure: Math.max(1, Math.min(measureCount || 1, measure)), beat: Math.max(1, Math.min(32, beat)) - 1, text, author: cleanAuthor, status: "open", createdAt: now, updatedAt: now };
    onChange([...comments, comment].slice(-512));
    setDraft("");
  };
  const postReply = (comment: SongReviewComment) => {
    const text = (replies[comment.id] ?? "").trim().slice(0, 1200), cleanAuthor = author.trim().slice(0, 80);
    if (!text || !cleanAuthor) return;
    const now = new Date().toISOString(), reply: SongReviewReply = { id: makeId(), author: cleanAuthor, text, createdAt: now };
    onChange(comments.map(item => item.id === comment.id ? { ...item, updatedAt: now, replies: [...(item.replies ?? []), reply].slice(-100) } : item));
    setReplies(current => ({ ...current, [comment.id]: "" }));
  };
  const toggleResolved = (comment: SongReviewComment) => onChange(comments.map(item => item.id === comment.id ? { ...item, status: item.status === "open" ? "resolved" : "open", updatedAt: new Date().toISOString() } : item));

  return <details className="card song-builder-review-threads">
    <summary>Score review threads · {comments.filter(comment => comment.status === "open").length} open</summary>
    <p>Leave measure anchored notes for collaborators. Replies and resolved status are saved with the section and travel with its local backup or shared song.</p>
    <div className="song-builder-tool-fields">
      <label>Your reviewer name<input maxLength={80} value={author} onChange={event=>setReviewer(event.target.value)} /></label>
      <label>Measure<input type="number" min={1} max={Math.max(1, measureCount)} value={measure} onChange={event=>setMeasure(Math.max(1,Math.min(Math.max(1,measureCount),Number(event.target.value)||1)))} /></label>
      <label>Beat within measure<input type="number" min={1} max={32} value={beat} onChange={event=>setBeat(Math.max(1,Math.min(32,Number(event.target.value)||1)))} /></label>
      <label>Review note<input maxLength={1200} value={draft} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();post();}}} placeholder="Check the snare accent in the second bar" /></label>
      <button type="button" disabled={!draft.trim()||!author.trim()} onClick={post}>Add review thread</button>
    </div>
    <label><input type="checkbox" checked={showResolved} onChange={event=>setShowResolved(event.target.checked)} />Show resolved threads</label>
    {visible.length ? <ol className="song-builder-review-thread-list">{visible.map(comment=><li key={comment.id}>
      <div className="song-builder-section-heading"><strong>Measure {comment.measure}{comment.beat!==undefined?` · beat ${(comment.beat+1).toFixed(Number.isInteger(comment.beat)?0:1)}`:""} · {comment.author}</strong><button type="button" onClick={()=>toggleResolved(comment)}>{comment.status==="open"?"Resolve":"Reopen"}</button></div>
      <p>{comment.text}</p><small>{new Date(comment.createdAt).toLocaleString()}</small>
      {!!comment.replies?.length&&<ul>{comment.replies.map(reply=><li key={reply.id}><strong>{reply.author}:</strong> {reply.text}<small> · {new Date(reply.createdAt).toLocaleString()}</small></li>)}</ul>}
      <div className="song-builder-tool-fields"><label>Reply<input maxLength={1200} value={replies[comment.id]??""} onChange={event=>setReplies(current=>({...current,[comment.id]:event.target.value}))} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();postReply(comment);}}} /></label><button type="button" disabled={!replies[comment.id]?.trim()||!author.trim()} onClick={()=>postReply(comment)}>Reply</button></div>
    </li>)}</ol> : <p>No {showResolved?"review":"open review"} threads in this section.</p>}
  </details>;
}
