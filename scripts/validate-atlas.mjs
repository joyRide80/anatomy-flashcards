import fs from "node:fs";
import assert from "node:assert/strict";
const filename = process.argv[2] ?? "atlas.json";
const base = new URL("../public/models/", import.meta.url),
  atlas = JSON.parse(fs.readFileSync(new URL(filename, base)));
const body = atlas.parts.filter((p) => p.id.startsWith("FJ"));
const skeletal = atlas.parts.filter((p) => p.system === "skeletal");
const muscular = atlas.parts.filter((p) => p.system === "muscular");
const joints = atlas.parts.filter((p) => p.system === "joints");
assert.equal(body.length, 1536);
assert.ok(
  body.every((p) => !["skeletal", "muscular", "joints"].includes(p.system)),
);
assert.ok(
  skeletal.length >= 200,
  `expected Z-Anatomy bones, found ${skeletal.length}`,
);
assert.ok(
  muscular.length >= 400,
  `expected Z-Anatomy muscles, found ${muscular.length}`,
);
assert.ok(
  joints.length >= 300,
  `expected joint meshes, found ${joints.length}`,
);
assert.equal(atlas.zaBody, "skeletal-muscular-joints-v1");
const ids = new Set(atlas.parts.map((p) => p.id));
assert.equal(ids.size, atlas.parts.length);
const files = atlas.chunks.map((c) => {
  const b = fs.readFileSync(new URL(c.url.split("/").pop(), base));
  assert.equal(b.length, c.bytes);
  return b;
});
let tris = 0;
for (const p of atlas.parts) {
  assert.ok(p.name.trim() && p.name !== "-" && !p.name.includes("Bounds("));
  assert.ok(p.conceptId !== "-");
  assert.ok(p.system);
  const b = files[p.chunk];
  assert.ok(p.indices + p.indexCount * 4 <= b.length);
  const pos = new Float32Array(
      b.buffer,
      b.byteOffset + p.positions,
      p.vertexCount * 3,
    ),
    indices = new Uint32Array(b.buffer, b.byteOffset + p.indices, p.indexCount);
  assert.ok(indices.length >= 3);
  for (const i of indices)
    assert.ok(i < p.vertexCount, `${p.id}: invalid vertex`);
  for (const value of pos) assert.ok(Number.isFinite(value));
  tris += p.indexCount / 3;
}
for (const c of atlas.concepts) {
  assert.ok(c.elements.length);
  for (const id of c.elements) assert.ok(ids.has(id), `${c.id}: missing ${id}`);
}
assert.equal(tris, atlas.triangles);
console.log(
  `Verified ${ids.size} individually indexed meshes, ${atlas.concepts.length} complete concept mappings, ${tris.toLocaleString()} triangles, and every binary buffer.`,
);
