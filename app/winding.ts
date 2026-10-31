/**
 * Z-Anatomy builds the body's left side as a negative-X mirror. Export applies
 * that mirror to positions and normals but keeps the original triangle order,
 * so outward normals face against the winding. A double-sided material then
 * flips those normals, and the whole mesh shades dark. Swap two corners when
 * the stored normals oppose the winding.
 */
export function alignMirroredWinding(
  positions: Float32Array,
  normals: Int16Array,
  indices: Uint32Array,
): void {
  const triangles = indices.length / 3;
  if (triangles < 1) return;
  const step = Math.max(1, Math.floor(triangles / 48));
  let disagree = 0;
  let sampled = 0;
  for (let triangle = 0; triangle < triangles; triangle += step) {
    const offset = triangle * 3;
    const i0 = indices[offset];
    const i1 = indices[offset + 1];
    const i2 = indices[offset + 2];
    const ax = positions[i0 * 3];
    const ay = positions[i0 * 3 + 1];
    const az = positions[i0 * 3 + 2];
    const bx = positions[i1 * 3];
    const by = positions[i1 * 3 + 1];
    const bz = positions[i1 * 3 + 2];
    const cx = positions[i2 * 3];
    const cy = positions[i2 * 3 + 1];
    const cz = positions[i2 * 3 + 2];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const sx = normals[i0 * 3] + normals[i1 * 3] + normals[i2 * 3];
    const sy = normals[i0 * 3 + 1] + normals[i1 * 3 + 1] + normals[i2 * 3 + 1];
    const sz = normals[i0 * 3 + 2] + normals[i1 * 3 + 2] + normals[i2 * 3 + 2];
    if (sx * nx + sy * ny + sz * nz < 0) disagree++;
    sampled++;
  }
  if (disagree * 2 <= sampled) return;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const first = indices[offset];
    indices[offset] = indices[offset + 1];
    indices[offset + 1] = first;
  }
}
