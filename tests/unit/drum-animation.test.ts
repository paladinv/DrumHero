import { describe, expect, it } from "vitest";
import { advanceHit, createHitAnimationState, createKickAnimationState, restartHit, resolveHitHand, sampleHit } from "@/lib/drum-animation";

describe("drum hit animation", () => {
  it("maps natural hands to kit voices and permits explicit overrides", () => {
    expect(resolveHitHand("hihat")).toBe("right");
    expect(resolveHitHand("snare")).toBe("left");
    expect(resolveHitHand("kick")).toBe("right");
    expect(resolveHitHand("snare", "left")).toBe("left");
  });

  it("restarts bounded animations without accumulating state", () => {
    const state = createHitAnimationState("right");
    restartHit(state, "snare", "right", 3);
    expect(state.velocity).toBe(1.4);
    advanceHit(state, 70);
    expect(sampleHit(state).down).toBeGreaterThan(0);
    restartHit(state, "tom", "right", 0.1);
    expect(state.elapsedMs).toBe(0);
    expect(state.instrument).toBe("tom");
    expect(state.velocity).toBe(0.35);
    advanceHit(state, 1000);
    expect(state.active).toBe(false);
    expect(sampleHit(state).down).toBe(0);
  });

  it("reaches contact at the apex and returns smoothly", () => {
    const state = createHitAnimationState("left");
    restartHit(state, "crash");
    advanceHit(state, 95);
    const contact = sampleHit(state);
    advanceHit(state, 47);
    const returning = sampleHit(state);
    advanceHit(state, 48);
    expect(contact.down).toBeCloseTo(1, 4);
    expect(returning.down).toBeLessThan(contact.down);
    expect(sampleHit(state).down).toBe(0);
  });

  it("keeps kick animation as a separate pedal/beater voice", () => {
    const kick = createKickAnimationState();
    restartHit(kick, "kick", "right", 1.2);
    advanceHit(kick, 95);
    expect(kick.instrument).toBe("kick");
    expect(sampleHit(kick).down).toBeGreaterThan(1);
    advanceHit(kick, 95);
    expect(kick.active).toBe(false);
    expect(sampleHit(kick).down).toBe(0);
  });
});
