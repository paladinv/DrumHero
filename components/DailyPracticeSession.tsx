"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dailySessionStorageKey, parseDailyPracticeSession, type DailyPracticeSession } from "@/lib/daily-practice-session";
import { useProgress } from "@/components/ProgressProvider";
import { useLocalization } from "@/components/LocalizationProvider";

function formatElapsed(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function DailyPracticeSession() {
  const { profileId } = useProgress();
  const { formatNumber, t } = useLocalization();
  const storageKey = useMemo(() => dailySessionStorageKey(profileId), [profileId]);
  const [session, setSession] = useState<DailyPracticeSession | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    try { setSession(parseDailyPracticeSession(window.localStorage.getItem(storageKey))); }
    catch { setSession(null); }
  }, [storageKey]);
  const save = useCallback((next: DailyPracticeSession) => {
    setSession(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new Event("drum-hero:daily-session-change")); }
    catch { /* Keep the current session usable until this page closes. */ }
  }, [storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    const sync = (event: StorageEvent) => { if (event.key === storageKey) load(); };
    window.addEventListener("storage", sync);
    window.addEventListener("drum-hero:daily-session-change", load);
    return () => { window.clearTimeout(timer); window.removeEventListener("storage", sync); window.removeEventListener("drum-hero:daily-session-change", load); };
  }, [load, storageKey]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const runStartedAt = session?.runStartedAt;
    if (!session || runStartedAt === null || runStartedAt === undefined || session.completedAt) return;
    const pauseOnPageHide = () => {
      const timestamp = Date.now();
      save({ ...session, elapsedMs: session.elapsedMs + Math.max(0, timestamp - runStartedAt), runStartedAt: null });
    };
    window.addEventListener("pagehide", pauseOnPageHide);
    return () => window.removeEventListener("pagehide", pauseOnPageHide);
  }, [session, save]);

  const pending = session ? session.steps.find((step) => !session.completedStepIds.includes(step.id) && !session.skippedStepIds.includes(step.id)) : undefined;
  const completeCount = session?.completedStepIds.length ?? 0;
  const elapsed = session ? session.elapsedMs + (session.runStartedAt === null ? 0 : Math.max(0, now - session.runStartedAt)) : 0;

  const toggleTimer = () => {
    if (!session || session.completedAt) return;
    const timestamp = Date.now();
    if (session.runStartedAt === null) save({ ...session, runStartedAt: timestamp });
    else save({ ...session, elapsedMs: session.elapsedMs + Math.max(0, timestamp - session.runStartedAt), runStartedAt: null });
  };

  const closeStep = (status: "complete" | "skip") => {
    if (!session || !pending) return;
    const completedStepIds = status === "complete" ? [...session.completedStepIds, pending.id] : session.completedStepIds;
    const skippedStepIds = status === "skip" ? [...session.skippedStepIds, pending.id] : session.skippedStepIds;
    const hasNext = session.steps.some((step) => !completedStepIds.includes(step.id) && !skippedStepIds.includes(step.id));
    const elapsedMs = session.runStartedAt === null ? session.elapsedMs : session.elapsedMs + Math.max(0, Date.now() - session.runStartedAt);
    save({
      ...session,
      completedStepIds,
      skippedStepIds,
      elapsedMs: hasNext ? session.elapsedMs : elapsedMs,
      runStartedAt: hasNext ? session.runStartedAt : null,
      completedAt: hasNext ? null : new Date().toISOString()
    });
  };

  if (!session) return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow">{t("Guided practice")}</span><h1>{t("No saved session")}</h1><p>{t("Start a guided session from your Home practice plan. Your plan is saved on this learner profile.")}</p></header><Link className="button" href="/">{t("Return Home")}</Link></main>;

  const done = !!session.completedAt;
  const progressPercent = Math.round(completeCount / session.steps.length * 100);

  return <main id="main-content" className="page daily-session-page">
    <header className="page-heading">
      <span className="eyebrow">{t("Guided practice")}</span>
      <h1>{done ? t("Session finished") : t("Your focused session")}</h1>
      <p>{done ? t("You completed {count} of {total} steps in {time}.", { count: completeCount, total: session.steps.length, time: formatElapsed(elapsed) }) : t("Open each drill in a new tab, then return here to track your steps and elapsed time.")}</p>
    </header>

    <section className="daily-session-summary card" aria-labelledby="daily-session-summary-heading">
      <div><span className="eyebrow">{t("Session timer")}</span><h2 id="daily-session-summary-heading" aria-label={t("Elapsed practice time")}>{formatElapsed(elapsed)}</h2></div>
      <div className="daily-session-progress"><strong>{t("{done} of {total} steps complete", { done: completeCount, total: session.steps.length })}</strong><progress aria-label={t("Session progress")} max={100} value={progressPercent} />{session.skippedStepIds.length > 0 && <small>{t("{count} skipped", { count: session.skippedStepIds.length })}</small>}</div>
      {!done && <button className="button-secondary" type="button" onClick={toggleTimer}>{session.runStartedAt === null ? t("Start timer") : t("Pause timer")}</button>}
      {done && <Link className="button-secondary" href="/">{t("Return Home")}</Link>}
    </section>

    <ol className="daily-session-steps" aria-label={t("Practice steps")}>
      {session.steps.map((step, index) => {
        const complete = session.completedStepIds.includes(step.id);
        const skipped = session.skippedStepIds.includes(step.id);
        const current = !done && pending?.id === step.id;
        return <li className={`daily-session-step${current ? " is-current" : ""}${complete ? " is-complete" : ""}${skipped ? " is-skipped" : ""}`} key={step.id} aria-current={current ? "step" : undefined}>
          <div className="daily-session-step-heading"><span className="daily-plan-number">{formatNumber(index + 1)}</span><div><span className="eyebrow">{t(step.title)} · {formatNumber(step.minutes)} {t("min")}</span><h2>{step.patternName}</h2><p>{t(step.reason)}</p></div><strong className="daily-session-step-status">{complete ? t("Complete") : skipped ? t("Skipped") : current ? t("Up next") : t("Queued")}</strong></div>
          <div className="daily-session-step-actions">
            {!complete && !skipped && <Link className="button-secondary" href={step.href} target="_blank" rel="noreferrer">{t("Open drill in a new tab")} <span aria-hidden="true">↗</span></Link>}
            {current && <><button className="button" type="button" onClick={() => closeStep("complete")}>{t("Mark step complete")}</button><button className="button-secondary" type="button" onClick={() => closeStep("skip")}>{t("Skip this step")}</button></>}
          </div>
        </li>;
      })}
    </ol>
    <p className="daily-session-note">{t("The timer runs while you practice in another tab. You can pause it or leave and resume this session later.")}</p>
  </main>;
}
