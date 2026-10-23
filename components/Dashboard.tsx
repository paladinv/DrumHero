"use client";

import Link from "next/link";
import { appliedAssessment, assessmentRecommendation, assessmentRecommendationReason } from "@/lib/assessment";
import { lessons } from "@/lib/curriculum";
import { useAssessment } from "./useAssessment";
import { calculateStreak, recommendNext } from "@/lib/progress";
import { DailyPracticePlan } from "./DailyPracticePlan";
import { useProgress } from "./ProgressProvider";
import { useLocalization } from "./LocalizationProvider";
import { useState } from "react";

const exploreLinks = [
  { href: "/learn", id: "learn" },
  { href: "/grooves", id: "grooves" },
  { href: "/rudiments", id: "rudiments" }
];

export function Dashboard() {
  const { progress, profileId } = useProgress();
  const { store } = useAssessment(profileId);
  const baseline = appliedAssessment(store);
  const suggested = baseline ? assessmentRecommendation(baseline) : null;
  const { t, formatNumber } = useLocalization();
  const [firstSessionPath, setFirstSessionPath] = useState<"lesson" | "pads" | "edrum">("lesson");
  const assessedLesson = lessons.find(l => l.id === suggested);
  const next = assessedLesson ?? recommendNext(progress.completedLessons);
  const recommendationReason = assessedLesson && baseline
    ? assessmentRecommendationReason(baseline)
    : progress.completedLessons.length
      ? "Next lesson in your learning path."
      : "A beginner-friendly place to start.";
  const streak = calculateStreak(progress.practiceDates);
  const firstSession = firstSessionPath === "lesson"
    ? { href: "/learn?lesson=meet-the-kit", title: "Start with the kit", detail: "A short introduction to kit voices, setup, and safe listening. No audio permission needed." }
    : firstSessionPath === "pads"
      ? { href: "/practice?pattern=quarter-pulse", title: "Play a steady pulse", detail: "Use touch or keyboard pads for a short, permission-free groove." }
      : { href: "/trainer?pattern=first-beat&setup=1", title: "Use an electronic kit", detail: "Open Trainer with input setup and timing calibration ready. Choose USB MIDI or another input when you are ready." };
  const lastSession = progress.sessions[0];

  return <main id="main-content" className="page dashboard-page">
    <section className="hero dashboard-hero">
      <div className="dashboard-welcome">
        <span className="eyebrow">{t("Drum learning, in time")}</span>
        <h1>{t("Build the beat.")}<br/><span>{t("Own the pocket.")}</span></h1>
        <p>{t("Clear lessons, playable patterns, and timing feedback for drummers at every stage. No account. No noise complaints required.")}</p>
      </div>
      <Link className="hero-action dashboard-recommendation" href={next.practicePatternId ? `/practice?pattern=${encodeURIComponent(next.practicePatternId)}` : "/learn"}>
        <span className="label">{t("Recommended next")}</span>
        <strong>{t(next.title)}</strong>
        <span>{t(recommendationReason)}</span>
        <span>{t(next.level)} · {formatNumber(next.duration)} min · {streak ? `${formatNumber(streak)} ${t("day streak")}` : t("Start your streak")}</span>
        <span className="dashboard-action-link">{t("Start learning")} <span aria-hidden="true">→</span></span>
      </Link>
    </section>

    {lastSession && <section className="dashboard-resume card" aria-labelledby="resume-heading">
      <div><span className="eyebrow">{t("Pick up where you left off")}</span><h2 id="resume-heading">{t(lastSession.patternName)}</h2><p>{formatNumber(lastSession.bpm)} BPM · {formatNumber(lastSession.accuracy)}% {t("accuracy")}</p></div>
      <Link className="button-secondary" href={`/practice?pattern=${encodeURIComponent(lastSession.patternId)}`}>{t("Practice again")} <span aria-hidden="true">→</span></Link>
    </section>}

    <p><Link className="button-secondary" href="/assessment">{t("Initial skill assessment")}</Link></p>
    <DailyPracticePlan />

    {progress.practiceDates.length === 0 && <section className="first-practice card" aria-labelledby="first-practice-heading">
      <div><span className="eyebrow">{t("Start here")}</span><h2 id="first-practice-heading">{t("Choose your first step")}</h2><p>{t("No account or setup is needed. Pick the path that fits today; microphone access is only requested if you choose it later in Trainer.")}</p><ol><li>{t("Take a short lesson or start playing right away.")}</li><li>{t("Follow the count-in at a comfortable tempo.")}</li><li>{t("Review the result and choose what to practice next.")}</li></ol></div>
      <div className="first-practice-actions"><fieldset className="first-session-choices"><legend>{t("What would you like to use?")}</legend><label><input type="radio" name="first-session-path" value="lesson" checked={firstSessionPath === "lesson"} onChange={() => setFirstSessionPath("lesson")} /> {t("I’m new and want a quick tour")}</label><label><input type="radio" name="first-session-path" value="pads" checked={firstSessionPath === "pads"} onChange={() => setFirstSessionPath("pads")} /> {t("Touch or keyboard pads")}</label><label><input type="radio" name="first-session-path" value="edrum" checked={firstSessionPath === "edrum"} onChange={() => setFirstSessionPath("edrum")} /> {t("Electronic drum kit")}</label></fieldset><p>{t(firstSession.detail)}</p><Link className="button" href={firstSession.href}>{t(firstSession.title)} →</Link></div>
    </section>}

    <section className="dashboard-overview" aria-label={t("Practice overview")}>
      <div className="dashboard-momentum card">
        <div className="section-heading dashboard-section-heading"><div><span className="eyebrow">{t("Your progress")}</span><h2>{t("Small steps add up.")}</h2></div><Link href="/progress">{t("View progress")} <span aria-hidden="true">→</span></Link></div>
        <div className="dashboard-stat-grid">
          <div><strong>{formatNumber(streak)}</strong><span>{t("day streak")}</span></div>
          <div><strong>{formatNumber(progress.completedLessons.length)}</strong><span>{t("Lessons completed")}</span></div>
          <div><strong>{formatNumber(progress.sessions.length)}</strong><span>{t("Practice sessions")}</span></div>
          <div><strong>{formatNumber(progress.practiceDates.length)}</strong><span>{t("Practice days")}</span></div>
        </div>
      </div>
      <div className="dashboard-explore">
        <div className="section-heading dashboard-section-heading"><div><span className="eyebrow">{t("Explore")}</span><h2>{t("Build your skills.")}</h2></div></div>
        <div className="dashboard-shortcuts">{exploreLinks.map((item) => <Link className="dashboard-shortcut" href={item.href} key={item.href}><span>{t(`dashboard.tool.${item.id}.title`)}</span><span aria-hidden="true">↗</span></Link>)}</div>
      </div>
    </section>
  </main>;
}
