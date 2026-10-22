import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type GltfDocument = {
  accessors?: Array<{ count: number; type: string; min?: number[]; max?: number[] }>;
  meshes?: Array<{ name?: string; primitives?: Array<{ attributes: Record<string, number>; indices?: number }> }>;
  nodes?: Array<{ skin?: number }>;
};

const readGltfJson = (filePath: string): GltfDocument => {
  const file = readFileSync(filePath);
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("hand model is not a GLB file");
  if (view.getUint32(4, true) !== 2) throw new Error("hand model must use GLB 2.0");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) throw new Error("hand model has no first JSON chunk");
  const jsonBytes = new Uint8Array(file.buffer, file.byteOffset + 20, jsonLength);
  return JSON.parse(new TextDecoder().decode(jsonBytes)) as GltfDocument;
};

describe("Blender-authored CC0 matched-grip hand and forearm", () => {
  it("ships as separate baked hand and forearm meshes within the per-hand triangle budget", () => {
    const document = readGltfJson(resolve(process.cwd(), "public/models/drums/hands/blender-cc0-matched-grip-arm-v7.glb"));
    const meshes = document.meshes ?? [];
    const primitives = meshes.flatMap((mesh) => mesh.primitives ?? []);
    expect(primitives).toHaveLength(2);
    expect(document.nodes?.some((node) => node.skin !== undefined)).toBe(false);

    let triangles = 0;
    for (const primitive of primitives) {
      expect(primitive.attributes).toHaveProperty("POSITION");
      expect(primitive.attributes).toHaveProperty("NORMAL");
      expect(primitive.attributes).not.toHaveProperty("JOINTS_0");
      expect(primitive.attributes).not.toHaveProperty("WEIGHTS_0");
      const indexAccessor = document.accessors?.[primitive.indices ?? -1];
      expect(indexAccessor?.type).toBe("SCALAR");
      triangles += (indexAccessor?.count ?? 0) / 3;
    }
    expect(triangles).toBeLessThanOrEqual(2_200);

    const handMesh = meshes.find((mesh) => mesh.name?.toLowerCase().includes("static hand mesh"));
    const forearmMesh = meshes.find((mesh) => mesh.name?.toLowerCase().includes("static forearm mesh"));
    expect(handMesh).toBeDefined();
    expect(forearmMesh).toBeDefined();
    const handPositions = document.accessors?.[handMesh?.primitives?.[0]?.attributes.POSITION ?? -1];
    const armPositions = document.accessors?.[forearmMesh?.primitives?.[0]?.attributes.POSITION ?? -1];
    const extent = (positions: typeof handPositions, axis: number): number => (positions?.max?.[axis] ?? 0) - (positions?.min?.[axis] ?? 0);
    expect(extent(handPositions, 1)).toBeGreaterThanOrEqual(0.18);
    expect(extent(handPositions, 1)).toBeLessThanOrEqual(0.21);
    expect(extent(armPositions, 1)).toBeGreaterThanOrEqual(0.34);
    expect(extent(armPositions, 1)).toBeLessThanOrEqual(0.38);
  });
});
