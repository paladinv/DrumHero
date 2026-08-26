"use client";

import Link from "next/link";
import { calculateStreak, recommendNext } from "@/lib/progress";
import { useProgress } from "./ProgressProvider";

const tools = [
  {href:"/learn",number:"01",title:"Learning Path",copy:"Twelve guided lessons from first setup to polyrhythm."},
  {href:"/practice",number:"02",title:"Practice Pad",copy:"Train timing with five playable kit voices and honest feedback."},
  {href:"/rudiments",number:"03",title:"Rudiments",copy:"Build control with sticking, accents, and focused coaching."},
  {href:"/grooves",number:"04",title:"Grooves",copy:"Move from a first backbeat to syncopation and odd meter."},
  {href:"/kit",number:"05",title:"Kit Guide",copy:"Set up comfortably, understand every voice, and protect your hearing."},
  {href:"/progress",number:"06",title:"Progress",copy:"See completed lessons, best scores, recent work, and your streak."}
];

export function Dashboard() {
  const { progress } = useProgress();
  const next = recommendNext(progress.completedLessons);
  const streak = calculateStreak(progress.practiceDates);
  return <main id="main-content" className="page">
    <section className="hero">
      <div><span className="eyebrow">Drum learning, in time</span><h1>Build the beat.<br/><span>Own the pocket.</span></h1><p>Clear lessons, playable patterns, and timing feedback for drummers at every stage. No account. No noise complaints required.</p><div className="chips"><span className="chip">5 playable voices</span><span className="chip">40–200 BPM</span><span className="chip">Local progress</span></div></div>
      <Link className="hero-action" href={next.practicePatternId ? `/practice?pattern=${next.practicePatternId}` : "/learn"}><span className="label">Recommended next</span><strong>{next.title}</strong><span>{next.level} · {next.duration} min · {streak ? `${streak}-day streak` : "Start your streak"} →</span></Link>
    </section>
    <div className="section-heading"><div><span className="eyebrow">Choose your focus</span><h2>A studio, not a scroll.</h2></div><p>Each tool has one job. Learn the idea, isolate the motion, then put it into a groove.</p></div>
    <section className="card-grid" aria-label="Drum Hero tools">{tools.map((tool)=><Link className="card card-link" href={tool.href} key={tool.href}><span className="number">{tool.number}</span><h3>{tool.title}</h3><p>{tool.copy}</p><span className="label">Open tool →</span></Link>)}</section>
  </main>;
}

