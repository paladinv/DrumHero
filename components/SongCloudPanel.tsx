"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { cloudLibraryState, cloudSongConflicts, getSongCloudClient, librarySyncSignature, readCloudLibrary, songCloudConfigured, SONG_CLOUD_SYNC_KEY, type CloudLibrary } from "@/lib/song-cloud";
import { emptySongLibrary, mergeSongLibraries, normalizeSong, songPartEvidenceFingerprint, type ArrangementSaveOptions, type DrumSong, type SongLibraryState } from "@/lib/song-library";
import { compareSongDrumArrangements, type ArrangementDiffLine } from "@/lib/song-library-tools";
import { collectionSongIds } from "@/lib/song-library-next";
import { SONG_INSTRUMENTS, type SongInstrument } from "@/lib/types";
const SYNC_KEY = SONG_CLOUD_SYNC_KEY;
type Checkpoint = { accountId: string; libraryId: string; revision: number; signature: string };
type Member = { user_id: string; email: string; role: "viewer" | "editor" };
type SharedSongComment = { id: string; library_id: string; song_id: string; section_id?: string | null; part_id?: string | null; bar?: number | null; body: string; author_id: string; author_label: string; arrangement_revision: number; created_at: string; parent_id?: string | null; resolved_at?: string | null; resolved_by?: string | null };
type SharedArrangementProposal = { version: 1; action: "add" | "remove"; instrument: SongInstrument; step: number; accent: boolean; baseFingerprint: string };
const ARRANGEMENT_PROPOSAL_PREFIX = "DRUM_ARRANGEMENT_PROPOSAL_V1:";
function parseArrangementProposal(body: string): { proposal: SharedArrangementProposal; rationale: string } | null {
  if (!body.startsWith(ARRANGEMENT_PROPOSAL_PREFIX)) return null;
  const [serialized, ...rationale] = body.slice(ARRANGEMENT_PROPOSAL_PREFIX.length).split("\n");
  try {
    const value = JSON.parse(serialized) as Partial<SharedArrangementProposal>;
    if (value.version !== 1 || !["add", "remove"].includes(String(value.action)) || !SONG_INSTRUMENTS.includes(value.instrument as SongInstrument) || !Number.isInteger(value.step) || Number(value.step) < 0 || Number(value.step) >= 8192 || typeof value.baseFingerprint !== "string" || value.baseFingerprint.length > 100 || typeof value.accent !== "boolean") return null;
    return { proposal: value as SharedArrangementProposal, rationale: rationale.join("\n").trim() };
  } catch { return null; }
}
type RecordConflict = { kind: "collection" | "queue" | "setlist" | "learning path" | "custom groove"; id: string; name: string; local: Record<string, unknown>; cloud: Record<string, unknown> };
const sharedArrangementSummary = (song: DrumSong) => `${song.bpm} BPM · ${song.meter} · ${song.sections.length} sections · ${song.sections.reduce((sum, section) => sum + section.parts.length, 0)} parts · ${song.sections.reduce((sum, section) => sum + section.parts.reduce((partSum, part) => partSum + part.hits.length, 0), 0)} hits`;
function libraryRecordConflicts(local: SongLibraryState, remote: SongLibraryState): RecordConflict[] {
  const groups: Array<{ kind: RecordConflict["kind"]; local: Array<{ id: string; name?: string; title?: string }>; cloud: Array<{ id: string; name?: string; title?: string }> }> = [
    { kind: "collection", local: local.collections, cloud: remote.collections },
    { kind: "queue", local: local.queues, cloud: remote.queues },
    { kind: "setlist", local: local.setlists, cloud: remote.setlists },
    { kind: "learning path", local: local.learningPaths ?? [], cloud: remote.learningPaths ?? [] },
    { kind: "custom groove", local: local.customGrooves ?? [], cloud: remote.customGrooves ?? [] }
  ];
  return groups.flatMap(group => group.local.flatMap(item => {
    const cloud = group.cloud.find(candidate => candidate.id === item.id);
    return cloud && JSON.stringify(item) !== JSON.stringify(cloud) ? [{ kind: group.kind, id: item.id, name: item.name ?? item.title ?? item.id, local: item as Record<string, unknown>, cloud: cloud as Record<string, unknown> }] : [];
  }));
}
function resolveRecord<T extends { id: string; name?: string; title?: string }>(records: T[], conflict: RecordConflict, choice: string): T[] {
  const rest = records.filter(item => item.id !== conflict.id);
  const local = conflict.local as T, cloud = conflict.cloud as T;
  if (choice === "device") return [...rest, local];
  if (choice === "cloud") return [...rest, cloud];
  const copy = { ...cloud, id: conflict.kind === "custom groove" ? `custom-${crypto.randomUUID()}` : crypto.randomUUID(), ...(cloud.name ? { name: conflict.kind === "custom groove" ? `${cloud.name.slice(0, 46)} (cloud copy)` : `${cloud.name} (cloud copy)` } : {}), ...(cloud.title ? { title: `${cloud.title} (cloud copy)` } : {}) } as T;
  return [...rest, local, copy];
}
export function SongCloudPanel({ state, apply }: { state: SongLibraryState; apply: (state: SongLibraryState, options?: ArrangementSaveOptions) => void }) {
  const [lastSync,setLastSync]=useState("");
  const [deviceName,setDeviceName]=useState("This device");
  const [history,setHistory]=useState<Array<{revision:number;created_at:string;device_name?:string;actor_id?:string}>>([]);
  const [historyMessage,setHistoryMessage]=useState("");
  const [restoreBaseSignature,setRestoreBaseSignature]=useState<string|undefined>();
  const [remoteSavedAt,setRemoteSavedAt]=useState("");
  const [remoteDevice,setRemoteDevice]=useState("");
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("My drum library");
  const [libraries, setLibraries] = useState<Array<Pick<CloudLibrary, "id" | "name" | "owner_id" | "share_scope">>>([]);
  const [sharedLibraries, setSharedLibraries] = useState<Array<Pick<CloudLibrary, "id" | "name" | "owner_id" | "share_scope">>>([]);
  const [selectedShareId, setSelectedShareId] = useState("");
  const [selectedShare, setSelectedShare] = useState<CloudLibrary | null>(null);
  const [shareDraftSongIds, setShareDraftSongIds] = useState<string[]>([]);
  const [selectedShareSongIds, setSelectedShareSongIds] = useState<string[]>([]);
  const [selectedShareUpdateIds, setSelectedShareUpdateIds] = useState<string[]>([]);
  const [shareCollectionId, setShareCollectionId] = useState("");
  const [shareName, setShareName] = useState("");
  const [shareInviteEmail, setShareInviteEmail] = useState("");
  const [shareMembers, setShareMembers] = useState<Member[]>([]);
  const [shareComments, setShareComments] = useState<SharedSongComment[]>([]);
  const [shareRole, setShareRole] = useState<string>("");
  const [commentReplies, setCommentReplies] = useState<Record<string,string>>({});
  const [commentText, setCommentText] = useState("");
  const [commentLabel, setCommentLabel] = useState("");
  const [commentSongId, setCommentSongId] = useState("");
  const [commentSectionId, setCommentSectionId] = useState("");
  const [commentPartId, setCommentPartId] = useState("");
  const [commentBar, setCommentBar] = useState("");
  const [commentKind, setCommentKind] = useState<"note" | "suggestion">("note");
  const [suggestionAction, setSuggestionAction] = useState<"add" | "remove">("add");
  const [suggestionVoice, setSuggestionVoice] = useState<SongInstrument>("snare");
  const [suggestionStep, setSuggestionStep] = useState(1);
  const [suggestionAccent, setSuggestionAccent] = useState(false);
  const [commentMessage, setCommentMessage] = useState("");
  const activeCommentSongId = selectedShare?.state.songs.some(song => song.id === commentSongId) ? commentSongId : selectedShare?.state.songs[0]?.id ?? "";
  const activeCommentSong = selectedShare?.state.songs.find(song => song.id === activeCommentSongId);
  const activeCommentSectionId = activeCommentSong?.sections.some(section => section.id === commentSectionId) ? commentSectionId : "";
  const activeCommentPartId = activeCommentSong?.sections.find(section => section.id === activeCommentSectionId)?.parts.some(part => part.id === commentPartId) ? commentPartId : "";
  const activeCommentSection = activeCommentSong?.sections.find(section => section.id === activeCommentSectionId);
  const activeCommentPart = activeCommentSection?.parts.find(part => part.id === activeCommentPartId);
  const suggestionGridSteps = activeCommentPart ? Math.max(1, Math.min(8192, Math.round(activeCommentPart.beats * activeCommentPart.subdivision / 4))) : 1;
  const [libraryId, setLibraryId] = useState("");
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [role, setRole] = useState<string>("");
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [remote, setRemote] = useState<CloudLibrary | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [sectionChoices, setSectionChoices] = useState<Record<string, string>>({});
  const [fieldChoices, setFieldChoices] = useState<Record<string, string>>({});
  const [recordChoices, setRecordChoices] = useState<Record<string, string>>({});
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualSync, setManualSync] = useState(false);
  const [retry, setRetry] = useState(0);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"viewer" | "editor">("viewer");
  const [members, setMembers] = useState<Member[]>([]);
  const saving = useRef(false);
  const activeAccount = useRef("");
  const generation = useRef(0);
  const cloudState = useMemo(() => cloudLibraryState(state), [state]);
  const signature = librarySyncSignature(cloudState);
  const conflicts = remote ? cloudSongConflicts(cloudState, remote.state) : [];
  const recordConflicts = remote ? libraryRecordConflicts(cloudState, remote.state) : [];
  const shareUpdateCandidates: Array<{ sourceId: string; local: DrumSong; shared: DrumSong | null; changes: string[]; arrangementChanges: ArrangementDiffLine[] }> = selectedShare ? state.songs.flatMap((local): Array<{ sourceId: string; local: DrumSong; shared: DrumSong | null; changes: string[]; arrangementChanges: ArrangementDiffLine[] }> => {
    const origin = local.sharedOrigin;
    if (!origin || origin.shareId !== selectedShare.id) return [];
    const shared = selectedShare.state.songs.find(song => song.id === origin.sourceSongId);
    if (!shared) return [{ sourceId: origin.sourceSongId, local, shared: null, changes: ["This song is no longer in the latest snapshot; the downloaded copy remains local."], arrangementChanges: [] as ArrangementDiffLine[] }];
    const localTitle = local.title.replace(/ \(shared copy\)$/, "");
    const changes = ["title", "artist", "difficulty", "bpm", "meter", "tags"].filter(field => JSON.stringify(field === "title" ? localTitle : local[field as keyof DrumSong]) !== JSON.stringify(shared[field as keyof DrumSong]));
    const localPublicSections = local.sections.map(section => ({ ...section, notes: "", parts: section.parts.map(part => ({ ...part, notes: "" })) }));
    const arrangementChanges = compareSongDrumArrangements(local, shared, 40);
    if (JSON.stringify(localPublicSections) !== JSON.stringify(shared.sections)) changes.push("drum arrangement or section details");
    const localKit = local.kitSetup ? { ...local.kitSetup, notes: "" } : undefined;
    if (JSON.stringify(localKit) !== JSON.stringify(shared.kitSetup)) changes.push("kit setup");
    if (JSON.stringify({ ...local.source, authorization: undefined }) !== JSON.stringify({ ...shared.source, authorization: undefined })) changes.push("source and attribution");
    return changes.length ? [{ sourceId: shared.id, local, shared, changes, arrangementChanges }] : [];
  }) : [];
  const changedSections = (conflict: (typeof conflicts)[number]) => {
    const localSections = new Map(conflict.local.sections.map(section => [section.id, section]));
    const remoteSections = new Map(conflict.remote.sections.map(section => [section.id, section]));
    return [...new Set([...localSections.keys(), ...remoteSections.keys()])].flatMap(id => {
      const local = localSections.get(id), cloud = remoteSections.get(id);
      return JSON.stringify(local) === JSON.stringify(cloud) ? [] : [{ id, local, cloud }];
    });
  };
  const sectionOrderChanged = (conflict: (typeof conflicts)[number]) => conflict.local.sections.map(section => section.id).join("|") !== conflict.remote.sections.map(section => section.id).join("|");
  const conflictFields = ["title", "artist", "difficulty", "bpm", "meter", "tags", "notes", "source", "kitSetup", "referenceTempoMap", "arrangementAutomation", "voiceLabels", "archived", "arrangementLocked"] as const;
  const unresolved = recordConflicts.some(conflict => !recordChoices[`${conflict.kind}::${conflict.id}`]) || conflicts.some(conflict => {
    const choice = choices[conflict.id];
    if (!choice) return true;
    if (choice !== "custom") return false;
    const incompleteSection = changedSections(conflict).some(section => !sectionChoices[`${conflict.id}::${section.id}`]) || sectionOrderChanged(conflict) && !sectionChoices[`${conflict.id}::order`];
    const incompleteField = conflictFields.some(field => JSON.stringify(conflict.local[field]) !== JSON.stringify(conflict.remote[field]) && !fieldChoices[`${conflict.id}::${field}`]);
    return incompleteSection || incompleteField;
  });
  const remember = useCallback((next: Checkpoint) => { setCheckpoint(next); setLastSync(new Date().toISOString()); try { localStorage.setItem(SYNC_KEY, JSON.stringify({ version: 1, ...next })); window.dispatchEvent(new Event("drum-hero:song-cloud-checkpoint-change")); } catch { setMessage("Sync succeeded, but the resume checkpoint could not be saved."); } }, []);
  const loadLibraries = useCallback(async () => { const client = getSongCloudClient(); if (!client) return []; const { data, error } = await client.from("drum_libraries").select("id,name,owner_id,share_scope").order("name"); if (error) throw error; const rows = (data ?? []) as Array<Pick<CloudLibrary, "id" | "name" | "owner_id" | "share_scope">>; setLibraries(rows.filter(row => row.share_scope !== true)); setSharedLibraries(rows.filter(row => row.share_scope === true)); return rows.filter(row => row.share_scope !== true); }, []);
  useEffect(() => {
    if (!connected) return;
    const client = getSongCloudClient(); if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => { const id = session?.user.id ?? ""; if (activeAccount.current !== id) { activeAccount.current = id; generation.current++; setRemote(null); setCheckpoint(null); setLibraryId(""); setRole(""); setSyncEnabled(false); setLibraries([]); setSharedLibraries([]); setSelectedShare(null); setSelectedShareId(""); } setUser(session?.user ?? null); });
    const offline = () => setOnline(false), online = () => { setOnline(true); setRetry((value) => value + 1); };
    const timer = window.setTimeout(() => setOnline(navigator.onLine), 0);
    const invalidate = () => { generation.current += 1; };
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    return () => { data.subscription.unsubscribe(); window.clearTimeout(timer); window.removeEventListener("offline", offline); window.removeEventListener("online", online); invalidate(); };
  }, [connected]);
  useEffect(() => { if (!user) return; let cancelled = false; const timer = window.setTimeout(() => { void loadLibraries().then(rows => { if (cancelled) return; try { const saved = JSON.parse(localStorage.getItem(SYNC_KEY) || "null"); if (saved?.version === 1 && saved.accountId === user.id && typeof saved.libraryId === "string" && rows.some(row => row.id === saved.libraryId)) { setLibraryId(saved.libraryId); setMessage("A previous library connection is available. Review it to resume sync."); } } catch { /* Ignore malformed checkpoints. */ } }).catch(() => setMessage("Cloud libraries could not be loaded. Apply the scoped sharing migration and check the project connection.")); }, 0); return () => { cancelled = true; window.clearTimeout(timer); }; }, [user, loadLibraries]);
  const reviewCloud = async (id = libraryId) => {
    const client = getSongCloudClient(); if (!client || !id || !user) return;
    const token = ++generation.current;
    setBusy(true); setSyncEnabled(false);
    try { const [{ data, error }, access] = await Promise.all([client.from("drum_libraries").select("*").eq("id", id).single(), client.rpc("drum_library_role", { p_library_id: id })]); if (error) throw error; if (access.error) throw access.error; if (token !== generation.current) return; const row = readCloudLibrary(data); if (row.share_scope) throw new Error("Selected song shares are read-only snapshots. Open them in the selected-share section below."); setRole(access.data); setRestoreBaseSignature(undefined); setRemoteSavedAt(row.updated_at); setRemoteDevice((data as {device_name?:string}).device_name??""); setRemote(row); setChoices({}); setSectionChoices({}); setFieldChoices({}); setRecordChoices({}); setMessage("Review cloud data before applying changes. Audio recordings remain on this device."); } catch (error) { if (token === generation.current) setMessage(error instanceof Error ? error.message : "Cloud library could not be read. Access may have changed."); } finally { if (token === generation.current) setBusy(false); }
  };
  useEffect(() => {
    if (!user || !syncEnabled || !checkpoint || checkpoint.libraryId !== libraryId || checkpoint.accountId !== user.id || !libraries.some(item => item.id === libraryId && item.share_scope !== true) || !["owner", "editor"].includes(role) || remote || !online || checkpoint.signature === signature && !manualSync) return;
    const timer = window.setTimeout(() => {
      if (saving.current) return;
      const client = getSongCloudClient(); if (!client) return;
      saving.current = true; setBusy(true); const token = generation.current;
      void Promise.resolve(client.rpc("save_drum_library", { p_library_id: libraryId, p_revision: checkpoint.revision, p_state: cloudState, p_device_name: deviceName.slice(0,80) })).then(async ({ data, error }) => {
        if (token !== generation.current) return;
        if (error) {
          if (error.code === "40001") { const latest = await client.from("drum_libraries").select("*").eq("id", libraryId).single(); if (latest.error) throw latest.error; setRestoreBaseSignature(undefined); setRemote(readCloudLibrary(latest.data)); setChoices({}); setSectionChoices({}); setFieldChoices({}); setRecordChoices({}); setMessage("The cloud library changed. Review conflicts before syncing again."); }
          else throw error;
        } else { const saved = readCloudLibrary(Array.isArray(data) ? data[0] : data); remember({ accountId: user.id, libraryId, revision: saved.revision, signature }); setMessage(`Synced revision ${saved.revision}.`); }
      }).catch(() => { if (token === generation.current) { setSyncEnabled(false); setMessage("Sync could not finish. Local changes are saved on this device. Review the cloud library before retrying."); } }).finally(() => { saving.current = false; if (token === generation.current) { setBusy(false); setManualSync(false); } });
    }, manualSync ? 0 : 1200);
    return () => window.clearTimeout(timer);
  }, [checkpoint, cloudState, libraries, libraryId, manualSync, online, remember, remote, retry, role, signature, syncEnabled, user, deviceName]);
  useEffect(() => { if (!user || role !== "owner" || !libraryId) return; const client = getSongCloudClient(); if (!client) return; const timer = window.setTimeout(() => { void client.from("drum_library_members").select("user_id,email,role").eq("library_id", libraryId).then(({ data, error }) => { if (!error) setMembers(data ?? []); }); }, 0); return () => window.clearTimeout(timer); }, [libraryId, role, user, retry]);
  useEffect(() => { if (!user || !selectedShare || selectedShare.owner_id !== user.id) { setShareMembers([]); return; } const client = getSongCloudClient(); if (!client) return; let cancelled = false; void client.from("drum_library_members").select("user_id,email,role").eq("library_id", selectedShare.id).then(({ data, error }) => { if (!cancelled && !error) setShareMembers(data ?? []); }); return () => { cancelled = true; }; }, [selectedShare, user, retry]);
  useEffect(() => {
    if (!user || !selectedShare) { setShareComments([]); return; }
    const client=getSongCloudClient();if(!client)return;
    setShareComments([]);
    let cancelled=false;
    void client.from("drum_library_comments").select("id,library_id,song_id,section_id,part_id,bar,body,author_id,author_label,arrangement_revision,created_at,parent_id,resolved_at,resolved_by").eq("library_id",selectedShare.id).order("created_at",{ascending:true}).limit(500).then(({data,error})=>{
      if(cancelled)return;
      if(error){setCommentMessage("Shared comments need the latest Song Library comments migration.");return;}
      setShareComments((data??[]) as SharedSongComment[]);
      setCommentMessage("");
    });
    return()=>{cancelled=true;};
  },[selectedShare?.id,selectedShare?.revision,user?.id,retry]);
  useEffect(()=>{setCommentReplies({});},[selectedShare?.id]);
  useEffect(()=>{
    if(!user||!selectedShare){setShareRole("");return;}
    const client=getSongCloudClient();if(!client)return;
    let cancelled=false;
    void client.rpc("drum_library_role",{p_library_id:selectedShare.id}).then(({data,error})=>{if(!cancelled)setShareRole(error?"":String(data??""));});
    return()=>{cancelled=true;};
  },[selectedShare?.id,user?.id,retry]);
  const authenticate = async (signup: boolean) => { const client = getSongCloudClient(); if (!client || busy) return; setBusy(true); try { const { error } = signup ? await client.auth.signUp({ email, password }) : await client.auth.signInWithPassword({ email, password }); if (error) throw error; setPassword(""); setMessage(signup ? "Account created. Confirm your email if requested, then sign in." : "Signed in. Create or review a cloud library to enable sync."); } catch (error) { setMessage(error instanceof Error ? error.message : "Account request failed."); } finally { setBusy(false); } };
  const loadHistory=async()=>{const client=getSongCloudClient();if(!client||!libraryId)return;setHistoryMessage("Loading revision history…");const {data,error}=await client.from("drum_library_revisions").select("revision,created_at,device_name,actor_id").eq("library_id",libraryId).order("revision",{ascending:false}).limit(20);if(error){setHistoryMessage("Revision history is unavailable. Apply the history migration or check your access.");return;}setHistory(data??[]);setHistoryMessage(data?.length?"Select a revision to review before recovering it.":"No earlier revisions yet.");};
  const recoverRevision=async(revision:number)=>{const client=getSongCloudClient();if(!client||!libraryId)return;setSyncEnabled(false);const token=++generation.current;setBusy(true);try{const [current,snapshot]=await Promise.all([client.from("drum_libraries").select("*").eq("id",libraryId).single(),client.from("drum_library_revisions").select("state").eq("library_id",libraryId).eq("revision",revision).single()]);if(current.error)throw current.error;if(snapshot.error)throw snapshot.error;if(token!==generation.current)return;const latest=readCloudLibrary(current.data);setRestoreBaseSignature(librarySyncSignature(latest.state));setRemote({...latest,state:readCloudLibrary({...current.data,state:snapshot.data.state}).state});setChoices({}); setSectionChoices({}); setFieldChoices({}); setRecordChoices({});setMessage(`Review recovery of revision ${revision}. Applying it creates a new revision; newer history remains available.`);}catch{setHistoryMessage("Could not read this revision. Refresh history and check your access.");}finally{if(token===generation.current)setBusy(false);}};
  const chooseRemote = (mode: "cloud" | "device" | "merge") => {
    if (!remote || !user) return;
    let next = mode === "cloud" ? remote.state : cloudState;
    if (mode === "merge") {
      next = mergeSongLibraries(cloudState, remote.state);
      next.songs = next.songs.map(song => {
        const conflict = conflicts.find(item => item.id === song.id);
        if (!conflict) return song;
        const choice = choices[song.id];
        if (choice === "cloud") return conflict.remote;
        if (choice !== "custom") return conflict.local;
        const sections = new Map(conflict.local.sections.map(section => [section.id, section]));
        for (const item of changedSections(conflict)) {
          if (sectionChoices[`${song.id}::${item.id}`] === "cloud") {
            if (item.cloud) sections.set(item.id, item.cloud);
            else sections.delete(item.id);
          } else if (!item.local) sections.delete(item.id);
        }
        const localOrder = conflict.local.sections.map(section => section.id), remoteOrder = conflict.remote.sections.map(section => section.id);
        const sectionOrder = sectionChoices[`${song.id}::order`] === "cloud" ? [...remoteOrder, ...localOrder.filter(id => !remoteOrder.includes(id))] : [...localOrder, ...remoteOrder.filter(id => !localOrder.includes(id))];
        const fields = Object.fromEntries(conflictFields.map(field => [field, fieldChoices[`${song.id}::${field}`] === "cloud" ? conflict.remote[field] : conflict.local[field]])) as Partial<DrumSong>;
        return { ...conflict.local, ...fields, updatedAt: new Date().toISOString(), sections: sectionOrder.flatMap(id => sections.has(id) ? [sections.get(id)!] : []) };
      });
      for (const conflict of recordConflicts) {
        const choice = recordChoices[`${conflict.kind}::${conflict.id}`];
        if (conflict.kind === "collection") next.collections = resolveRecord(next.collections, conflict, choice);
        else if (conflict.kind === "queue") next.queues = resolveRecord(next.queues, conflict, choice);
        else if (conflict.kind === "setlist") next.setlists = resolveRecord(next.setlists, conflict, choice);
        else if (conflict.kind === "learning path") next.learningPaths = resolveRecord(next.learningPaths ?? [], conflict, choice);
        else next.customGrooves = resolveRecord(next.customGrooves ?? [], conflict, choice);
      }
    }
    const unlockSongIds = cloudState.songs.filter(previous => {
      if (!previous.arrangementLocked) return false;
      const replacement = next.songs.find(song => song.id === previous.id);
      return !replacement || !replacement.arrangementLocked || JSON.stringify([previous.bpm, previous.meter, previous.sections]) !== JSON.stringify([replacement.bpm, replacement.meter, replacement.sections]);
    }).map(song => song.id);
    apply({ ...next, recordings: state.recordings, referenceTracks: state.referenceTracks??[] }, unlockSongIds.length ? { unlockSongIds } : undefined);
    remember({ accountId: user.id, libraryId: remote.id, revision: remote.revision, signature: restoreBaseSignature??librarySyncSignature(remote.state) });
    setRemote(null); setRestoreBaseSignature(undefined); setSyncEnabled(true); setMessage(role === "viewer" ? "Cloud library opened with view-only access. Local edits remain on this device." : "Library reviewed. Automatic sync is enabled while connected.");
  };
  const openScopedShare = async (id: string) => {
    const client = getSongCloudClient(); if (!client || !id) return;
    setBusy(true);
    try {
      const { data, error } = await client.from("drum_libraries").select("*").eq("id", id).single();
      if (error) throw error;
      const row = readCloudLibrary(data);
      if (!row.share_scope) throw new Error("This is a whole-library sync record, not a selected-song share.");
      setSelectedShareId(id); setSelectedShare(row); setSelectedShareSongIds(row.state.songs.map(song => song.id)); setSelectedShareUpdateIds([]); setShareDraftSongIds(row.owner_id === user?.id ? row.state.songs.map(song => song.id) : []); setMessage("Selected share opened read-only. It has no practice progress or private notes.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Selected share could not be opened."); }
    finally { setBusy(false); }
  };
  const createScopedShare = async () => {
    const client = getSongCloudClient(); if (!client || !user) return;
    const chosen = state.songs.filter(song => !song.archived && shareDraftSongIds.includes(song.id));
    if (!chosen.length) { setMessage("Choose at least one song to share."); return; }
    const safeSongs = chosen.map(song => { const { sharedOrigin: _sharedOrigin, ...publicSong } = song; return { ...publicSong, notes: "", kitSetup: song.kitSetup ? { ...song.kitSetup, notes: "" } : undefined, sections: song.sections.map(section => ({ ...section, notes: "", parts: section.parts.map(part => ({ ...part, notes: "" })) })) }; });
    const collection = state.collections.find(item => item.id === shareCollectionId);
    const members = collection ? new Set(collectionSongIds(collection, state.songs, state)) : new Set<string>();
    const scopedState: SongLibraryState = { ...emptySongLibrary(), songs: safeSongs, collections: collection ? [{ id: collection.id, name: collection.name, songIds: chosen.filter(song => members.has(song.id)).map(song => song.id) }] : [] };
    setBusy(true);
    try {
      const { data, error } = await client.from("drum_libraries").insert({ name: (shareName.trim() || `Selected songs · ${chosen.length}`).slice(0, 100), owner_id: user.id, state: scopedState, share_scope: true }).select("*").single();
      if (error) throw error;
      const row = readCloudLibrary(data); await loadLibraries(); setSelectedShareId(row.id); setSelectedShare(row); setSelectedShareSongIds(row.state.songs.map(song => song.id)); setShareName(""); setMessage("Selected-song snapshot created. Invite confirmed accounts as viewers below.");
    } catch { setMessage("Selected share could not be created. Check that the scoped sharing migration is applied and the snapshot fits the cloud storage limit."); }
    finally { setBusy(false); }
  };
  const updateScopedShare = async () => {
    const client = getSongCloudClient();
    if (!client || !selectedShare || selectedShare.owner_id !== user?.id || !online) return;
    const chosen = state.songs.filter(song => !song.archived && shareDraftSongIds.includes(song.id));
    if (!chosen.length) { setMessage("Choose at least one current song before updating this snapshot."); return; }
    const safeSongs = chosen.map(song => { const { sharedOrigin: _sharedOrigin, ...publicSong } = song; return { ...publicSong, notes: "", kitSetup: song.kitSetup ? { ...song.kitSetup, notes: "" } : undefined, sections: song.sections.map(section => ({ ...section, notes: "", parts: section.parts.map(part => ({ ...part, notes: "" })) })) }; });
    const chosenIds = new Set(chosen.map(song => song.id));
    const collections = selectedShare.state.collections.map(collection => ({ ...collection, songIds: collection.songIds.filter(id => chosenIds.has(id)) })).filter(collection => collection.songIds.length);
    const nextState: SongLibraryState = { ...emptySongLibrary(), songs: safeSongs, collections };
    setBusy(true);
    try {
      const { data, error } = await client.rpc("save_drum_library", { p_library_id: selectedShare.id, p_revision: selectedShare.revision, p_state: nextState, p_device_name: deviceName.slice(0, 80) });
      if (error) {
        if (error.code === "40001") {
          const latest = await client.from("drum_libraries").select("*").eq("id", selectedShare.id).single();
          if (!latest.error) { const row = readCloudLibrary(latest.data); setSelectedShare(row); setSelectedShareSongIds(row.state.songs.map(song => song.id)); setMessage("This snapshot changed elsewhere. The latest revision is loaded; review it before trying your update again."); return; }
        }
        throw error;
      }
      const row = readCloudLibrary(Array.isArray(data) ? data[0] : data);
      setSelectedShare(row); setSelectedShareSongIds(row.state.songs.map(song => song.id)); setSelectedShareUpdateIds([]); await loadLibraries();
      setMessage(`Snapshot updated to revision ${row.revision}. Recipients can review the changes before updating their downloaded copies.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Snapshot update failed. The current snapshot was left intact."); }
    finally { setBusy(false); }
  };
  const importSharedSongs = () => {
    if (!selectedShare) return;
    const selected = selectedShare.state.songs.filter(song => selectedShareSongIds.includes(song.id));
    const copied = selected.flatMap(song => {
      const copy = normalizeSong({ ...song, id: crypto.randomUUID(), sharedOrigin: { shareId: selectedShare.id, sourceSongId: song.id }, title: `${song.title} (shared copy)`, notes: "", bundled: false, arrangementLocked: false, kitSetup: song.kitSetup ? { ...song.kitSetup, notes: "" } : undefined, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sections: song.sections.map(section => ({ ...section, notes: "", parts: section.parts.map(part => ({ ...part, notes: "" })) })) });
      return copy ? [{ sourceId: song.id, song: copy }] : [];
    });
    if (!copied.length) { setMessage("Choose at least one valid shared song to copy."); return; }
    const ids = new Map(copied.map(item => [item.sourceId, item.song.id]));
    const copies = copied.map(item => item.song);
    const sharedCollections = selectedShare.state.collections.filter(collection => collection.songIds.some(id => ids.has(id))).map(collection => ({ id: crypto.randomUUID(), name: `${collection.name} (shared copy)`, songIds: collection.songIds.flatMap(id => ids.has(id) ? [ids.get(id)!] : []) }));
    apply({ ...state, songs: [...state.songs, ...copies], collections: [...state.collections, ...sharedCollections] });
    setMessage(`${copies.length} selected song${copies.length === 1 ? "" : "s"} copied into this device’s local library. Shared data was not connected to automatic sync.`);
  };
  const applySharedUpdates = () => {
    if (!selectedShare || !selectedShareUpdateIds.length) return;
    const now = new Date().toISOString();
    const selectedIds = new Set(selectedShareUpdateIds);
    const updates = new Map(selectedShare.state.songs.filter(song => selectedIds.has(song.id)).map(song => [song.id, song]));
    let changed = 0;
    const songs = state.songs.map(local => {
      const origin = local.sharedOrigin;
      const shared = origin?.shareId === selectedShare.id ? updates.get(origin.sourceSongId) : undefined;
      if (!shared) return local;
      const localSections = new Map(local.sections.map(section => [section.id, section]));
      const incoming = normalizeSong({ ...shared, id: local.id, sharedOrigin: origin, title: `${shared.title} (shared copy)`, bundled: false, arrangementLocked: false, notes: local.notes, createdAt: local.createdAt, updatedAt: now,
        kitSetup: shared.kitSetup ? { ...shared.kitSetup, notes: local.kitSetup?.notes ?? "" } : undefined,
        sections: shared.sections.map(section => {
          const oldSection = localSections.get(section.id);
          const oldParts = new Map(oldSection?.parts.map(part => [part.id, part]) ?? []);
          return { ...section, notes: oldSection?.notes ?? "", parts: section.parts.map(part => ({ ...part, notes: oldParts.get(part.id)?.notes ?? "" })) };
        })
      });
      if (!incoming) return local;
      changed++;
      return incoming;
    });
    if (!changed) { setMessage("No selected shared updates matched a downloaded local copy."); return; }
    apply({ ...state, songs });
    setSelectedShareUpdateIds([]);
    setMessage(`${changed === 1 ? "One local shared copy was" : `${changed} local shared copies were`} updated. Private song, section, part, and kit notes, practice history, and recordings stayed on this device.`);
  };
  const inviteScopedViewer = async () => {
    const client = getSongCloudClient(); if (!client || !selectedShare || !shareInviteEmail.trim()) return;
    setBusy(true);
    try { const { error } = await client.rpc("grant_drum_library_access", { p_library_id: selectedShare.id, p_email: shareInviteEmail, p_role: "viewer" }); if (error) throw error; setShareInviteEmail(""); setRetry(value => value + 1); setMessage("Viewer access granted to the selected-song snapshot."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Viewer access could not be granted."); }
    finally { setBusy(false); }
  };
  const deleteScopedShare = async () => {
    const client = getSongCloudClient(); if (!client || !selectedShare || selectedShare.owner_id !== user?.id) return;
    setBusy(true);
    try { const { error } = await client.from("drum_libraries").delete().eq("id", selectedShare.id); if (error) throw error; setSelectedShare(null); setSelectedShareId(""); await loadLibraries(); setMessage("Selected-song snapshot deleted. The recipients’ downloaded copies remain on their devices."); }
    catch { setMessage("Selected-song snapshot could not be deleted."); }
    finally { setBusy(false); }
  };
  const addSharedComment = async (parent?:SharedSongComment) => {
    const client=getSongCloudClient(),song=selectedShare?.state.songs.find(item=>item.id===(parent?.song_id??activeCommentSongId));
    const reply=parent?commentReplies[parent.id]??"":commentText;
    if(!client||!user||!selectedShare||!song||!reply.trim())return;
    if(!parent&&commentKind==="suggestion"&&(!activeCommentSection||!activeCommentPart||!commentBar||suggestionStep<1||suggestionStep>suggestionGridSteps)){
      setCommentMessage("Choose a song section, part, bar, and valid grid step before posting an arrangement proposal.");return;
    }
    setBusy(true);setCommentMessage("Saving comment…");
    try{
      const suggestion=commentKind==="suggestion"&&!parent&&activeCommentPart?{version:1 as const,action:suggestionAction,instrument:suggestionVoice,step:suggestionStep-1,accent:suggestionAccent,baseFingerprint:songPartEvidenceFingerprint(activeCommentPart)}:null;
      const body=(suggestion?`${ARRANGEMENT_PROPOSAL_PREFIX}${JSON.stringify(suggestion)}\n${reply.trim()}`:reply.trim()).slice(0,2000),authorLabel=(commentLabel.trim()||user.email?.split("@")[0]||"Drummer").slice(0,80);
      const payload={library_id:selectedShare.id,song_id:parent?.song_id??song.id,section_id:parent?parent.section_id??null:activeCommentSectionId||null,part_id:parent?parent.part_id??null:activeCommentPartId||null,bar:parent?parent.bar??null:activeCommentSectionId&&commentBar?Math.max(1,Math.min(20000,Math.round(Number(commentBar)||1))):null,body,author_id:user.id,author_label:authorLabel,arrangement_revision:parent?.arrangement_revision??selectedShare.revision,parent_id:parent?.id??null};
      const {data,error}=await client.from("drum_library_comments").insert(payload).select("id,library_id,song_id,section_id,part_id,bar,body,author_id,author_label,arrangement_revision,created_at,parent_id,resolved_at,resolved_by").single();
      if(error)throw error;
      setShareComments(current=>[...current,data as SharedSongComment].slice(-500));if(parent)setCommentReplies(current=>({...current,[parent.id]:""}));else{setCommentText("");setCommentKind("note");}setCommentMessage(parent?"Reply added to this comment thread.":suggestion?"Arrangement proposal added. An owner or editor can review the diff before applying it to a local copy.":"Comment added to this shared snapshot.");
    }catch{setCommentMessage("Comment could not be saved. Check snapshot membership and the shared comments migration.");}
    finally{setBusy(false);}
  };
  const applySharedArrangementProposal=(comment:SharedSongComment)=>{
    if(!selectedShare||!(shareRole==="owner"||shareRole==="editor")||comment.parent_id)return;
    const parsed=parseArrangementProposal(comment.body),source=selectedShare.state.songs.find(item=>item.id===comment.song_id),section=source?.sections.find(item=>item.id===comment.section_id),part=section?.parts.find(item=>item.id===comment.part_id);
    if(!parsed||!source||!section||!part){setCommentMessage("This thread does not contain a supported bar/part arrangement proposal.");return;}
    const {proposal}=parsed;
    if(comment.arrangement_revision!==selectedShare.revision||songPartEvidenceFingerprint(part)!==proposal.baseFingerprint){setCommentMessage("This proposal is based on an older arrangement. Refresh the snapshot and ask for a new proposal before applying it.");return;}
    const existing=state.songs.find(song=>song.sharedOrigin?.shareId===selectedShare.id&&song.sharedOrigin.sourceSongId===source.id);
    if(existing?.arrangementLocked){setCommentMessage("Unlock the approved local arrangement before applying a reviewed proposal.");return;}
    const base=existing??normalizeSong({...source,id:crypto.randomUUID(),sharedOrigin:{shareId:selectedShare.id,sourceSongId:source.id},title:`${source.title} (shared copy)`,notes:"",bundled:false,arrangementLocked:false,kitSetup:source.kitSetup?{...source.kitSetup,notes:""}:undefined,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sections:source.sections.map(item=>({...item,notes:"",parts:item.parts.map(candidate=>({...candidate,notes:""}))}))});
    if(!base){setCommentMessage("Could not prepare a local copy for the arrangement proposal.");return;}
    const localSection=base.sections.find(item=>item.id===section.id),localPart=localSection?.parts.find(item=>item.id===part.id);
    if(!localSection||!localPart||songPartEvidenceFingerprint(localPart)!==proposal.baseFingerprint){setCommentMessage("Your local copy has changed since this proposal was written. Review or update that copy before applying the proposal.");return;}
    if(proposal.step>=Math.round(localPart.beats*localPart.subdivision/4)){setCommentMessage("The proposed grid step is outside this part’s current pattern.");return;}
    const at=localPart.hits.findIndex(hit=>hit.step===proposal.step&&hit.instrument===proposal.instrument);
    if(proposal.action==="remove"&&at<0){setCommentMessage("The proposed hit is already absent from this local arrangement.");return;}
    if(proposal.action==="add"&&at>=0&&Boolean(localPart.hits[at]?.accent)===proposal.accent){setCommentMessage("The proposed hit already matches this local arrangement.");return;}
    if(proposal.action==="add"&&at<0&&localPart.hits.length>=256){setCommentMessage("This drum part has reached the 256-hit limit. Remove a hit or choose another part before applying the proposal.");return;}
    const hits=proposal.action==="remove"?localPart.hits.filter((_,index)=>index!==at):at>=0?localPart.hits.map((hit,index)=>index===at?{...hit,accent:proposal.accent}:hit):[...localPart.hits,{step:proposal.step,instrument:proposal.instrument,accent:proposal.accent}];
    const next=normalizeSong({...base,updatedAt:new Date().toISOString(),sections:base.sections.map(item=>item.id!==localSection.id?item:{...item,parts:item.parts.map(candidate=>candidate.id===localPart.id?{...candidate,hits}:candidate)})});
    if(!next)return;
    const action=proposal.action==="remove"?"remove":"add or update";
    const reviewText=`${action} ${proposal.instrument}${proposal.accent?" accent":""} at part grid step ${proposal.step+1} in ${section.name} / ${part.name}${comment.bar?`, rehearsal reference bar ${comment.bar}`:""}. This changes every repeat of the part.`;
    if(!window.confirm(`Apply reviewed arrangement proposal to a local song copy?\n\n${source.title}: ${reviewText}\n\n${existing?"The matching local shared copy will be updated.":"A local shared copy will be created first."}`))return;
    apply({...state,songs:[...state.songs.filter(song=>song.id!==base.id),next]});
    setCommentMessage(`Reviewed proposal applied to ${next.title}. The shared snapshot and original arrangement were left unchanged.`);
  };
  const resolveSharedComment=async(comment:SharedSongComment)=>{
    const client=getSongCloudClient();if(!client||!user||!selectedShare||!(shareRole==="owner"||shareRole==="editor")||comment.parent_id)return;
    const resolvedAt=comment.resolved_at?null:new Date().toISOString(),resolvedBy=resolvedAt?user.id:null;
    try{const {data,error}=await client.from("drum_library_comments").update({resolved_at:resolvedAt,resolved_by:resolvedBy}).eq("id",comment.id).eq("library_id",selectedShare.id).select("id,library_id,song_id,section_id,part_id,bar,body,author_id,author_label,arrangement_revision,created_at,parent_id,resolved_at,resolved_by").single();if(error)throw error;setShareComments(current=>current.map(item=>item.id===comment.id?data as SharedSongComment:item));setCommentMessage(resolvedAt?"Comment thread resolved.":"Comment thread reopened.");}
    catch{setCommentMessage("This thread could not be updated. Editors and owners can resolve comments after applying the latest comment-thread migration.");}
  };
  const removeSharedComment = async (comment:SharedSongComment) => {
    const client=getSongCloudClient();if(!client||!selectedShare)return;
    try{const {error}=await client.from("drum_library_comments").delete().eq("id",comment.id).eq("library_id",selectedShare.id);if(error)throw error;setShareComments(current=>current.filter(item=>item.id!==comment.id&&item.parent_id!==comment.id));setCommentMessage("Comment removed.");}
    catch{setCommentMessage("This comment could not be removed. Only its author or the snapshot owner can remove it.");}
  };
  if (!songCloudConfigured()) return <section className="song-cloud-panel"><h3>Optional account sync and sharing</h3><p>Account sync is not enabled for this installation. Your library and local backups are available without an account.</p></section>;
  return <section className="song-cloud-panel"><h3>Account sync and sharing</h3><p>Connecting uploads your selected library’s songs, saved custom grooves, notes, plans, and practice progress to your account. Recording audio, reference audio, and their metadata stay on this device. Shared editors can change this library; viewers can read it.</p>{!connected ? <button type="button" onClick={() => setConnected(true)}>Connect account</button> : !user ? <form onSubmit={(event) => { event.preventDefault(); void authenticate(false); }}><label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input required type="password" autoComplete="current-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="song-actions"><button type="submit" disabled={busy}>Sign in</button><button type="button" disabled={busy || !email || password.length < 12} onClick={() => void authenticate(true)}>Create account</button></div></form> : <><p>Signed in as {user.email} · {online ? "Online" : "Offline · changes remain saved locally"}</p><button type="button" disabled={busy} onClick={() => { generation.current++; setSyncEnabled(false); void getSongCloudClient()?.auth.signOut().then(({ error }) => { if (error) setMessage("Could not sign out. Please try again."); }); }}>Sign out</button><label>Device name for sync history<input value={deviceName} maxLength={80} onChange={event=>setDeviceName(event.target.value)}/></label><label>New cloud library name<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label><button type="button" disabled={busy || !name.trim() || !online} onClick={() => { const client = getSongCloudClient(); if (!client) return; setBusy(true); void Promise.resolve(client.from("drum_libraries").insert({ name: name.trim(), owner_id: user.id, state: cloudState }).select().single()).then(async ({ data, error }) => { if (error) throw error; const row = readCloudLibrary(data); setLibraryId(row.id); setRole("owner"); setRemote(null); remember({ accountId: user.id, libraryId: row.id, revision: row.revision, signature }); setSyncEnabled(true); await loadLibraries(); setMessage("Cloud library created. Automatic sync is enabled."); }).catch(() => setMessage("Could not create a cloud library. Check the database migration and connection.")).finally(() => setBusy(false)); }}>Create cloud library from this device</button><label>Cloud library<select value={libraryId} disabled={busy} onChange={(event) => { generation.current++; setLibraryId(event.target.value); setRemote(null); setSyncEnabled(false); setCheckpoint(null); setRole(""); }}><option value="">Choose a library</option>{libraries.map((item) => <option key={item.id} value={item.id}>{item.name}{item.owner_id === user.id ? " · owner" : " · shared"}</option>)}</select></label><div className="song-actions"><button type="button" disabled={!libraryId || busy || !online} onClick={() => void reviewCloud()}>Review cloud library</button><button type="button" disabled={!checkpoint || busy} onClick={() => setSyncEnabled(!syncEnabled)}>{syncEnabled ? "Pause sync" : "Resume sync"}</button>{syncEnabled && checkpoint && role !== "viewer" && <button type="button" disabled={busy || !online} onClick={() => { setManualSync(true); setMessage("Syncing device changes now…"); }}>Sync now</button>}</div><p role="status">{!checkpoint ? "Review a cloud library to enable sync." : !syncEnabled ? "Sync is paused; local changes stay on this device." : checkpoint.signature === signature ? "All local changes are synced." : "Unsynced local changes are waiting to sync."}</p><p>Last successful sync or review: {lastSync?new Date(lastSync).toLocaleString():"None in this session"}{remoteSavedAt?` · cloud saved ${new Date(remoteSavedAt).toLocaleString()}${remoteDevice?` by ${remoteDevice}`:""}`:""}</p><p role="status" aria-live="polite" aria-atomic="true">{!online ? "Offline — changes remain saved on this device." : checkpoint ? checkpoint.signature === signature ? `Revision ${checkpoint.revision} · ${role} · Local and cloud copies are up to date.` : `Revision ${checkpoint.revision} · ${role} · Local changes are saved here and waiting to sync.` : "Local-only for now. Sync starts after you create or review a cloud library."}</p>{user&&<section className="song-scoped-shares"><h3>Share selected songs or a collection</h3><p>Creates a separate viewer-only snapshot. It includes only selected arrangements and an optional selected collection; private notes, journals, progress, recordings, and reference audio are excluded.</p><label>Snapshot name<input maxLength={100} value={shareName} onChange={event=>setShareName(event.target.value)} placeholder="e.g. Tuesday rehearsal"/></label><label>Start from a collection<select value={shareCollectionId} onChange={event=>{const id=event.target.value;setShareCollectionId(id);if(id){const collection=state.collections.find(item=>item.id===id);if(collection)setShareDraftSongIds(collectionSongIds(collection,state.songs).filter(songId=>state.songs.some(song=>song.id===songId)));}}}><option value="">Choose songs below</option>{state.collections.map(collection=><option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label><fieldset><legend>Songs to include or update</legend>{state.songs.filter(song=>!song.archived).map(song=><label key={song.id}><input type="checkbox" checked={shareDraftSongIds.includes(song.id)} onChange={event=>setShareDraftSongIds(current=>event.target.checked?[...new Set([...current,song.id])]:current.filter(id=>id!==song.id))}/>{song.title} · {song.artist}</label>)}</fieldset><button type="button" disabled={busy||!online||!shareDraftSongIds.length} onClick={()=>void createScopedShare()}>Create viewer-only snapshot</button><h4>Selected-song snapshots</h4>{sharedLibraries.length?sharedLibraries.map(item=><button key={item.id} type="button" aria-pressed={selectedShareId===item.id} disabled={busy} onClick={()=>void openScopedShare(item.id)}>{item.name}{item.owner_id===user.id?" · owner":" · shared with me"}</button>):<p>No selected-song snapshots are available to this account.</p>}{selectedShare&&<div className="song-scoped-share-review"><h4>{selectedShare.name} · {selectedShare.state.songs.length} songs · revision {selectedShare.revision}</h4><p>{selectedShare.owner_id===user.id?"You own this read-only snapshot.":"This shared snapshot is read-only. Copy selected songs to your local library to practice or edit them."}</p><section className="song-shared-comments"><h5>Shared arrangement comments</h5><p>Members can leave revision-specific feedback on this snapshot. These comments are separate from private song notes, practice history, and recordings.</p><label>Display name<input maxLength={80} value={commentLabel} onChange={event=>setCommentLabel(event.target.value)} placeholder={user?.email?.split("@")[0]??"Drummer"}/></label><label>Song<select value={activeCommentSongId||""} onChange={event=>{setCommentSongId(event.target.value);setCommentSectionId("");setCommentPartId("");}}>{selectedShare.state.songs.map(song=><option key={song.id} value={song.id}>{song.title}</option>)}</select></label>{(()=>{const selectedCommentSong=selectedShare.state.songs.find(song=>song.id===(activeCommentSongId));const commentSections=selectedCommentSong?.sections??[];const commentParts=commentSections.find(section=>section.id===activeCommentSectionId)?.parts??[];return <><label>Section anchor<select value={activeCommentSectionId} onChange={event=>{setCommentSectionId(event.target.value);setCommentPartId("");}}><option value="">Whole song</option>{commentSections.map(section=><option key={section.id} value={section.id}>{section.name}</option>)}</select></label>{activeCommentSectionId&&<><label>Part anchor<select value={activeCommentPartId} onChange={event=>setCommentPartId(event.target.value)}><option value="">Whole section</option>{commentParts.map(part=><option key={part.id} value={part.id}>{part.name}</option>)}</select></label><label>{commentKind==="suggestion"?"Bar reference":"Bar (optional)"}<input type="number" min={1} max={20000} value={commentBar} onChange={event=>setCommentBar(event.target.value)}/></label></>}</>;})()}<label>Feedback type<select value={commentKind} onChange={event=>setCommentKind(event.target.value as "note"|"suggestion")}><option value="note">Rehearsal comment</option><option value="suggestion">Structured arrangement suggestion</option></select></label>{commentKind==="suggestion"&&<fieldset className="song-arrangement-proposal"><legend>Proposed drum change</legend><div className="song-form-row"><label>Change<select value={suggestionAction} onChange={event=>setSuggestionAction(event.target.value as "add"|"remove")}><option value="add">Add or update a hit</option><option value="remove">Remove a hit</option></select></label><label>Drum voice<select value={suggestionVoice} onChange={event=>setSuggestionVoice(event.target.value as SongInstrument)}>{SONG_INSTRUMENTS.map(voice=><option key={voice} value={voice}>{voice}</option>)}</select></label><label>Part grid step<input type="number" min={1} max={suggestionGridSteps} value={suggestionStep} onChange={event=>setSuggestionStep(Math.max(1,Math.min(suggestionGridSteps,Math.round(Number(event.target.value)||1))))}/></label></div><label><input type="checkbox" checked={suggestionAccent} onChange={event=>setSuggestionAccent(event.target.checked)}/> Accented hit</label><p>This updates the selected part’s repeating grid. The selected bar is kept as the rehearsal reference; every repeat of this part uses the approved change.</p></fieldset>}<label>{commentKind==="suggestion"?"Why this change?":"Feedback"}<textarea maxLength={2000} value={commentText} onChange={event=>setCommentText(event.target.value)} placeholder={commentKind==="suggestion"?"Explain the groove or rehearsal reason":"Add a rehearsal note"}/></label><button type="button" disabled={busy||!online||!commentText.trim()||!user||(commentKind==="suggestion"&&(!activeCommentSectionId||!activeCommentPartId||!commentBar||suggestionStep>suggestionGridSteps))} onClick={()=>void addSharedComment()}>{commentKind==="suggestion"?`Propose change on revision ${selectedShare.revision}`:`Add comment to revision ${selectedShare.revision}`}</button><ol className="song-comment-threads">{shareComments.filter(comment=>!comment.parent_id).map(comment=>{const song=selectedShare.state.songs.find(item=>item.id===comment.song_id),section=song?.sections.find(item=>item.id===comment.section_id),part=section?.parts.find(item=>item.id===comment.part_id),replies=shareComments.filter(reply=>reply.parent_id===comment.id),proposal=parseArrangementProposal(comment.body),proposalHit=proposal?part?.hits.find(hit=>hit.step===proposal.proposal.step&&hit.instrument===proposal.proposal.instrument):undefined;return <li key={comment.id} className={comment.resolved_at?"is-resolved":""}><strong>{comment.author_label} · revision {comment.arrangement_revision}{comment.resolved_at?" · Resolved":" · Open"}</strong><p>{song?.title??"Song"}{section?` · ${section.name}`:""}{part?` · ${part.name}`:""}{comment.bar?` · bar ${comment.bar}`:""}</p>{proposal?<div className="song-arrangement-proposal-review"><strong>Arrangement suggestion · {proposal.proposal.action} {proposal.proposal.instrument} at part grid step {proposal.proposal.step+1}{proposal.proposal.accent?" · accent":""}</strong><p>Current: {proposalHit?(proposalHit.accent?"hit with accent":"hit"):"no hit"} → Proposed: {proposal.proposal.action==="remove"?"no hit":proposal.proposal.accent?"hit with accent":"hit"}{comment.bar?` · rehearsal reference bar ${comment.bar}`:""}</p>{proposal.rationale&&<p>Reason: {proposal.rationale}</p>}<small>{comment.arrangement_revision===selectedShare.revision?"Based on the current snapshot revision.":"This proposal is based on an older snapshot revision and cannot be applied."} Applying it updates or creates a local shared copy; the shared snapshot remains unchanged.</small>{(shareRole==="owner"||shareRole==="editor")&&<button type="button" disabled={busy||comment.arrangement_revision!==selectedShare.revision} onClick={()=>applySharedArrangementProposal(comment)}>Review diff and apply to local copy</button>}</div>:<p>{comment.body}</p>}{(shareRole==="owner"||shareRole==="editor")&&<button type="button" className="button-secondary" onClick={()=>void resolveSharedComment(comment)}>{comment.resolved_at?"Reopen thread":"Resolve thread"}</button>}{(comment.author_id===user?.id||selectedShare.owner_id===user?.id)&&<button type="button" className="button-secondary" onClick={()=>void removeSharedComment(comment)}>Delete comment</button>}{replies.length>0&&<ol aria-label={`Replies to ${comment.author_label}`} className="song-comment-replies">{replies.map(reply=><li key={reply.id}><strong>{reply.author_label} · revision {reply.arrangement_revision}</strong><p>{reply.body}</p>{(reply.author_id===user?.id||selectedShare.owner_id===user?.id)&&<button type="button" className="button-secondary" onClick={()=>void removeSharedComment(reply)}>Delete reply</button>}</li>)}</ol>}{user&&<div className="song-comment-reply"><label>Reply<textarea maxLength={2000} rows={2} value={commentReplies[comment.id]??""} onChange={event=>setCommentReplies(current=>({...current,[comment.id]:event.target.value}))}/></label><button type="button" disabled={busy||!online||Boolean(comment.resolved_at)||!(commentReplies[comment.id]??"").trim()} onClick={()=>void addSharedComment(comment)}>Reply to thread</button></div>}</li>;})}</ol><p role="status" aria-live="polite">{commentMessage}</p></section><fieldset><legend>Songs in this snapshot</legend>{selectedShare.state.songs.map(song=><label key={song.id}><input type="checkbox" checked={selectedShareSongIds.includes(song.id)} onChange={event=>setSelectedShareSongIds(current=>event.target.checked?[...new Set([...current,song.id])]:current.filter(id=>id!==song.id))}/>{song.title} · {song.artist}</label>)}</fieldset><button type="button" disabled={!selectedShareSongIds.length} onClick={importSharedSongs}>Copy selected songs to my library</button>{shareUpdateCandidates.length>0&&<section className="song-shared-copy-updates"><h4>Review updates for downloaded copies</h4><p>Each checked update replaces the shared song’s public metadata and arrangement. Your local notes, practice history, and recordings stay here. Review the listed changes before applying.</p>{shareUpdateCandidates.map(candidate=><fieldset key={candidate.local.id}><legend>{candidate.local.title}</legend><label><input type="checkbox" disabled={!candidate.shared} checked={selectedShareUpdateIds.includes(candidate.sourceId)} onChange={event=>setSelectedShareUpdateIds(current=>event.target.checked?[...new Set([...current,candidate.sourceId])]:current.filter(id=>id!==candidate.sourceId))}/>{candidate.shared?`Update from “${candidate.shared.title}”`:"No longer included in the latest snapshot"}</label><p>On this device: {sharedArrangementSummary(candidate.local)} · Latest snapshot: {candidate.shared ? sharedArrangementSummary(candidate.shared) : "Song removed from snapshot"}</p><p>Changes: {candidate.changes.join(" · ")}</p>{candidate.arrangementChanges.length>0&&<details><summary>Review up to 40 bar-level changes ({candidate.arrangementChanges.length})</summary><ul>{candidate.arrangementChanges.map((change,index)=><li key={`${change.location}:${index}`}><strong>{change.location}</strong> · {change.change} · {change.detail}</li>)}</ul></details>}</fieldset>)}<button type="button" disabled={!selectedShareUpdateIds.length} onClick={applySharedUpdates}>Apply reviewed updates to local copies</button></section>}{selectedShare.owner_id===user.id&&<><button type="button" disabled={busy||!online||!shareDraftSongIds.length} onClick={()=>void updateScopedShare()}>Update snapshot from selected songs</button><label>Invite confirmed account as viewer<input type="email" value={shareInviteEmail} onChange={event=>setShareInviteEmail(event.target.value)}/></label><button type="button" disabled={busy||!online||!shareInviteEmail.trim()} onClick={()=>void inviteScopedViewer()}>Grant viewer access</button>{shareMembers.map(member=><p key={member.user_id}>{member.email} · viewer <button type="button" disabled={busy} onClick={()=>{const client=getSongCloudClient();if(client)void client.rpc("revoke_drum_library_access",{p_library_id:selectedShare.id,p_user_id:member.user_id}).then(({error})=>{if(error)setMessage("Viewer access could not be revoked.");else{setRetry(value=>value+1);setMessage("Viewer access revoked.");}});}}>Revoke</button></p>)}<button type="button" disabled={busy||!online} onClick={()=>{if(window.confirm(`Delete the selected-song snapshot “${selectedShare.name}”?`))void deleteScopedShare();}}>Delete snapshot</button></>}</div>}</section>}{remote && <div className="song-cloud-review"><h4>Review {remote.name} · revision {remote.revision}</h4><p>This device: {cloudState.songs.length} personal songs. Cloud: {remote.state.songs.length}. Merging keeps compatible planning records and lets you choose changed song fields and sections individually.</p>{conflicts.map(conflict => <details className="song-cloud-conflict" key={conflict.id}><summary>{conflict.title} · {conflict.local.sections.length} device sections / {conflict.remote.sections.length} cloud sections</summary><p>Review changed fields and arrangement sections. A mixed resolution keeps the device version for any item not explicitly set to cloud.</p><label>Resolve this song<select value={choices[conflict.id] ?? ""} onChange={event => setChoices({ ...choices, [conflict.id]: event.target.value })}><option value="">Choose a resolution</option><option value="device">Keep the whole device song</option><option value="cloud">Use the whole cloud song</option><option value="custom">Choose fields and sections</option></select></label>{choices[conflict.id] === "custom" && <><h5>Song fields</h5>{conflictFields.filter(field => JSON.stringify(conflict.local[field]) !== JSON.stringify(conflict.remote[field])).map(field => <label key={`${conflict.id}:${field}`}>{field}<select value={fieldChoices[`${conflict.id}::${field}`] ?? ""} onChange={event => setFieldChoices({ ...fieldChoices, [`${conflict.id}::${field}`]: event.target.value })}><option value="">Choose version</option><option value="device">Device · {JSON.stringify(conflict.local[field])}</option><option value="cloud">Cloud · {JSON.stringify(conflict.remote[field])}</option></select></label>)}<h5>Arrangement sections</h5>{sectionOrderChanged(conflict) && <label>Section order<small>Device: {conflict.local.sections.map(section => section.name).join(" → ")} · Cloud: {conflict.remote.sections.map(section => section.name).join(" → ")}</small><select value={sectionChoices[`${conflict.id}::order`] ?? ""} onChange={event => setSectionChoices({ ...sectionChoices, [`${conflict.id}::order`]: event.target.value })}><option value="">Choose order</option><option value="device">Device order</option><option value="cloud">Cloud order</option></select></label>}{changedSections(conflict).map(section => <label key={`${conflict.id}:${section.id}`}>{section.local?.name ?? section.cloud?.name ?? "Unnamed section"}<small>{section.local ? `Device: ${section.local.parts.length} parts, ${section.local.parts.reduce((sum, part) => sum + part.hits.length, 0)} hits` : "Device: section absent"} · {section.cloud ? `Cloud: ${section.cloud.parts.length} parts, ${section.cloud.parts.reduce((sum, part) => sum + part.hits.length, 0)} hits` : "Cloud: section absent"}</small><select value={sectionChoices[`${conflict.id}::${section.id}`] ?? ""} onChange={event => setSectionChoices({ ...sectionChoices, [`${conflict.id}::${section.id}`]: event.target.value })}><option value="">Choose version</option><option value="device">Keep device section{section.local ? "" : " · omit addition"}</option><option value="cloud">Use cloud section{section.cloud ? "" : " · remove section"}</option></select></label>)}</>}</details>)}{recordConflicts.length > 0 && <details className="song-cloud-conflict"><summary>Collections, plans, custom groove, and learning path conflicts ({recordConflicts.length})</summary><p>Choose the device copy, cloud copy, or keep both for each changed record. Keeping both creates a separate cloud copy on this device.</p>{recordConflicts.map(conflict => <div className="song-cloud-record-conflict" key={`${conflict.kind}:${conflict.id}`}><strong>{conflict.kind}: {conflict.name}</strong><div className="song-form-row"><pre>On this device\n{JSON.stringify(conflict.local, null, 2)}</pre><pre>In cloud\n{JSON.stringify(conflict.cloud, null, 2)}</pre></div><label>Resolution<select value={recordChoices[`${conflict.kind}::${conflict.id}`] ?? ""} onChange={event => setRecordChoices({ ...recordChoices, [`${conflict.kind}::${conflict.id}`]: event.target.value })}><option value="">Choose a version</option><option value="device">Keep device record</option><option value="cloud">Use cloud record</option><option value="both">Keep both copies</option></select></label></div>)}</details>}<div className="song-actions"><button type="button" onClick={() => chooseRemote("cloud")}>Use cloud version</button>{role !== "viewer" && <><button type="button" onClick={() => chooseRemote("device")}>Keep device version and sync</button><button type="button" disabled={unresolved} onClick={() => chooseRemote("merge")}>Merge reviewed changes</button></>}<button type="button" onClick={() => { setRemote(null); setSyncEnabled(false); }}>Cancel</button></div></div>}{checkpoint&&<details><summary>Device activity and recoverable revisions</summary><p>Shows the previous 20 saved cloud versions. Recovery requires review and creates a new revision.</p><button type="button" disabled={busy||!online} onClick={()=>void loadHistory()}>Refresh revision history</button><p role="status">{historyMessage}</p>{history.map(item=><p key={item.revision}>Revision {item.revision} · {new Date(item.created_at).toLocaleString()} · {item.device_name||"Unnamed device"} {role!=="viewer"&&<button type="button" disabled={busy||!online} onClick={()=>void recoverRevision(item.revision)}>Review revision {item.revision} for recovery</button>}</p>)}</details>}{role === "owner" && checkpoint && <div><h4>Share this library</h4><p>The recipient must create and confirm an account first.</p><label>Recipient email<input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></label><label>Permission<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "viewer" | "editor")}><option value="viewer">Viewer</option><option value="editor">Editor</option></select></label><button type="button" disabled={busy || !inviteEmail || !online} onClick={() => { const client = getSongCloudClient(); if (!client) return; setBusy(true); void Promise.resolve(client.rpc("grant_drum_library_access", { p_library_id: libraryId, p_email: inviteEmail, p_role: inviteRole })).then(({ error }) => { if (error) throw error; setInviteEmail(""); setRetry((value) => value + 1); setMessage("Access granted."); }).catch((error) => setMessage(error.message || "Could not share this library.")).finally(() => setBusy(false)); }}>Grant access</button>{members.map((member) => <p key={member.user_id}>{member.email} · {member.role} <button type="button" disabled={busy} onClick={() => { const client = getSongCloudClient(); if (!client) return; void client.rpc("revoke_drum_library_access", { p_library_id: libraryId, p_user_id: member.user_id }).then(({ error }) => { if (error) setMessage(error.message); else { setRetry((value) => value + 1); setMessage("Access revoked."); } }); }}>Revoke access</button></p>)}</div>}</>}<p role="status">{busy ? "Working…" : message}</p></section>;
}
