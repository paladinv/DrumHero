import type { Metadata } from "next";
import Link from "next/link";
import { SongBuilder } from "@/components/SongBuilder";
import { LocalizedText } from "@/components/LocalizedText";
import { translateRequest } from "@/lib/request-locale";

export async function generateMetadata(): Promise<Metadata> { return { title: await translateRequest("Song Builder") }; }

export default async function SongBuilderPage({ searchParams }: { searchParams: Promise<{ song?: string }> }) {
  const params = await searchParams;
  return <main id="main-content" className="page song-builder-page">
    <header className="page-heading">
      <span className="eyebrow"><LocalizedText text="Your music, your way"/></span>
      <h1><LocalizedText text="Write the part you hear."/></h1>
      <p><LocalizedText text="Arrange grooves and fills, edit every drum hit, then hear the whole song or follow the moving notes. Your songs stay local by default and can sync when you opt in."/></p>
      <Link className="button-secondary song-builder-library-link" href="/song-library"><LocalizedText text="Open Song Library"/></Link>
    </header>
    <SongBuilder initialSongId={params.song ?? ""} />
  </main>;
}
