"use client";

import Link from "next/link";
import { calculateStreak, levelProgress } from "@/lib/progress";
import type { Level } from "@/lib/types";
import { useProgress } from "./ProgressProvider";
const levels:Level[]=["Beginner","Intermediate","Advanced"];
export function ProgressDashboard(){
  const {progress}=useProgress();const streak=calculateStreak(progress.practiceDates);const best=Math.max(0,...Object.values(progress.bestScores));
  return <><section className="stat-grid"><div className="stat"><strong>{progress.completedLessons.length}/12</strong><span>Lessons complete</span></div><div className="stat"><strong>{progress.sessions.length}</strong><span>Practice sessions</span></div><div className="stat"><strong>{best}</strong><span>Best score</span></div><div className="stat"><strong>{streak}</strong><span>Day streak</span></div></section><div className="section-heading"><div><span className="eyebrow">Learning path</span><h2>Level progress</h2></div></div><section className="card-grid">{levels.map((level)=>{const value=levelProgress(progress.completedLessons,level);return <article className={`card level-${level}`} key={level}><span className="level-mark">{level}</span><h3>{value.done} of {value.total}</h3><div className="progress-track" aria-label={`${value.percent}% complete`}><span style={{width:`${value.percent}%`}}/></div><p>{value.percent}% of this level completed.</p></article>})}</section><div className="section-heading"><div><span className="eyebrow">Latest work</span><h2>Recent sessions</h2></div><Link className="button" href="/practice">Practice now</Link></div>{progress.sessions.length?<section className="lesson-list">{progress.sessions.slice(0,8).map((session)=><article className="lesson" key={session.id}><span className="lesson-order">{session.score}</span><div className="lesson-copy"><h3>{session.patternName}</h3><p>{session.bpm} BPM · {session.accuracy}% accuracy · {new Date(session.playedAt).toLocaleDateString()}</p></div><span className="done-mark">{session.maxCombo} combo</span></article>)}</section>:<div className="empty-state"><h3>No sessions yet</h3><p>Finish one Practice Pad loop and your timing history will appear here.</p></div>}</>;
}

