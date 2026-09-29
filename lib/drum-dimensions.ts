/**
 * Physical reference dimensions for the procedural kit. All model units are
 * metres (MODEL_SCALE is intentionally one so downstream trainers can place
 * the kit beside other real-world props without a conversion step).
 */
export const MODEL_SCALE = 1 as const;
export const DRUM_MODEL_VERSION = "professional-v31" as const;

export const DRUM_DIMENSIONS = Object.freeze({
  kick: Object.freeze({ diameter: 0.5588, depth: 0.4572 }), // 22 x 18 in
  snare: Object.freeze({ diameter: 0.3556, depth: 0.1524 }), // 14 x 6 in
  rackTom10: Object.freeze({ diameter: 0.254, depth: 0.1778 }), // 10 x 7 in
  rackTom12: Object.freeze({ diameter: 0.3048, depth: 0.2032 }), // 12 x 8 in
  floorTom: Object.freeze({ diameter: 0.4064, depth: 0.381 }), // 16 x 15 in
  hiHat: Object.freeze({ diameter: 0.3556, thickness: 0.004 }), // paired 14 in
  crash16: Object.freeze({ diameter: 0.4064, thickness: 0.004 }),
  crash18: Object.freeze({ diameter: 0.4572, thickness: 0.004 }),
  ride20: Object.freeze({ diameter: 0.508, thickness: 0.004 }),
} as const);

export const STICK_DIMENSIONS = Object.freeze({
  length: 0.4064, // Vic Firth American Classic 5A
  diameter: 0.0144,
  tipLength: 0.035,
  tipDiameter: 0.010, // slender teardrop wood tip, not the full shaft diameter
} as const);

export const HAND_DIMENSIONS = Object.freeze({
  wristToMiddleFinger: 0.19,
  palmWidth: 0.086,
  palmLength: 0.095,
  palmDepth: 0.042,
  wristDiameter: 0.038,
  fingerDiameter: 0.012,
} as const);

export const KIT_DIMENSION_CHECKS = Object.freeze({
  handToSnareWidthRatio: HAND_DIMENSIONS.palmWidth / DRUM_DIMENSIONS.snare.diameter,
  handToStickLengthRatio: HAND_DIMENSIONS.wristToMiddleFinger / STICK_DIMENSIONS.length,
} as const);
