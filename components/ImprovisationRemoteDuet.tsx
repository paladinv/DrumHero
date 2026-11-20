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
type RemoteHit = ImprovisationHit & { player: 1 | 2 };
type Control = "pause" | "stop" | "resume";
export type RemoteDuetHandle = {
  sendHit: (hit: RemoteHit) => void;
  sendControl: (control: "pause" | "stop") => void;
  sendResume: () => void;
};
type Props = {
  settings: ImprovisationSettings;
  disabled: boolean;
  onRoleChange: (player: 1 | 2 | null) => void;
  onPrepare: () => Promise<boolean>;
  onStart: (settings: ImprovisationSettings, localStartAtEpoch: number) => void;
  onPeerHit: (hit: RemoteHit, roomId: string) => boolean;
  onControl: (control: Control, localStartAtEpoch?: number) => void;
};
type Presence = { userId: string; instanceId: string; name: string; roomId: string; role: Role; ready: boolean };

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const ImprovisationRemoteDuet = forwardRef<RemoteDuetHandle, Props>(function ImprovisationRemoteDuet({ settings, disabled, onRoleChange, onPrepare, onStart, onPeerHit, onControl }, forwardedRef) {
  const { t } = useLocalization();
  const [code, setCode] = useState(""), [roomId, setRoomId] = useState(""), [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState("Remote duet uses a private room shared with members of the same reviewed cloud library.");
  const [connected, setConnected] = useState(false), [peerConnected, setPeerConnected] = useState(false), [prepared, setPrepared] = useState(false), [peerReady, setPeerReady] = useState(false), [offsetMs, setOffsetMs] = useState(0), [roundTripMs, setRoundTripMs] = useState<number | null>(null), [jitterMs, setJitterMs] = useState<number | null>(null), [latePacketCount, setLatePacketCount] = useState(0);
  const channelRef = useRef<Channel | null>(null), clientRef = useRef<NonNullable<ReturnType<typeof getSongCloudClient>> | null>(null);
  const roomRef = useRef(""), roleRef = useRef<Role | null>(null), instanceRef = useRef(crypto.randomUUID()), accountRef = useRef(""), nameRef = useRef("Drummer");
  const offsetRef = useRef(0), preparedRef = useRef(false), pingTimer = useRef<ReturnType<typeof setInterval> | null>(null), peerIdRef = useRef(""), pingSequence = useRef(0), pendingPings = useRef(new Map<number, number>()), smoothedRtt = useRef<number | null>(null), smoothedJitter = useRef<number | null>(null);
  const callbacks = useRef({ onRoleChange, onPrepare, onStart, onPeerHit, onControl });
  callbacks.current = { onRoleChange, onPrepare, onStart, onPeerHit, onControl };

  const trackPresence = async () => {
    const channel = channelRef.current, roleNow = roleRef.current, roomNow = roomRef.current;
    if (!channel || !roleNow || !roomNow) return;
    const result = await channel.track({ userId: accountRef.current, instanceId: instanceRef.current, name: nameRef.current, roomId: roomNow, role: roleNow, ready: preparedRef.current } satisfies Presence);
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
    const sequence = ++pingSequence.current, t0 = Date.now();
    pendingPings.current.set(sequence, t0);
    for (const [key, sentAt] of pendingPings.current) if (Date.now() - sentAt > 10000) pendingPings.current.delete(key);
    void send({ kind: "ping", sequence, t0 });
  };

  const disconnect = async (notice?: string) => {
    if (pingTimer.current) clearInterval(pingTimer.current); pingTimer.current = null;
    const channel = channelRef.current; channelRef.current = null;
    if (channel) {
      await channel.untrack().catch(() => undefined);
      await clientRef.current?.removeChannel(channel);
    }
    roomRef.current = ""; roleRef.current = null; preparedRef.current = false; peerIdRef.current = ""; offsetRef.current = 0; pendingPings.current.clear(); smoothedRtt.current = null; smoothedJitter.current = null;
    setRoomId(""); setRole(null); setConnected(false); setPeerConnected(false); setPrepared(false); setPeerReady(false); setOffsetMs(0); setRoundTripMs(null); setJitterMs(null); setLatePacketCount(0);
    callbacks.current.onRoleChange(null);
    if (notice) setStatus(notice);
  };

  const connectRoom = async (nextRoom: string, nextRole: Role) => {
    if (!isUuid(nextRoom)) throw new Error(t("Enter a valid remote duet invite code."));
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
    channelRef.current = channel; clientRef.current = client; roomRef.current = nextRoom; roleRef.current = nextRole;
    channel.on("presence", { event: "sync" }, () => {
      const presence = channel.presenceState() as Record<string, Array<Presence>>;
      const peers = Object.values(presence).flat().filter(item => item.roomId === roomRef.current && item.instanceId !== instanceRef.current);
      const peer = peers[0]; peerIdRef.current = peer?.instanceId ?? "";
      setPeerConnected(Boolean(peer)); setPeerReady(Boolean(peer?.ready));
      if (peer) setStatus(t("Connected with {name}. Estimated clock difference: {offset} ms.", { name: peer.name, offset: Math.round(offsetRef.current) }));
      else setStatus(nextRole === "host" ? t("Room ready. Share the invite code with one member of this cloud library.") : t("Joined room. Waiting for the host to connect."));
    });
    channel.on("broadcast", { event: "duet" }, message => {
      const payload = message.payload as Record<string, unknown> | undefined;
      if (!payload || payload.roomId !== roomRef.current || payload.senderId === instanceRef.current) return;
      if (payload.kind === "join" || payload.kind === "ready") { void trackPresence(); return; }
      if (payload.kind === "ping" && typeof payload.t0 === "number" && Number.isInteger(payload.sequence)) {
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
        const nextSettings = normalizeImprovisationSettings({ ...(payload.settings as ImprovisationSettings), mode: "duet" });
        callbacks.current.onStart(nextSettings, payload.startAtHost - offsetRef.current); return;
      }
      if (payload.kind === "hit" && payload.hit && typeof payload.hit === "object") {
        const raw = payload.hit as Record<string, unknown>;
        if ((raw.instrument === "kick" || raw.instrument === "snare" || raw.instrument === "hihat" || raw.instrument === "tom" || raw.instrument === "crash") && typeof raw.atMs === "number" && Number.isFinite(raw.atMs) && raw.atMs >= 0 && (raw.player === 1 || raw.player === 2)) {
          const articulation = ["closed-hat", "open-hat", "pedal-hat", "foot-splash", "ride", "crash", "rimshot"].includes(String(raw.articulation)) ? raw.articulation as MidiArticulation : undefined;
          if (callbacks.current.onPeerHit({ instrument: raw.instrument as Instrument, atMs: Number(raw.atMs), player: raw.player, ...(Number.isInteger(raw.velocity) && Number(raw.velocity) >= 1 && Number(raw.velocity) <= 127 ? { velocity: Number(raw.velocity) } : {}), ...(articulation ? { articulation } : {}) }, roomRef.current)) setLatePacketCount(count => count + 1);
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
    setRoomId(nextRoom); setRole(nextRole); setConnected(true); setPrepared(false); setPeerConnected(false); setPeerReady(false);
    callbacks.current.onRoleChange(nextRole === "host" ? 1 : 2);
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
    const payload = { kind: "start", settings: normalizeImprovisationSettings({ ...settings, mode: "duet" }), startAtHost };
    if (!await send(payload)) return;
    preparedRef.current = false; setPrepared(false); void trackPresence();
    callbacks.current.onStart(payload.settings, startAtHost);
    setStatus(t("Starting both count-ins together."));
  };
  const leave = () => { void disconnect(t("Remote duet disconnected.")); };
  const copyCode = () => { void navigator.clipboard?.writeText(roomId).then(() => setStatus(t("Invite code copied."))).catch(() => setStatus(t("Copy the invite code shown below."))); };

  return <section className={styles.remoteDuet} aria-label={t("Remote duet session")}>
    <h3>{t("Remote duet")}</h3>
    <p>{t("Both players need an account with access to the same reviewed cloud library. Drum hits are sent live for playback and are not stored in the cloud.")}</p>
    {!connected ? <div className={styles.transport}>
      <button type="button" className="button-secondary" disabled={disabled} onClick={() => void createRoom()}>{t("Create invite code")}</button>
      <label>{t("Invite code")}<input value={code} maxLength={36} onChange={event => setCode(event.target.value)} /></label>
      <button type="button" className="button-secondary" disabled={disabled || !code.trim()} onClick={() => void joinRoom()}>{t("Join remote duet")}</button>
    </div> : <>
      <p><strong>{t(role === "host" ? "Host · Player 1" : "Guest · Player 2")}</strong>{` · ${roomId}`}</p>
      <div className={styles.transport}>
        {role === "host" && <button type="button" className="button-secondary" onClick={copyCode}>{t("Copy invite code")}</button>}
        {!prepared && <button type="button" className="button-secondary" disabled={disabled} onClick={() => void prepare()}>{t("Prepare remote duet audio")}</button>}
        {role === "host" && <button type="button" className="button" disabled={disabled || !prepared || !peerConnected || !peerReady} onClick={() => void startTogether()}>{t("Start synchronized duet")}</button>}
        <button type="button" className="button-secondary" disabled={disabled} onClick={leave}>{t("Leave remote duet")}</button>
      </div>
      <p role="status" aria-live="polite">{t("Other player: {connected} · audio ready: {ready}", { connected: peerConnected ? t("connected") : t("waiting"), ready: peerReady ? t("yes") : t("no") })} · {t("Round-trip latency")}: {roundTripMs === null ? t("Measuring…") : `${roundTripMs} ms`} · {t("Jitter")}: {jitterMs === null ? "—" : `${jitterMs} ms`} · {t("Clock offset")}: {offsetMs} ms · {t("Late packets")}: {latePacketCount} · {t("Connection quality")}: {roundTripMs === null ? t("Measuring") : roundTripMs < 80 && (jitterMs ?? 0) < 25 ? t("Good") : roundTripMs < 180 && (jitterMs ?? 0) < 60 ? t("Fair") : t("Unstable")}</p>
      {!peerConnected && <p>{t("Ask the other player to join this code from the same reviewed cloud library.")}</p>}
    </>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
});
