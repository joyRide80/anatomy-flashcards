"""Export Z-Anatomy skeleton, muscles, and joints into atlas coordinates.

Run inside Blender with zanatomy.blend open:

  blender zanatomy.blend --background --python scripts/export-zanatomy-systems.py

The blend is meters, Z-up. The atlas is meters, Y-up:

  x' =  x
  y' =  z + 0.0084
  z' = -y - 0.0105

Origin and insertion markers parented to bones are left out. Evaluated
meshes include solidify and subdivision, which is the surface shown in
Blender and the surface the joint meshes were built against.
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
SYSTEMS = {
    "Skeletal system.g": ("skeletal", "ZS", "ZSC", "ZSG"),
    "Muscular system.g": ("muscular", "ZM", "ZMC", "ZMG"),
    "Joints.g": ("joints", "ZJ", "ZC", "ZG"),
}
ORDINALS = [
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
    "tenth",
    "eleventh",
    "twelfth",
]
MARKER = re.compile(r"\.(?:[oe]\d*[lr]|[ij])$", re.I)


def root_name(obj):
    node = obj
    while node.parent:
        node = node.parent
    return node.name


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


def public_name(name: str) -> str:
    name = display_name(name)
    if name == "Atlas (C1)":
        return "Atlas"
    if name == "Axis (C2)":
        return "Axis"
    vertebra = re.fullmatch(r"Vertebra ([CTL])(\d+)", name)
    if vertebra:
        word = ORDINALS[int(vertebra.group(2)) - 1]
        region = {"C": "cervical", "T": "thoracic", "L": "lumbar"}[vertebra.group(1)]
        return f"{word[0].upper()}{word[1:]} {region} vertebra"
    cartilage = re.fullmatch(r"(Left|Right) costal cartilage of (\w+) rib", name)
    if cartilage:
        return f"{cartilage.group(1)} {cartilage.group(2)} costal cartilage"
    return name


def convert_point(x, y, z):
    return (x, z + Y_OFFSET, -y + Z_OFFSET)


def convert_normal(x, y, z):
    normal = Vector((x, z, -y))
    if normal.length < 1e-8:
        return (0.0, 1.0, 0.0)
    normal.normalize()
    return (normal.x, normal.y, normal.z)


def quantize(component: float) -> int:
    return max(-32767, min(32767, int(round(component * 32767))))


def group_of(obj):
    parent = obj.parent
    while parent:
        if parent.name.endswith(".g") and parent.name not in SYSTEMS:
            return parent
        parent = parent.parent
    return None


def main():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    blob = bytearray()
    parts = []
    seen = {}

    def align():
        while len(blob) % 4:
            blob.append(0)

    objects = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and obj.data
        and len(obj.data.polygons) > 0
        and len(obj.data.vertices) >= 3
        and root_name(obj) in SYSTEMS
        and not MARKER.search(obj.name)
    ]
    objects.sort(key=lambda obj: (root_name(obj), obj.name))
    print(f"exporting {len(objects)} meshes", flush=True)
    for number, obj in enumerate(objects, start=1):
        system, prefix, concept_prefix, group_prefix = SYSTEMS[root_name(obj)]
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
                normals.extend(
                    convert_normal(local_normal.x, local_normal.y, local_normal.z)
                )
            indices = []
            for triangle in mesh.loop_triangles:
                corners = [int(index) for index in triangle.vertices]
                if mirrored:
                    corners[0], corners[1] = corners[1], corners[0]
                indices.extend(corners)
            if len(indices) < 3 or max(indices) >= len(mesh.vertices):
                continue
            name = public_name(obj.name)
            seen[name] = seen.get(name, 0) + 1
            if seen[name] > 1:
                name = f"{name} ({seen[name]})"
            align()
            position_offset = len(blob)
            blob.extend(struct.pack(f"<{len(coordinates)}f", *coordinates))
            align()
            normal_offset = len(blob)
            blob.extend(struct.pack(f"<{len(normals)}h", *(quantize(v) for v in normals)))
            align()
            index_offset = len(blob)
            blob.extend(struct.pack(f"<{len(indices)}I", *indices))
            group = group_of(obj)
            parts.append(
                {
                    "sourceName": obj.name,
                    "name": name,
                    "group": public_name(group.name) if group else None,
                    "system": system,
                    "prefix": prefix,
                    "conceptPrefix": concept_prefix,
                    "groupPrefix": group_prefix,
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
        if number % 100 == 0:
            print(f"  {number}/{len(objects)}", flush=True)

    counters = {system: 0 for system, *_ in SYSTEMS.values()}
    group_counters = {system: 0 for system, *_ in SYSTEMS.values()}
    groups = {system: {} for system, *_ in SYSTEMS.values()}
    for part in parts:
        counters[part["system"]] += 1
        part["id"] = f"{part['prefix']}{counters[part['system']]:04d}"
        part["conceptId"] = f"{part['conceptPrefix']}{counters[part['system']]:04d}"
        if part["group"]:
            groups[part["system"]].setdefault(part["group"], []).append(part["id"])
    concepts = [
        {"id": part["conceptId"], "name": part["name"], "elements": [part["id"]]}
        for part in parts
    ]
    for system, grouped in groups.items():
        prefix = next(item[3] for item in SYSTEMS.values() if item[0] == system)
        for name, elements in sorted(grouped.items()):
            if len(elements) < 2:
                continue
            group_counters[system] += 1
            concepts.append(
                {
                    "id": f"{prefix}{group_counters[system]:04d}",
                    "name": name,
                    "elements": elements,
                }
            )
    for part in parts:
        del part["prefix"]
        del part["conceptPrefix"]
        del part["groupPrefix"]
        del part["sourceName"]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "za-body.bin").write_bytes(blob)
    manifest = {
        "source": "Z-Anatomy",
        "file": bpy.data.filepath,
        "triangles": sum(part["indexCount"] for part in parts) // 3,
        "parts": parts,
        "concepts": concepts,
    }
    (OUT / "za-body-manifest.json").write_text(json.dumps(manifest))
    summary = {
        "parts": len(parts),
        "concepts": len(concepts),
        "triangles": manifest["triangles"],
        "bytes": len(blob),
        "bySystem": {
            system: sum(1 for part in parts if part["system"] == system)
            for system, *_ in SYSTEMS.values()
        },
    }
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
