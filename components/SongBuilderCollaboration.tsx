"use client";

import { useEffect, useState } from "react";
import { getSongCloudClient, readSongCloudCheckpoint } from "@/lib/song-cloud";
import type { SongSection } from "@/lib/song-library";

type Collaborator = { userId: string; name: string; sectionId: string; updatedAt: number };

export function SongBuilderCollaboration({ songId, sectionId, sections }: { songId: string; sectionId: string; sections: SongSection[] }) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [status, setStatus] = useState("Sign in and review a shared cloud library to show live section activity.");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("drum-hero:song-cloud-checkpoint-change", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("drum-hero:song-cloud-checkpoint-change", refresh); window.removeEventListener("storage", refresh); };
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<NonNullable<ReturnType<typeof getSongCloudClient>>["channel"]> | undefined;
    let accountId = "";
    const connect = async () => {
      const client = getSongCloudClient();
      const checkpoint = readSongCloudCheckpoint();
      if (!client || !checkpoint) { setCollaborators([]); setStatus("Sign in and review a shared cloud library to show live section activity."); return; }
      const { data: sessionData } = await client.auth.getSession();
      const user = sessionData.session?.user;
      if (!user || user.id !== checkpoint.accountId) { setCollaborators([]); setStatus("Review the cloud library in Song Builder to resume live section activity."); return; }
      accountId = user.id;
      const { data: role, error } = await client.rpc("drum_library_role", { p_library_id: checkpoint.libraryId });
      if (error || !role) { setCollaborators([]); setStatus("This account no longer has access to the connected library."); return; }
      if (!active) return;
      const displayName = String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Drummer").slice(0, 48);
      const presenceKey = `${user.id}:${Math.random().toString(36).slice(2, 10)}`;
      channel = client.channel(`drum-library:${checkpoint.libraryId}`, { config: { private: true, presence: { key: presenceKey } } });
      channel.on("presence", { event: "sync" }, () => {
        if (!active || !channel) return;
        const presence = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
        const peers = Object.values(presence).flat().filter(item => item.userId !== accountId && item.songId === songId && typeof item.userId === "string").map(item => ({ userId: String(item.userId), name: String(item.name ?? "Drummer").slice(0,48), sectionId: typeof item.sectionId === "string" ? item.sectionId : "", updatedAt: Number(item.updatedAt) || Date.now() }));
        setCollaborators([...new Map(peers.map(peer => [peer.userId,peer])).values()]);
        setStatus(peers.length ? "Live presence is connected." : "No other library members are in this song right now.");
      });
      channel.subscribe(async state => {
        if (state !== "SUBSCRIBED" || !active || !channel) return;
        const trackResult = await channel.track({ userId: user.id, name: displayName, songId, sectionId, updatedAt: Date.now() });
        if (!active) return;
        setStatus(trackResult === "ok" ? "Live presence is connected." : "Could not publish your current section. Check the Realtime policy migration.");
      });
    };
    void connect().catch(() => { if (active) setStatus("Live presence is unavailable. Apply the Song Builder Realtime migration and check your connection."); });
    return () => { active = false; if (channel) void channel.untrack().catch(() => undefined).finally(() => getSongCloudClient()?.removeChannel(channel!)); };
  }, [songId, sectionId, revision]);

  return <section className="song-builder-collaboration" aria-label="Song Builder collaboration"><h3>Live section activity</h3><p>{status}</p>{collaborators.length>0&&<ul>{collaborators.map(person=><li key={person.userId}><strong>{person.name}</strong><span>In {sections.find(section=>section.id===person.sectionId)?.name??"another section"}</span></li>)}</ul>}<small>Activity appears for members of the same reviewed cloud library. Presence is temporary and does not reserve a section.</small></section>;
}
