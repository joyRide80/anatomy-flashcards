// Seat the external intercostal membranes on the costal cartilages.
//
// Each membrane is eight separate sheets. In Z-Anatomy every sheet already
// runs along one costal cartilage. A nearest-rib snap had collapsed those
// sheets onto the rib shafts. This restores each sheet and slides it, still
// in one piece, onto the cartilage or the front of the rib it follows.
//
//   node scripts/seat-intercostal-membranes.mjs
//   node scripts/seat-intercostal-membranes.mjs --dry-run
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const dry = process.argv.includes("--dry-run");
const root = new URL("../", import.meta.url);
const models = new URL("public/models/", root);
const atlas = JSON.parse(readFileSync(new URL("atlas.json", models)));
if (atlas.zaBody) {
  throw new Error(
    "Skeleton and joints come from the same Z-Anatomy file, so this pass does not apply.",
  );
}
const source = JSON.parse(
  readFileSync(new URL("scripts/data/external-membrane-source.json", root)),
);
const files = atlas.chunks.map((chunk) =>
  readFileSync(new URL(chunk.url.split("/").pop(), models)),
);

const ordinals = [
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
];

function readPoint(buffer, offset) {
  return [
    buffer.readFloatLE(offset),
    buffer.readFloatLE(offset + 4),
    buffer.readFloatLE(offset + 8),
  ];
}
function vertices(part, step = 1) {
  const buffer = files[part.chunk];
  const points = [];
  for (let index = 0; index < part.vertexCount; index += step) {
    points.push(readPoint(buffer, part.positions + index * 12));
  }
  return points;
}
function sourcePoint(membrane, index) {
  return [
    membrane.positions[index * 3],
    membrane.positions[index * 3 + 1],
    membrane.positions[index * 3 + 2],
  ];
}

const byName = new Map(atlas.parts.map((part) => [part.name, part]));
const front = { Left: [], Right: [] };
for (const side of ["Left", "Right"]) {
  for (const word of ordinals) {
    const cartilage = byName.get(`${side} ${word} costal cartilage`);
    if (cartilage) {
      for (const point of vertices(cartilage, 2)) {
        front[side].push({ word, kind: "cartilage", point });
      }
    }
    const rib = byName.get(`${side} ${word} rib`);
    if (!rib) continue;
    const ribPoints = vertices(rib, 2);
    const limit = Math.max(...ribPoints.map((point) => point[2])) - 0.04;
    for (const point of ribPoints) {
      if (point[2] >= limit) front[side].push({ word, kind: "rib", point });
    }
  }
}
function nearestOn(side, vertex) {
  let best = null;
  let bestDistance = Infinity;
  for (const item of front[side]) {
    const point = item.point;
    const distance =
      (vertex[0] - point[0]) ** 2 +
      (vertex[1] - point[1]) ** 2 +
      (vertex[2] - point[2]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }
  return best;
}
function gap(side, vertex) {
  let best = Infinity;
  for (const item of front[side]) {
    const point = item.point;
    const distance = Math.hypot(
      vertex[0] - point[0],
      vertex[1] - point[1],
      vertex[2] - point[2],
    );
    if (distance < best) best = distance;
  }
  return best;
}

const geometry = Buffer.from(
  files[atlas.chunks.findIndex((chunk) => chunk.url.includes("body-joints"))],
);
for (const name of [
  "Left external intercostal membrane",
  "Right external intercostal membrane",
]) {
  const part = byName.get(name);
  const side = name.startsWith("Right") ? "Right" : "Left";
  const membrane = source.membranes[side];
  if (!part || membrane.count !== part.vertexCount) {
    throw new Error(`${name} does not match the exported membrane`);
  }
  const groups = new Map();
  for (let index = 0; index < membrane.count; index++) {
    const id = membrane.component[index];
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(index);
  }
  const shift = new Map();
  for (const [id, indices] of groups) {
    const votes = new Map();
    const acc = [0, 0, 0];
    let count = 0;
    for (let cursor = 0; cursor < indices.length; cursor += 2) {
      const vertex = sourcePoint(membrane, indices[cursor]);
      const hit = nearestOn(side, vertex);
      for (let axis = 0; axis < 3; axis++) {
        acc[axis] += hit.point[axis] - vertex[axis];
      }
      const key = `${hit.word} ${hit.kind}`;
      votes.set(key, (votes.get(key) ?? 0) + 1);
      count += 1;
    }
    const label = [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    shift.set(
      id,
      acc.map((value) => value / count),
    );
    shift.get(id).label = label;
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const tally = new Map();
  for (let index = 0; index < membrane.count; index++) {
    const delta = shift.get(membrane.component[index]);
    const original = sourcePoint(membrane, index);
    const point = original.map((value, axis) => value + delta[axis]);
    if (index % 8 === 0) {
      const id = membrane.component[index];
      const bucket = tally.get(id) ?? { before: 0, after: 0, count: 0 };
      bucket.before += gap(side, original);
      bucket.after += gap(side, point);
      bucket.count += 1;
      tally.set(id, bucket);
    }
    if (!dry) {
      const offset = part.positions + index * 12;
      geometry.writeFloatLE(point[0], offset);
      geometry.writeFloatLE(point[1], offset + 4);
      geometry.writeFloatLE(point[2], offset + 8);
    }
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  if (!dry) part.bounds = [min, max];
  const rows = [...groups.keys()].sort(
    (a, b) => shift.get(b)[1] - shift.get(a)[1],
  );
  for (const id of rows) {
    const bucket = tally.get(id);
    const delta = shift.get(id);
    const moved = delta.map((value) => Math.round(value * 1000));
    console.log(
      `${side} ${delta.label.padEnd(18)} ` +
        `${Math.round((bucket.before / bucket.count) * 1000)} -> ` +
        `${Math.round((bucket.after / bucket.count) * 1000)} mm  ` +
        `shift ${moved.join(",")}`,
    );
  }
}

if (dry) process.exit(0);
atlas.membraneAlignment = "along-cartilage-v1";
const compressed = gzipSync(geometry, { level: 9 });
const chunk = atlas.chunks.find((item) => item.url.includes("body-joints"));
chunk.bytes = geometry.length;
chunk.gzipBytes = compressed.length;
writeFileSync(new URL("body-joints.bin", models), geometry);
writeFileSync(new URL("body-joints.bin.gz", models), compressed);
writeFileSync(new URL("atlas.json", models), JSON.stringify(atlas));
console.log(`wrote ${geometry.length} bytes`);
