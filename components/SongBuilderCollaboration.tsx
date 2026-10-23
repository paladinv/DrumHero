"use client";

import { useEffect, useRef, useState } from "react";
import { getSongCloudClient, readSongCloudCheckpoint } from "@/lib/song-cloud";
import { normalizeSong, type DrumPart, type DrumSong, type SongSection } from "@/lib/song-library";
import type { SongInstrument } from "@/lib/types";

type Collaborator = { userId: string; name: string; sectionId: string; partId: string; instrument?: SongInstrument; step?: number; updatedAt: number };
type Cursor = { sectionId: string; partId: string; instrument?: SongInstrument; step?: number };
type Channel = NonNullable<ReturnType<NonNullable<ReturnType<typeof getSongCloudClient>>["channel"]>>;

function mergePartEdits(base:DrumPart,local:DrumPart,remote:DrumPart):DrumPart{
  const key=(hit:DrumPart["hits"][number])=>`${hit.instrument}:${hit.step}`;
  const before=new Map(base.hits.map(hit=>[key(hit),hit])),mine=new Map(local.hits.map(hit=>[key(hit),hit])),theirs=new Map(remote.hits.map(hit=>[key(hit),hit]));
  const hits=[...new Set([...before.keys(),...mine.keys(),...theirs.keys()])].flatMap(id=>{
    const b=before.get(id),l=mine.get(id),r=theirs.get(id);
    const localChanged=JSON.stringify(l)!==JSON.stringify(b),remoteChanged=JSON.stringify(r)!==JSON.stringify(b);
    const selected=remoteChanged?r:localChanged?l:b;
    return selected?[selected]:[];
  }).sort((a,b)=>a.step-b.step||a.instrument.localeCompare(b.instrument));
  const merged={...local,...remote,hits};
  const allKeys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
  for(const field of allKeys){if(field==="hits"||field==="id")continue;if(JSON.stringify((remote as unknown as Record<string,unknown>)[field])===JSON.stringify((base as unknown as Record<string,unknown>)[field]))(merged as unknown as Record<string,unknown>)[field]=(local as unknown as Record<string,unknown>)[field];}
  return merged;
}

function mergeSectionEdits(base:SongSection,local:SongSection,remote:SongSection):SongSection{
  const before=new Map(base.parts.map(part=>[part.id,part])),mine=new Map(local.parts.map(part=>[part.id,part])),theirs=new Map(remote.parts.map(part=>[part.id,part]));
  const parts=remote.parts.flatMap(part=>{const b=before.get(part.id),l=mine.get(part.id);if(b&&!l&&JSON.stringify(part)===JSON.stringify(b))return [];return b&&l?[mergePartEdits(b,l,part)]:[part];});
  for(const part of local.parts)if(!before.has(part.id)&&!theirs.has(part.id))parts.push(part);
  const merged={...local,...remote,parts};
  const allKeys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
  for(const field of allKeys){if(field==="parts"||field==="id")continue;if(JSON.stringify((remote as unknown as Record<string,unknown>)[field])===JSON.stringify((base as unknown as Record<string,unknown>)[field]))(merged as unknown as Record<string,unknown>)[field]=(local as unknown as Record<string,unknown>)[field];}
  return merged;
}

function mergeSongEdits(base:DrumSong,local:DrumSong,remote:DrumSong):DrumSong{
  const before=new Map(base.sections.map(section=>[section.id,section])),mine=new Map(local.sections.map(section=>[section.id,section])),theirs=new Map(remote.sections.map(section=>[section.id,section]));
  const mergedById=new Map(remote.sections.flatMap(section=>{const b=before.get(section.id),l=mine.get(section.id);if(b&&!l&&JSON.stringify(section)===JSON.stringify(b))return [];return [[section.id,b&&l?mergeSectionEdits(b,l,section):section] as const];}));
  for(const section of local.sections)if(!before.has(section.id)&&!theirs.has(section.id))mergedById.set(section.id,section);
  const sections=[...remote.sections.map(section=>mergedById.get(section.id)!),...local.sections.filter(section=>!theirs.has(section.id)&&!before.has(section.id)).map(section=>mergedById.get(section.id)!)];
  const merged={...local,...remote,sections};
  const allKeys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]);
  for(const field of allKeys){if(field==="sections"||field==="id"||field==="updatedAt")continue;if(JSON.stringify((remote as unknown as Record<string,unknown>)[field])===JSON.stringify((base as unknown as Record<string,unknown>)[field]))(merged as unknown as Record<string,unknown>)[field]=(local as unknown as Record<string,unknown>)[field];}
  return merged;
}

const stableSong=(song:DrumSong)=>JSON.stringify({...song,updatedAt:""});

