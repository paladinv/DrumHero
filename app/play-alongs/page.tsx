import Link from "next/link";
import type { Metadata } from "next";
import { PlayAlongStudio } from "@/components/PlayAlongStudio";
import { LocalizedText } from "@/components/LocalizedText";

export const metadata: Metadata = { title: "Play-alongs" };

export default function PlayAlongPage() {
  return <main id="main-content" className="page playalong-page">
    <header className="page-heading"><span className="eyebrow"><LocalizedText text="Play with a band"/></span><h1><LocalizedText text="Lock into the pocket."/></h1><p><LocalizedText text="Play with original synthesized backing loops or import a local track you own or have permission to use. Set the tempo, shape the mix, and build a repeating multi-section form with tempo changes."/></p></header>
    <p><Link className="button-secondary" href="/improvisation"><LocalizedText text="Try improvisation and trading fours" /></Link></p><PlayAlongStudio />
  </main>;
}
