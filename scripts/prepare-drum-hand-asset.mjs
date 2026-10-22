import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "assets/posable-right-cc0-source.glb");
const outputPath = path.join(projectRoot, "public/models/drums/hands/posable-right-cc0-grip.glb");
const targetGripTriangles = 1_418;
const verticesToRemove = 5_655;

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing CC0 source hand: ${path.relative(projectRoot, sourcePath)}`);
}

const source = fs.readFileSync(sourcePath);
const sourceBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
const sourceScene = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(sourceBuffer, "", (gltf) => resolve(gltf.scene), reject);
});

let skinnedHand = null;
const bones = new Map();
sourceScene.traverse((object) => {
  if (object.isSkinnedMesh) skinnedHand = object;
  if (object.isBone) bones.set(object.name, object);
});
const requireBone = (name) => {
  const bone = bones.get(name);
  if (!bone) throw new Error(`The CC0 source hand is missing bone ${name}`);
  return bone;
};
if (!skinnedHand) throw new Error("The CC0 source hand has no skinned mesh");

sourceScene.updateMatrixWorld(true);
const wrist = requireBone("hand_r");
const middleTip = requireBone("middle_03_r");
const wristRest = wrist.getWorldPosition(new THREE.Vector3());
const sourceLength = wristRest.distanceTo(middleTip.getWorldPosition(new THREE.Vector3()));
const scale = 0.19 / sourceLength;

// This deterministic pose curls the fingers into the engine's 5A grip. It is
// applied once here, not when a player opens a lesson or starts a hit.
for (const [finger, opposition] of [["index", 0.8], ["middle", 0.35], ["ring", 0.05], ["pinky", -0.5]]) {
  const proximal = requireBone(`${finger}_01_r`);
  proximal.rotateZ(0.2);
  requireBone(`${finger}_02_r`).rotateZ(0.35);
  requireBone(`${finger}_03_r`).rotateZ(0.25);
  proximal.rotateX(opposition);
}
for (const [joint, flex, opposition] of [["01", 0.2, 1.3], ["02", 0.3, 0.9], ["03", 0.18, 0.4]]) {
  const thumb = requireBone(`thumb_${joint}_r`);
  thumb.rotateZ(flex);
  thumb.rotateX(opposition);
}
sourceScene.updateMatrixWorld(true);
skinnedHand.skeleton.update();

const sourcePositions = skinnedHand.geometry.getAttribute("position");
const sourceTriangles = skinnedHand.geometry.getIndex()?.count / 3;
const bakedPositions = new Float32Array(sourcePositions.count * 3);
const point = new THREE.Vector3();
const alignFingerAxis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const bakedGeometry = skinnedHand.geometry.clone();
const bakedWrist = wrist.getWorldPosition(new THREE.Vector3());
for (let index = 0; index < sourcePositions.count; index += 1) {
  point.fromBufferAttribute(sourcePositions, index);
  skinnedHand.applyBoneTransform(index, point);
  skinnedHand.localToWorld(point);
  point.sub(bakedWrist).applyQuaternion(alignFingerAxis).multiplyScalar(scale);
  bakedPositions.set([point.x, point.y, point.z], index * 3);
}
bakedGeometry.setAttribute("position", new THREE.BufferAttribute(bakedPositions, 3));
for (const attribute of ["normal", "tangent", "uv", "skinIndex", "skinWeight"]) bakedGeometry.deleteAttribute(attribute);
bakedGeometry.clearGroups();

// The source body node has a negative scale determinant. Correct winding
// before reduction so the exported static mesh has outward-facing normals.
if (skinnedHand.matrixWorld.determinant() < 0) {
  const index = bakedGeometry.getIndex();
  if (index) {
    for (let face = 0; face < index.count; face += 3) {
      const second = index.getX(face + 1);
      index.setX(face + 1, index.getX(face + 2));
      index.setX(face + 2, second);
    }
  }
}

const reducedGeometry = new SimplifyModifier().modify(bakedGeometry, verticesToRemove);
bakedGeometry.dispose();
reducedGeometry.computeVertexNormals();
reducedGeometry.computeBoundingBox();
reducedGeometry.computeBoundingSphere();
const triangleCount = reducedGeometry.getIndex()?.count / 3;
if (!Number.isFinite(triangleCount) || triangleCount !== targetGripTriangles) {
  throw new Error(`Expected ${targetGripTriangles} grip triangles, generated ${triangleCount}`);
}

const material = new THREE.MeshStandardMaterial({ color: 0xa87569, roughness: 0.68, metalness: 0 });
const mesh = new THREE.Mesh(reducedGeometry, material);
mesh.name = "CC0 Anatomical Hand — Curled 5A Grip";
mesh.userData = {
  source: "Innerscene Posable Anatomical Right Hand",
  sourceUrl: "https://www.innerscene.com/tools/library/3d-parts/posable-anatomical-right-hand-f6098b4f",
  license: "CC0 1.0 Universal",
  pose: "static curled 5A grip; wrist origin, engine finger axis +Y",
};
const outputScene = new THREE.Scene();
outputScene.name = "Drum Hero Static 5A Grip";
outputScene.userData = { license: "CC0 1.0 Universal", generatedBy: "scripts/prepare-drum-hand-asset.mjs" };
outputScene.add(mesh);

// GLTFExporter uses FileReader for its binary result. This tiny Node adapter
// keeps the authoring step local and does not add any browser runtime code.
globalThis.FileReader = class {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    void blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onloadend?.();
    });
  }
};

const binary = await new GLTFExporter().parseAsync(outputScene, { binary: true });
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, new Uint8Array(binary));
console.log(JSON.stringify({
  output: path.relative(projectRoot, outputPath),
  bytes: fs.statSync(outputPath).size,
  sourceTriangles,
  gripTriangles: triangleCount,
  gripVertices: reducedGeometry.getAttribute("position").count,
}));
