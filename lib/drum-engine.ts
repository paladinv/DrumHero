import type * as THREE from "three";
import type { Instrument } from "./types";
import {
  advanceHit,
  createHitAnimationState,
  createKickAnimationState,
  DEFAULT_HAND_BY_INSTRUMENT,
  HIT_DURATION_MS,
  restartHit,
  resolveHitHand,
  sampleHitInto,
  type HandSide,
  type HitAnimationState,
  type HitPose,
} from "./drum-animation";
import {
  DRUM_DIMENSIONS,
  DRUM_MODEL_VERSION,
  HAND_DIMENSIONS,
  MODEL_SCALE,
  STICK_DIMENSIONS,
} from "./drum-dimensions";

export type DrumKitView = "player" | "showcase";

export type DrumKitEngineOptions = {
  reducedMotion?: boolean;
  antialias?: boolean;
  pixelRatio?: number;
  interactive?: boolean;
  view?: DrumKitView;
};

export type DrumKitSnapshot = {
  activeHits: Array<{ instrument: Instrument; hand: HandSide | null; progress: number }>;
  lastHit: { instrument: Instrument; hand: HandSide | null; velocity: number } | null;
  kick: { active: boolean; progress: number };
  running: boolean;
  modelVersion: typeof DRUM_MODEL_VERSION;
  modelScale: typeof MODEL_SCALE;
  view: DrumKitView;
  renderer: { drawCalls: number; triangles: number; staticObjectCount: number };
};

export type DrumKitEngine = {
  readonly element: HTMLCanvasElement;
  hit(instrument: Instrument, hand?: HandSide, velocity?: number): void;
  advance(ms: number): void;
  snapshot(): DrumKitSnapshot;
  resize(): void;
  dispose(): void;
};

type ThreeApi = typeof import("three");
type DrumMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> & {
  userData: { instrument?: Instrument; baseY?: number };
};
type HandRig = {
  group: THREE.Group;
  grip: THREE.Group;
  stick: THREE.Group;
  palm: THREE.Object3D;
  forearm: THREE.Object3D;
  elbow: THREE.Object3D;
  sleeve: THREE.Object3D;
  cuff: THREE.Object3D;
  proceduralHandVisuals: THREE.Object3D[];
  visualQuaternion: THREE.Quaternion;
  restVisualQuaternion: THREE.Quaternion;
  restPosition: THREE.Vector3;
  restQuaternion: THREE.Quaternion;
  strikePosition: THREE.Vector3;
  strikeQuaternion: THREE.Quaternion;
  strikeDirection: THREE.Vector3;
  pose: HitPose;
  state: HitAnimationState;
};

const COLORS = {
  backdrop: 0x181b20,
  floor: 0x151a1f,
  rug: 0x252c32,
  shell: 0x75412f,
  shellEdge: 0xa86143,
  head: 0xf2eee4,
  headEdge: 0xc9c3b9,
  chrome: 0xd5dde1,
  chromeDark: 0x59656e,
  bronze: 0xe0ac62,
  bronzeDark: 0x75502b,
  hickory: 0xc4874f,
  hickoryTip: 0xf4d2a4,
  // Muted warm skin tones separate from the lacquer/copper kit without
  // turning the hands into saturated orange blobs at the compact viewport.
  skin: 0xa87569,
  skinLight: 0xdca092,
  skinShadow: 0x875345,
  nail: 0xf3c0a8,
  sleeve: 0x20242a,
  sleeveCuff: 0x323943,
  black: 0x111317,
};
const HAND_SIDES = ["left", "right"] as const;
const INSTRUMENTS = ["kick", "snare", "hihat", "tom", "crash"] as const;

