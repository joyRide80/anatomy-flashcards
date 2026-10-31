// Replace the skeleton, muscles, and joints with the Z-Anatomy export.
// Vessels, nerves, organs, and the other BodyParts3D systems stay.
//
//   node scripts/replace-body-systems.mjs
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { gzipSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const models = new URL("public/models/", root);
const manifest = JSON.parse(
  readFileSync(new URL("scripts/data/za-body-manifest.json", root)),
);
const geometry = readFileSync(new URL("scripts/data/za-body.bin", root));
const atlas = JSON.parse(readFileSync(new URL("atlas.json", models)));
if (atlas.zaBody) {
  throw new Error(
    "Z-Anatomy skeleton, muscles, and joints are already installed.",
  );
}
const catalog = JSON.parse(
  readFileSync(new URL("public/cards/catalog.json", root)),
);

const replaced = new Set(["skeletal", "muscular", "joints"]);
const kept = atlas.parts.filter((part) => !replaced.has(part.system));
const fj = kept.filter((part) => part.id.startsWith("FJ"));
if (fj.length !== 1536) {
  throw new Error(
    `Expected 1,536 BodyParts3D meshes outside skeleton, muscle, and joints, found ${fj.length}.`,
  );
}
for (const system of replaced) {
  const count = manifest.parts.filter((part) => part.system === system).length;
  if (count < 100)
    throw new Error(`Z-Anatomy ${system} export is incomplete (${count}).`);
}

const sources = atlas.chunks.map((chunk) =>
  readFileSync(new URL(chunk.url.split("/").pop(), models)),
);
const chunkLimit = 8_000_000;
const bins = [];
let pieces = [];
let size = 0;

function flush() {
  if (!size) return;
  bins.push(Buffer.concat(pieces, size));
  pieces = [];
  size = 0;
}
function align() {
  const pad = (4 - (size % 4)) % 4;
  if (!pad) return;
  pieces.push(Buffer.alloc(pad));
  size += pad;
}
function append(buffer) {
  align();
  const offset = size;
  pieces.push(buffer);
  size += buffer.length;
  return offset;
}
function take(buffer, start, length) {
  return Buffer.from(buffer.subarray(start, start + length));
}

const repacked = [];
for (const part of kept) {
  const source = sources[part.chunk];
  const positions = take(source, part.positions, part.vertexCount * 12);
  const normals = take(source, part.normals, part.vertexCount * 6);
  const indices = take(source, part.indices, part.indexCount * 4);
  const bytes = positions.length + normals.length + indices.length + 12;
  if (size && size + bytes > chunkLimit) flush();
  const chunk = bins.length;
  repacked.push({
    ...part,
    chunk,
    positions: append(positions),
    normals: append(normals),
    indices: append(indices),
  });
}

const imported = [];
for (const part of manifest.parts) {
  const { group, ...record } = part;
  const positions = take(geometry, part.positions, part.vertexCount * 12);
  const normals = take(geometry, part.normals, part.vertexCount * 6);
  const indices = take(geometry, part.indices, part.indexCount * 4);
  const bytes = positions.length + normals.length + indices.length + 12;
  if (size && size + bytes > chunkLimit) flush();
  imported.push({
    ...record,
    chunk: bins.length,
    positions: append(positions),
    normals: append(normals),
    indices: append(indices),
  });
}
flush();

const keptIds = new Set(repacked.map((part) => part.id));
const concepts = [];
for (const concept of atlas.concepts) {
  if (concept.id.startsWith("Z")) continue;
  const elements = concept.elements.filter((id) => keptIds.has(id));
  if (elements.length) concepts.push({ ...concept, elements });
}
concepts.push(...manifest.concepts);

const parts = [...repacked, ...imported];
const triangles = parts.reduce((sum, part) => sum + part.indexCount / 3, 0);
const chunks = bins.map((bin, index) => {
  const compressed = gzipSync(bin, { level: 9 });
  const url = `/models/body-${index}.bin`;
  writeFileSync(new URL(`body-${index}.bin`, models), bin);
  writeFileSync(new URL(`body-${index}.bin.gz`, models), compressed);
  return {
    url,
    bytes: bin.length,
    gzip: `${url}.gz`,
    gzipBytes: compressed.length,
  };
});

const oldNames = new Map(
  atlas.parts.map((part) => [part.id, part.name.toLowerCase()]),
);
const byName = new Map();
for (const part of parts) {
  const key = part.name.toLowerCase();
  byName.set(key, [...(byName.get(key) ?? []), part.id]);
}
const live = new Set(parts.map((part) => part.id));
function remap(id) {
  if (live.has(id)) return [id];
  const name = oldNames.get(id);
  return name ? (byName.get(name) ?? []) : [];
}
const structures = [];
let remapped = 0;
let dropped = 0;
for (const structure of catalog.structures) {
  const nextParts = [...new Set(structure.parts.flatMap(remap))];
  if (!nextParts.length) {
    dropped += 1;
    continue;
  }
  if (nextParts.some((id, index) => id !== structure.parts[index]))
    remapped += 1;
  const focus = [...new Set(structure.focus.flatMap(remap))].filter((id) =>
    nextParts.includes(id),
  );
  structures.push({
    ...structure,
    parts: nextParts,
    focus: focus.length ? focus : nextParts.slice(0, 1),
    members: structure.members,
  });
}
const structureIds = new Set(structures.map((structure) => structure.id));
for (const structure of structures) {
  if (structure.members) {
    structure.members = structure.members.filter((id) => structureIds.has(id));
  }
}
const groups = (catalog.groups ?? [])
  .map((group) => ({
    ...group,
    members: group.members.filter((id) => structureIds.has(id)),
  }))
  .filter((group) => group.members.length > 1);

const next = {
  version: atlas.version,
  zaBody: "skeletal-muscular-joints-v1",
  parts,
  concepts,
  chunks,
  triangles,
};
for (const file of readdirSync(models)) {
  if (!/^body-.*\.bin(\.gz)?$/.test(file)) continue;
  const url = `/models/${file.replace(/\.gz$/, "")}`;
  const gzip = `/models/${file.endsWith(".gz") ? file : `${file}.gz`}`;
  const used = chunks.some((chunk) => chunk.url === url || chunk.gzip === gzip);
  if (!used && existsSync(new URL(file, models)))
    unlinkSync(new URL(file, models));
}
writeFileSync(new URL("atlas.json", models), JSON.stringify(next));
catalog.structures = structures;
catalog.groups = groups;
if (!catalog.sources.some((source) => source.includes("Z-Anatomy"))) {
  catalog.sources.push(
    "Skeleton, muscles, and joints: Z-Anatomy, CC BY-SA 2.1 Japan",
  );
}
writeFileSync(
  new URL("public/cards/catalog.json", root),
  JSON.stringify(catalog),
);
console.log(
  JSON.stringify(
    {
      parts: parts.length,
      kept: repacked.length,
      imported: imported.length,
      concepts: concepts.length,
      triangles,
      chunks: chunks.length,
      bytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
      gzip: chunks.reduce((sum, chunk) => sum + chunk.gzipBytes, 0),
      cardsRemapped: remapped,
      cardsDropped: dropped,
      cardsLeft: structures.length,
    },
    null,
    2,
  ),
);
