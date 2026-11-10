import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Catalog, Category, Structure } from "@/lib/flashcards/types";
import { t, viewName, type StudyLanguage } from "./language";

const CLOSE_EXPLORE = "human-atlas:close-explore";

export const CATEGORY_LABEL: Record<Category, string> = {
  bone: "Bone",
  muscle: "Muscle",
  ligament: "Ligament",
  joint: "Joint",
  artery: "Artery",
};

/** Preferred Latin term without TA's bracketed numbering, e.g. "atlas [C I]" → "atlas". */
export const latinName = (s: Structure) => (s.la[0] ?? s.en).replace(/\s*\[[^\]]*\]/g, "");
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function catalogMaps(catalog: Catalog) {
  return {
    structures: new Map(catalog.structures.map((s) => [s.id, s])),
    groups: new Map(catalog.groups.map((g) => [g.id, g])),
  };
}

/** Opens the 3D explorer on this structure, framed on the card's side, with nearby anatomy kept visible. */
export function explorerHref(s: Structure, imageView?: string) {
  const params = new URLSearchParams({
    parts: s.parts.join(","),
    name: s.en,
    study: "1",
  });
  if (s.la[0]) params.set("latin", s.la[0].replace(/\s*\[[^\]]*\]/g, ""));
  if (imageView === "anterior") params.set("view", "front");
  if (imageView === "posterior") params.set("view", "back");
  if (s.focus.length) params.set("focus", s.focus.join(","));
  return `/atlas?${params}`;
}

export function ExplorerOverlay({
  open,
  src,
  title,
  onClose,
}: {
  open: boolean;
  src: string;
  title: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    // A card may have been magnified on a small screen. Return the document to
    // its origin and focus the exit affordance before handing off to the atlas.
    window.scrollTo(0, 0);
    dialog.current?.scrollTo(0, 0);
    requestAnimationFrame(() => closeButton.current?.focus());
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
  }, [open]);

  const sendTarget = () => {
    frame.current?.contentWindow?.postMessage(
      {
        type: "human-atlas:study-target",
        search: new URL(src, location.origin).search,
      },
      location.origin,
    );
  };
  useEffect(() => {
    if (!open) return;
    if (!frameSrc) {
      setFrameSrc(src);
      return;
    }
    sendTarget();
  }, [open, src, frameSrc]);

  return createPortal(
    <div
      ref={dialog}
      className="study explorer-overlay"
      hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-labelledby="explorer-overlay-title"
      tabIndex={-1}
    >
      <div className="explorer-overlay-bar">
        <h2 id="explorer-overlay-title">{title}</h2>
        <button
          ref={closeButton}
          type="button"
          className="deck-settings-button explorer-overlay-close"
          aria-label="Close 3D explorer"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <iframe
        ref={frame}
        className="explorer-frame"
        src={frameSrc ?? "about:blank"}
        title={title}
        onLoad={sendTarget}
      />
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
  language = "en",
}: {
  structure: Structure;
  view: number;
  /** Shown over the lower right of the picture once the answer is revealed. */
  explore?: () => void;
  onView?: (index: number) => void;
  /** A correct multiple-choice answer. Stamps the picture. */
  praise?: boolean;
  language?: StudyLanguage;
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
            alt={`Highlighted structure, ${viewName(language, image.view)} view`}
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
            {t(language, "explore3d")}
          </button>
        )}
      </div>
      {onView && images.length > 1 && (
        <figcaption>
          <span className="plate-views" role="group" aria-label={t(language, "views")}>
            {images.map((img, i) => (
              <button
                key={img.src}
                type="button"
                aria-pressed={i === view % images.length}
                onClick={() => onView(i)}
              >
                {viewName(language, img.view)}
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
