import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Catalog, Category, Structure } from "@/lib/flashcards/types";

const CLOSE_EXPLORE = "human-atlas:close-explore";

export const CATEGORY_LABEL: Record<Category, string> = {
  bone: "Bone",
  muscle: "Muscle",
  ligament: "Ligament",
  joint: "Joint",
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

export function ExplorerOverlay({
  src,
  title,
  onClose,
}: {
  src: string;
  title: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    const close = () => onCloseRef.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin) return;
      if (e.data?.type === CLOSE_EXPLORE) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("message", onMessage);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return createPortal(
    <div
      ref={dialog}
      className="study explorer-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="explorer-overlay-title"
      tabIndex={-1}
    >
      <div className="explorer-overlay-bar">
        <h2 id="explorer-overlay-title">{title}</h2>
        <button
          type="button"
          className="deck-settings-button explorer-overlay-close"
          aria-label="Close 3D explorer"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <iframe className="explorer-frame" src={src} title={title} />
    </div>,
    document.body,
  );
}

export function Plate({
  structure,
  view,
  explore,
  onView,
  praise = false,
}: {
  structure: Structure;
  view: number;
  /** Shown over the lower right of the picture once the answer is revealed. */
  explore?: () => void;
  onView?: (index: number) => void;
  /** A correct multiple-choice answer. Stamps the picture. */
  praise?: boolean;
}) {
  const images = structure.images;
  const image = images[view % Math.max(1, images.length)];
  return (
    <figure className="plate">
      <div className={praise ? "plate-frame is-correct" : "plate-frame"}>
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
        {praise && (
          <p className="choice-stamp" aria-hidden="true">
            <strong>Correct</strong>
          </p>
        )}
        {explore && (
          <button type="button" className="plate-explore" onClick={explore}>
            Explore in 3D
          </button>
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
