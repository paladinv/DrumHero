"""Bake the bundled CC0 rigged hand into a compact matched-grip hand/arm GLB.

Run this from Blender's Python console with the original
``assets/Hands Rigged/Hands + armature.blend`` open. The source blend is never
saved or overwritten; only the authored runtime GLB is written.
"""

from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(bpy.data.filepath).resolve().parents[2]
OUTPUT = ROOT / "public/models/drums/hands/blender-cc0-matched-grip-arm-v7.glb"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

ARMATURE_NAME = "Hand_Right"
HAND_NAME = "Hand.R"
AUTHORED_NAME = "CC0 Matched Grip Hand and Forearm"
MATERIAL_NAME = "CC0 Skin | warm neutral PBR"

# The source asset has four weighted bones per finger. Mild metacarpal splay,
# a stronger PIP curl, and a softer DIP curl form a relaxed matched grip.
DIGIT_CHAINS = (
    ("Bone.012", "Bone", "Bone.001", "Bone.002"),  # index
    ("Bone.013", "Bone.003", "Bone.004", "Bone.005"),  # middle
    ("Bone.014", "Bone.006", "Bone.007", "Bone.008"),  # ring
    ("Bone.015", "Bone.009", "Bone.010", "Bone.011"),  # little
)
DIGIT_FLEX = (
    (0.12, 0.48, 0.72, 0.42),
    (0.11, 0.46, 0.70, 0.40),
    (0.14, 0.52, 0.75, 0.43),
    (0.18, 0.56, 0.78, 0.45),
)


def make_skin_material():
    material = bpy.data.materials.get(MATERIAL_NAME) or bpy.data.materials.new(MATERIAL_NAME)
    material.diffuse_color = (0.64, 0.40, 0.31, 1.0)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Base Color"].default_value = (0.64, 0.40, 0.31, 1.0)
    shader.inputs["Roughness"].default_value = 0.58
    for socket_name, value in (("Subsurface Weight", 0.055), ("Sheen Weight", 0.08), ("Specular IOR Level", 0.30)):
        socket = shader.inputs.get(socket_name)
        if socket is not None:
            socket.default_value = value
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def pose_source_grip(armature):
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
    digit_splay = (-0.08, -0.025, 0.045, 0.11)
    for chain, flex, splay in zip(DIGIT_CHAINS, DIGIT_FLEX, digit_splay):
        for joint_index, (bone_name, angle) in enumerate(zip(chain, flex)):
            pose_bone = armature.pose.bones[bone_name]
            # In this rig each finger bends toward the palm around its local
            # flexion axis (X). This stronger but tapered curl leaves each
            # fingertip visibly wrapped around a 5A shaft at compact scale.
            pose_bone.rotation_euler.x = angle
            if joint_index == 0:
                # Preserve the natural index-to-pinky fan at the knuckles.
                pose_bone.rotation_euler.z = splay

    # Oppose the thumb across the index web. A restrained base opposition and
    # two flexed distal joints leave its pad visible instead of closing a fist.
    thumb_flex = {
        "Bone.021": (0.34, -0.08, 0.82),
        "Bone.017": (0.18, 0.02, 0.70),
        "Bone.018": (0.12, 0.03, 0.58),
        "Bone.019": (0.08, 0.0, 0.36),
    }
    for bone_name, rotation in thumb_flex.items():
        armature.pose.bones[bone_name].rotation_euler = rotation


def make_forearm_vertices(start_index):
    # Bury the proximal ring 12 mm inside the source wrist. The forearm grows
    # from a narrow wrist into a rounded elbow and bends away from the stick so
    # the arm reads as anatomy rather than a second, pointed shaft.
    rings = (
        (0.012, 0.015, 0.014),
        (-0.010, 0.017, 0.015),
        (-0.040, 0.020, 0.018),
        (-0.080, 0.024, 0.021),
        (-0.130, 0.027, 0.023),
        (-0.180, 0.030, 0.025),
        (-0.230, 0.033, 0.028),
        (-0.270, 0.034, 0.029),
        (-0.300, 0.032, 0.027),
        (-0.340, 0.017, 0.015),
        (-0.350, 0.001, 0.001),
    )
    radial_segments = 16
    vertices = []
    faces = []
    for ring_index, (engine_y, radius_x, radius_z) in enumerate(rings):
        progress = ring_index / (len(rings) - 1)
        center_x = 0.0
        center_z = 0.0
        for segment in range(radial_segments):
            angle = math.tau * segment / radial_segments
            engine_point = (
                center_x + math.cos(angle) * radius_x,
                engine_y,
                center_z + math.sin(angle) * radius_z,
            )
            # Blender exports Z-up geometry as glTF Y-up. This inverse axis
            # conversion bakes engine X/Y/Z coordinates into the GLB directly.
            vertices.append((engine_point[0], -engine_point[2], engine_point[1]))
    for ring_index in range(len(rings) - 1):
        for segment in range(radial_segments):
            a = ring_index * radial_segments + segment
            b = ring_index * radial_segments + (segment + 1) % radial_segments
            c = (ring_index + 1) * radial_segments + (segment + 1) % radial_segments
            d = (ring_index + 1) * radial_segments + segment
            faces.append((start_index + a, start_index + b, start_index + c, start_index + d))
    # A tiny distal cap is buried inside the hand. The rounded elbow-end cap
    # remains a closed surface when the arm reaches the lower screen edge.
    first = start_index
    faces.append(tuple(first + i for i in reversed(range(radial_segments))))
    final = start_index + (len(rings) - 1) * radial_segments
    faces.append(tuple(final + i for i in range(radial_segments)))
    return vertices, faces


