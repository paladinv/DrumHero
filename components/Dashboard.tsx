"use client";

import Link from "next/link";
import { calculateStreak, recommendNext } from "@/lib/progress";
import { DailyPracticePlan } from "./DailyPracticePlan";
import { useProgress } from "./ProgressProvider";
import { useLocalization } from "./LocalizationProvider";
import { useState } from "react";

const tools = [
  {href:"/learn",number:"01",id:"learn"}, {href:"/trainer",number:"02",id:"trainer"},
  {href:"/practice",number:"03",id:"practice"}, {href:"/rudiments",number:"04",id:"rudiments"},
  {href:"/grooves",number:"05",id:"grooves"}, {href:"/song-library",number:"06",id:"songs"},
  {href:"/kit",number:"07",id:"kit"}, {href:"/progress",number:"08",id:"progress"}
];

export function Dashboard() {
  const { progress } = useProgress();
  const { t, formatNumber } = useLocalization();
  const [firstSessionPath, setFirstSessionPath] = useState<"lesson" | "pads" | "edrum">("lesson");
  const next = recommendNext(progress.completedLessons);
  const streak = calculateStreak(progress.practiceDates);
  const firstSession = firstSessionPath === "lesson"
    ? { href: "/learn?lesson=meet-the-kit", title: "Start with the kit", detail: "A short introduction to kit voices, setup, and safe listening. No audio permission needed." }
    : firstSessionPath === "pads"
      ? { href: "/practice?pattern=quarter-pulse", title: "Play a steady pulse", detail: "Use touch or keyboard pads for a short, permission-free groove." }
      : { href: "/trainer?pattern=first-beat", title: "Use an electronic kit", detail: "Open Trainer and choose USB MIDI or another input when you are ready." };
  return <main id="main-content" className="page">
    <section className="hero">
      <div><span className="eyebrow">{t("Drum learning, in time")}</span><h1>{t("Build the beat.")}<br/><span>{t("Own the pocket.")}</span></h1><p>{t("Clear lessons, playable patterns, and timing feedback for drummers at every stage. No account. No noise complaints required.")}</p><div className="chips"><span className="chip">{t("5 playable voices")}</span><span className="chip">40–200 BPM</span><span className="chip">{t("Local progress")}</span></div></div>
      <Link className="hero-action" href={next.practicePatternId ? `/practice?pattern=${next.practicePatternId}` : "/learn"}><span className="label">{t("Recommended next")}</span><strong>{next.title}</strong><span>{t(next.level)} · {formatNumber(next.duration)} min · {streak ? `${formatNumber(streak)} ${t("day streak")}` : t("Start your streak")} →</span></Link>
    </section>
    {progress.practiceDates.length === 0 && <section className="first-practice card" aria-labelledby="first-practice-heading">
      <div><span className="eyebrow">{t("Start here")}</span><h2 id="first-practice-heading">{t("Choose your first step")}</h2><p>{t("No account or setup is needed. Pick the path that fits today; microphone access is only requested if you choose it later in Trainer.")}</p><ol><li>{t("Take a short lesson or start playing right away.")}</li><li>{t("Follow the count-in at a comfortable tempo.")}</li><li>{t("Review the result and choose what to practice next.")}</li></ol></div>
      <div className="first-practice-actions"><fieldset className="first-session-choices"><legend>{t("What would you like to use?")}</legend><label><input type="radio" name="first-session-path" value="lesson" checked={firstSessionPath === "lesson"} onChange={() => setFirstSessionPath("lesson")} /> {t("I’m new and want a quick tour")}</label><label><input type="radio" name="first-session-path" value="pads" checked={firstSessionPath === "pads"} onChange={() => setFirstSessionPath("pads")} /> {t("Touch or keyboard pads")}</label><label><input type="radio" name="first-session-path" value="edrum" checked={firstSessionPath === "edrum"} onChange={() => setFirstSessionPath("edrum")} /> {t("Electronic drum kit")}</label></fieldset><p>{t(firstSession.detail)}</p><Link className="button" href={firstSession.href}>{t(firstSession.title)} →</Link></div>
    </section>}
    <DailyPracticePlan />
    <div className="section-heading"><div><span className="eyebrow">{t("Choose your focus")}</span><h2>{t("A studio, not a scroll.")}</h2></div><p>{t("Each tool has one job. Learn the idea, isolate the motion, then put it into a groove.")}</p></div>
    <section className="card-grid" aria-label="Drum Hero tools">{tools.map((tool)=><Link className="card card-link" href={tool.href} key={tool.href}><span className="number">{tool.number}</span><h3>{t(`dashboard.tool.${tool.id}.title`)}</h3><p>{t(`dashboard.tool.${tool.id}.description`)}</p><span className="label">{t("Open tool →")}</span></Link>)}</section>
  </main>;
}
