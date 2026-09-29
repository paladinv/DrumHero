import type { Instrument } from "./types";

export type HandSide = "left" | "right";

export type HitAnimationState = {
  active: boolean;
  elapsedMs: number;
  durationMs: number;
  velocity: number;
  instrument: Instrument;
  hand: HandSide;
};

export type HitPose = {
  down: number;
  rebound: number;
  rotation: number;
};

export const HIT_DURATION_MS = 190;

export const DEFAULT_HAND_BY_INSTRUMENT: Record<Instrument, HandSide> = {
  kick: "right",
  // Conventional right-handed setup: left hand leads the snare while the
  // right hand owns the hi-hat; crossing is then visible on hi-hat reaches.
  snare: "left",
  hihat: "right",
  tom: "right",
  crash: "left",
};

export function createHitAnimationState(hand: HandSide): HitAnimationState {
  return {
    active: false,
    elapsedMs: 0,
    durationMs: HIT_DURATION_MS,
    velocity: 1,
    instrument: "snare",
    hand,
  };
}

export function createKickAnimationState(): HitAnimationState {
  const state = createHitAnimationState("right");
  state.instrument = "kick";
  return state;
}

export function restartHit(
  state: HitAnimationState,
  instrument: Instrument,
  hand: HandSide = state.hand,
  velocity = 1,
): void {
  state.active = true;
  state.elapsedMs = 0;
  state.instrument = instrument;
  state.hand = hand;
  state.velocity = Math.max(0.35, Math.min(1.4, velocity));
}

export function advanceHit(state: HitAnimationState, deltaMs: number): void {
  if (!state.active) return;
  state.elapsedMs += Math.max(0, deltaMs);
  if (state.elapsedMs >= state.durationMs) {
    state.elapsedMs = state.durationMs;
    state.active = false;
  }
}

/** Writes a reusable pose object so the render loop does not allocate. */
export function sampleHitInto(state: HitAnimationState, pose: HitPose, reducedMotion = false): void {
  if (!state.active && state.elapsedMs >= state.durationMs) {
    pose.down = 0;
    pose.rebound = 0;
    pose.rotation = 0;
    return;
  }
  const progress = Math.max(0, Math.min(1, state.elapsedMs / state.durationMs));
  // One smooth arc: rest → contact at the midpoint → rest. This keeps a
  // reduced-motion hit finite as well; it never freezes at contact.
  const contact = Math.sin(progress * Math.PI);
  const rebound = progress > 0.5 ? Math.sin((progress - 0.5) * Math.PI) : 0;
  pose.down = contact * state.velocity;
  pose.rebound = rebound * state.velocity;
  pose.rotation = (reducedMotion ? contact * 0.35 : contact) * state.velocity;
}

export function sampleHit(state: HitAnimationState, reducedMotion = false): HitPose {
  const pose: HitPose = { down: 0, rebound: 0, rotation: 0 };
  sampleHitInto(state, pose, reducedMotion);
  return pose;
}

export function resolveHitHand(instrument: Instrument, hand?: HandSide): HandSide {
  return hand ?? DEFAULT_HAND_BY_INSTRUMENT[instrument];
}
