"use client";
import { useState } from "react";
import type { DrumSong, Setlist, SongLibraryState } from "@/lib/song-library";
import { setlistHtml } from "@/lib/song-setlist-html";

export function SongSetlistShare({ plan, songs, state }: { plan: Setlist; songs: DrumSong[]; state: SongLibraryState }) {
  const [message, setMessage] = useState("");
  const exportView = () => {
    try {
      const blob = new Blob([setlistHtml(plan, songs, state)], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `${plan.name.replace(/[^a-z0-9]+/gi, "-") || "drum-setlist"}-rehearsal-pack.html`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Read-only rehearsal pack exported with song parts, kit setup, transitions, stage cues, rehearsal roles, and saved checklists. It contains no recording audio or account data.");
    } catch { setMessage("Could not export this setlist view."); }
  };
  return <div className="song-setlist-share"><p>Make a standalone rehearsal pack for bandmates who do not need a Drum Hero account. It includes arrangement details, kit setup, stage cues, saved checklists, and assigned setlist roles.</p><button type="button" onClick={exportView}>Export rehearsal pack</button><p role="status">{message}</p></div>;
}
