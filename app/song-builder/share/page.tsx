import type { Metadata } from "next";
import { SongBuilderSharePlayer } from "@/components/SongBuilderSharePlayer";

export const metadata: Metadata = { title: "Song Builder Playback · Drum Hero", robots: { index: false, follow: false } };

export default function SongBuilderSharePage() {
  return <SongBuilderSharePlayer />;
}
