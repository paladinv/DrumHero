"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { Instrument, PracticePattern, RatedHit } from "@/lib/types";
import type { TrainerRound } from "@/lib/trainer";
import { getSongCloudClient, readSongCloudCheckpoint } from "@/lib/song-cloud";

type Role = "host" | "guest";
type Channel = NonNullable<ReturnType<NonNullable<ReturnType<typeof getSongCloudClient>>["channel"]>>;
type Turn = { index: number; role: Role; patternId: string; startAtHost: number };
type Plan = { id: string; bpm: number; callPatternId: string; responsePatternId: string; turns: Turn[] };
type Presence = { instanceId: string; role: Role; name: string; ready: boolean };
type DuetScore = { planId: string; turnIndex: number; role: Role; player: string; pattern: string; bpm: number; accuracy: number | null; score: number | null; clipped: boolean; uncertain: number };

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const nowEpoch = () => Date.now();

function patternSignature(pattern: PracticePattern) {
  return JSON.stringify(pattern);
}

function readPlan(value: unknown, patterns: PracticePattern[]): Plan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Plan>;
  if (typeof raw.id !== "string" || !isUuid(raw.id) || !Number.isInteger(raw.bpm) || raw.bpm! < 40 || raw.bpm! > 220 ||
      typeof raw.callPatternId !== "string" || typeof raw.responsePatternId !== "string" || raw.callPatternId === raw.responsePatternId ||
      !Array.isArray(raw.turns) || raw.turns.length < 2 || raw.turns.length > 8 || raw.turns.length % 2 !== 0) return null;
  const turns: Turn[] = [];
  for (let index = 0; index < raw.turns.length; index += 1) {
    const turn = raw.turns[index] as Partial<Turn>;
    const expectedRole: Role = index % 2 === 0 ? "host" : "guest";
    const expectedPattern = expectedRole === "host" ? raw.callPatternId : raw.responsePatternId;
    if (!turn || turn.index !== index || turn.role !== expectedRole || turn.patternId !== expectedPattern || !Number.isFinite(turn.startAtHost) || turn.startAtHost! < nowEpoch() - 24 * 60 * 60_000 || turn.startAtHost! > nowEpoch() + 24 * 60 * 60_000) return null;
    const pattern = patterns.find(item => item.id === turn.patternId);
    if (!pattern) return null;
    const previous = turns.at(-1);
    if (previous) {
      const previousPattern = patterns.find(item => item.id === previous.patternId);
      if (!previousPattern || turn.startAtHost! < previous.startAtHost + previousPattern.beats * 4 * 60000 / raw.bpm! + 4 * 60000 / raw.bpm! + 500) return null;
    }
    turns.push({ index, role: turn.role, patternId: turn.patternId, startAtHost: turn.startAtHost! });
  }
  return { id: raw.id, bpm: raw.bpm!, callPatternId: raw.callPatternId, responsePatternId: raw.responsePatternId, turns };
}