export function SongBuilderCollaboration({ song, sectionId, partId, cursor, onRemoteSong }: {
  song: DrumSong;
  sectionId: string;
  partId: string;
  cursor: { instrument: SongInstrument; step: number } | null;
  onRemoteSong: (song: DrumSong) => void;
}) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [status, setStatus] = useState("Sign in and review a shared cloud library to show live section activity.");
  const [revision, setRevision] = useState(0);
  const channelRef=useRef<Channel|null>(null);
  const accountRef=useRef("");
  const canPublishRef=useRef(false);
  const nameRef=useRef("Drummer");
  const cursorRef=useRef<Cursor>({sectionId,partId});
  const onRemoteRef=useRef(onRemoteSong);
  const lastSongRef=useRef(song);
  const lastBroadcastSongRef=useRef(song);
  const ignoreVersionRef=useRef("");
  cursorRef.current={sectionId,partId,...(cursor??{})};
  onRemoteRef.current=onRemoteSong;

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("drum-hero:song-cloud-checkpoint-change", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("drum-hero:song-cloud-checkpoint-change", refresh); window.removeEventListener("storage", refresh); };
  }, []);

  useEffect(() => {
    let active = true;
    let channel: Channel | undefined;
    const connect = async () => {
      const client = getSongCloudClient();
      const checkpoint = readSongCloudCheckpoint();
      if (!client || !checkpoint) { setCollaborators([]); setStatus("Sign in and review a shared cloud library to show live section activity."); return; }
      const { data: sessionData } = await client.auth.getSession();
      const user = sessionData.session?.user;
      if (!user || user.id !== checkpoint.accountId) { setCollaborators([]); setStatus("Review the cloud library in Song Builder to resume live section activity."); return; }
      const { data: role, error } = await client.rpc("drum_library_role", { p_library_id: checkpoint.libraryId });
      if (error || !role) { setCollaborators([]); setStatus("This account no longer has access to the connected library."); return; }
      if (!active) return;
      accountRef.current=user.id;
      nameRef.current=String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Drummer").slice(0,48);
      const canEdit=role==="owner"||role==="editor";
      canPublishRef.current=canEdit;
      const presenceKey = `${user.id}:${crypto.randomUUID().slice(0,8)}`;
      channel = client.channel(`drum-library:${checkpoint.libraryId}`, { config: { private: true, presence: { key: presenceKey }, broadcast: { ack: true, self: false } } });
      channelRef.current=channel;
      channel.on("presence", { event: "sync" }, () => {
        if (!active || !channel) return;
        const presence = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
        const peers = Object.values(presence).flat().filter(item => item.userId !== accountRef.current && item.songId === song.id && typeof item.userId === "string").map(item => ({ userId: String(item.userId), name: String(item.name ?? "Drummer").slice(0,48), sectionId: typeof item.sectionId === "string" ? item.sectionId : "", partId: typeof item.partId === "string" ? item.partId : "", instrument: typeof item.instrument === "string" ? item.instrument as SongInstrument : undefined, step: Number.isInteger(item.step) ? Number(item.step) : undefined, updatedAt: Number(item.updatedAt) || Date.now() }));
        setCollaborators([...new Map(peers.map(peer => [peer.userId,peer])).values()]);
        setStatus(peers.length ? "Live edits and cursors are connected." : canEdit ? "Live editing is ready. Your section and selected note are shared with library editors." : "Live presence is connected. This library role is read-only.");
      });
      channel.on("broadcast", { event: "song-edit" }, message => {
        if (!active || message.payload?.songId!==song.id || message.payload?.senderId===accountRef.current) return;
        const base=lastBroadcastSongRef.current,local=lastSongRef.current;
        let remoteCandidate:unknown=message.payload?.song;
        if(message.payload?.kind==='section'&&typeof message.payload.sectionId==='string'&&message.payload.section){
          const replacement=message.payload.section as SongSection;
          remoteCandidate={...base,sections:base.sections.some(section=>section.id===message.payload.sectionId)?base.sections.map(section=>section.id===message.payload.sectionId?replacement:section):[...base.sections,replacement],updatedAt:message.payload.updatedAt};
        }else if(message.payload?.kind==='section-delete'&&typeof message.payload.sectionId==='string'){
          remoteCandidate={...base,sections:base.sections.filter(section=>section.id!==message.payload.sectionId),updatedAt:message.payload.updatedAt};
        }
        const remote=normalizeSong(remoteCandidate);
        if (!remote || remote.id!==song.id || typeof remote.updatedAt!=="string") return;
        const incoming=normalizeSong(mergeSongEdits(base,local,remote));
        if(!incoming)return;
        lastBroadcastSongRef.current=remote;
        lastSongRef.current=local;
        if(stableSong(incoming)===stableSong(remote))ignoreVersionRef.current=incoming.updatedAt;
        else ignoreVersionRef.current="";
        onRemoteRef.current(incoming);
        setStatus(`Updated live from ${String(message.payload?.name??"a collaborator").slice(0,48)}.`);
      });
      channel.subscribe(async state => {
        if (state !== "SUBSCRIBED" || !active || !channel) return;
        const current=cursorRef.current;
        const result = await channel.track({ userId: user.id, name: nameRef.current, songId: song.id, ...current, updatedAt: Date.now() });
        if (!active) return;
        setStatus(result === "ok" ? canEdit ? "Live editing is ready. Your section and selected note are shared with library editors." : "Live presence is connected. This library role is read-only." : "Could not publish your cursor. Check the Song Builder Realtime migrations.");
      });
    };
    void connect().catch(() => { if (active) setStatus("Live collaboration is unavailable. Apply the Song Builder Realtime migrations and check your connection."); });
    return () => { active = false; channelRef.current=null; if (channel) void channel.untrack().catch(() => undefined).finally(() => getSongCloudClient()?.removeChannel(channel!)); };
  }, [song.id, revision]);

  useEffect(()=>{
    const channel=channelRef.current;
    if(!channel)return;
    void channel.track({userId:accountRef.current,name:nameRef.current,songId:song.id,...cursorRef.current,updatedAt:Date.now()}).catch(()=>undefined);
  },[sectionId,partId,cursor?.instrument,cursor?.step,song.id]);

  useEffect(()=>{
    const previous=lastSongRef.current;
    lastSongRef.current=song;
    const songContent=JSON.stringify({...song,updatedAt:""});
    if(previous.id!==song.id){lastBroadcastSongRef.current=song;ignoreVersionRef.current="";return;}
    if(ignoreVersionRef.current===song.updatedAt){ignoreVersionRef.current="";lastBroadcastSongRef.current=song;return;}
    if(JSON.stringify({...previous,updatedAt:""})===songContent)return;
    if(!canPublishRef.current)return;
    const channel=channelRef.current;
    if(!channel)return;
    const timer=window.setTimeout(()=>{
      const prior=lastBroadcastSongRef.current;
      if(prior.id!==song.id)return;
      const priorSections=new Map(prior.sections.map(section=>[section.id,section]));
      const nextSections=new Map(song.sections.map(section=>[section.id,section]));
      const changedSectionIds=[...new Set([...priorSections.keys(),...nextSections.keys()])].filter(id=>JSON.stringify(priorSections.get(id))!==JSON.stringify(nextSections.get(id)));
      const previousHeader={...prior,sections:[],updatedAt:""},nextHeader={...song,sections:[],updatedAt:""};
      const oneSectionOnly=JSON.stringify(previousHeader)===JSON.stringify(nextHeader)&&changedSectionIds.length===1;
      const sectionId=oneSectionOnly?changedSectionIds[0]:undefined;
      const kind=sectionId?nextSections.has(sectionId)?"section":"section-delete":"song";
      const payload={songId:song.id,senderId:accountRef.current,name:nameRef.current,kind,updatedAt:song.updatedAt,...(kind==="section"&&sectionId?{sectionId,section:nextSections.get(sectionId)}:kind==="section-delete"?{sectionId}:kind==="song"?{song}: {})};
      const raw=JSON.stringify(payload);
      if(raw.length>180_000){setStatus("Live update skipped because this song is too large to send in real time. Save it through cloud sync instead.");return;}
      lastBroadcastSongRef.current=song;
      void channel.send({type:"broadcast",event:"song-edit",payload}).then(result=>{
        if(result!=="ok")setStatus("Could not send a live edit. Check the Realtime broadcast migration.");
      }).catch(()=>setStatus("Could not send a live edit. Check your connection."));
    },180);
    return()=>window.clearTimeout(timer);
  },[song]);

  return <section className="song-builder-collaboration" aria-label="Song Builder collaboration"><h3>Live editing</h3><p>{status}</p>{collaborators.length>0&&<ul>{collaborators.map(person=>{const section=song.sections.find(item=>item.id===person.sectionId);const part=section?.parts.find(item=>item.id===person.partId);return <li key={person.userId}><strong>{person.name}</strong><span>In {section?.name??"another section"}{part?` · ${part.name}`:""}{person.instrument&&Number.isInteger(person.step)?` · ${person.instrument} step ${person.step!+1}`:""}</span></li>;})}</ul>}<small>Members of this reviewed cloud library see section presence. Owners and editors receive note edits in real time; viewers remain read-only. Cursor and edits are temporary until the song is saved to the shared library.</small></section>;
}
