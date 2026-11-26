"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ImprovisationHit, ImprovisationSettings } from "@/lib/improvisation";
import { normalizeImprovisationSettings } from "@/lib/improvisation";
import { getSongCloudClient, readSongCloudCheckpoint } from "@/lib/song-cloud";
import type { Instrument, MidiArticulation } from "@/lib/types";
import { useLocalization } from "./LocalizationProvider";
import styles from "./ImprovisationStudio.module.css";

type Channel = NonNullable<ReturnType<NonNullable<ReturnType<typeof getSongCloudClient>>["channel"]>>;
type Role = "host" | "guest";
export type RemotePlayer = 1 | 2 | 3 | 4;
type RemoteHit = ImprovisationHit & { player: RemotePlayer };
type Control = "pause" | "stop" | "resume";
export type RemoteDuetHandle = {
  sendHit: (hit: RemoteHit) => void;
  sendControl: (control: "pause" | "stop") => void;
  sendResume: () => void;
};
type Props = {
  settings: ImprovisationSettings;
  disabled: boolean;
  onRoleChange: (player: RemotePlayer | null) => void;
  onPrepare: () => Promise<boolean>;
  onStart: (settings: ImprovisationSettings, localStartAtEpoch: number) => void;
  onPeerHit: (hit: RemoteHit, roomId: string) => boolean;
  onControl: (control: Control, localStartAtEpoch?: number) => void;
};
type Presence = { userId: string; instanceId: string; name: string; roomId: string; role: Role; player: RemotePlayer | null; ready: boolean };

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const ImprovisationRemoteDuet = forwardRef<RemoteDuetHandle, Props>(function ImprovisationRemoteDuet({ settings, disabled, onRoleChange, onPrepare, onStart, onPeerHit, onControl }, forwardedRef) {
  const { t } = useLocalization();
  const [code, setCode] = useState(""), [roomId, setRoomId] = useState(""), [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState("Remote rooms use a private connection shared with members of the same reviewed cloud library.");
  const [connected, setConnected] = useState(false), [peers, setPeers] = useState<Presence[]>([]), [prepared, setPrepared] = useState(false), [player, setPlayer] = useState<RemotePlayer | null>(null), [offsetMs, setOffsetMs] = useState(0), [roundTripMs, setRoundTripMs] = useState<number | null>(null), [jitterMs, setJitterMs] = useState<number | null>(null), [latePacketCount, setLatePacketCount] = useState(0);
  const channelRef = useRef<Channel | null>(null), clientRef = useRef<NonNullable<ReturnType<typeof getSongCloudClient>> | null>(null);
  const roomRef = useRef(""), roleRef = useRef<Role | null>(null), instanceRef = useRef(crypto.randomUUID()), accountRef = useRef(""), nameRef = useRef("Drummer");
  const offsetRef = useRef(0), preparedRef = useRef(false), pingTimer = useRef<ReturnType<typeof setInterval> | null>(null), pingSequence = useRef(0), pendingPings = useRef(new Map<number, number>()), smoothedRtt = useRef<number | null>(null), smoothedJitter = useRef<number | null>(null), playerRef = useRef<RemotePlayer | null>(null), assignmentsRef = useRef(new Map<string, RemotePlayer>()), hostIdRef = useRef(""), settingsRef = useRef(settings);
  settingsRef.current = settings;
  const callbacks = useRef({ onRoleChange, onPrepare, onStart, onPeerHit, onControl });
  callbacks.current = { onRoleChange, onPrepare, onStart, onPeerHit, onControl };

  const trackPresence = async () => {
    const channel = channelRef.current, roleNow = roleRef.current, roomNow = roomRef.current;
    if (!channel || !roleNow || !roomNow) return;
    const result = await channel.track({ userId: accountRef.current, instanceId: instanceRef.current, name: nameRef.current, roomId: roomNow, role: roleNow, player: playerRef.current, ready: preparedRef.current } satisfies Presence);
    if (result !== "ok") setStatus(t("Could not publish duet presence. Check the Supabase Realtime migration."));
  };

  const send = async (payload: Record<string, unknown>) => {
    const channel = channelRef.current, room = roomRef.current;
    if (!channel || !room) return false;
    try {
      const result = await channel.send({ type: "broadcast", event: "duet", payload: { ...payload, roomId: room, senderId: instanceRef.current } });
      if (result !== "ok") { setStatus(t("Could not send a duet update. Check the private Realtime room migration.")); return false; }
      return true;
    } catch { setStatus(t("Remote duet lost its cloud connection.")); return false; }
  };

  const sendPing = () => {
    const targetId = roleRef.current === "guest" ? hostIdRef.current : undefined;
    if (roleRef.current === "guest" && !targetId) return;
    const sequence = ++pingSequence.current, t0 = Date.now();
    pendingPings.current.set(sequence, t0);
    for (const [key, sentAt] of pendingPings.current) if (Date.now() - sentAt > 10000) pendingPings.current.delete(key);
    void send({ kind: "ping", sequence, t0, ...(targetId ? { targetId } : {}) });
  };

  const disconnect = async (notice?: string) => {
    if (pingTimer.current) clearInterval(pingTimer.current); pingTimer.current = null;
    const channel = channelRef.current; channelRef.current = null;
    if (channel) {
      await channel.untrack().catch(() => undefined);
      await clientRef.current?.removeChannel(channel);
    }
    roomRef.current = ""; roleRef.current = null; preparedRef.current = false; playerRef.current = null; hostIdRef.current = ""; assignmentsRef.current.clear(); offsetRef.current = 0; pendingPings.current.clear(); smoothedRtt.current = null; smoothedJitter.current = null;
    setRoomId(""); setRole(null); setConnected(false); setPeers([]); setPrepared(false); setPlayer(null); setOffsetMs(0); setRoundTripMs(null); setJitterMs(null); setLatePacketCount(0);
    callbacks.current.onRoleChange(null);
    if (notice) setStatus(notice);
  };

  const connectRoom = async (nextRoom: string, nextRole: Role) => {
    if (!isUuid(nextRoom)) throw new Error(t("Enter a valid remote room invite code."));
    await disconnect();
    const client = getSongCloudClient(), checkpoint = readSongCloudCheckpoint();
    if (!client || !checkpoint) throw new Error(t("Open Song Builder cloud sharing and review a shared library before creating or joining a remote duet."));
    const { data: sessionData } = await client.auth.getSession(), user = sessionData.session?.user;
    if (!user || user.id !== checkpoint.accountId) throw new Error(t("Sign in and review the shared cloud library on this device first."));
    const { data: libraryRole, error: roleError } = await client.rpc("drum_library_role", { p_library_id: checkpoint.libraryId });
    if (roleError || !libraryRole) throw new Error(t("This account no longer has access to the reviewed cloud library."));
    accountRef.current = user.id;
    nameRef.current = String(user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Drummer").slice(0, 48);
    const topic = `drum-improv:${checkpoint.libraryId}:${nextRoom}`;
    const channel = client.channel(topic, { config: { private: true, presence: { key: instanceRef.current }, broadcast: { ack: true, self: false } } });
    channelRef.current = channel; clientRef.current = client; roomRef.current = nextRoom; roleRef.current = nextRole; playerRef.current = nextRole === "host" ? 1 : null;
    channel.on("presence", { event: "sync" }, () => {
      const presence = channel.presenceState() as Record<string, Array<Presence>>;
      const peers = Object.values(presence).flat().filter(item => item.roomId === roomRef.current && item.instanceId !== instanceRef.current);
      setPeers(peers);
      if (nextRole === "host") {
        for (const id of assignmentsRef.current.keys()) if (!peers.some(peer => peer.instanceId === id)) assignmentsRef.current.delete(id);
        setStatus(t("Room ready · {count} of {required} players connected.", { count: peers.length + 1, required: settingsRef.current.mode === "ensemble" ? settingsRef.current.ensemblePlayers.length : 2 }));
      } else if (peers.some(peer => peer.role === "host")) {
        hostIdRef.current = peers.find(peer => peer.role === "host")?.instanceId ?? "";
        if (playerRef.current === null) void send({ kind: "slot-request" });
        setStatus(playerRef.current ? t("Connected as Player {player}. Estimated clock difference: {offset} ms.", { player: playerRef.current, offset: Math.round(offsetRef.current) }) : t("Connected to the host. Waiting for a player slot."));
      } else setStatus(t("Joined room. Waiting for the host to connect."));
    });
    channel.on("broadcast", { event: "duet" }, message => {
      const payload = message.payload as Record<string, unknown> | undefined;
      if (!payload || payload.roomId !== roomRef.current || payload.senderId === instanceRef.current) return;
      if (payload.kind === "join" || payload.kind === "ready") { void trackPresence(); return; }
      if (payload.kind === "slot-request" && roleRef.current === "host" && typeof payload.senderId === "string") {
        const senderId = payload.senderId;
        const currentPresence = channel.presenceState() as Record<string, Array<Presence>>;
        const occupants = new Set(Object.values(currentPresence).flat().filter(item => item.roomId === roomRef.current && item.player !== null).map(item => item.player as RemotePlayer));
        occupants.add(1);
        assignmentsRef.current.forEach(slot => occupants.add(slot));
        const existing = assignmentsRef.current.get(senderId);
        const available = Array.from({ length: Math.max(0, (settingsRef.current.mode === "ensemble" ? settingsRef.current.ensemblePlayers.length : 2) - 1) }, (_, index) => index + 2).find(slot => existing === slot || !occupants.has(slot as RemotePlayer));
        if (available && available <= 4) {
          assignmentsRef.current.set(senderId, available as RemotePlayer);
          void send({ kind: "assign", targetId: senderId, player: available });
        } else void send({ kind: "room-full", targetId: senderId });
        return;
      }
      if (payload.kind === "room-full" && payload.targetId === instanceRef.current) { setStatus(t("All player slots are filled. Ask the host to increase the player count or use another invite code.")); return; }
      if (payload.kind === "assign" && payload.targetId === instanceRef.current && Number.isInteger(payload.player) && Number(payload.player) >= 2 && Number(payload.player) <= 4) {
        playerRef.current = Number(payload.player) as RemotePlayer; setPlayer(playerRef.current); callbacks.current.onRoleChange(playerRef.current); void trackPresence(); return;
      }
      if (payload.kind === "ping" && (!payload.targetId || payload.targetId === instanceRef.current) && typeof payload.t0 === "number" && Number.isInteger(payload.sequence)) {
        const t1 = Date.now(), t2 = Date.now(); void send({ kind: "pong", targetId: payload.senderId, sequence: payload.sequence, t0: payload.t0, t1, t2 }); return;
      }
      if (payload.kind === "pong" && payload.targetId === instanceRef.current && Number.isInteger(payload.sequence) && typeof payload.t0 === "number" && typeof payload.t1 === "number" && typeof payload.t2 === "number") {
        const sequence = Number(payload.sequence), sentAt = pendingPings.current.get(sequence);
        if (sentAt === undefined || sentAt !== payload.t0) return;
        pendingPings.current.delete(sequence);
        const t3 = Date.now(), roundTrip = Math.max(0, (t3 - sentAt) - (payload.t2 - payload.t1));
        const jitter = smoothedRtt.current === null ? 0 : Math.abs(roundTrip - smoothedRtt.current);
        smoothedJitter.current = smoothedJitter.current === null ? jitter : smoothedJitter.current * 0.75 + jitter * 0.25;
        smoothedRtt.current = smoothedRtt.current === null ? roundTrip : smoothedRtt.current * 0.75 + roundTrip * 0.25;
        offsetRef.current = ((payload.t1 - sentAt) + (payload.t2 - t3)) / 2;
        setOffsetMs(Math.round(offsetRef.current)); setRoundTripMs(Math.round(smoothedRtt.current)); setJitterMs(Math.round(smoothedJitter.current)); return;
      }
      if (payload.kind === "start" && typeof payload.startAtHost === "number" && payload.settings && typeof payload.settings === "object") {
        preparedRef.current = false; setPrepared(false); void trackPresence();
        const requestedMode = (payload.settings as ImprovisationSettings).mode;
        const nextSettings = normalizeImprovisationSettings({ ...(payload.settings as ImprovisationSettings), mode: requestedMode === "ensemble" ? "ensemble" : "duet" });
        callbacks.current.onStart(nextSettings, payload.startAtHost - offsetRef.current); return;
      }
      if (payload.kind === "hit" && payload.hit && typeof payload.hit === "object") {
        const raw = payload.hit as Record<string, unknown>;
        if ((raw.instrument === "kick" || raw.instrument === "snare" || raw.instrument === "hihat" || raw.instrument === "tom" || raw.instrument === "crash") && typeof raw.atMs === "number" && Number.isFinite(raw.atMs) && raw.atMs >= 0 && [1, 2, 3, 4].includes(Number(raw.player))) {
          const articulation = ["closed-hat", "open-hat", "pedal-hat", "foot-splash", "ride", "crash", "rimshot"].includes(String(raw.articulation)) ? raw.articulation as MidiArticulation : undefined;
          if (callbacks.current.onPeerHit({ instrument: raw.instrument as Instrument, atMs: Number(raw.atMs), player: Number(raw.player) as RemotePlayer, ...(Number.isInteger(raw.velocity) && Number(raw.velocity) >= 1 && Number(raw.velocity) <= 127 ? { velocity: Number(raw.velocity) } : {}), ...(articulation ? { articulation } : {}) }, roomRef.current)) setLatePacketCount(count => count + 1);
        }
        return;
      }
      if (payload.kind === "control" && (payload.control === "pause" || payload.control === "stop")) {
        if (payload.control === "stop") { preparedRef.current = false; setPrepared(false); void trackPresence(); }
        callbacks.current.onControl(payload.control); return;
      }
      if (payload.kind === "resume" && typeof payload.startAtHost === "number") { callbacks.current.onControl("resume", payload.startAtHost - offsetRef.current); }
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error(t("Remote duet connection timed out. Check your connection and migration."))), 12000);
      channel.subscribe(state => {
        if (state === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") { clearTimeout(timeout); reject(new Error(t("Remote duet could not connect. Apply the Realtime room migration and try again."))); }
      });
    });
    setRoomId(nextRoom); setRole(nextRole); setConnected(true); setPrepared(false); setPeers([]); setPlayer(playerRef.current);
    callbacks.current.onRoleChange(playerRef.current);
    await trackPresence();
    if (nextRole === "guest") void send({ kind: "join" }); else sendPing();
    if (pingTimer.current) clearInterval(pingTimer.current);
    pingTimer.current = setInterval(sendPing, 1500);
  };

  useImperativeHandle(forwardedRef, () => ({
    sendHit: hit => { void send({ kind: "hit", hit }); },
    sendControl: control => { preparedRef.current = control === "pause" ? preparedRef.current : false; setPrepared(preparedRef.current); void trackPresence(); void send({ kind: "control", control }); },
    sendResume: () => { const startAtHost = Date.now() + (roleRef.current === "host" ? 0 : offsetRef.current) + 1500; void send({ kind: "resume", startAtHost }); },
  }));

  useEffect(() => () => {
    if (pingTimer.current) clearInterval(pingTimer.current);
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) void channel.untrack().catch(() => undefined).finally(() => clientRef.current?.removeChannel(channel));
  }, []);

  const createRoom = async () => {
    const id = crypto.randomUUID();
    try { await connectRoom(id, "host"); setCode(id); setStatus(t("Room created. Share the invite code with a member of the same cloud library.")); }
    catch (error) { setStatus(error instanceof Error ? error.message : t("Could not create a remote duet room.")); }
  };
  const joinRoom = async () => {
    const id = code.trim();
    try { await connectRoom(id, "guest"); setStatus(t("Joined room. Prepare your audio, then wait for the host.")); void send({ kind: "join" }); }
    catch (error) { setStatus(error instanceof Error ? error.message : t("Could not join that remote duet room.")); }
  };
  const prepare = async () => {
    setStatus(t("Loading drum sounds for the shared session…"));
    if (!await callbacks.current.onPrepare()) { setStatus(t("Could not prepare sound. Check audio playback and try again.")); return; }
    preparedRef.current = true; setPrepared(true); await trackPresence(); void send({ kind: "ready" });
    setStatus(t("Audio is ready. Waiting for the other player."));
  };
  const startTogether = async () => {
    const startAtHost = Date.now() + 1800;
    const payload = { kind: "start", settings: normalizeImprovisationSettings({ ...settings, mode: settings.mode === "ensemble" ? "ensemble" : "duet" }), startAtHost };
    if (!await send(payload)) return;
    preparedRef.current = false; setPrepared(false); void trackPresence();
    callbacks.current.onStart(payload.settings, startAtHost);
    setStatus(t("Starting both count-ins together."));
  };
  const leave = () => { void disconnect(t("Remote duet disconnected.")); };
  const copyCode = () => { void navigator.clipboard?.writeText(roomId).then(() => setStatus(t("Invite code copied."))).catch(() => setStatus(t("Copy the invite code shown below."))); };

    return <section className={styles.remoteDuet} aria-label={t(settings.mode === "ensemble" ? "Remote ensemble session" : "Remote duet session")}>
    <h3>{t(settings.mode === "ensemble" ? "Remote ensemble" : "Remote duet")}</h3>
    <p>{t("Each player needs an account with access to the same reviewed cloud library. Drum hits are sent live for playback and are not stored in the cloud.")}</p>
    {!connected ? <div className={styles.transport}>
      <button type="button" className="button-secondary" disabled={disabled} onClick={() => void createRoom()}>{t("Create invite code")}</button>
      <label>{t("Invite code")}<input value={code} maxLength={36} onChange={event => setCode(event.target.value)} /></label>
      <button type="button" className="button-secondary" disabled={disabled || !code.trim()} onClick={() => void joinRoom()}>{t(settings.mode === "ensemble" ? "Join remote ensemble" : "Join remote duet")}</button>
    </div> : <>
      <p><strong>{role === "host" ? t("Host · Player 1") : player ? t("Guest · Player {player}", { player }) : t("Guest · waiting for a slot")}</strong>{` · ${roomId}`}</p>
      <div className={styles.transport}>
        {role === "host" && <button type="button" className="button-secondary" onClick={copyCode}>{t("Copy invite code")}</button>}
        {!prepared && <button type="button" className="button-secondary" disabled={disabled} onClick={() => void prepare()}>{t(settings.mode === "ensemble" ? "Prepare ensemble audio" : "Prepare remote duet audio")}</button>}
        {role === "host" && <button type="button" className="button" disabled={disabled || !prepared || peers.length < (settings.mode === "ensemble" ? settings.ensemblePlayers.length - 1 : 1) || peers.filter(peer => peer.ready && peer.player !== null).length < (settings.mode === "ensemble" ? settings.ensemblePlayers.length - 1 : 1)} onClick={() => void startTogether()}>{t(settings.mode === "ensemble" ? "Start synchronized ensemble" : "Start synchronized duet")}</button>}
        <button type="button" className="button-secondary" disabled={disabled} onClick={leave}>{t(settings.mode === "ensemble" ? "Leave remote ensemble" : "Leave remote duet")}</button>
      </div>
      <ul aria-label={t("Room participants")}>{[{ instanceId: instanceRef.current, name: nameRef.current, player, ready: prepared }, ...peers].sort((a, b) => (a.player ?? 9) - (b.player ?? 9)).map(peer => <li key={peer.instanceId}>{peer.player ? `${t("Player {player}", { player: peer.player })} · ` : ""}{peer.name} · {peer.ready ? t("audio ready") : t("waiting for audio")}</li>)}</ul>
      <p role="status" aria-live="polite">{t("Players connected: {count} of {required}", { count: peers.length + 1, required: settings.mode === "ensemble" ? settings.ensemblePlayers.length : 2 })} · {t("Round-trip latency")}: {roundTripMs === null ? t("Measuring…") : `${roundTripMs} ms`} · {t("Jitter")}: {jitterMs === null ? "—" : `${jitterMs} ms`} · {t("Clock offset")}: {offsetMs} ms · {t("Late packets")}: {latePacketCount} · {t("Connection quality")}: {roundTripMs === null ? t("Measuring") : roundTripMs < 80 && (jitterMs ?? 0) < 25 ? t("Good") : roundTripMs < 180 && (jitterMs ?? 0) < 60 ? t("Fair") : t("Unstable")}</p>
      {role === "host" && peers.length < (settings.mode === "ensemble" ? settings.ensemblePlayers.length - 1 : 1) && <p>{t("Share the invite code with the other players in this reviewed cloud library. The host starts when each required player is connected and audio-ready.")}</p>}
    </>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
});
