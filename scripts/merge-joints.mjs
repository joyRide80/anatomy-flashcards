// Append the Z-Anatomy joint chunk written by scripts/export-joints.py.
// Re-running replaces the previous joint chunk and leaves BodyParts3D meshes in place.
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";

const root = new URL("../", import.meta.url);
const models = new URL("public/models/", root);
const manifest = JSON.parse(
  readFileSync(new URL("scripts/data/joints-manifest.json", root)),
);
const geometry = readFileSync(
  new URL("scripts/data/joints-geometry.bin", root),
);
const atlas = JSON.parse(readFileSync(new URL("atlas.json", models)));

const kept = atlas.parts.filter((part) => !part.id.startsWith("ZJ"));
const keptConcepts = atlas.concepts.filter(
  (concept) => !concept.id.startsWith("Z"),
);
if (kept.length !== 2234) {
  throw new Error(
    `Expected 2,234 BodyParts3D meshes before adding joints, found ${kept.length}.`,
  );
}
for (const chunk of atlas.chunks) {
  if (!chunk.url.includes("body-joints")) continue;
  for (const name of [chunk.url, chunk.gzip].filter(Boolean)) {
    const file = new URL(name.split("/").pop(), models);
    if (existsSync(file)) unlinkSync(file);
  }
}

const cruciate = manifest.parts.find(
  (part) => part.name.toLowerCase() === "left anterior cruciate ligament",
);
if (!cruciate)
  throw new Error("The knee export is missing the anterior cruciate ligament.");
const center = cruciate.bounds[0].map(
  (value, axis) => (value + cruciate.bounds[1][axis]) / 2,
);
const femur = kept.find((part) => part.name === "Left femur");
const tibia = kept.find((part) => part.name === "Left tibia");
const knee = (femur.bounds[0][1] + tibia.bounds[1][1]) / 2;
if (Math.abs(center[1] - knee) > 0.04 || center[0] < 0.04 || center[0] > 0.14) {
  throw new Error(
    `Left anterior cruciate ligament is not on the knee (${center.map((value) => value.toFixed(3)).join(", ")}).`,
  );
}

const chunkIndex = atlas.chunks.filter(
  (chunk) => !chunk.url.includes("body-joints"),
).length;
const url = "/models/body-joints.bin";
const parts = manifest.parts.map((part) => {
  const { group, ...record } = part;
  return { ...record, chunk: chunkIndex };
});
const triangles =
  kept.reduce((sum, part) => sum + part.indexCount / 3, 0) + manifest.triangles;
const next = {
  ...atlas,
  parts: [...kept, ...parts],
  concepts: [...keptConcepts, ...manifest.concepts],
  chunks: [
    ...atlas.chunks.filter((chunk) => !chunk.url.includes("body-joints")),
    { url, bytes: geometry.length },
  ],
  triangles,
};
const compressed = gzipSync(geometry, { level: 9 });
next.chunks[chunkIndex].gzip = `${url}.gz`;
next.chunks[chunkIndex].gzipBytes = compressed.length;
writeFileSync(new URL("body-joints.bin", models), geometry);
writeFileSync(new URL("body-joints.bin.gz", models), compressed);
writeFileSync(new URL("atlas.json", models), JSON.stringify(next));
console.log(
  JSON.stringify(
    {
      parts: next.parts.length,
      concepts: next.concepts.length,
      jointParts: parts.length,
      jointConcepts: manifest.concepts.length,
      triangles,
      chunkBytes: geometry.length,
      gzipBytes: compressed.length,
      cruciate: center.map((value) => +value.toFixed(4)),
      knee: +knee.toFixed(4),
    },
    null,
    2,
  ),
);
