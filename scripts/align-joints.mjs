// Seat hand and foot joint meshes on the BodyParts3D bones.
// Z-Anatomy and this atlas share a pose through the torso, but the hands are
// translated together and the toes differ bone by bone. Each joint vertex
// follows the nearest paired hand or foot bone. Knee, hip, and spine joints
// are outside that neighborhood and stay put.
//
//   node scripts/align-joints.mjs            # write
//   node scripts/align-joints.mjs --dry-run  # report only
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
if (atlas.jointAlignment === "hand-foot-v1" && !dry) {
  throw new Error("Joint alignment hand-foot-v1 is already applied.");
}
const za = JSON.parse(
  readFileSync(new URL("scripts/data/za-bone-centers.json", root)),
);

const handDigit = {
  first: "thumb",
  second: "index",
  third: "middle",
  fourth: "ring",
  fifth: "little",
};
const footDigit = {
  first: "big",
  second: "second",
  third: "third",
  fourth: "fourth",
  fifth: "little",
};
const carpals = {
  "Capitate bone": "capitate",
  "Hamate bone": "hamate",
  "Lunate bone": "lunate",
  "Pisiform bone": "pisiform",
  "Scaphoid bone": "scaphoid",
  "Trapezium bone": "trapezium",
  "Trapezoid bone": "trapezoid",
  "Triquetrum bone": "triquetral",
};

function atlasName(zaName) {
  const match = zaName.match(/^(.*)\.([lr])$/i);
  if (!match) return null;
  const side = match[2].toLowerCase() === "l" ? "left" : "right";
  const Side = side[0].toUpperCase() + side.slice(1);
  const base = match[1];
  const phalanx = base.match(
    /^(Distal|Middle|Proximal) phalanx of (first|second|third|fourth|fifth) finger of (hand|foot)$/i,
  );
  if (phalanx) {
    const which =
      phalanx[1][0].toUpperCase() + phalanx[1].slice(1).toLowerCase();
    if (phalanx[3].toLowerCase() === "hand") {
      const digit = handDigit[phalanx[2].toLowerCase()];
      const label = digit === "thumb" ? "thumb" : `${digit} finger`;
      return `${which} phalanx of ${side} ${label}`;
    }
    const digit = footDigit[phalanx[2].toLowerCase()];
    const toe =
      digit === "big"
        ? "big toe"
        : digit === "little"
          ? "little toe"
          : `${digit} toe`;
    return `${which} phalanx of ${side} ${toe}`;
  }
  if (carpals[base]) return `${Side} ${carpals[base]}`;
  if (base === "Navicular bone") return `Navicular bone of ${side} foot`;
  if (/^(Calcaneus|Talus|Cuboid bone)$/.test(base))
    return `${Side} ${base[0].toLowerCase()}${base.slice(1)}`;
  if (/metacarpal bone$|metatarsal bone$|cuneiform bone$/i.test(base))
    return `${Side} ${base[0].toLowerCase()}${base.slice(1)}`;
  return null;
}

const skeletal = new Map(
  atlas.parts
    .filter((part) => part.system === "skeletal")
    .map((part) => [part.name, part]),
);
const landmarks = [];
for (const bone of za) {
  const name = atlasName(bone.name);
  const part = name && skeletal.get(name);
  if (!part) continue;
  const amid = part.bounds[0].map(
    (value, axis) => (value + part.bounds[1][axis]) / 2,
  );
  const delta = amid.map((value, axis) => value - bone.mid[axis]);
  const distance = Math.hypot(...delta);
  if (distance > 0.05) {
    console.log(`skip ${name}: ${(distance * 1000).toFixed(0)} mm`);
    continue;
  }
  landmarks.push({ name, at: bone.mid, delta });
}
console.log(`landmarks ${landmarks.length}`);

function deltaAt(vertex) {
  let nearest = Infinity;
  const scored = landmarks.map((landmark) => {
    const distance = Math.hypot(
      vertex[0] - landmark.at[0],
      vertex[1] - landmark.at[1],
      vertex[2] - landmark.at[2],
    );
    if (distance < nearest) nearest = distance;
    return { landmark, distance };
  });
  if (nearest > 0.04) return null;
  scored.sort((a, b) => a.distance - b.distance);
  let weightSum = 0;
  const acc = [0, 0, 0];
  for (const item of scored.slice(0, 3)) {
    if (item.distance > 0.05) break;
    const weight = 1 / (item.distance * item.distance + 1e-6);
    weightSum += weight;
    for (let axis = 0; axis < 3; axis++)
      acc[axis] += weight * item.landmark.delta[axis];
  }
  return acc.map((value) => value / weightSum);
}

const geometryUrl = new URL("body-joints.bin", models);
const geometry = Buffer.from(readFileSync(geometryUrl));
let moved = 0;
let kept = 0;
const reports = [];
for (const part of atlas.parts) {
  if (part.system !== "joints") continue;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let partMoved = 0;
  const shift = [0, 0, 0];
  for (let vertex = 0; vertex < part.vertexCount; vertex++) {
    const offset = part.positions + vertex * 12;
    const point = [
      geometry.readFloatLE(offset),
      geometry.readFloatLE(offset + 4),
      geometry.readFloatLE(offset + 8),
    ];
    const delta = deltaAt(point);
    if (delta) {
      point[0] += delta[0];
      point[1] += delta[1];
      point[2] += delta[2];
      if (!dry) {
        geometry.writeFloatLE(point[0], offset);
        geometry.writeFloatLE(point[1], offset + 4);
        geometry.writeFloatLE(point[2], offset + 8);
      }
      partMoved++;
      for (let axis = 0; axis < 3; axis++) shift[axis] += delta[axis];
    }
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  if (partMoved) {
    moved += partMoved;
    reports.push({
      name: part.name,
      vertices: partMoved,
      mm: shift.map((value) => Math.round((value / partMoved) * 1000)),
    });
  } else kept++;
  if (!dry) part.bounds = [min, max];
}
reports.sort((a, b) => b.vertices - a.vertices);
console.log(
  `parts shifted ${reports.length}, untouched ${kept}, vertices ${moved}`,
);
const limb =
  /phalan|metacarpal|carpal|wrist|thumb|toe|tarsal|finger|plantar|cuneiform|navicular|talus|calcane|cuboid|ankle|radiocarpal|intercarpal|metatars/i;
for (const report of reports.filter((item) => !limb.test(item.name)))
  console.log(
    "other",
    report.mm.join(",").padEnd(16),
    String(report.vertices).padStart(5),
    report.name,
  );

if (dry) process.exit(0);
atlas.jointAlignment = "hand-foot-v1";
const compressed = gzipSync(geometry, { level: 9 });
const chunk = atlas.chunks.find((item) => item.url.includes("body-joints"));
chunk.bytes = geometry.length;
chunk.gzipBytes = compressed.length;
writeFileSync(geometryUrl, geometry);
writeFileSync(new URL("body-joints.bin.gz", models), compressed);
writeFileSync(new URL("atlas.json", models), JSON.stringify(atlas));
console.log(`wrote ${geometry.length} bytes, gzip ${compressed.length}`);
