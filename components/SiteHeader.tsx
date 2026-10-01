"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const groups = [
  { title: "Practice", links: [["/practice", "Practice Pad"], ["/trainer", "Trainer"]] },
  { title: "Explore", links: [["/rudiments", "Rudiments"], ["/grooves", "Grooves"], ["/kit", "Kit Guide"]] },
  { title: "Songs", links: [["/song-library", "Song Library"], ["/song-builder", "Song Builder"]] }
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = (href: string) => pathname === href;
  return <header className="site-header">
    <Link href="/" className="brand" onClick={() => setOpen(false)}>
      <Image src="/drum-hero-logo.svg" alt="" width={58} height={58} priority />
      <span><strong>Drum <em>Hero</em></strong><small>Practice Studio</small></span>
    </Link>
    <button className="menu-button" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen((value) => !value)}><span aria-hidden="true">☰</span> Menu</button>
    <nav id="primary-navigation" className={open ? "site-nav open" : "site-nav"} aria-label="Primary navigation">
      <Link href="/" aria-current={current("/") ? "page" : undefined} onClick={() => setOpen(false)}>Home</Link>
      <Link href="/learn" aria-current={current("/learn") ? "page" : undefined} onClick={() => setOpen(false)}>Learn</Link>
      {groups.map((group) => {
        const active = group.links.some(([href]) => current(href));
        return <details className={`site-nav-group${active ? " current" : ""}`} key={group.title}>
          <summary aria-label={active ? `${group.title}, current section` : group.title}>{group.title}</summary>
          <div className="site-nav-submenu">{group.links.map(([href, label]) => <Link key={href} href={href} aria-current={current(href) ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>)}</div>
        </details>;
      })}
      <Link href="/progress" aria-current={current("/progress") ? "page" : undefined} onClick={() => setOpen(false)}>Progress</Link>
      <Link href="/about" aria-current={current("/about") ? "page" : undefined} onClick={() => setOpen(false)}>About</Link>
    </nav>
  </header>;
}
