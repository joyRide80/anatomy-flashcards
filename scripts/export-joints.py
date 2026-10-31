"""Export Z-Anatomy joint meshes into this atlas's coordinates.

Run inside Blender with the Z-Anatomy file open:

  blender zanatomy.blend --background --python scripts/export-joints.py

The blend is meters, Z-up. The atlas is meters, Y-up. A rigid fit against
bones that share a name with BodyParts3D 4.0 is:

  x' =  x
  y' =  z + 0.0084
  z' = -y - 0.0105

Z-Anatomy repaired those bones, so a ligament can still sit about 1–2 cm
off the BodyParts3D surface. Meshes this atlas already contains (matched
with left/right ignored) are left out.
"""
import json
import re
import struct
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "scripts" / "data"
Y_OFFSET = 0.0084
Z_OFFSET = -0.0105


def identity(name: str) -> str:
    name = re.sub(r"\.(l|r|g)$", "", name, flags=re.I)
    name = name.lower()
    name = re.sub(r"\b(left|right)\b", " ", name)
    name = re.sub(r"[^a-z0-9]+", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def display_name(name: str) -> str:
    name = re.sub(r"\.g$", "", name, flags=re.I)
    match = re.search(r"\.([lr])$", name, flags=re.I)
    if not match:
        return name
    side = "Left" if match.group(1).lower() == "l" else "Right"
    base = name[: match.start()]
    if base:
        base = base[0].lower() + base[1:]
    return f"{side} {base}"


def ancestors(obj):
    parent = obj.parent
    while parent:
        yield parent
        parent = parent.parent


def under_joint(obj) -> bool:
    return any("joint" in parent.name.lower() for parent in ancestors(obj))


def joint_group(obj):
    for parent in ancestors(obj):
        if parent.name.endswith(".g"):
            return parent
    return obj.parent


def convert_point(x, y, z):
    return (x, z + Y_OFFSET, -y + Z_OFFSET)


def convert_normal(x, y, z):
    n = Vector((x, z, -y))
    if n.length < 1e-8:
        return (0.0, 1.0, 0.0)
    n.normalize()
    return (n.x, n.y, n.z)


def quantize(component: float) -> int:
    return max(-32767, min(32767, int(round(component * 32767))))


def main():
    atlas = json.loads((ROOT / "public" / "models" / "atlas.json").read_text())
    present = {identity(part["name"]) for part in atlas["parts"]}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    blob = bytearray()
    parts = []
    seen_names = {}

    def align():
        while len(blob) % 4:
            blob.append(0)

    objects = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and obj.data
        and len(obj.data.polygons) > 0
        and under_joint(obj)
    ]
    objects.sort(key=lambda obj: obj.name)
    for obj in objects:
        if identity(obj.name) in present:
            continue
        group = joint_group(obj)
        if group is None:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            if not mesh.loop_triangles or len(mesh.vertices) < 3:
                continue
            matrix = evaluated.matrix_world
            normal_matrix = matrix.to_3x3()
            # A negative scale mirrors positions and normals but not triangle
            # order. Swap two corners so the winding stays outward.
            mirrored = matrix.determinant() < 0
            coordinates = []
            normals = []
            minimum = [1e9, 1e9, 1e9]
            maximum = [-1e9, -1e9, -1e9]
            for vertex in mesh.vertices:
                world = matrix @ vertex.co
                point = convert_point(world.x, world.y, world.z)
                coordinates.extend(point)
                for axis, value in enumerate(point):
                    minimum[axis] = min(minimum[axis], value)
                    maximum[axis] = max(maximum[axis], value)
                local_normal = normal_matrix @ vertex.normal
                normals.extend(convert_normal(local_normal.x, local_normal.y, local_normal.z))
            indices = []
            for triangle in mesh.loop_triangles:
                corners = [int(index) for index in triangle.vertices]
                if mirrored:
                    corners[0], corners[1] = corners[1], corners[0]
                indices.extend(corners)
            if len(indices) < 3:
                continue
            name = display_name(obj.name)
            seen_names[name] = seen_names.get(name, 0) + 1
            if seen_names[name] > 1:
                name = f"{name} ({seen_names[name]})"
            align()
            position_offset = len(blob)
            blob.extend(struct.pack(f"<{len(coordinates)}f", *coordinates))
            align()
            normal_offset = len(blob)
            blob.extend(struct.pack(f"<{len(normals)}h", *(quantize(v) for v in normals)))
            align()
            index_offset = len(blob)
            blob.extend(struct.pack(f"<{len(indices)}I", *indices))
            parts.append(
                {
                    "name": name,
                    "group": display_name(group.name),
                    "positions": position_offset,
                    "normals": normal_offset,
                    "indices": index_offset,
                    "vertexCount": len(mesh.vertices),
                    "indexCount": len(indices),
                    "bounds": [minimum, maximum],
                }
            )
        finally:
            evaluated.to_mesh_clear()

    groups = {}
    for index, part in enumerate(parts, start=1):
        part_id = f"ZJ{index:04d}"
        concept_id = f"ZC{index:04d}"
        part["id"] = part_id
        part["conceptId"] = concept_id
        part["system"] = "joints"
        groups.setdefault(part["group"], []).append(part_id)
    concepts = [
        {"id": part["conceptId"], "name": part["name"], "elements": [part["id"]]}
        for part in parts
    ]
    for index, (name, elements) in enumerate(sorted(groups.items()), start=1):
        if len(elements) < 2:
            continue
        concepts.append({"id": f"ZG{index:04d}", "name": name, "elements": elements})
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "joints-geometry.bin").write_bytes(blob)
    manifest = {
        "source": "Z-Anatomy",
        "file": bpy.data.filepath,
        "triangles": sum(part["indexCount"] for part in parts) // 3,
        "parts": parts,
        "concepts": concepts,
    }
    (OUT / "joints-manifest.json").write_text(json.dumps(manifest))
    print(
        json.dumps(
            {
                "parts": len(parts),
                "concepts": len(concepts),
                "triangles": manifest["triangles"],
                "bytes": len(blob),
                "groups": len(groups),
            }
        )
    )


if __name__ == "__main__":
    main()
