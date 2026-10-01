import type { Metadata } from "next";
import Link from "next/link";
import { SongBuilder } from "@/components/SongBuilder";

export const metadata: Metadata = { title: "Song Builder" };

export default async function SongBuilderPage({ searchParams }: { searchParams: Promise<{ song?: string }> }) {
  const params = await searchParams;
  return <main id="main-content" className="page song-builder-page">
    <header className="page-heading">
      <span className="eyebrow">Your music, your way</span>
      <h1>Build a song <span>from the kit up.</span></h1>
      <p>Arrange grooves and fills, edit every drum hit, then hear the whole song or follow the moving notes. Your songs stay in this browser and appear in the Song Library.</p>
      <Link className="button-secondary song-builder-library-link" href="/song-library">Open Song Library</Link>
    </header>
    <SongBuilder initialSongId={params.song ?? ""} />
  </main>;
}
