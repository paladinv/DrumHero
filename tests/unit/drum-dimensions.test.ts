import { describe, expect, it } from "vitest";
import { DRUM_DIMENSIONS, DRUM_MODEL_VERSION, HAND_DIMENSIONS, KIT_DIMENSION_CHECKS, MODEL_SCALE, STICK_DIMENSIONS } from "@/lib/drum-dimensions";

describe("professional drum model dimensions", () => {
  it("uses metre-scale conventional kit sizes", () => {
    expect(MODEL_SCALE).toBe(1);
    expect(DRUM_MODEL_VERSION).toBe("professional-v31");
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
    expect(HAND_DIMENSIONS.wristToMiddleFinger).toBeCloseTo(0.19);
    expect(HAND_DIMENSIONS.palmWidth).toBeLessThan(DRUM_DIMENSIONS.snare.diameter * 0.3);
    expect(KIT_DIMENSION_CHECKS.handToStickLengthRatio).toBeCloseTo(0.4678, 3);
  });
});