def build_asset():
    source_hand = bpy.data.objects.get(HAND_NAME)
    armature = bpy.data.objects.get(ARMATURE_NAME)
    if source_hand is None or armature is None:
        raise RuntimeError("Open the bundled Hands + armature.blend source before running this script.")

    for obj in list(bpy.data.objects):
        if obj.name.startswith(AUTHORED_NAME):
            bpy.data.objects.remove(obj, do_unlink=True)

    multires = next((modifier for modifier in source_hand.modifiers if modifier.type == "MULTIRES"), None)
    if multires is not None:
        # The authored mesh must fit beside the loaded instrument assembly.
        # Keep the source's smooth base cage; do not export its sculpt levels.
        multires.levels = 0
        multires.render_levels = 0
    pose_source_grip(armature)
    bpy.context.view_layer.update()

    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated_hand = source_hand.evaluated_get(depsgraph)
    evaluated_mesh = evaluated_hand.to_mesh()
    try:
        if not evaluated_mesh.vertices or not evaluated_mesh.polygons:
            raise RuntimeError("The licensed hand source evaluated to an empty mesh.")
        # The source rig is authored in an oblique, transformed Blender basis.
        # Derive the stick direction from the posed middle-finger chain, then
        # rebase the baked mesh at the proximal wrist heel. The MCP is only an
        # orientation reference; using it as the runtime origin puts the shaft
        # at the fingertips and makes the forearm join the palm too high.
        armature_world = armature.matrix_world
        middle_mcp_world = armature_world @ armature.pose.bones["Bone.013"].head
        middle_tip_world = armature_world @ armature.pose.bones["Bone.005"].tail
        stick_axis = (middle_tip_world - middle_mcp_world).normalized()
        index_base = armature_world @ armature.pose.bones["Bone.012"].head
        little_base = armature_world @ armature.pose.bones["Bone.015"].head
        palm_width_axis = little_base - index_base
        palm_width_axis -= stick_axis * palm_width_axis.dot(stick_axis)
        if stick_axis.length < 1e-5 or palm_width_axis.length < 1e-5:
            raise RuntimeError("The CC0 hand rig has no usable wrist-to-finger basis.")
        palm_width_axis.normalize()
        palm_normal_axis = palm_width_axis.cross(stick_axis).normalized()
        palm_width_axis = stick_axis.cross(palm_normal_axis).normalized()

        world_points = [evaluated_hand.matrix_world @ vertex.co for vertex in evaluated_mesh.vertices]
        projections = [
            (
                (point - middle_mcp_world).dot(palm_width_axis),
                (point - middle_mcp_world).dot(stick_axis),
                (point - middle_mcp_world).dot(palm_normal_axis),
            )
            for point in world_points
        ]
        minima = [min(point[axis] for point in projections) for axis in range(3)]
        maxima = [max(point[axis] for point in projections) for axis in range(3)]
        source_extents = [maxima[axis] - minima[axis] for axis in range(3)]
        # Match real hand references in engine-local X/Y/Z: 86 mm palm width,
        # 190 mm wrist-to-middle fingertip, and 42 mm palm depth.
        target_extents = (0.086, 0.190, 0.042)
        scales = tuple(target_extents[axis] / source_extents[axis] for axis in range(3))
        vertices = []
        for projection in projections:
            engine_point = (
                (projection[0] - (minima[0] + maxima[0]) * 0.5) * scales[0],
                (projection[1] - minima[1]) * scales[1],
                (projection[2] - (minima[2] + maxima[2]) * 0.5) * scales[2],
            )
            vertices.append((engine_point[0], -engine_point[2], engine_point[1]))
        faces = [tuple(poly.vertices) for poly in evaluated_mesh.polygons]
    finally:
        evaluated_hand.to_mesh_clear()

    # Retain fine anatomical silhouettes while keeping the authored grip no
    # heavier than the current static hand + arm presentation.
    hand_mesh = bpy.data.meshes.new(f"{AUTHORED_NAME} | source hand")
    hand_mesh.from_pydata(vertices, [], faces)
    hand_mesh.update()
    temp_hand = bpy.data.objects.new(f"{AUTHORED_NAME} | simplify source", hand_mesh)
    bpy.context.scene.collection.objects.link(temp_hand)
    decimate = temp_hand.modifiers.new("Offline triangle budget", "DECIMATE")
    decimate.ratio = 0.84
    decimate.use_collapse_triangulate = True
    bpy.context.view_layer.update()
    evaluated_simplified = temp_hand.evaluated_get(bpy.context.evaluated_depsgraph_get())
    simplified = evaluated_simplified.to_mesh()
    try:
        hand_vertices = [tuple(vertex.co) for vertex in simplified.vertices]
        hand_faces = [tuple(poly.vertices) for poly in simplified.polygons]
    finally:
        evaluated_simplified.to_mesh_clear()
    bpy.data.objects.remove(temp_hand, do_unlink=True)
    bpy.data.meshes.remove(hand_mesh, do_unlink=True)

    forearm_vertices, forearm_faces = make_forearm_vertices(0)
    hand_data = bpy.data.meshes.new(f"{AUTHORED_NAME} | static hand mesh")
    hand_data.from_pydata(hand_vertices, [], hand_faces)
    hand_data.update()
    for polygon in hand_data.polygons:
        polygon.use_smooth = True
    forearm_data = bpy.data.meshes.new(f"{AUTHORED_NAME} | static forearm mesh")
    forearm_data.from_pydata(forearm_vertices, [], forearm_faces)
    forearm_data.update()
    for polygon in forearm_data.polygons:
        polygon.use_smooth = True

    skin = make_skin_material()
    authored = bpy.data.objects.new(f"{AUTHORED_NAME} | hand", hand_data)
    forearm = bpy.data.objects.new(f"{AUTHORED_NAME} | forearm", forearm_data)
    bpy.context.scene.collection.objects.link(authored)
    bpy.context.scene.collection.objects.link(forearm)
    authored.location = (0.0, 0.0, 0.0)
    forearm.location = (0.0, 0.0, 0.0)
    authored.data.materials.append(skin)
    forearm.data.materials.append(skin)
    for part in (authored, forearm):
        part["source"] = "Hands Rigged / Hands + armature.blend (CC0 1.0)"
        part["pose"] = "Static matched-grip hold for measured 406.4 mm 5A stick"
        part["runtime"] = "Static hand and independently oriented continuous bare forearm; mirrored in Three.js"

    # Keep the source untouched and out of the runtime selection. The original
    # remains available in the open Blender file for further revisions.
    for obj in bpy.data.objects:
        if obj not in (authored, forearm):
            obj.hide_set(True)
            obj.select_set(False)
    for part in (authored, forearm):
        part.hide_set(False)
        part.select_set(True)
    bpy.context.view_layer.objects.active = authored

    hand_triangles = sum(len(poly.vertices) - 2 for poly in hand_data.polygons)
    forearm_triangles = sum(len(poly.vertices) - 2 for poly in forearm_data.polygons)
    triangle_count = hand_triangles + forearm_triangles
    # GUI runs need a View3D region for the exporter context; background runs
    # use the active scene/view layer directly. Both paths export the same
    # static selected mesh and leave the original .blend unsaved.
    window = bpy.context.window
    view_area = next((area for area in window.screen.areas if area.type == "VIEW_3D"), None) if window else None
    if window and view_area:
        view_region = next(region for region in view_area.regions if region.type == "WINDOW")
        override = {"window": window, "area": view_area, "region": view_region}
        with bpy.context.temp_override(**override):
            if bpy.context.object and bpy.context.object.mode != "OBJECT":
                bpy.ops.object.mode_set(mode="OBJECT")
            bpy.ops.export_scene.gltf(
                filepath=str(OUTPUT),
                export_format="GLB",
                use_selection=True,
                export_apply=True,
                export_yup=True,
                export_animations=False,
                export_nla_strips=False,
            )
    else:
        bpy.ops.export_scene.gltf(
            filepath=str(OUTPUT),
            export_format="GLB",
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_animations=False,
            export_nla_strips=False,
        )
    print(f"AUTHORED_HAND_OUTPUT={OUTPUT}")
    print(f"AUTHORED_HAND_TRIANGLES={triangle_count}")
    print(f"AUTHORED_HAND_BOUNDS={tuple(round(v, 4) for v in authored.dimensions)}")
    print(f"AUTHORED_FOREARM_TRIANGLES={forearm_triangles}")
    print(f"AUTHORED_FOREARM_BOUNDS={tuple(round(v, 4) for v in forearm.dimensions)}")
    print("AUTHORED_HAND_SOURCE_UNMODIFIED=True")


build_asset()
