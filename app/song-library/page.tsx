import type { Metadata } from "next";
import Link from "next/link";
import { SongLibrary } from "@/components/SongLibrary";
import { LocalizedText } from "@/components/LocalizedText";
import { translateRequest } from "@/lib/request-locale";
export async function generateMetadata(): Promise<Metadata> { return { title: await translateRequest("Song Library") }; }
export default async function SongLibraryPage({ searchParams }: { searchParams: Promise<{ song?: string | string[]; q?: string | string[] }> }) { const params = await searchParams; const songId = Array.isArray(params.song) ? params.song[0] : params.song; const query = Array.isArray(params.q) ? params.q[0] : params.q; return <main id="main-content" className="page song-library-page"><header className="page-heading"><span className="eyebrow"><LocalizedText text="Your repertoire"/></span><h1><LocalizedText text="Your Song Library"/></h1><p><LocalizedText text="Organize songs, build drum parts, and take a section into focused practice. Your library stays on this device by default."/></p><Link className="button-secondary" href="/song-builder"><LocalizedText text="Create or edit in Song Builder"/></Link></header><SongLibrary initialSongId={songId} initialQuery={query}/></main>; }