/** Reusable procedural drumset renderer. The Three.js import stays lazy in the client wrapper. */
export function createDrumKitEngine(
  THREE: ThreeApi,
  host: HTMLElement,
  options: DrumKitEngineOptions = {},
): DrumKitEngine {
  const reducedMotion = options.reducedMotion ?? false;
  const interactive = options.interactive ?? true;
  const view = options.view ?? "showcase";
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.backdrop);
  const baseFov = view === "player" ? 36 : 34;
  const camera = new THREE.PerspectiveCamera(baseFov, 1, 0.05, 30);
  const aim = new THREE.Vector3(0, 1.18, 0.24);
  if (view === "player") {
    // A seated three-quarter eye line keeps heads readable without the v30
    // overhead look, and exposes the dorsal grip/forearm connection.
    camera.position.set(0.16, 2.48, 3.22);
    aim.set(0, 0.95, 0.18);
  } else {
    camera.position.set(0.36, 2.85, 3.95);
    aim.set(0, 0.95, 0.18);
  }
  camera.lookAt(aim);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: options.antialias ?? !reducedMotion,
      alpha: false,
      powerPreference: "low-power",
    });
  } catch (error) {
    throw new Error(`WebGL is unavailable: ${error instanceof Error ? error.message : "renderer initialization failed"}`);
  }
  const pixelRatioCap = view === "player" ? 1.25 : 1.5;
  renderer.setPixelRatio(Math.min(options.pixelRatio ?? (window.devicePixelRatio || 1), pixelRatioCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(COLORS.backdrop);
  renderer.shadowMap.enabled = false;
  renderer.domElement.setAttribute("aria-label", "Interactive 3D drum kit");
  renderer.domElement.setAttribute("role", "img");
  host.appendChild(renderer.domElement);

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometryCache = new Map<string, THREE.BufferGeometry>();
  // Practice uses a centered 16:9 logical viewport inside the wide compact
  // canvas. This preserves projection proportions instead of stretching the
  // kit across the 2.5:1 CSS surface, while leaving showcase full-width.
  let renderViewportX = 0;
  let renderViewportWidth = 1;
  let renderViewportHeight = 1;
  let renderBufferWidth = 1;
  let renderBufferHeight = 1;
  let staticObjectCount = 0;
  const getMaterial = (color: number, roughness = 0.52, metalness = 0.05, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial => {
    const key = `${color}:${roughness}:${metalness}:${side}`;
    let material = materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness, metalness, side });
      materials.set(key, material);
    }
    return material;
  };
  const cachedGeometry = <T extends THREE.BufferGeometry>(key: string, create: () => T): T => {
    let value = geometryCache.get(key);
    if (!value) {
      value = create();
      geometryCache.set(key, value);
    }
    return value as T;
  };
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial): THREE.Mesh => {
    staticObjectCount += 1;
    return new THREE.Mesh(geometry, material);
  };
  // A tiny shared procedural grain keeps the shells from reading as flat
  // plastic. It is generated once at mount time and reused by shell lacquer
  // and heads; no per-frame texture work or external asset is needed.
  const surfaceTextureWidth = 64;
  const surfaceTextureHeight = 8;
  const surfaceTextureData = new Uint8Array(surfaceTextureWidth * surfaceTextureHeight * 4);
  for (let y = 0; y < surfaceTextureHeight; y += 1) {
    for (let x = 0; x < surfaceTextureWidth; x += 1) {
      const grain = 222 + Math.round(14 * Math.sin(x * 0.72 + Math.sin(x * 0.11) * 2.2 + y * 0.24));
      const micro = ((x * 17 + y * 31) % 7) - 3;
      const value = Math.max(0, Math.min(255, grain + micro));
      const offset = (y * surfaceTextureWidth + x) * 4;
      surfaceTextureData[offset] = value;
      surfaceTextureData[offset + 1] = value;
      surfaceTextureData[offset + 2] = value;
      surfaceTextureData[offset + 3] = 255;
    }
  }
  const surfaceTexture = new THREE.DataTexture(surfaceTextureData, surfaceTextureWidth, surfaceTextureHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
  surfaceTexture.wrapS = THREE.RepeatWrapping;
  surfaceTexture.wrapT = THREE.RepeatWrapping;
  surfaceTexture.repeat.set(3, 1);
  surfaceTexture.minFilter = THREE.LinearFilter;
  surfaceTexture.magFilter = THREE.LinearFilter;
  surfaceTexture.unpackAlignment = 1;
  // This is a scalar roughness cue, not a color texture. Keeping it in the
  // renderer's linear space prevents mobile color management from multiplying
  // the brown lacquer/cream head colors down toward black.
  surfaceTexture.colorSpace = THREE.NoColorSpace;
  surfaceTexture.needsUpdate = true;
  const shellMaterial = new THREE.MeshStandardMaterial({ color: COLORS.shell, roughnessMap: surfaceTexture, roughness: 0.3, metalness: 0.03 });
  const shellStripeMaterial = new THREE.MeshStandardMaterial({ color: COLORS.shellEdge, roughnessMap: surfaceTexture, roughness: 0.32, metalness: 0.02 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: COLORS.head, roughnessMap: surfaceTexture, roughness: 0.57, metalness: 0.02 });
  materials.set("shell-grain", shellMaterial);
  materials.set("shell-lacquer-grain", shellStripeMaterial);
  materials.set("head-surface", headMaterial);
  const group = new THREE.Group();
  scene.add(group);
  const reactiveMeshes: Record<Instrument, THREE.Object3D[]> = { kick: [], snare: [], hihat: [], tom: [], crash: [] };
  let loadedKitVisible = false;
  const loadedHandRoots: Partial<Record<HandSide, THREE.Object3D>> = {};
  const loadedComponentRoots: Record<Instrument, THREE.Object3D[]> = { kick: [], snare: [], hihat: [], tom: [], crash: [] };
  const importedAssetRoots: THREE.Object3D[] = [];
  const assetAbortController = new AbortController();
  let raycastTargets: THREE.Object3D[] = group.children;

  const cylinderGeometry = (radius: number, height: number, radial = 16): THREE.CylinderGeometry =>
    cachedGeometry(`cylinder:${radius}:${height}:${radial}`, () => new THREE.CylinderGeometry(radius, radius, height, radial));
  const addRod = (parent: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, radius: number, color: number, radial = 8): THREE.Mesh => {
    const delta = new THREE.Vector3().subVectors(end, start);
    const rod = mesh(cachedGeometry(`rod:${radius}:${delta.length()}:${radial}`, () => new THREE.CylinderGeometry(radius, radius, delta.length(), radial)), getMaterial(color, 0.32, 0.72));
    rod.position.copy(start).add(end).multiplyScalar(0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    parent.add(rod);
    return rod;
  };
  // Every stand uses the same small collar. Keep it in one instanced draw so
  // the chrome attachment remains visible without four extra render calls.
  const standCollars = new THREE.InstancedMesh(
    cachedGeometry("stand-collar", () => new THREE.TorusGeometry(0.022, 0.004, 5, 12)),
    getMaterial(COLORS.chromeDark, 0.26, 0.78),
    4,
  );
  const standCollarMatrix = new THREE.Matrix4();
  const standCollarPosition = new THREE.Vector3();
  const standCollarQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  let standCollarIndex = 0;
  staticObjectCount += 1;
  const addStand = (x: number, z: number, height: number, boom = 0): void => {
    const stand = new THREE.Group();
    stand.position.set(x, 0, z);
    // The lower tube is normally hidden by the shells/pedal in this camera;
    // starting it just above the floor keeps thin poles from dominating the
    // compact composition while the tripod feet still ground the stand.
    const visibleStart = Math.min(0.2, height * 0.22);
    addRod(stand, new THREE.Vector3(0, visibleStart, 0), new THREE.Vector3(0, height, 0), 0.012, COLORS.chrome, 8);
    for (const angle of [-0.35, 1.75, 3.85]) {
      addRod(stand, new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(Math.cos(angle) * 0.26, 0.02, Math.sin(angle) * 0.26), 0.009, COLORS.chromeDark, 6);
    }
    if (standCollarIndex < 4) {
      standCollarPosition.set(x, Math.max(0.2, height - 0.08), z);
      standCollarMatrix.compose(standCollarPosition, standCollarQuaternion, new THREE.Vector3(1, 1, 1));
      standCollars.setMatrixAt(standCollarIndex, standCollarMatrix);
      standCollarIndex += 1;
    }
    if (boom !== 0) addRod(stand, new THREE.Vector3(0, height - 0.08, 0), new THREE.Vector3(boom, height + 0.06, 0), 0.011, COLORS.chrome, 8);
    group.add(stand);
  };

  const lugGeometry = cachedGeometry("lug", () => new THREE.BoxGeometry(0.024, 0.046, 0.018));
  const rodGeometry = cachedGeometry("tension-rod", () => new THREE.CylinderGeometry(0.0035, 0.0035, 0.078, 6));
  const addDrumHardware = (parent: THREE.Group, radius: number, depth: number): void => {
    // Twelve lugs is the common configuration for a 14–16 inch drum. Keeping
    // them instanced gives the eye the right hardware rhythm without turning
    // each tension point into a separate draw call.
    const count = 24;
    const lugs = new THREE.InstancedMesh(lugGeometry, getMaterial(COLORS.chrome, 0.28, 0.78), count);
    const rods = new THREE.InstancedMesh(rodGeometry, getMaterial(COLORS.chrome, 0.28, 0.78), count);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.floor(index / 2) / (count / 2)) * Math.PI * 2;
      const y = index % 2 === 0 ? depth * 0.5 : -depth * 0.5;
      position.set(Math.cos(angle) * radius * 0.98, y, Math.sin(angle) * radius * 0.98);
      matrix.makeTranslation(position.x, position.y, position.z);
      lugs.setMatrixAt(index, matrix);
      matrix.makeTranslation(position.x, y > 0 ? depth * 0.5 + 0.025 : -depth * 0.5 - 0.025, position.z);
      rods.setMatrixAt(index, matrix);
    }
    lugs.instanceMatrix.needsUpdate = true;
    rods.instanceMatrix.needsUpdate = true;
    parent.add(lugs, rods);
    staticObjectCount += 2;
  };

  const addDrum = (
    instrument: Instrument,
    x: number,
    y: number,
    z: number,
    radius: number,
    depth: number,
    tilt = 0,
    kick = false,
  ): THREE.Group => {
    const drum = new THREE.Group();
    drum.position.set(x, y, z);
    if (kick) drum.rotation.x = Math.PI / 2;
    else drum.rotation.x = tilt;
    // Leave the shell open-ended so the head reads as a separate membrane and
    // the thin shell wall catches a clean highlight around its circumference.
    // A shallow lathed bead gives the lacquer a real bearing-edge highlight
    // instead of the toy-like hard cylinder silhouette, without adding a
    // render object or changing the measured shell envelope.
    const shell = mesh(cachedGeometry(`shell-v20:${radius}:${depth}`, () => new THREE.LatheGeometry([
      new THREE.Vector2(radius * 0.985, -depth * 0.5),
      new THREE.Vector2(radius, -depth * 0.46),
      new THREE.Vector2(radius, depth * 0.46),
      new THREE.Vector2(radius * 0.985, depth * 0.5),
    ], 24)), shellMaterial);
    const shellStripe = mesh(cachedGeometry(`shell-stripe-v25:${radius}:${depth}`, () => new THREE.CylinderGeometry(radius * 1.002, radius * 1.002, depth * 0.045, 24, 1, true)), shellStripeMaterial);
    shellStripe.position.y = depth * 0.05;
    const headTop = mesh(cachedGeometry(`head-v22:${radius}`, () => new THREE.LatheGeometry([
      new THREE.Vector2(0, 0.011),
      new THREE.Vector2(radius * 0.26, 0.012),
      new THREE.Vector2(radius * 0.72, 0.006),
      new THREE.Vector2(radius * 0.935, 0),
      new THREE.Vector2(radius * 0.935, -0.006),
      new THREE.Vector2(0, -0.006),
    ], 24)), headMaterial) as DrumMesh;
    headTop.position.y = depth * 0.5 + 0.016;
    headTop.userData.instrument = instrument;
    headTop.userData.baseY = headTop.position.y;
    reactiveMeshes[instrument].push(headTop);
    const hoopGeometry = cachedGeometry(`hoop-v20:${radius}`, () => new THREE.TorusGeometry(radius * 0.963, 0.014, 8, 24));
    const flangeGeometry = cachedGeometry(`hoop-flange-v20:${radius}`, () => new THREE.TorusGeometry(radius * 0.918, 0.0055, 6, 24));
    const hoopTop = mesh(hoopGeometry, getMaterial(COLORS.chrome, 0.22, 0.82));
    const flangeTop = mesh(flangeGeometry, getMaterial(COLORS.chromeDark, 0.28, 0.74));
    hoopTop.rotation.x = Math.PI / 2;
    hoopTop.position.y = depth * 0.5 + 0.032;
    flangeTop.rotation.x = Math.PI / 2;
    flangeTop.position.y = depth * 0.5 + 0.019;
    addDrumHardware(drum, radius, depth);
    drum.add(shell, shellStripe, headTop, hoopTop, flangeTop);
    group.add(drum);
    if (instrument === "snare") {
      const snareWires = mesh(cachedGeometry(`snare-wires:${radius}`, () => new THREE.BoxGeometry(radius * 1.45, 0.006, 0.018)), getMaterial(COLORS.chromeDark, 0.55, 0.42));
      snareWires.position.set(0, -depth * 0.5 - 0.02, 0);
      drum.add(snareWires);
    }
    return drum;
  };

  const cymbalProfile = [
    // A shallow bell, a long bow, and a rolled edge produce the characteristic
    // cymbal silhouette when lit from above. Values are normalized by radius.
    new THREE.Vector2(0.035, 0.004), new THREE.Vector2(0.046, 0.024), new THREE.Vector2(0.085, 0.06),
    new THREE.Vector2(0.15, 0.1), new THREE.Vector2(0.23, 0.05), new THREE.Vector2(0.42, 0.016),
    new THREE.Vector2(0.72, 0.006), new THREE.Vector2(0.94, -0.001), new THREE.Vector2(0.985, -0.009),
    new THREE.Vector2(1, -0.014),
  ];
  // Three very fine lathe grooves per cymbal are shared through one instanced
  // mesh. They break up the flat bronze plates while staying cheap on mobile.
  const cymbalGrooveGeometry = cachedGeometry("cymbal-groove", () => new THREE.TorusGeometry(1, 0.004, 4, 20));
  const cymbalGrooves = new THREE.InstancedMesh(cymbalGrooveGeometry, getMaterial(COLORS.bronzeDark, 0.36, 0.58, THREE.DoubleSide), 15);
  const cymbalGrooveMatrix = new THREE.Matrix4();
  const cymbalGroovePosition = new THREE.Vector3();
  const cymbalGrooveScale = new THREE.Vector3();
  const cymbalGrooveQuaternion = new THREE.Quaternion();
  const cymbalGrooveEuler = new THREE.Euler(Math.PI / 2, 0, 0);
  let cymbalGrooveIndex = 0;
  staticObjectCount += 1;
  const cymbalCollars = new THREE.InstancedMesh(
    cachedGeometry("cymbal-collar", () => new THREE.CylinderGeometry(0.048, 0.06, 0.06, 10)),
    getMaterial(COLORS.chrome, 0.3, 0.74),
    3,
  );
  const cymbalCollarMatrix = new THREE.Matrix4();
  const cymbalCollarPosition = new THREE.Vector3();
  const cymbalCollarQuaternion = new THREE.Quaternion();
  const cymbalCollarEuler = new THREE.Euler();
  let cymbalCollarIndex = 0;
  staticObjectCount += 1;
  const addCymbal = (
    instrument: Instrument,
    x: number,
    y: number,
    z: number,
    radius: number,
    tilt: number,
    standX: number,
    standZ: number,
    reactive = true,
    withStand = true,
    withCollar = true,
  ): void => {
    const cymbal = mesh(cachedGeometry("profiled-cymbal-v22", () => new THREE.LatheGeometry(cymbalProfile, 32)), getMaterial(COLORS.bronze, 0.2, 0.68, THREE.DoubleSide)) as DrumMesh;
    cymbal.scale.set(radius, radius, radius);
    // The lathed profile's normal is +Y; pitch around X brings its playing
    // surface toward the +Z player/camera side.
    cymbal.rotation.x = tilt;
    cymbal.position.set(x, y, z);
    cymbal.userData.instrument = instrument;
    cymbal.userData.baseY = y;
    if (reactive) reactiveMeshes[instrument].push(cymbal);
    for (const normalizedRadius of [0.34, 0.6, 0.82]) {
      cymbalGroovePosition.set(x, y + 0.003, z);
      cymbalGrooveEuler.x = Math.PI / 2 + tilt;
      cymbalGrooveEuler.z = 0;
      cymbalGrooveQuaternion.setFromEuler(cymbalGrooveEuler);
      cymbalGrooveScale.set(radius * normalizedRadius, radius * normalizedRadius, radius * normalizedRadius);
      cymbalGrooveMatrix.compose(cymbalGroovePosition, cymbalGrooveQuaternion, cymbalGrooveScale);
      cymbalGrooves.setMatrixAt(cymbalGrooveIndex, cymbalGrooveMatrix);
      cymbalGrooveIndex += 1;
    }
    group.add(cymbal);
    if (withCollar && cymbalCollarIndex < 3) {
      cymbalCollarPosition.set(x, y + 0.025, z);
      cymbalCollarEuler.set(tilt, 0, 0);
      cymbalCollarQuaternion.setFromEuler(cymbalCollarEuler);
      cymbalCollarMatrix.compose(cymbalCollarPosition, cymbalCollarQuaternion, new THREE.Vector3(1, 1, 1));
      cymbalCollars.setMatrixAt(cymbalCollarIndex, cymbalCollarMatrix);
      cymbalCollarIndex += 1;
    }
    if (withStand) addStand(standX, standZ, y, x - standX);
  };

  const addHiHat = (): void => {
    // Conventional right-handed layout: the hi-hat stays player-left of the
    // snare. The right-hand crossover is performed only by a hi-hat hit.
    const x = -0.78;
    const z = 0.62;
    const radius = DRUM_DIMENSIONS.hiHat.diameter / 2;
    addCymbal("hihat", x, 1.72, z, radius, 0.14, x, z, true, false, false);
    addCymbal("hihat", x, 1.64, z, radius, 0.14, x, z, false, false, false);
    addStand(x, z, 1.68);
    addRod(group, new THREE.Vector3(x, 1.64, z), new THREE.Vector3(x, 1.84, z), 0.008, COLORS.chromeDark, 8);
    const clutch = mesh(cachedGeometry("hihat-clutch", () => new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12)), getMaterial(COLORS.chrome, 0.3, 0.74));
    clutch.position.set(x, 1.82, z);
    group.add(clutch);
    const pedal = mesh(cachedGeometry("hihat-pedal", () => new THREE.BoxGeometry(0.12, 0.016, 0.28)), getMaterial(COLORS.chrome, 0.3, 0.78));
    pedal.position.set(x, 0.034, 0.96);
    group.add(pedal);
    addRod(group, new THREE.Vector3(x, 0.05, 0.96), new THREE.Vector3(x, 0.06, z), 0.007, COLORS.chromeDark, 6);
  };

  addDrum("kick", 0, 0.43, 0.25, DRUM_DIMENSIONS.kick.diameter / 2, DRUM_DIMENSIONS.kick.depth, 0, true);
  const snare = addDrum("snare", -0.58, 0.76, 0.62, DRUM_DIMENSIONS.snare.diameter / 2, DRUM_DIMENSIONS.snare.depth, 0.12);
  const rack10 = addDrum("tom", -0.23, 1.05, 0.16, DRUM_DIMENSIONS.rackTom10.diameter / 2, DRUM_DIMENSIONS.rackTom10.depth, 0.18);
  const rack12 = addDrum("tom", 0.2, 1.02, 0.2, DRUM_DIMENSIONS.rackTom12.diameter / 2, DRUM_DIMENSIONS.rackTom12.depth, 0.14);
  const floorTom = addDrum("tom", 0.82, 0.5, 0.64, DRUM_DIMENSIONS.floorTom.diameter / 2, DRUM_DIMENSIONS.floorTom.depth, 0.06);
  void snare;
  void rack10;
  void rack12;
  addRod(group, new THREE.Vector3(-0.23, 0.58, 0.16), new THREE.Vector3(-0.23, 0.98, 0.16), 0.014, COLORS.chrome);
  addRod(group, new THREE.Vector3(0.2, 0.58, 0.2), new THREE.Vector3(0.2, 0.96, 0.2), 0.014, COLORS.chrome);
  addRod(group, new THREE.Vector3(-0.23, 0.9, 0.16), new THREE.Vector3(0.2, 0.9, 0.2), 0.012, COLORS.chromeDark);
  addRod(group, new THREE.Vector3(-0.23, 0.9, 0.16), new THREE.Vector3(-0.13, 0.99, 0.15), 0.013, COLORS.chrome);
  addRod(group, new THREE.Vector3(0.2, 0.9, 0.2), new THREE.Vector3(0.1, 0.97, 0.2), 0.013, COLORS.chrome);
  for (const angle of [-0.8, 1.35, 3.45]) addRod(floorTom, new THREE.Vector3(0, -0.15, 0), new THREE.Vector3(Math.cos(angle) * 0.23, -0.38, Math.sin(angle) * 0.23), 0.01, COLORS.chrome);
  addHiHat();
  addCymbal("crash", -1.2, 1.88, 0.0, DRUM_DIMENSIONS.crash16.diameter / 2, 0.24, -1.2, 0.03);
  addCymbal("crash", 1.12, 1.86, 0.18, DRUM_DIMENSIONS.crash18.diameter / 2, 0.2, 1.12, 0.2);
  addCymbal("crash", 1.46, 1.98, 0.58, DRUM_DIMENSIONS.ride20.diameter / 2, 0.12, 1.46, 0.58);
  standCollars.instanceMatrix.needsUpdate = true;
  group.add(standCollars);
  cymbalCollars.instanceMatrix.needsUpdate = true;
  group.add(cymbalCollars);
  cymbalGrooves.instanceMatrix.needsUpdate = true;
  group.add(cymbalGrooves);
  // The authored GLB is the primary kit visual. Keep the procedural build
  // available until it has loaded so offline/failure cases remain usable.
  const proceduralKitObjects = group.children.slice();

  const floor = mesh(cachedGeometry("studio-floor-v28", () => new THREE.PlaneGeometry(5.2, 4.4)), getMaterial(COLORS.floor, 0.9, 0.02));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.005;
  group.add(floor);
  const rug = mesh(cachedGeometry("rectangular-rug-v28", () => new THREE.BoxGeometry(2.85, 0.014, 2.05)), getMaterial(COLORS.rug, 0.96, 0));
  rug.position.y = 0.012;
  group.add(rug);
  // Baked radial contact tones keep the feet and shell grounded while
  // real-time shadow maps remain disabled for predictable low-power rendering.
  const contactGeometry = cachedGeometry("kick-contact-gradient", () => {
    const geometry = new THREE.CircleGeometry(0.42, 24);
    const positions = geometry.getAttribute("position");
    const colors = new Float32Array(positions.count * 3);
    const center = [0.035, 0.045, 0.055];
    const edge = [0.145, 0.18, 0.21];
    for (let index = 0; index < positions.count; index += 1) {
      const distance = Math.min(1, Math.hypot(positions.getX(index), positions.getY(index)) / 0.42);
      const fade = distance * distance;
      colors[index * 3] = center[0] + (edge[0] - center[0]) * fade;
      colors[index * 3 + 1] = center[1] + (edge[1] - center[1]) * fade;
      colors[index * 3 + 2] = center[2] + (edge[2] - center[2]) * fade;
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  });
  const contactMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.99, metalness: 0 });
  materials.set("contact-gradient", contactMaterial);
  const kickContact = mesh(contactGeometry, contactMaterial);
  kickContact.rotation.x = -Math.PI / 2;
  kickContact.scale.set(1.25, 0.48, 1);
  kickContact.position.set(0, 0.019, 0.26);
  group.add(kickContact);
  const throne = new THREE.Group();
  // A first-person practice view should show the playable surfaces, not the
  // seat between the viewer and the kick. Showcase keeps a small throne hint
  // behind the floor tom, away from the center line.
  throne.position.set(view === "player" ? 0 : 0.78, 0, view === "player" ? 1.55 : 1.88);
  const seat = mesh(cachedGeometry("throne-seat", () => new THREE.CylinderGeometry(0.23, 0.25, 0.09, 24)), getMaterial(COLORS.black, 0.72, 0.03));
  seat.position.y = 1.12;
  const thronePole = mesh(cylinderGeometry(0.025, 0.72, 10), getMaterial(COLORS.chromeDark, 0.38, 0.72));
  thronePole.position.y = 0.6;
  throne.add(seat, thronePole);
  if (view !== "player") group.add(throne);

  const kickMechanism = new THREE.Group();
  const pedal = mesh(cachedGeometry("kick-pedal", () => new THREE.BoxGeometry(0.15, 0.018, 0.34)), getMaterial(COLORS.chrome, 0.3, 0.78));
  pedal.position.set(0, 0.035, 0.7);
  const pedalHinge = mesh(cachedGeometry("pedal-hinge", () => new THREE.CylinderGeometry(0.018, 0.018, 0.22, 10)), getMaterial(COLORS.chromeDark, 0.35, 0.78));
  pedalHinge.rotation.z = Math.PI / 2;
  pedalHinge.position.set(0, 0.09, 0.84);
  const beater = new THREE.Group();
  const beaterRod = mesh(cylinderGeometry(0.012, 0.52, 8), getMaterial(COLORS.chrome, 0.3, 0.78));
  beaterRod.position.y = 0.26;
  const beaterHead = mesh(cachedGeometry("beater-head", () => new THREE.SphereGeometry(1, 14, 10)), getMaterial(COLORS.head, 0.62, 0.04));
  beaterHead.scale.set(0.045, 0.06, 0.04);
  beaterHead.position.y = 0.52;
  // The footboard sits in front of the kick head; the beater leans back to
  // make contact instead of floating upright in front of the shell.
  beater.rotation.x = -0.26;
  beater.add(beaterRod, beaterHead);
  beater.position.set(0, 0.08, 0.83);
  kickMechanism.add(pedal, pedalHinge, beater);
  group.add(kickMechanism);

  // Build a matched-grip basis instead of relying on a unit-vector rotation
  // alone. The local Y axis remains the exact stick axis, while local Z is
  // chosen toward the player so the palm, four finger lanes, and opposing
  // thumb stay readable as the stick points down toward the heads.
  const gripLateral = new THREE.Vector3();
  const gripNormal = new THREE.Vector3();
  const gripBasis = new THREE.Matrix4();
  const visualGripY = new THREE.Vector3();
  const visualGripX = new THREE.Vector3();
  const visualGripNormal = new THREE.Vector3();
  const visualGripBasis = new THREE.Matrix4();
  const gripLocalQuaternion = new THREE.Quaternion();
  const setGripQuaternion = (direction: THREE.Vector3, position: THREE.Vector3, output: THREE.Quaternion): void => {
    gripNormal.copy(camera.position).sub(position).normalize();
    gripNormal.addScaledVector(direction, -gripNormal.dot(direction)).normalize();
    gripLateral.crossVectors(direction, gripNormal).normalize();
    gripBasis.makeBasis(gripLateral, direction, gripNormal);
    output.setFromRotationMatrix(gripBasis);
  };
  const setVisualGripQuaternion = (direction: THREE.Vector3, position: THREE.Vector3, output: THREE.Quaternion): void => {
    visualGripNormal.copy(camera.position).sub(position).normalize();
    visualGripY.copy(direction).addScaledVector(visualGripNormal, -direction.dot(visualGripNormal));
    if (visualGripY.lengthSq() < 0.04) visualGripY.set(0, 1, 0);
    visualGripY.normalize();
    visualGripX.crossVectors(visualGripY, visualGripNormal).normalize();
    visualGripBasis.makeBasis(visualGripX, visualGripY, visualGripNormal);
    output.setFromRotationMatrix(visualGripBasis);
  };
  const updateGripPlane = (rig: HandRig): void => {
    gripLocalQuaternion.copy(rig.group.quaternion).invert();
    rig.grip.quaternion.copy(gripLocalQuaternion).multiply(rig.visualQuaternion);
  };

  const createStick = (): THREE.Group => {
    const stick = new THREE.Group();
    const shaftLength = STICK_DIMENSIONS.length - STICK_DIMENSIONS.tipLength;
    // One lathed body keeps the nominal 5A shaft and shoulder continuous,
    // with a subtly fuller butt and a smooth taper into the wood tip.
    const stickBody = mesh(cachedGeometry("5a-body", () => new THREE.LatheGeometry([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(STICK_DIMENSIONS.diameter * 0.56, 0),
      new THREE.Vector2(STICK_DIMENSIONS.diameter * 0.53, shaftLength * 0.72),
      new THREE.Vector2(STICK_DIMENSIONS.diameter * 0.5, shaftLength),
      new THREE.Vector2(STICK_DIMENSIONS.diameter * 0.46, shaftLength + 0.01),
      new THREE.Vector2(STICK_DIMENSIONS.diameter * 0.32, shaftLength + 0.027),
      new THREE.Vector2(STICK_DIMENSIONS.diameter * 0.26, STICK_DIMENSIONS.length),
      new THREE.Vector2(0, STICK_DIMENSIONS.length),
    ], 12)), getMaterial(COLORS.hickory, 0.48, 0.02));
    const tip = mesh(cachedGeometry("5a-teardrop-tip", () => new THREE.SphereGeometry(1, 12, 8)), getMaterial(COLORS.hickoryTip, 0.42, 0.01));
    // Use the measured tip diameter (10 mm) and length instead of a 22 mm
    // sphere. The ellipsoid keeps a small teardrop shoulder while reading as
    // a distinct pale wood tip at the compact camera distance.
    tip.scale.set(STICK_DIMENSIONS.tipDiameter * 0.5, STICK_DIMENSIONS.tipLength * 0.5, STICK_DIMENSIONS.tipDiameter * 0.5);
    tip.position.y = STICK_DIMENSIONS.length - STICK_DIMENSIONS.tipLength * 0.5;
    stick.add(stickBody, tip);
    return stick;
  };
  const createHand = (side: HandSide): HandRig => {
    const sign = side === "left" ? -1 : 1;
    const hand = new THREE.Group();
    const grip = new THREE.Group();
    const armAnatomy = new THREE.Group();
    // A rounded octagonal cross-section gives the palm a human trapezoid
    // silhouette rather than another rotational oval/blob.
    const palmGeometry = cachedGeometry("anatomical-palm-v14", () => {
      const levels = [-0.052, -0.036, 0.02, 0.052];
      const widths = [0.018, 0.039, 0.048, 0.026];
      const depths = [0.012, 0.02, 0.023, 0.012];
      const outline = [[-0.55, -1], [0.55, -1], [0.92, -0.68], [1, -0.2], [0.96, 0.42], [0.62, 0.9], [0, 1], [-0.62, 0.9], [-0.96, 0.42], [-1, -0.2], [-0.92, -0.68]];
      const positions: number[] = [];
      const indices: number[] = [];
      for (let level = 0; level < levels.length; level += 1) {
        for (const [x, z] of outline) positions.push(x * widths[level], levels[level], z * depths[level]);
      }
      for (let level = 0; level < levels.length - 1; level += 1) {
        for (let point = 0; point < outline.length; point += 1) {
          const next = (point + 1) % outline.length;
          const a = level * outline.length + point;
          const b = level * outline.length + next;
          const c = (level + 1) * outline.length + next;
          const d = (level + 1) * outline.length + point;
          // Reverse the winding so FrontSide skin materials face away from
          // the palm volume rather than being culled on the negative-z side.
          indices.push(a, d, b, b, d, c);
        }
      }
      const bottomCenter = positions.length / 3;
      positions.push(0, levels[0], 0);
      const topCenter = positions.length / 3;
      positions.push(0, levels[levels.length - 1], 0);
      for (let point = 0; point < outline.length; point += 1) {
        const next = (point + 1) % outline.length;
        indices.push(bottomCenter, point, next);
        const top = (levels.length - 1) * outline.length;
        indices.push(topCenter, top + next, top + point);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    });
    const palm = mesh(palmGeometry, getMaterial(COLORS.skin, 0.62, 0));
    palm.position.set(0, 0.012, -0.017);
    const wrist = mesh(cachedGeometry("hand-wrist-v3", () => new THREE.LatheGeometry([
      new THREE.Vector2(0, -0.04), new THREE.Vector2(0.014, -0.038), new THREE.Vector2(0.019, -0.026),
      new THREE.Vector2(0.019, 0.023), new THREE.Vector2(0.015, 0.036), new THREE.Vector2(0, 0.04),
    ], 12)), getMaterial(COLORS.skinLight, 0.65, 0));
    wrist.position.y = -0.071;
    wrist.position.z = -0.017;
    // A 210 mm rounded section keeps the wrist visibly connected to the
    // player's arm while its narrow taper avoids the old detached orange bar.
    const forearm = mesh(cachedGeometry("hand-forearm-tapered-v25", () => new THREE.LatheGeometry([
      new THREE.Vector2(0, -0.19), new THREE.Vector2(0.021, -0.19), new THREE.Vector2(0.03, -0.16),
      new THREE.Vector2(0.032, -0.08), new THREE.Vector2(0.025, 0.02), new THREE.Vector2(0.021, 0.082), new THREE.Vector2(0.017, 0.105),
      new THREE.Vector2(0, 0.105),
    ], 10)), getMaterial(COLORS.skin, 0.68, 0));
    forearm.position.y = -0.155;
    // Offset the forearm's local origin under the splayed arm pivot so its
    // tapered wrist lands beneath the camera-facing wrist volume instead of
    // leaving a visible lateral gap.
    forearm.position.x = 0;
    forearm.position.z = -0.018;
    const elbow = mesh(cachedGeometry("hand-elbow-v26", () => new THREE.SphereGeometry(1, 8, 6)), getMaterial(COLORS.skinShadow, 0.72, 0));
    elbow.position.set(0, -0.235, -0.018);
    elbow.scale.set(0.032, 0.05, 0.028);
    const sleeve = mesh(cachedGeometry("tailored-sleeve-v28", () => new THREE.LatheGeometry([
      new THREE.Vector2(0, -0.22), new THREE.Vector2(0.026, -0.22), new THREE.Vector2(0.031, -0.17),
      new THREE.Vector2(0.032, -0.08), new THREE.Vector2(0.027, 0.015), new THREE.Vector2(0.022, 0.07),
      new THREE.Vector2(0, 0.07),
    ], 10)), getMaterial(COLORS.sleeve, 0.72, 0.04));
    sleeve.position.set(0, -0.155, -0.018);
    sleeve.rotation.z = sign * 0.08;
    const cuff = mesh(cachedGeometry("tailored-cuff-v28", () => new THREE.CylinderGeometry(0.024, 0.027, 0.028, 10)), getMaterial(COLORS.sleeveCuff, 0.58, 0.08));
    // Bridge the sleeve's top directly into the wrist's lower edge. The
    // former cuff sat ahead of both pieces and read as a detached dark bar.
    cuff.position.set(0, -0.098, -0.018);
    cuff.rotation.z = sign * 0.08;
    // Keep a single tapered forearm and elbow underneath the short cuff. The
    // authored hand supplies the grip itself; this controlled bridge keeps
    // its wrist visibly connected without substituting generic finger art.
    forearm.rotation.z = sign * 0.08;
    // The forearm splays out toward the player's lower corner, but the palm
    // and wrist stay in the camera-facing grip plane. Counter-rotate these
    // two volumes against the arm splay so the hand does not collapse edge-on
    // while the tapered forearm still reads as a connected transition.
    palm.rotation.z = -sign * (view === "player" ? 0.5 : 0.42);
    wrist.rotation.z = palm.rotation.z;
    armAnatomy.add(forearm, elbow, sleeve, cuff);
    // Keep the outer hand pivot and stick on local +Y, but angle the wrist
    // and forearm away from that axis like a real matched-grip hand.
    // A small inward roll keeps the palm, fingers, and shaft in one matched
    // grip plane; the former 24–26° roll separated the forearm silhouette from
    // the finger pose at the compact player camera.
    // Let the forearm arrive from the lower outer corner, with the wrist
    // turning naturally into the camera-readable palm instead of projecting
    // as a detached horizontal bar.
    armAnatomy.rotation.set(-0.14, sign * 0.05, sign * (view === "player" ? 0.5 : 0.42));
    // Keep the shaft on the animated hand root. Palm and digits twist in this
    // child grip group so their matched-grip roll cannot hide the stick.
    grip.add(palm, wrist, armAnatomy);
    hand.add(grip);
    // A real swept tube keeps each digit round in the light. The old flat
    // ribbons followed the shaft axis and collapsed into one slash in the
    // compact practice projection; these arcs remain separated at the
    // knuckles, then converge onto the actual stick cross-section.
    const digitMaterial = getMaterial(COLORS.skinLight, 0.68, 0, THREE.DoubleSide);
    const digitAccentMaterial = getMaterial(COLORS.skinShadow, 0.7, 0, THREE.DoubleSide);
    const sweptDigitGeometry = (key: string, paths: THREE.Vector3[][], radiusSets: number[][]): THREE.BufferGeometry => cachedGeometry(key, () => {
      const radialSegments = 7;
      const positions: number[] = [];
      const indices: number[] = [];
      const appendProng = (path: THREE.Vector3[], radii: number[]): void => {
        const pathSegments = path.length - 1;
        const baseVertex = positions.length / 3;
        for (let step = 0; step <= pathSegments; step += 1) {
          const point = path[step];
          const radius = radii[step];
          const previous = path[Math.max(0, step - 1)];
          const next = path[Math.min(pathSegments, step + 1)];
          const tangent = new THREE.Vector3().subVectors(next, previous).normalize();
          const reference = Math.abs(tangent.y) < 0.85
            ? new THREE.Vector3(0, 1, 0)
            : new THREE.Vector3(1, 0, 0);
          const normalA = new THREE.Vector3().crossVectors(tangent, reference).normalize();
          const normalB = new THREE.Vector3().crossVectors(tangent, normalA).normalize();
          for (let radial = 0; radial < radialSegments; radial += 1) {
            const angle = (radial / radialSegments) * Math.PI * 2;
            positions.push(
              point.x + (normalA.x * Math.cos(angle) + normalB.x * Math.sin(angle)) * radius,
              point.y + (normalA.y * Math.cos(angle) + normalB.y * Math.sin(angle)) * radius,
              point.z + (normalA.z * Math.cos(angle) + normalB.z * Math.sin(angle)) * radius,
            );
          }
        }
        for (let step = 0; step < pathSegments; step += 1) {
          for (let radial = 0; radial < radialSegments; radial += 1) {
            const next = (radial + 1) % radialSegments;
            const a = baseVertex + step * radialSegments + radial;
            const b = baseVertex + step * radialSegments + next;
            const c = baseVertex + (step + 1) * radialSegments + next;
            const d = baseVertex + (step + 1) * radialSegments + radial;
            indices.push(a, b, d, b, c, d);
          }
        }
        const bottomCenter = positions.length / 3;
        positions.push(path[0].x, path[0].y, path[0].z);
        const topCenter = positions.length / 3;
        positions.push(path[pathSegments].x, path[pathSegments].y, path[pathSegments].z);
        const topRing = baseVertex + pathSegments * radialSegments;
        for (let radial = 0; radial < radialSegments; radial += 1) {
          const next = (radial + 1) % radialSegments;
          indices.push(bottomCenter, baseVertex + next, baseVertex + radial, topCenter, topRing + radial, topRing + next);
        }
      };
      paths.forEach((path, index) => appendProng(path, radiusSets[index]));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    });
    // Separate draw objects are intentional here: at the 844x340 practice
    // projection a single merged tube lets the stick/palm depth-test away the
    // lane gaps. Each lane remains measured (12 mm diameter) and cached, but
    // can now carry its own small highlight and silhouette.
    const digitRadius = HAND_DIMENSIONS.fingerDiameter * 0.44;
    const fingerXs = [-0.041, -0.014, 0.014, 0.041];
    const fingerLengths = [0.065, 0.073, 0.071, 0.063];
    // The bases stay in four 26 mm lanes (well within the 86 mm palm), while
    // each fingertip takes its own 3D route to the shaft. The 16–18 mm y
    // offsets and small x offsets at contact keep four fingertips legible
    // around the 14.4 mm shaft instead of collapsing into one distal point.
    const fingerPaths = fingerXs.map((x, index) => {
      const baseX = sign * x;
      const towardShaft = baseX > 0 ? -1 : 1;
      const reach = Math.abs(baseX) - 0.006;
      const y = 0.014 + index * 0.017;
      const length = fingerLengths[index];
      const contactX = sign * [-0.015, -0.005, 0.005, 0.015][index];
      return [
        new THREE.Vector3(baseX, y, 0.014),
        new THREE.Vector3(baseX + towardShaft * reach * 0.2, y + length * 0.12, 0.021),
        new THREE.Vector3(baseX + towardShaft * reach * 0.58, y + length * 0.29, 0.026),
        new THREE.Vector3(sign * 0.018, y + length * 0.45, 0.027),
        new THREE.Vector3(contactX, y + length * 0.63, 0.017),
        new THREE.Vector3(contactX, y + length, 0.008),
      ];
    });
    const fingerRadii = fingerLengths.map(() => [digitRadius * 0.7, digitRadius * 0.92, digitRadius, digitRadius * 0.94, digitRadius * 0.82, digitRadius * 0.5]);
    const thumbRadius = HAND_DIMENSIONS.fingerDiameter * 0.38;
    const thumbPath = [
      new THREE.Vector3(sign * 0.048, 0.003, 0.018),
      new THREE.Vector3(sign * 0.039, 0.015, 0.026),
      new THREE.Vector3(sign * 0.024, 0.031, 0.03),
      new THREE.Vector3(sign * 0.008, 0.047, 0.022),
      new THREE.Vector3(-sign * 0.012, 0.067, 0.01),
    ];
    const thumbRadii = [thumbRadius * 0.76, thumbRadius, thumbRadius * 1.04, thumbRadius * 0.88, thumbRadius * 0.5];
    const digitMeshes = fingerPaths.map((path, index) => mesh(
      sweptDigitGeometry(`matched-grip-finger-v23:${sign}:${index}`, [path], [fingerRadii[index]]),
      index % 2 === 0 ? digitMaterial : digitAccentMaterial,
    ));
    const thumbMesh = mesh(
      sweptDigitGeometry(`matched-grip-thumb-v23:${sign}`, [thumbPath], [thumbRadii]),
      digitAccentMaterial,
    );
    grip.add(...digitMeshes, thumbMesh);
    // Small merged cues survive the compact projection better than separate
    // full finger meshes: one pale nail/one shaded knuckle per lane, with the
    // opposed thumb included in the same per-hand instanced draws.
    const cueGeometry = cachedGeometry("hand-cue-sphere-v22", () => new THREE.SphereGeometry(1, 6, 4));
    const nailCues = new THREE.InstancedMesh(cueGeometry, getMaterial(COLORS.nail, 0.5, 0), 5);
    const knuckleCues = new THREE.InstancedMesh(cueGeometry, getMaterial(COLORS.skinShadow, 0.72, 0), 5);
    const cueMatrix = new THREE.Matrix4();
    const cuePosition = new THREE.Vector3();
    const cueScale = new THREE.Vector3();
    for (let index = 0; index < 4; index += 1) {
      const finger = fingerPaths[index];
      const tip = finger[finger.length - 1];
      const knuckle = finger[2];
      cuePosition.set(tip.x, tip.y, tip.z + 0.004);
      cueScale.set(0.006, 0.0035, 0.0018);
      cueMatrix.compose(cuePosition, new THREE.Quaternion(), cueScale);
      nailCues.setMatrixAt(index, cueMatrix);
      cuePosition.set(knuckle.x, knuckle.y, knuckle.z + 0.002);
      cueScale.set(0.0055, 0.0055, 0.0045);
      cueMatrix.compose(cuePosition, new THREE.Quaternion(), cueScale);
      knuckleCues.setMatrixAt(index, cueMatrix);
    }
    const thumbTip = thumbPath[thumbPath.length - 1];
    cuePosition.set(thumbTip.x, thumbTip.y, thumbTip.z + 0.004);
    cueScale.set(0.006, 0.0035, 0.0018);
    cueMatrix.compose(cuePosition, new THREE.Quaternion(), cueScale);
    nailCues.setMatrixAt(4, cueMatrix);
    const thumbKnuckle = thumbPath[2];
    cuePosition.set(thumbKnuckle.x, thumbKnuckle.y, thumbKnuckle.z + 0.002);
    cueScale.set(0.0055, 0.0055, 0.0045);
    cueMatrix.compose(cuePosition, new THREE.Quaternion(), cueScale);
    knuckleCues.setMatrixAt(4, cueMatrix);
    nailCues.instanceMatrix.needsUpdate = true;
    knuckleCues.instanceMatrix.needsUpdate = true;
    grip.add(nailCues, knuckleCues);
    staticObjectCount += 2;
    const stick = createStick();
    stick.position.y = 0.055;
    hand.add(stick);
    // Keep the wrist inside the playable envelope so a real 406.4 mm 5A
    // stick can reach the rack/snares from rest. The forearm then splays back
    // toward the lower outer corners through the anatomy rotation above.
    // Solve the idle wrist from a real playing surface and the measured stick
    // reach. The visible tip is therefore on the snare or hi-hat at rest,
    // rather than ending hundreds of millimetres in front of the kit.
    const restTarget = side === "left"
      ? new THREE.Vector3(-0.58, 0.76 + 0.12, 0.62)
      // Idle right hand rests over the right-side floor-tom playing envelope;
      // hi-hat crossover uses targetPoints.hihat during an actual hit.
      : new THREE.Vector3(0.95, 0.62 + 0.12, 0.64);
    const restDirection = side === "left"
      ? new THREE.Vector3(-0.72, -0.36, -0.60).normalize()
      : new THREE.Vector3(0.72, -0.32, -0.61).normalize();
    const restPosition = restTarget.clone().addScaledVector(restDirection, -(STICK_DIMENSIONS.length + 0.055));
    hand.position.copy(restPosition);
    const restQuaternion = new THREE.Quaternion();
    setGripQuaternion(restDirection, restPosition, restQuaternion);
    hand.quaternion.copy(restQuaternion);
    const visualQuaternion = new THREE.Quaternion();
    setVisualGripQuaternion(restDirection, restPosition, visualQuaternion);
    gripLocalQuaternion.copy(restQuaternion).invert();
    grip.quaternion.copy(gripLocalQuaternion).multiply(visualQuaternion);
    group.add(hand);
    return {
      group: hand,
      grip,
      stick,
      palm,
      forearm,
      elbow,
      sleeve,
      cuff,
      proceduralHandVisuals: [...digitMeshes, thumbMesh, nailCues, knuckleCues],
      visualQuaternion,
      restVisualQuaternion: visualQuaternion.clone(),
      restPosition,
      restQuaternion,
      strikePosition: new THREE.Vector3(),
      strikeQuaternion: new THREE.Quaternion(),
      strikeDirection: new THREE.Vector3(),
      pose: { down: 0, rebound: 0, rotation: 0 },
      state: createHitAnimationState(side),
    };
  };
  const hands: Record<HandSide, HandRig> = { left: createHand("left"), right: createHand("right") };

  const targetPoints: Record<Instrument, THREE.Vector3> = {
    kick: new THREE.Vector3(0, 0.43, 0.12), snare: new THREE.Vector3(-0.58, 0.76, 0.84),
    hihat: new THREE.Vector3(-0.78, 1.05, 0.87), tom: new THREE.Vector3(-0.02, 0.84, 0.02), crash: new THREE.Vector3(-1.2, 1.40, 0.23),
  };
  const strikeDirections: Record<Instrument, THREE.Vector3> = {
    kick: new THREE.Vector3(0, -0.1, -1).normalize(), snare: new THREE.Vector3(0.08, -0.5, -0.86).normalize(),
    hihat: new THREE.Vector3(0.08, -0.3, -0.95).normalize(), tom: new THREE.Vector3(-0.05, -0.46, -0.89).normalize(), crash: new THREE.Vector3(0.08, -0.38, -0.92).normalize(),
  };

  const classifyLoadedPoint = (point: THREE.Vector3): Instrument => {
    // The supplied kit is a static five-material mesh, so its node names do
    // not expose per-drum hit parts. Use the existing physical playing
    // targets as a stable nearest-surface map for pointer picking instead of
    // replacing the public five-voice contract or raycasting every frame.
    let nearest: Instrument = "tom";
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const instrument of INSTRUMENTS) {
      const distance = point.distanceToSquared(targetPoints[instrument]);
      if (distance < nearestDistance) {
        nearest = instrument;
        nearestDistance = distance;
      }
    }
    return nearest;
  };

  const disposeImportedRoot = (root: THREE.Object3D): void => {
    root.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (!renderable.isMesh) return;
      renderable.geometry.dispose();
      const material = renderable.material;
      const materialsToDispose = Array.isArray(material) ? material : [material];
      for (const importedMaterial of materialsToDispose) {
        for (const value of Object.values(importedMaterial)) {
          if (value && typeof value === "object" && "isTexture" in value && (value as THREE.Texture).isTexture) {
            (value as THREE.Texture).dispose();
          }
        }
        importedMaterial.dispose();
      }
    });
  };

  const tintImportedMaterials = (root: THREE.Object3D, hand = false): void => {
    root.traverse((object) => {
      const renderable = object as THREE.Mesh;
      if (!renderable.isMesh) return;
      const importedMaterials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      for (const importedMaterial of importedMaterials) {
        const material = importedMaterial as THREE.MeshStandardMaterial;
        if (hand) {
          // FUZE's albedo is intentionally neutral so it can be tinted by the
          // host. Keep the map/normal intact and multiply it by a warm skin
          // tone rather than replacing the authored hand shading.
          material.color.set(0xb87968);
          material.roughness = 0.64;
          material.metalness = 0;
          continue;
        }
        switch (material.name) {
          case "accent":
            material.color.set(0x48151d);
            material.roughness = 0.3;
            material.metalness = 0.08;
            break;
          case "shell":
            material.color.set(0x46151c);
            material.roughness = 0.3;
            material.metalness = 0.08;
            break;
          case "amber":
          case "brass":
            material.color.set(0x94683c);
            material.roughness = 0.3;
            material.metalness = 0.76;
            break;
          case "metal":
            material.color.set(0xb9c4ca);
            material.roughness = 0.27;
            material.metalness = 0.88;
            break;
          case "cream":
            material.color.set(0xc9c0b1);
            material.roughness = 0.48;
            material.metalness = 0.04;
            break;
          case "black":
          case "gear":
            material.color.set(0x16191d);
            material.roughness = 0.48;
            material.metalness = 0.08;
            break;
          default:
            break;
        }
      }
    });
  };

  const loadLicensedAssets = async (): Promise<void> => {
    try {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const loadGlb = async (url: string, resourcePath: string): Promise<THREE.Object3D> => {
        const response = await fetch(url, { signal: assetAbortController.signal, cache: "force-cache" });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const buffer = await response.arrayBuffer();
        const loader = new GLTFLoader();
        return await new Promise<THREE.Object3D>((resolve, reject) => {
          loader.parse(buffer, resourcePath, (gltf) => resolve(gltf.scene), reject);
        });
      };
      const results = await Promise.allSettled([
        loadGlb("/models/drums/components/bass-toms.glb", "/models/drums/components/"),
        loadGlb("/models/drums/components/snare-stand.glb", "/models/drums/components/"),
        loadGlb("/models/drums/components/floor-tom.glb", "/models/drums/components/"),
        loadGlb("/models/drums/components/hihat-stand.glb", "/models/drums/components/"),
        loadGlb("/models/drums/components/crash-stand.glb", "/models/drums/components/"),
        loadGlb("/models/drums/hands/left-hold.glb", "/models/drums/hands/"),
        loadGlb("/models/drums/hands/right-hold.glb", "/models/drums/hands/"),
      ]);
      if (results.some((result) => result.status !== "fulfilled")) {
        // Promise.allSettled lets us reclaim any successful sibling loads when
        // one asset is unavailable, instead of leaking a partial GLTF scene.
        for (const result of results) {
          if (result.status === "fulfilled") disposeImportedRoot(result.value);
        }
        throw new Error("one or more licensed model assets failed to load");
      }
      const fulfilledResults = results as [
        PromiseFulfilledResult<THREE.Object3D>,
        PromiseFulfilledResult<THREE.Object3D>,
        PromiseFulfilledResult<THREE.Object3D>,
        PromiseFulfilledResult<THREE.Object3D>,
        PromiseFulfilledResult<THREE.Object3D>,
        PromiseFulfilledResult<THREE.Object3D>,
        PromiseFulfilledResult<THREE.Object3D>,
      ];
      const [bassRoot, snareRoot, floorRoot, hihatRoot, crashRoot, leftHandRoot, rightHandRoot] = fulfilledResults.map((result) => result.value);
      if (disposed) {
        disposeImportedRoot(bassRoot);
        disposeImportedRoot(snareRoot);
        disposeImportedRoot(floorRoot);
        disposeImportedRoot(hihatRoot);
        disposeImportedRoot(crashRoot);
        disposeImportedRoot(leftHandRoot);
        disposeImportedRoot(rightHandRoot);
        return;
      }
      importedAssetRoots.push(bassRoot, snareRoot, floorRoot, hihatRoot, crashRoot, leftHandRoot, rightHandRoot);
      tintImportedMaterials(bassRoot);
      tintImportedMaterials(snareRoot);
      tintImportedMaterials(floorRoot);
      tintImportedMaterials(hihatRoot);
      tintImportedMaterials(crashRoot);
      tintImportedMaterials(leftHandRoot, true);
      tintImportedMaterials(rightHandRoot, true);
      const kitAssembly = new THREE.Group();
      const placeComponent = (root: THREE.Object3D, instrument: Instrument, x: number, y: number, z: number, tilt = 0): void => {
        root.position.set(x, y, z);
        root.rotation.x = tilt;
        root.userData.baseY = y;
        root.userData.baseRotationZ = root.rotation.z;
        kitAssembly.add(root);
        loadedComponentRoots[instrument].push(root);
      };
      // Keep the kick/rack-tom asset registered only with kick: its GLB has
      // one non-semantic rigid root, so no child can safely react to a tom
      // hit without moving the kick. Tom contact/rebound remains visible on
      // the exact stick, while the independent floor tom keeps its response.
      // Put the bass/rack-tom shell slightly behind independent heads so the
      // normal player-side (+Z) layout leaves snare/tom surfaces readable.
      placeComponent(bassRoot, "kick", 0, 0, -0.16);
      placeComponent(snareRoot, "snare", -0.58, 0, 0.52, 0.04);
      placeComponent(floorRoot, "tom", 0.82, 0, 0.62, 0.02);
      placeComponent(hihatRoot, "hihat", -0.78, 0, 0.7, 0.08);
      placeComponent(crashRoot, "crash", -1.2, 0, 0.28, 0.12);
      const rightCrashRoot = crashRoot.clone(true);
      rightCrashRoot.position.set(1.12, 0.03, 0.5);
      rightCrashRoot.scale.setScalar(0.96);
      rightCrashRoot.userData.baseY = rightCrashRoot.position.y;
      rightCrashRoot.userData.baseRotationZ = rightCrashRoot.rotation.z;
      kitAssembly.add(rightCrashRoot);
      loadedComponentRoots.crash.push(rightCrashRoot);
      group.add(kitAssembly);
      loadedKitVisible = true;
      raycastTargets = [kitAssembly];
      for (const object of proceduralKitObjects) object.visible = false;
      kickMechanism.visible = false;

      const handAssets: Array<[HandSide, THREE.Object3D]> = [["left", leftHandRoot], ["right", rightHandRoot]];
      for (const [side, assetRoot] of handAssets) {
        const rig = hands[side];
        for (const visual of rig.proceduralHandVisuals) visual.visible = false;
        // Retain one measured procedural palm as a warm silhouette behind the
        // authored hold mesh. It bridges the licensed fingers into the sleeve
        // without adding any new animated geometry or enlarging the hand.
        rig.palm.visible = true;
        rig.palm.position.z = -0.065;
        rig.forearm.visible = true;
        rig.elbow.visible = true;
        rig.sleeve.visible = false;
        rig.cuff.visible = true;
        // The authored mesh is a 150 mm hand pose. Uniformly scale to the
        // reference 190 mm wrist-to-middle-finger length, then keep the
        // procedural wrist/forearm transition behind it.
        assetRoot.scale.setScalar(HAND_DIMENSIONS.wristToMiddleFinger / 0.15);
        // FUZE's wrist-to-fingertip axis is local X (verified from the GLB
        // bounds), while the 5A shaft is local +Y. Opposite Z rolls align
        // each mirrored hold around that shaft. A local half-turn about the
        // newly aligned shaft presents the authored dorsal/curled side, not
        // the palm-forward silhouette that made a closed hold look open.
        assetRoot.rotation.z = side === "left" ? Math.PI / 2 : -Math.PI / 2;
        assetRoot.rotateY(Math.PI);
        assetRoot.position.set(0, 0.058, -0.008);
        rig.grip.add(assetRoot);
        loadedHandRoots[side] = assetRoot;
      }
      staticObjectCount = countVisibleMeshObjects();
      metadataPublished = false;
      render();
    } catch (error) {
      if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) {
        console.warn("[DrumKit] licensed model load failed; keeping procedural fallback", error);
      }
    }
  };
  const kickState = createKickAnimationState();
  const kickPose: HitPose = { down: 0, rebound: 0, rotation: 0 };

  const ambient = new THREE.HemisphereLight(0xffead0, 0x17212d, 2.05);
  const key = new THREE.DirectionalLight(0xffe6c2, 2.8);
  key.position.set(-3.5, 6.2, 5.5);
  const fill = new THREE.DirectionalLight(0x9bc4e9, 1.3);
  fill.position.set(4, 3.5, 2);
  const rim = new THREE.DirectionalLight(0xa5b8ff, 1.45);
  rim.position.set(0, 4, -5);
  scene.add(ambient, key, fill, rim);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const onPointerDown = (event: PointerEvent): void => {
    const rect = renderer.domElement.getBoundingClientRect();
    const pixelRatio = renderer.getPixelRatio();
    const viewportLeft = rect.left + renderViewportX / pixelRatio;
    const viewportWidth = renderViewportWidth / pixelRatio;
    if (event.clientX < viewportLeft || event.clientX > viewportLeft + viewportWidth) return;
    pointer.set(((event.clientX - viewportLeft) / viewportWidth) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const intersection of raycaster.intersectObjects(raycastTargets, true)) {
      const candidate = intersection.object as DrumMesh;
      if (candidate.userData.instrument) { hit(candidate.userData.instrument); break; }
      if (loadedKitVisible) { hit(classifyLoadedPoint(intersection.point)); break; }
    }
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!interactive || event.repeat) return;
    const instrument = ({ Space: "kick", KeyF: "snare", KeyJ: "hihat", KeyK: "tom", KeyL: "crash" } as Record<string, Instrument>)[event.code];
    if (!instrument) return;
    event.preventDefault();
    hit(instrument);
  };
  if (interactive) {
    renderer.domElement.addEventListener("pointerdown", onPointerDown, { passive: true });
    renderer.domElement.addEventListener("keydown", onKeyDown);
  }

  let disposed = false;
  let raf = 0;
  let lastFrame = 0;
  let running = false;
  let onScreen = true;
  let lastHit: DrumKitSnapshot["lastHit"] = null;
  let metadataPublished = false;
  const countVisibleMeshObjects = (): number => {
    let count = 0;
    scene.traverseVisible((object) => {
      if ((object as THREE.Mesh).isMesh) count += 1;
    });
    return count;
  };
  const publishMetadata = (): void => {
    if (metadataPublished) return;
    metadataPublished = true;
    const metadata = {
      modelVersion: DRUM_MODEL_VERSION,
      view,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      staticObjectCount,
    };
    for (const [key, value] of Object.entries(metadata)) {
      host.dataset[key] = String(value);
      renderer.domElement.dataset[key] = String(value);
    }
  };
  const render = (): void => {
    if (disposed) return;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderBufferWidth, renderBufferHeight);
    renderer.clear();
    renderer.setScissorTest(true);
    renderer.setViewport(renderViewportX, 0, renderViewportWidth, renderViewportHeight);
    renderer.setScissor(renderViewportX, 0, renderViewportWidth, renderViewportHeight);
    renderer.render(scene, camera);
    publishMetadata();
  };
  const frame = (time: number): void => {
    if (disposed) return;
    const delta = lastFrame === 0 ? 16 : Math.min(50, time - lastFrame);
    lastFrame = time;
    advanceInternal(delta);
    // Exactly one continuation is scheduled for each active frame callback.
    if (running) {
      raf = requestAnimationFrame(frame);
    }
  };
  const ensureRunning = (): void => {
    if (running || disposed || !onScreen || document.hidden) return;
    running = true;
    lastFrame = 0;
    raf = requestAnimationFrame(frame);
  };
  const advanceInternal = (ms: number): void => {
    let active = false;
    advanceHit(kickState, ms);
    sampleHitInto(kickState, kickPose, reducedMotion);
    if (kickState.active || kickPose.down > 0) {
      active = kickState.active;
      pedal.rotation.x = -kickPose.down * 0.22;
      // Rest clear of the head; the downstroke leans back into the kick face.
      beater.rotation.x = -0.26 - kickPose.down * 0.42;
    } else { pedal.rotation.x = 0; beater.rotation.x = -0.26; }
    for (const side of HAND_SIDES) {
      const rig = hands[side];
      advanceHit(rig.state, ms);
      sampleHitInto(rig.state, rig.pose, reducedMotion);
      const target = targetPoints[rig.state.instrument];
      const strikeDirection = strikeDirections[rig.state.instrument];
      if (rig.state.active || rig.pose.down > 0) {
        active = active || rig.state.active;
        rig.strikeDirection.copy(strikeDirection);
        // The stick is offset 55 mm into the palm; place its actual teardrop
        // tip on the playable surface rather than ending short or floating.
        rig.strikePosition.copy(target).addScaledVector(strikeDirection, -(STICK_DIMENSIONS.length + 0.055) + 0.012);
        setGripQuaternion(rig.strikeDirection, rig.strikePosition, rig.strikeQuaternion);
        setVisualGripQuaternion(rig.strikeDirection, rig.strikePosition, rig.visualQuaternion);
        rig.group.position.lerpVectors(rig.restPosition, rig.strikePosition, rig.pose.down);
        rig.group.quaternion.slerpQuaternions(rig.restQuaternion, rig.strikeQuaternion, rig.pose.down);
      } else { rig.group.position.copy(rig.restPosition); rig.group.quaternion.copy(rig.restQuaternion); rig.visualQuaternion.copy(rig.restVisualQuaternion); }
      updateGripPlane(rig);
    }
    for (const instrument of INSTRUMENTS) {
      let response = 0;
      if (kickState.active && instrument === "kick") response = kickPose.down * 0.03 + kickPose.rebound * 0.012;
      for (const side of HAND_SIDES) {
        const rig = hands[side];
        if (rig.state.active && rig.state.instrument === instrument) response = Math.max(response, rig.pose.down * 0.025 + rig.pose.rebound * 0.01);
      }
      for (const item of reactiveMeshes[instrument]) {
        const reactive = item as DrumMesh;
        item.position.y = (reactive.userData.baseY ?? item.position.y) - response;
        item.rotation.z = response * 0.12;
      }
      for (const component of loadedComponentRoots[instrument]) {
        const baseY = typeof component.userData.baseY === "number" ? component.userData.baseY : component.position.y;
        const baseRotationZ = typeof component.userData.baseRotationZ === "number" ? component.userData.baseRotationZ : 0;
        component.position.y = baseY - response * 0.024;
        component.rotation.z = baseRotationZ + response * 0.12;
      }
    }
    if (active) render();
    else if (running) { running = false; cancelAnimationFrame(raf); render(); }
  };
  const hit = (instrument: Instrument, hand?: HandSide, velocity = 1): void => {
    if (instrument === "kick") {
      restartHit(kickState, instrument, "right", velocity);
      lastHit = { instrument, hand: null, velocity: Math.max(0.35, Math.min(1.4, velocity)) };
    } else {
      const side = resolveHitHand(instrument, hand);
      restartHit(hands[side].state, instrument, side, velocity);
      lastHit = { instrument, hand: side, velocity: Math.max(0.35, Math.min(1.4, velocity)) };
    }
    ensureRunning();
  };
  const resize = (): void => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const viewportCssWidth = view === "player" ? Math.min(width, height * (16 / 9)) : width;
    const pixelRatio = renderer.getPixelRatio();
    renderBufferWidth = Math.max(1, Math.round(width * pixelRatio));
    renderBufferHeight = Math.max(1, Math.round(height * pixelRatio));
    renderViewportX = Math.max(0, Math.round((width - viewportCssWidth) * 0.5 * pixelRatio));
    renderViewportWidth = Math.max(1, Math.round(viewportCssWidth * pixelRatio));
    renderViewportHeight = renderBufferHeight;
    camera.aspect = viewportCssWidth / height;
    // Portrait/mobile canvases need a little more horizontal breathing room;
    // desktop stays at the tighter base framing so the kit remains prominent.
    const narrowPad = Math.min(8, Math.max(0, (1.2 / camera.aspect - 1) * 24));
    camera.fov = baseFov + narrowPad;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const onVisibilityChange = (): void => {
    if (document.hidden || !onScreen) { running = false; cancelAnimationFrame(raf); return; }
    if (kickState.active || hands.left.state.active || hands.right.state.active) ensureRunning();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  const intersectionObserver = new IntersectionObserver((entries) => { onScreen = entries[0]?.isIntersecting ?? true; onVisibilityChange(); }, { threshold: 0.01 });
  intersectionObserver.observe(host);
  staticObjectCount = countVisibleMeshObjects();
  resize();
  render();
  void loadLicensedAssets();

  return {
    element: renderer.domElement,
    hit,
    advance(ms: number): void { advanceInternal(ms); },
    snapshot(): DrumKitSnapshot {
      const activeHits: DrumKitSnapshot["activeHits"] = [];
      if (kickState.active) activeHits.push({ instrument: "kick", hand: null, progress: Math.round(kickState.elapsedMs / kickState.durationMs * 100) / 100 });
      for (const side of HAND_SIDES) {
        const state = hands[side].state;
        if (state.active) activeHits.push({ instrument: state.instrument, hand: side, progress: Math.round(state.elapsedMs / state.durationMs * 100) / 100 });
      }
      return {
        activeHits,
        lastHit,
        kick: { active: kickState.active, progress: Math.round(kickState.elapsedMs / kickState.durationMs * 100) / 100 },
        running,
        modelVersion: DRUM_MODEL_VERSION,
        modelScale: MODEL_SCALE,
        view,
        renderer: { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, staticObjectCount },
      };
    },
    resize,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (interactive) {
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("keydown", onKeyDown);
      }
      assetAbortController.abort();
      for (const root of importedAssetRoots) disposeImportedRoot(root);
      for (const value of geometryCache.values()) value.dispose();
      for (const material of materials.values()) material.dispose();
      surfaceTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

export { DEFAULT_HAND_BY_INSTRUMENT, HIT_DURATION_MS, DRUM_DIMENSIONS, HAND_DIMENSIONS, MODEL_SCALE, STICK_DIMENSIONS, DRUM_MODEL_VERSION };
