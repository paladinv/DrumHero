"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  ["/", "Home"], ["/learn", "Learn"], ["/trainer", "Trainer"], ["/practice", "Practice"], ["/rudiments", "Rudiments"],
  ["/grooves", "Grooves"], ["/song-library", "Song Library"], ["/kit", "Kit Guide"], ["/progress", "Progress"], ["/about", "About"]
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <Link href="/" className="brand" onClick={() => setOpen(false)}>
      <Image src="/drum-hero-logo.svg" alt="" width={58} height={58} priority />
      <span><strong>Drum <em>Hero</em></strong><small>Practice Studio</small></span>
    </Link>
    <button className="menu-button" aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen((value) => !value)}><span aria-hidden="true">☰</span> Menu</button>
    <nav id="primary-navigation" className={open ? "site-nav open" : "site-nav"} aria-label="Primary navigation">
      {links.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>)}
    </nav>
  </header>;
}
