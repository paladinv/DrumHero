"use client";

import { AccessibilitySettings } from "./AccessibilitySettings";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type MouseEvent } from "react";
import { LanguagePicker, useLocalization } from "@/components/LocalizationProvider";
import { LearnerProfilePicker } from "@/components/LearnerProfilePicker";
import { QuickLauncher } from "@/components/QuickLauncher";
import { ThemeSettings } from "@/components/ThemeSettings";

const groups = [
  { title: "Learn", primary: ["/learn", "Learn"], links: [["/rudiments", "Rudiments"], ["/grooves", "Grooves"], ["/kit", "Kit Guide"]] },
  { title: "Practice", primary: ["/practice", "Practice"], links: [["/trainer", "Trainer"], ["/improvisation", "Improvisation"], ["/sight-reading", "Sight reading"], ["/ear-training", "Ear Training"], ["/play-alongs", "Play-alongs"]] },
  { title: "Songs", primary: ["/song-library", "Songs"], links: [["/song-builder", "Song Builder"]] }
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { t } = useLocalization();
  const current = (href: string) => pathname === href;
  const closeMenu = (event: MouseEvent<HTMLAnchorElement>) => {
    setOpen(false);
    event.currentTarget.closest("header")?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((details) => { details.open = false; });
  };

  return <header className="site-header">
    <Link href="/" className="brand" onClick={closeMenu}>
      <Image src="/drum-hero-logo.svg" alt="" width={46} height={46} priority />
      <span><strong>Drum <em>Hero</em></strong><small>Practice Studio</small></span>
    </Link>
    <QuickLauncher />
    <button className="menu-button" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen((value) => !value)}><span aria-hidden="true">☰</span> {t("Menu")}</button>
    <nav id="primary-navigation" className={open ? "site-nav open" : "site-nav"} aria-label={t("Primary navigation")}>
      <Link className="site-nav-link" href="/" aria-current={current("/") ? "page" : undefined} onClick={closeMenu}>{t("Home")}</Link>
      {groups.map((group) => {
        const active = current(group.primary[0]) || group.links.some(([href]) => current(href));
        return <div className={`site-nav-entry${active ? " current" : ""}`} key={group.title}>
          <Link className="site-nav-link" href={group.primary[0]} aria-current={active ? "page" : undefined} onClick={closeMenu}>{t(group.primary[1])}</Link>
          <details className={`site-nav-group${active ? " current" : ""}`}>
            <summary aria-label={`${t("More")} ${t(group.title)} pages`}><span aria-hidden="true">⌄</span></summary>
            <div className="site-nav-submenu">
              {group.links.map(([href, label]) => <Link key={href} href={href} aria-current={current(href) ? "page" : undefined} onClick={closeMenu}>{t(label)}</Link>)}
            </div>
          </details>
        </div>;
      })}
      <Link className="site-nav-link" href="/progress" aria-current={current("/progress") ? "page" : undefined} onClick={closeMenu}>{t("Progress")}</Link>
      <details className="site-settings site-nav-group">
        <summary>{t("Settings")}</summary>
        <div className="site-nav-submenu site-settings-panel">
          <LearnerProfilePicker />
          <ThemeSettings />
          <AccessibilitySettings />
          <LanguagePicker compact />
        </div>
      </details>
    </nav>
  </header>;
}
