import type { Catalog } from "./types";

/**
 * Preferred card Latin indexed by mesh. When a composite and one of its parts
 * share a mesh, the smaller card is the more useful label for direct 3D picks.
 */
export function preferredLatinByPart(catalog: Catalog) {
  const entries = new Map<string, { latin: string; partCount: number }>();
  for (const structure of catalog.structures) {
    const latin = structure.la[0]?.replace(/\s*\[[^\]]*\]/g, "").trim();
    if (!latin) continue;
    for (const part of structure.parts) {
      const current = entries.get(part);
      if (!current || structure.parts.length < current.partCount)
        entries.set(part, { latin, partCount: structure.parts.length });
    }
  }
  return new Map([...entries].map(([part, entry]) => [part, entry.latin]));
}
