import { ArrowUpRight } from "lucide-react";
import type { Catalog, Category, Structure } from "@/lib/flashcards/types";

export const CATEGORY_LABEL: Record<Category, string> = {
  bone: "Bone",
  muscle: "Muscle",
  ligament: "Ligament",
};

/** Preferred Latin term without TA's bracketed numbering, e.g. "atlas [C I]" → "atlas". */
export const latinName = (s: Structure) =>
  (s.la[0] ?? s.en).replace(/\s*\[[^\]]*\]/g, "");
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function catalogMaps(catalog: Catalog) {
  return {
    structures: new Map(catalog.structures.map((s) => [s.id, s])),
    groups: new Map(catalog.groups.map((g) => [g.id, g])),
  };
}

/** Opens the 3D explorer on this structure, framed on the card's side, with nearby anatomy kept visible. */
export function explorerHref(s: Structure) {
  const params = new URLSearchParams({
    parts: s.parts.join(","),
    name: s.en,
    study: "1",
  });
  if (s.focus.length) params.set("focus", s.focus.join(","));
  return `/atlas?${params}`;
}

export function Plate({
  structure,
  view,
  explore,
  onView,
}: {
  structure: Structure;
  view: number;
  /** Shown over the lower right of the picture once the answer is revealed. */
  explore?: string;
  onView?: (index: number) => void;
}) {
  const images = structure.images;
  const image = images[view % Math.max(1, images.length)];
  return (
    <figure className="plate">
      <div className="plate-frame">
        {image ? (
          <img
            key={image.src}
            src={image.src}
            alt={`Highlighted structure, ${image.view} view`}
            draggable={false}
          />
        ) : (
          <div className="plate-missing">No image rendered yet</div>
        )}
        {explore && (
          <a
            className="plate-explore"
            href={explore}
            target="_blank"
            rel="noreferrer"
          >
            Explore in 3D <ArrowUpRight size={14} />
          </a>
        )}
      </div>
      {onView && images.length > 1 && (
        <figcaption>
          <span className="plate-views" role="group" aria-label="Views">
            {images.map((img, i) => (
              <button
                key={img.src}
                type="button"
                aria-pressed={i === view % images.length}
                onClick={() => onView(i)}
              >
                {img.view}
              </button>
            ))}
          </span>
        </figcaption>
      )}
    </figure>
  );
}

export function Thumb({ structure }: { structure: Structure }) {
  const src = structure.images[0]?.src;
  return src ? (
    <img className="thumb" src={src} alt="" loading="lazy" />
  ) : (
    <span className="thumb" />
  );
}
