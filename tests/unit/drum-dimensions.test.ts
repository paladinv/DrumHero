import { describe, expect, it } from "vitest";
import { DRUM_CONTACT_POINTS, DRUM_DIMENSIONS, DRUM_MODEL_VERSION, HAND_DIMENSIONS, KIT_DIMENSION_CHECKS, MODEL_SCALE, STICK_DIMENSIONS } from "@/lib/drum-dimensions";

describe("professional drum model dimensions", () => {
  it("uses metre-scale conventional kit sizes", () => {
    expect(MODEL_SCALE).toBe(1);
    expect(DRUM_MODEL_VERSION).toBe("professional-v44");
    expect(DRUM_DIMENSIONS.kick).toMatchObject({ diameter: 0.5588, depth: 0.4572 });
    expect(DRUM_DIMENSIONS.snare).toMatchObject({ diameter: 0.3556, depth: 0.1524 });
    expect(DRUM_DIMENSIONS.rackTom10.diameter).toBeCloseTo(0.254);
    expect(DRUM_DIMENSIONS.rackTom12.diameter).toBeCloseTo(0.3048);
    expect(DRUM_DIMENSIONS.floorTom.diameter).toBeCloseTo(0.4064);
    expect(DRUM_DIMENSIONS.hiHat.diameter).toBeCloseTo(0.3556);
    expect(DRUM_DIMENSIONS.ride20.diameter).toBeCloseTo(0.508);
  });

  it("keeps 5A sticks and hands in plausible proportion", () => {
    expect(STICK_DIMENSIONS.length).toBeCloseTo(0.4064);
    expect(STICK_DIMENSIONS.diameter).toBeCloseTo(0.0144);
    expect(STICK_DIMENSIONS.gripOffset + STICK_DIMENSIONS.length - (STICK_DIMENSIONS.length + STICK_DIMENSIONS.gripOffset - STICK_DIMENSIONS.contactClearance)).toBeCloseTo(0.012);
    expect(HAND_DIMENSIONS.wristToMiddleFinger).toBeCloseTo(0.19);
    expect(HAND_DIMENSIONS.palmWidth).toBeLessThan(DRUM_DIMENSIONS.snare.diameter * 0.3);
    expect(HAND_DIMENSIONS.forearmLength).toBeCloseTo(0.24);
    expect(HAND_DIMENSIONS.thumbLength).toBeCloseTo(0.056);
    expect(KIT_DIMENSION_CHECKS.handToStickLengthRatio).toBeCloseTo(0.4678, 3);
  });

  it("keeps separate calibrated contacts for authored and fallback surfaces", () => {
    expect(DRUM_CONTACT_POINTS.procedural.snare).toMatchObject({ x: -0.58, y: 0.852, z: 0.631 });
    expect(DRUM_CONTACT_POINTS.procedural.hihat.y).toBeGreaterThan(1.72);
    expect(DRUM_CONTACT_POINTS.components.snare).toMatchObject({ x: -0.58, y: 0.756, z: 0.55 });
    expect(DRUM_CONTACT_POINTS.components.hihat).toMatchObject({ x: -0.78, y: 1.035, z: 0.782 });
    expect(DRUM_CONTACT_POINTS.procedural.tom).toMatchObject({ x: 0.2, y: 1.136, z: 0.216 });
    expect(DRUM_CONTACT_POINTS.components.tom).toMatchObject({ x: -0.02, y: 0.84, z: 0.02 });
    expect(DRUM_CONTACT_POINTS.components.crash).toMatchObject({ x: -1.2, y: 1.4, z: 0.447 });
  });
});
