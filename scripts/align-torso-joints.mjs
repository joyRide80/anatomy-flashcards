// Seat the spinal ligaments on this vertebral column.
//
// Spinal ligaments were built on the Z-Anatomy spine. Each vertex follows the
// nearest paired vertebra, so the ligament bends with this column.
// The external intercostal membranes are seated separately, as whole sheets
// along the costal cartilages, by scripts/seat-intercostal-membranes.mjs.
//
//   node scripts/align-torso-joints.mjs
//   node scripts/align-torso-joints.mjs --dry-run
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
if (atlas.torsoAlignment === "spine-ribs-v1" && !dry) {
  throw new Error("Torso alignment spine-ribs-v1 is already applied.");
}
const za = JSON.parse(
  readFileSync(new URL("scripts/data/za-bone-centers.json", root)),
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
function atlasName(zaName) {
  if (zaName === "Atlas (C1)") return "Atlas";
  if (zaName === "Axis (C2)") return "Axis";
  if (zaName === "Sacrum") return "Sacrum";
  const vertebra = zaName.match(/^Vertebra ([CTL])(\d+)$/);
  if (vertebra) {
    const word = ordinals[Number(vertebra[2]) - 1];
    const region =
      vertebra[1] === "C"
        ? "cervical"
        : vertebra[1] === "T"
          ? "thoracic"
          : "lumbar";
    return `${word[0].toUpperCase()}${word.slice(1)} ${region} vertebra`;
  }
  return null;
}

const skeletal = new Map(
  atlas.parts
    .filter((part) => part.system === "skeletal")
    .map((part) => [part.name, part]),
);
const vertebrae = [];
for (const bone of za) {
  const name = atlasName(bone.name);
  const part = name && skeletal.get(name);
  if (!part) continue;
  const center = part.bounds[0].map(
    (value, axis) => (value + part.bounds[1][axis]) / 2,
  );
  vertebrae.push({
    name,
    at: bone.mid,
    delta: center.map((value, axis) => value - bone.mid[axis]),
  });
}
console.log(`vertebrae ${vertebrae.length}`);

const spineNames = new Set([
  "Anterior longitudinal ligament",
  "Posterior longitudinal ligament",
  "Ligamenta flava",
  "Interspinous ligaments",
  "Supraspinous ligament",
  "Nuchal ligament",
]);
function readPoint(buffer, offset) {
  return [
    buffer.readFloatLE(offset),
    buffer.readFloatLE(offset + 4),
    buffer.readFloatLE(offset + 8),
  ];
}
function samples(part, step) {
  const buffer = files[part.chunk];
  const points = [];
  for (let index = 0; index < part.vertexCount; index += step) {
    points.push(readPoint(buffer, part.positions + index * 12));
  }
  return points;
}
function spineDelta(vertex) {
  const nearest = vertebrae
    .map((bone) => ({
      bone,
      distance: Math.hypot(
        vertex[0] - bone.at[0],
        vertex[1] - bone.at[1],
        vertex[2] - bone.at[2],
      ),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2);
  let weightSum = 0;
  const acc = [0, 0, 0];
  for (const item of nearest) {
    const weight = 1 / (item.distance * item.distance + 1e-6);
    weightSum += weight;
    for (let axis = 0; axis < 3; axis++)
      acc[axis] += weight * item.bone.delta[axis];
  }
  return acc.map((value) => value / weightSum);
}
function distanceTo(points, vertex) {
  let best = Infinity;
  for (const point of points) {
    const distance = Math.hypot(
      vertex[0] - point[0],
      vertex[1] - point[1],
      vertex[2] - point[2],
    );
    if (distance < best) best = distance;
  }
  return best;
}
const vertebraCloud = [...skeletal.values()]
  .filter((part) => /vertebra$|^Atlas$|^Axis$|^Sacrum$/.test(part.name))
  .flatMap((part) => samples(part, 4));

const geometry = Buffer.from(
  files[atlas.chunks.findIndex((chunk) => chunk.url.includes("body-joints"))],
);
const report = [];
for (const part of atlas.parts) {
  if (!spineNames.has(part.name)) continue;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let before = 0;
  let after = 0;
  const probe = vertebraCloud;
  for (let index = 0; index < part.vertexCount; index++) {
    const offset = part.positions + index * 12;
    const point = readPoint(geometry, offset);
    if (index % 8 === 0) before += distanceTo(probe, point);
    const next = point.map((value, axis) => value + spineDelta(point)[axis]);
    if (!dry) {
      geometry.writeFloatLE(next[0], offset);
      geometry.writeFloatLE(next[1], offset + 4);
      geometry.writeFloatLE(next[2], offset + 8);
    }
    if (index % 8 === 0) after += distanceTo(probe, next);
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], next[axis]);
      max[axis] = Math.max(max[axis], next[axis]);
    }
  }
  const samplesCount = Math.ceil(part.vertexCount / 8);
  report.push({
    name: part.name,
    before: Math.round((before / samplesCount) * 1000),
    after: Math.round((after / samplesCount) * 1000),
  });
  if (!dry) part.bounds = [min, max];
}
for (const line of report)
  console.log(
    `${String(line.before).padStart(3)} -> ${String(line.after).padStart(3)} mm  ${line.name}`,
  );
if (dry) process.exit(0);

atlas.torsoAlignment = "spine-ribs-v1";
const compressed = gzipSync(geometry, { level: 9 });
const chunk = atlas.chunks.find((item) => item.url.includes("body-joints"));
chunk.bytes = geometry.length;
chunk.gzipBytes = compressed.length;
writeFileSync(new URL("body-joints.bin", models), geometry);
writeFileSync(new URL("body-joints.bin.gz", models), compressed);
writeFileSync(new URL("atlas.json", models), JSON.stringify(atlas));
console.log(`wrote ${geometry.length} bytes`);
