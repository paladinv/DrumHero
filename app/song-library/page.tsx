import type { Metadata } from "next";
import { SongLibrary } from "@/components/SongLibrary";
export const metadata: Metadata = { title: "Song Library" };
export default function SongLibraryPage() { return <main id="main-content" className="page"><header className="page-heading"><span className="eyebrow">Your repertoire</span><h1>Make every song <span>playable.</span></h1><p>Organize songs, build drum parts, and take a section into focused practice. Your library stays on this device by default.</p></header><SongLibrary /></main>; }
