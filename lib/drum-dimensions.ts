/**
 * Physical reference dimensions for the procedural kit. All model units are
 * metres (MODEL_SCALE is intentionally one so downstream trainers can place
 * the kit beside other real-world props without a conversion step).
 */
export const MODEL_SCALE = 1 as const;
export const DRUM_MODEL_VERSION = "professional-v44" as const;

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
  gripOffset: 0.055, // wrist pivot to shaft heel
  contactClearance: 0.012, // tip centre beyond the calibrated surface point
} as const);

export const HAND_DIMENSIONS = Object.freeze({
  wristToMiddleFinger: 0.19,
  palmWidth: 0.086,
  palmLength: 0.095,
  palmDepth: 0.042,
  wristDiameter: 0.038,
  fingerDiameter: 0.012,
  forearmLength: 0.24,
  thumbLength: 0.056,
} as const);

/**
 * Centre-contact locations for the five playable voices. The procedural kit
 * and the bundled CC0 component kit have different authored transforms, so
 * they deliberately keep separate calibrated targets. All units are metres.
 */
export const DRUM_CONTACT_POINTS = Object.freeze({
  procedural: Object.freeze({
    kick: Object.freeze({ x: 0, y: 0.43, z: 0.495 }),
    snare: Object.freeze({ x: -0.58, y: 0.852, z: 0.631 }),
    hihat: Object.freeze({ x: -0.78, y: 1.738, z: 0.622 }),
    // K/tom maps to the central 12 in rack tom. The floor tom remains a
    // visible secondary tom, but using it as the sole keyboard target sends
    // the right-hand stroke to the frame edge in the compact player view.
    tom: Object.freeze({ x: 0.2, y: 1.136, z: 0.216 }),
    crash: Object.freeze({ x: -1.2, y: 1.9, z: 0.005 }),
  }),
  components: Object.freeze({
    kick: Object.freeze({ x: 0, y: 0.439, z: 0.066 }),
    snare: Object.freeze({ x: -0.58, y: 0.756, z: 0.55 }),
    hihat: Object.freeze({ x: -0.78, y: 1.035, z: 0.782 }),
    // The bundled bass/rack asset is one non-semantic root. Its central rack
    // head is the only safe generic tom target; the distinct floor-tom root
    // remains the bounded visual response object for a tom hit.
    tom: Object.freeze({ x: -0.02, y: 0.84, z: 0.02 }),
    crash: Object.freeze({ x: -1.2, y: 1.4, z: 0.447 }),
  }),
} as const);

export const KIT_DIMENSION_CHECKS = Object.freeze({
  handToSnareWidthRatio: HAND_DIMENSIONS.palmWidth / DRUM_DIMENSIONS.snare.diameter,
  handToStickLengthRatio: HAND_DIMENSIONS.wristToMiddleFinger / STICK_DIMENSIONS.length,
} as const);