export function TrainerRemoteDuet({ patterns, selectedPatternId, bpm, round, liveHits, disabled, onPrepareAudio, onPrepareTurn, onStartAt, onStop, onRemoteHit }: {
  patterns: PracticePattern[];
  selectedPatternId: string;
  bpm: number;
  round: TrainerRound | null;
  liveHits: RatedHit[];
  disabled: boolean;
  onPrepareAudio: () => Promise<boolean>;
  onPrepareTurn: (pattern: PracticePattern, bpm: number) => Promise<boolean>;
  onStartAt: (localFirstBeatEpoch: number) => void;
  onStop: () => void;
  onRemoteHit: (instrument: Instrument) => void;
}) {
  const [inviteCode, setInviteCode] = useState("");
  const [roomId, setRoomId] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("Player A");
  const [callPatternId, setCallPatternId] = useState(selectedPatternId);
  const [responsePatternId, setResponsePatternId] = useState(patterns.find(item => item.id !== selectedPatternId)?.id ?? selectedPatternId);
  const [cycles, setCycles] = useState(2);
  const [connected, setConnected] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [peerRole, setPeerRole] = useState<Role | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [peerReady, setPeerReady] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [reportPlan, setReportPlan] = useState<Plan | null>(null);
  const [activeTurn, setActiveTurn] = useState<Turn | null>(null);
  const [scores, setScores] = useState<DuetScore[]>([]);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [status, setStatus] = useState("Pair two Trainer devices in the same reviewed cloud library for synchronized scored call-and-response.");
  const channelRef = useRef<Channel | null>(null);
  const clientRef = useRef<NonNullable<ReturnType<typeof getSongCloudClient>> | null>(null);
  const instanceRef = useRef(crypto.randomUUID());
  const roleRef = useRef<Role | null>(null);
  const roomRef = useRef("");
  const libraryRef = useRef("");
  const offsetRef = useRef(0);
  const clockSamplesRef = useRef(0);
  const nameRef = useRef(name);
  const patternsRef = useRef(patterns);
  const callbacksRef = useRef({ onPrepareAudio, onPrepareTurn, onStartAt, onStop, onRemoteHit });
  const readyRef = useRef(false);
  const peerIdRef = useRef("");
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const scheduledTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reportedRoundIds = useRef(new Set<string>());
  const sentHitKeys = useRef(new Set<string>());
  const receivedHitKeys = useRef(new Set<string>());
  const activeTurnRef = useRef<Turn | null>(null);
  const scoresRef = useRef(scores);
  const planRef = useRef(plan);

  useEffect(() => {
    patternsRef.current = patterns;
    callbacksRef.current = { onPrepareAudio, onPrepareTurn, onStartAt, onStop, onRemoteHit };
    scoresRef.current = scores;
    planRef.current = plan;
    nameRef.current = name;
  }, [name, onPrepareAudio, onPrepareTurn, onStartAt, onStop, onRemoteHit, patterns, plan, scores]);

  const send = async (payload: Record<string, unknown>) => {
    const channel = channelRef.current, room = roomRef.current;
    if (!channel || !room) return false;
    try {
      const result = await channel.send({ type: "broadcast", event: "trainer-duet", payload: { ...payload, roomId: room, senderId: instanceRef.current } });
      if (result !== "ok") {
        setStatus("Could not send the Trainer duet update. The synchronized session stopped; check the connection and Realtime migration.");
        if (planRef.current) {
          scheduledTimers.current.forEach(clearTimeout); scheduledTimers.current = [];
          setPlan(null); planRef.current = null; setActiveTurn(null); activeTurnRef.current = null; callbacksRef.current.onStop();
        }
        return false;
      }
      return true;
    } catch {
      setStatus("The remote Trainer duet lost its cloud connection. The synchronized session stopped.");
      if (planRef.current) {
        scheduledTimers.current.forEach(clearTimeout); scheduledTimers.current = [];
        setPlan(null); planRef.current = null; setActiveTurn(null); activeTurnRef.current = null; callbacksRef.current.onStop();
      }
      return false;
    }
  };
  const publishHit = useEffectEvent((payload: Record<string, unknown>) => send(payload));

  const trackPresence = async () => {
    const channel = channelRef.current, currentRole = roleRef.current, currentRoom = roomRef.current;
    if (!channel || !currentRole || !currentRoom) return;
    const result = await channel.track({ instanceId: instanceRef.current, role: currentRole, name: nameRef.current.slice(0, 40), ready: readyRef.current } satisfies Presence);
    if (result !== "ok") setStatus("Could not update room presence. Reconnect and try again.");
    else void send({ kind: "ping", t0: nowEpoch() });
  };

  const clearSchedule = () => { scheduledTimers.current.forEach(clearTimeout); scheduledTimers.current = []; };

  const handleChannelFailure = (channel: Channel) => {
    if (channelRef.current !== channel) return;
    channelRef.current = null;
    if (pingTimer.current) clearInterval(pingTimer.current);
    pingTimer.current = null;
    roomRef.current = ""; roleRef.current = null; offsetRef.current = 0; clockSamplesRef.current = 0; readyRef.current = false; peerIdRef.current = "";
    clearSchedule(); setPlan(null); planRef.current = null; setActiveTurn(null); activeTurnRef.current = null;
    setRoomId(""); setRole(null); setConnected(false); setPeerConnected(false); setPeerRole(null); setLocalReady(false); setPeerReady(false); setClockOffsetMs(0);
    callbacksRef.current.onStop(); setStatus("The private Trainer room connection was lost. The session stopped; reconnect before starting again.");
    void channel.untrack().catch(() => undefined).finally(() => clientRef.current?.removeChannel(channel));
  };

  const disconnect = async (notice?: string) => {
    clearSchedule();
    if (pingTimer.current) clearInterval(pingTimer.current);
    pingTimer.current = null;
    const channel = channelRef.current; channelRef.current = null;
    if (channel) { await channel.untrack().catch(() => undefined); await clientRef.current?.removeChannel(channel); }
    roomRef.current = ""; roleRef.current = null; offsetRef.current = 0; clockSamplesRef.current = 0; readyRef.current = false; peerIdRef.current = "";
    setRoomId(""); setRole(null); setConnected(false); setPeerConnected(false); setPeerRole(null); setLocalReady(false); setPeerReady(false); setPlan(null); planRef.current = null; setActiveTurn(null); setClockOffsetMs(0);
    activeTurnRef.current = null; callbacksRef.current.onStop();
    if (notice) setStatus(notice);
  };

  const connectRoom = async (nextRoom: string, nextRole: Role) => {
    if (!isUuid(nextRoom)) throw new Error("Enter a valid Trainer room invite code.");
    await disconnect();
    const client = getSongCloudClient(), checkpoint = readSongCloudCheckpoint();
    if (!client || !checkpoint) throw new Error("Open Song Builder cloud sharing and review a shared library on this device first.");
    const { data: sessionData } = await client.auth.getSession(), user = sessionData.session?.user;
    if (!user || user.id !== checkpoint.accountId) throw new Error("Sign in and review the same shared cloud library on this device first.");
    const { data: libraryRole, error: roleError } = await client.rpc("drum_library_role", { p_library_id: checkpoint.libraryId });
    if (roleError || !libraryRole) throw new Error("This account no longer has access to the reviewed cloud library.");
    libraryRef.current = checkpoint.libraryId;
    const topic = `drum-trainer:${checkpoint.libraryId}:${nextRoom}`;
    const channel = client.channel(topic, { config: { private: true, presence: { key: instanceRef.current }, broadcast: { ack: true, self: false } } });
    channelRef.current = channel; clientRef.current = client; roomRef.current = nextRoom; roleRef.current = nextRole;
    channel.on("presence", { event: "sync" }, () => {
      const presence = channel.presenceState() as Record<string, Array<Presence>>;
      const peers = Object.values(presence).flat().filter(item => item.instanceId !== instanceRef.current);
      const peer = peers.length === 1 && peers[0]?.role !== nextRole ? peers[0] : undefined;
      peerIdRef.current = peer?.instanceId ?? "";
      setPeerConnected(Boolean(peer)); setPeerRole(peer?.role ?? null); setPeerReady(Boolean(peer?.ready));
      if (!peer) setStatus(peers.length > 1 || peers.some(item => item.role === nextRole)
        ? "This duet room needs exactly one host and one guest. Ask extra devices to leave, then reconnect."
        : nextRole === "host" ? "Room is ready. Share the invite code with one member of the same reviewed library." : "Joined room. Waiting for the host to connect.");
      else setStatus(`Connected with ${peer.name || "the other player"}. Clock offset estimate: ${Math.round(offsetRef.current)} ms.`);
    });
    channel.on("broadcast", { event: "trainer-duet" }, message => {
      const payload = message.payload as Record<string, unknown> | undefined;
      if (!payload || payload.roomId !== roomRef.current || payload.senderId === instanceRef.current) return;
      if (payload.kind === "join" || payload.kind === "ready") { void trackPresence(); return; }
      if (payload.kind === "ping" && typeof payload.t0 === "number") {
        const t1 = nowEpoch(), t2 = nowEpoch(); void send({ kind: "pong", targetId: payload.senderId, t0: payload.t0, t1, t2 }); return;
      }
      if (payload.kind === "pong" && payload.targetId === instanceRef.current && typeof payload.t0 === "number" && typeof payload.t1 === "number" && typeof payload.t2 === "number") {
        const t3 = nowEpoch(); offsetRef.current = ((payload.t1 - payload.t0) + (payload.t2 - t3)) / 2; clockSamplesRef.current += 1; setClockOffsetMs(Math.round(offsetRef.current)); return;
      }
      if (payload.kind === "plan" && payload.senderId === peerIdRef.current && payload.plan && roleRef.current === "guest") {
        const next = readPlan(payload.plan, patternsRef.current);
        if (!next || next.callPatternId === next.responsePatternId) { setStatus("The other player sent a plan with patterns this device does not have or used the same call and response. Choose two distinct matching patterns."); return; }
        const signatures = payload.signatures as Record<string, unknown> | undefined;
        const matches = next.turns.every(turn => {
          const local = patternsRef.current.find(item => item.id === turn.patternId);
          return Boolean(local && signatures?.[turn.patternId] === patternSignature(local));
        });
        if (!matches) { setStatus("The Trainer pattern versions differ between devices. Update or choose matching patterns, then create a new room."); return; }
        clearSchedule(); setPlan(next); planRef.current = next; setReportPlan(next); setScores([]); setActiveTurn(null); activeTurnRef.current = null; reportedRoundIds.current.clear(); sentHitKeys.current.clear(); receivedHitKeys.current.clear();
        setStatus("Synchronized plan received. Both players will see the score; only the player assigned to each turn is scored.");
        void (async () => {
          if (!clockSamplesRef.current) {
            const deadline = nowEpoch() + 2500;
            void send({ kind: "ping", t0: nowEpoch() });
            while (!clockSamplesRef.current && nowEpoch() < deadline) await new Promise(resolve => window.setTimeout(resolve, 100));
          }
          if (!clockSamplesRef.current) {
            clearSchedule(); setPlan(null); planRef.current = null; setActiveTurn(null); activeTurnRef.current = null; setStatus("Clock sync did not respond. Check the connection, then ask the host to start a new duet.");
            void send({ kind: "cancel", planId: next.id });
            return;
          }
          schedulePlan(next, roleRef.current!, offsetRef.current);
        })();
        return;
      }
      if (payload.kind === "hit" && typeof payload.planId === "string" && Number.isInteger(payload.turnIndex) && Number.isInteger(payload.hitIndex) && payload.hit && typeof payload.hit === "object") {
        const hit = payload.hit as Record<string, unknown>, key = `${payload.planId}:${payload.turnIndex}:${payload.hitIndex}`;
        const instrument = hit.instrument;
        const turn = planRef.current?.turns[Number(payload.turnIndex)];
        if (payload.senderId === peerIdRef.current && planRef.current?.id === payload.planId && turn && turn.role !== roleRef.current && activeTurnRef.current?.index === turn.index && !receivedHitKeys.current.has(key) &&
            (instrument === "kick" || instrument === "snare" || instrument === "hihat" || instrument === "tom" || instrument === "crash") && Number.isFinite(hit.atMs) && Number(hit.atMs) >= 0 && Number(hit.atMs) < 600_000) {
          receivedHitKeys.current.add(key);
          callbacksRef.current.onRemoteHit(instrument);
        }
        return;
      }
      if (payload.kind === "score" && payload.senderId === peerIdRef.current && payload.score && typeof payload.score === "object") {
        const score = payload.score as DuetScore;
        if (typeof score.planId === "string" && Number.isInteger(score.turnIndex) && (score.role === "host" || score.role === "guest") && score.role !== roleRef.current && typeof score.player === "string" && score.player.length <= 40 && typeof score.pattern === "string" && score.pattern.length <= 160 && (score.accuracy === null || (Number.isFinite(score.accuracy) && score.accuracy >= 0 && score.accuracy <= 100)) && (score.score === null || (Number.isFinite(score.score) && score.score >= 0 && score.score <= 100)) && typeof score.clipped === "boolean" && Number.isInteger(score.uncertain) && score.uncertain >= 0 && score.uncertain <= 10000 && planRef.current?.id === score.planId && planRef.current.turns[score.turnIndex]?.role === score.role) {
          setScores(previous => previous.some(item => item.planId === score.planId && item.turnIndex === score.turnIndex && item.role === score.role) ? previous : [...previous, score]);
        }
        return;
      }
      if (payload.kind === "cancel" && payload.senderId === peerIdRef.current && typeof payload.planId === "string" && payload.planId === planRef.current?.id) {
        clearSchedule(); setPlan(null); planRef.current = null; setActiveTurn(null); activeTurnRef.current = null; callbacksRef.current.onStop(); setStatus("The other player ended the synchronized session.");
      }
    });
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        handleChannelFailure(channel);
        reject(new Error("Trainer room connection timed out. Check your connection and Realtime migration."));
      }, 12000);
      channel.subscribe(state => {
        if (state === "SUBSCRIBED") { clearTimeout(timeout); resolve(); }
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          clearTimeout(timeout); handleChannelFailure(channel);
          reject(new Error("Trainer room could not connect. Apply the private Realtime migration and try again."));
        }
      });
    });
    setRoomId(nextRoom); setRole(nextRole); setConnected(true); setLocalReady(false); setPeerConnected(false); setPeerReady(false);
    await trackPresence(); void send({ kind: nextRole === "guest" ? "join" : "ping", t0: nowEpoch() });
    if (pingTimer.current) clearInterval(pingTimer.current);
    pingTimer.current = setInterval(() => void send({ kind: "ping", t0: nowEpoch() }), 1500);
  };

  const abortPlan = (target: Plan, message: string) => {
    void send({ kind: "cancel", planId: target.id });
    clearSchedule(); setPlan(null); planRef.current = null; setActiveTurn(null); activeTurnRef.current = null;
    callbacksRef.current.onStop(); setStatus(message);
  };

  const schedulePlan = (next: Plan, localRole: Role, offset: number) => {
    clearSchedule();
    const countInMs = 4 * 60000 / next.bpm;
    for (const turn of next.turns) {
      const pattern = patternsRef.current.find(item => item.id === turn.patternId);
      if (!pattern) continue;
      const localStartAt = turn.startAtHost - (localRole === "host" ? 0 : offset);
      const prepareAt = localStartAt - countInMs - 1000;
      const timer = window.setTimeout(() => {
        void (async () => {
          if (nowEpoch() > localStartAt - countInMs + 500) { abortPlan(next, "This device missed a synchronized handoff. The duet stopped; start a fresh plan."); return; }
          setActiveTurn(turn); activeTurnRef.current = turn;
          const prepared = await callbacksRef.current.onPrepareTurn(pattern, next.bpm);
          if (!prepared) { abortPlan(next, "Could not prepare the scheduled pattern. The synchronized session has stopped."); return; }
          if (turn.role === localRole) {
            setStatus(`Your ${turn.role === "host" ? "call" : "response"} · ${pattern.name}. Count-in is synchronized with the other player.`);
            callbacksRef.current.onStartAt(localStartAt);
          } else setStatus(`Listen to ${turn.role === "host" ? "Player A’s call" : "Player B’s response"} · ${pattern.name}.`);
        })();
      }, Math.max(0, prepareAt - nowEpoch()));
      scheduledTimers.current.push(timer);
    }
    const last = next.turns.at(-1);
    const lastPattern = last ? patternsRef.current.find(item => item.id === last.patternId) : undefined;
    if (last && lastPattern) {
      const endAt = last.startAtHost + lastPattern.beats * 4 * 60000 / next.bpm;
      const timer = window.setTimeout(() => { setActiveTurn(null); activeTurnRef.current = null; callbacksRef.current.onStop(); setStatus("Synchronized duet complete. Review both players’ round scores below."); }, Math.max(0, endAt - (localRole === "host" ? 0 : offset) - nowEpoch() + 1500));
      scheduledTimers.current.push(timer);
    }
  };

  const createPlan = async () => {
    const call = patterns.find(item => item.id === callPatternId), response = patterns.find(item => item.id === responsePatternId);
    if (!call || !response || call.id === response.id || role !== "host" || peerRole !== "guest" || !peerConnected || !peerReady || !localReady) return;
    const minimum = Math.max(call.tempoRange[0], response.tempoRange[0]), maximum = Math.min(call.tempoRange[1], response.tempoRange[1]);
    if (minimum > maximum) { setStatus("These patterns have no shared playable tempo. Choose another response pattern."); return; }
    const sharedBpm = Math.max(minimum, Math.min(maximum, Math.round(bpm)));
    const firstStart = nowEpoch() + 12000;
    const turns: Turn[] = [];
    let cursor = firstStart;
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const callTurn = { index: turns.length, role: "host" as const, patternId: call.id, startAtHost: cursor };
      turns.push(callTurn);
      cursor += call.beats * 4 * 60000 / sharedBpm + 4 * 60000 / sharedBpm + 1500;
      const responseTurn = { index: turns.length, role: "guest" as const, patternId: response.id, startAtHost: cursor };
      turns.push(responseTurn);
      cursor += response.beats * 4 * 60000 / sharedBpm + 4 * 60000 / sharedBpm + 1500;
    }
    const next: Plan = { id: crypto.randomUUID(), bpm: sharedBpm, callPatternId: call.id, responsePatternId: response.id, turns };
    const signatures: Record<string, string> = { [call.id]: patternSignature(call), [response.id]: patternSignature(response) };
    if (!await send({ kind: "plan", plan: next, signatures })) return;
    setPlan(next); planRef.current = next; setReportPlan(next); setScores([]); setActiveTurn(null); activeTurnRef.current = null; reportedRoundIds.current.clear(); sentHitKeys.current.clear(); receivedHitKeys.current.clear();
    setStatus("Plan shared. The first synchronized count-in begins shortly.");
    schedulePlan(next, "host", 0);
  };

  const prepare = async () => {
    const success = await callbacksRef.current.onPrepareAudio();
    if (!success) { setStatus("Audio is not ready yet. Load Trainer sounds and try again."); return; }
    readyRef.current = true; setLocalReady(true); await trackPresence(); void send({ kind: "ready" });
    setStatus("Audio is ready. Wait for the other player; the host starts the synchronized plan.");
  };

  const stopPlan = async (broadcast = true) => {
    if (broadcast && plan) void send({ kind: "cancel", planId: plan.id });
    clearSchedule(); setPlan(null); planRef.current = null; setActiveTurn(null); activeTurnRef.current = null; reportedRoundIds.current.clear(); sentHitKeys.current.clear(); receivedHitKeys.current.clear(); callbacksRef.current.onStop();
    if (connected) setStatus("Synchronized session stopped.");
  };

  useEffect(() => {
    if (!plan || !activeTurn || activeTurn.role !== role || !round || round.mode !== "scored" || round.patternId !== activeTurn.patternId || reportedRoundIds.current.has(round.id)) return;
    const score: DuetScore = {
      planId: plan.id, turnIndex: activeTurn.index, role: role!, player: nameRef.current.trim().slice(0, 40) || (role === "host" ? "Player A" : "Player B"),
      pattern: round.patternName, bpm: round.bpm, accuracy: round.result?.accuracy ?? null, score: round.result?.score ?? null,
      clipped: Boolean(round.inputClipped), uncertain: round.uncertainDetections ?? 0,
    };
    reportedRoundIds.current.add(round.id);
    setScores(previous => previous.some(item => item.planId === plan.id && item.turnIndex === activeTurn.index) ? previous : [...previous, score]);
    void send({ kind: "score", score });
  }, [activeTurn, plan, role, round]);

  useEffect(() => {
    if (!plan || !activeTurn || activeTurn.role !== role) return;
    liveHits.forEach((hit, hitIndex) => {
      const key = `${plan.id}:${activeTurn.index}:${hitIndex}`;
      if (hit.rating === "miss" || sentHitKeys.current.has(key) || !Number.isFinite(hit.atMs) || Number(hit.atMs) < 0) return;
      sentHitKeys.current.add(key);
      void publishHit({ kind: "hit", planId: plan.id, turnIndex: activeTurn.index, hitIndex,
        hit: { instrument: hit.instrument, atMs: hit.atMs, ...(Number.isInteger(hit.velocity) ? { velocity: hit.velocity } : {}) } });
    });
  }, [activeTurn, liveHits, plan, role]);

  useEffect(() => () => {
    clearSchedule();
    if (pingTimer.current) clearInterval(pingTimer.current);
    const channel = channelRef.current; channelRef.current = null;
    if (channel) void channel.untrack().catch(() => undefined).finally(() => clientRef.current?.removeChannel(channel));
  }, []);

  const copyCode = () => { void navigator.clipboard?.writeText(roomId).then(() => setStatus("Invite code copied.")).catch(() => setStatus("Copy the invite code shown above.")); };
  const exportReport = () => {
    if (!reportPlan) return;
    const rows = [...scoresRef.current].filter(item => item.planId === reportPlan.id).sort((a, b) => a.turnIndex - b.turnIndex);
    const report = { format: "drum-hero-trainer-remote-duet", version: 1, callPattern: patterns.find(item => item.id === reportPlan.callPatternId)?.name ?? "Call pattern", responsePattern: patterns.find(item => item.id === reportPlan.responsePatternId)?.name ?? "Response pattern", bpm: reportPlan.bpm, results: rows, privacy: "Contains optional player labels and score summaries only; no audio, device IDs, cloud account IDs, or learner profile IDs." };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "drum-hero-remote-duet.json"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const reportRows = reportPlan ? scores.filter(item => item.planId === reportPlan.id).sort((a, b) => a.turnIndex - b.turnIndex) : [];
  const reportSection = reportPlan && reportRows.length > 0 ? <section className="trainer-remote-duet-results"><h4>Shared results</h4><ol>{reportRows.map(item => <li key={`${item.planId}-${item.turnIndex}-${item.role}`}><strong>{item.player} · {item.role === "host" ? "Call" : "Response"}</strong><span>{item.pattern} · {item.accuracy === null || item.clipped || item.uncertain ? "Check input quality" : `${item.accuracy}%`} · {item.bpm} BPM</span></li>)}</ol><button type="button" className="button-secondary" onClick={exportReport}>Download duet report</button></section> : null;

  return <section className="trainer-remote-duet" aria-label="Synchronized remote Trainer duet">
    <h3>Synchronized remote duet</h3>
    <p>Each player scores their own call or response on a separate device. The room synchronizes count-ins and handoffs and broadcasts drum note events for local sample playback. Microphone audio and recordings are never sent. Both devices need matching patterns and access to one reviewed cloud library.</p>
    {!connected ? <><div className="transport">
      <label>Player label<input maxLength={40} value={name} onChange={event => setName(event.target.value)} /><small>Use a nickname; avoid contact or identifying details.</small></label>
      <button type="button" className="button-secondary" disabled={disabled} onClick={() => { const id = crypto.randomUUID(); void connectRoom(id, "host").then(() => { setInviteCode(id); setName("Player A"); }).catch(error => setStatus(error instanceof Error ? error.message : "Could not create a Trainer duet room.")); }}>Create room</button>
      <label>Invite code<input maxLength={36} value={inviteCode} onChange={event => setInviteCode(event.target.value)} /></label>
      <button type="button" className="button-secondary" disabled={disabled || !inviteCode.trim()} onClick={() => { nameRef.current = "Player B"; setName("Player B"); void connectRoom(inviteCode.trim(), "guest").catch(error => setStatus(error instanceof Error ? error.message : "Could not join the Trainer duet room.")); }}>Join room</button>
    </div>{reportSection}</> : <>
      <p><strong>{role === "host" ? "Host · Player A" : "Guest · Player B"}</strong> · room {roomId}</p>
      <div className="transport">
        {role === "host" && <button type="button" className="button-secondary" onClick={copyCode}>Copy invite code</button>}
        {!localReady && <button type="button" className="button-secondary" disabled={disabled} onClick={() => void prepare()}>Prepare audio and join ready list</button>}
      {role === "host" && !plan && <>
          <label>Call score<select value={callPatternId} disabled={disabled} onChange={event => setCallPatternId(event.target.value)}>{patterns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Response score<select value={responsePatternId} disabled={disabled} onChange={event => setResponsePatternId(event.target.value)}>{patterns.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Call / response pairs<select value={cycles} disabled={disabled} onChange={event => setCycles(Number(event.target.value))}>{[1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <button type="button" disabled={disabled || !localReady || !peerReady || !peerConnected || peerRole !== "guest" || callPatternId === responsePatternId} onClick={() => void createPlan()}>Start synchronized scored duet</button>
        </>}
        {plan && <button type="button" className="button-secondary" onClick={() => void stopPlan()}>Stop duet</button>}
        <button type="button" className="button-secondary" disabled={Boolean(plan)} onClick={() => void disconnect("Remote Trainer room disconnected.")}>Leave room</button>
      </div>
      <p>Other player: {peerConnected ? "connected" : "waiting for exactly one guest"} · audio ready: {peerReady ? "yes" : "no"} · estimated clock offset: {clockOffsetMs} ms</p>
      {plan && <p><strong>{activeTurn ? activeTurn.role === role ? "Your turn" : "Listen and follow the score" : "Session scheduled"}</strong> · {patterns.find(item => item.id === activeTurn?.patternId)?.name ?? "Awaiting first phrase"} · {plan.bpm} BPM</p>}
      {reportSection}
    </>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}
