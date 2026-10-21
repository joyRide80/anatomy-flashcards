import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react";

/** Right swipe. Schedules the card as a successful review. */
export const REMEMBER = "I remember";
/** Left swipe. Brings the card back soon. */
export const NOT_YET = "Not yet remember";

export type Recall = "good" | "again";

const COMMIT = 96;

export function SwipeCard({
  enabled,
  intent,
  yesWhen,
  noWhen,
  onDecide,
  children,
}: {
  enabled: boolean;
  /** Keyboard stand-in for a flick. Cleared by the parent after it lands. */
  intent: Recall | null;
  yesWhen: string;
  noWhen: string;
  onDecide: (grade: Recall) => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const dragControls = useDragControls();
  const x = useMotionValue(0);
  const rotate = useTransform(
    x,
    [-520, -120, 0, 120, 520],
    [-15, -7, 0, 7, 15],
  );
  const lift = useTransform(x, (value) => -Math.min(Math.abs(value) / 30, 12));
  const yesOpacity = useTransform(x, [18, COMMIT], [0, 1]);
  const noOpacity = useTransform(x, [-COMMIT, -18], [1, 0]);
  const yesScale = useTransform(x, [18, COMMIT], [1.18, 1]);
  const noScale = useTransform(x, [-COMMIT, -18], [1, 1.18]);
  const yesRotate = useTransform(x, [18, COMMIT], [-16, -8]);
  const noRotate = useTransform(x, [-COMMIT, -18], [8, 16]);
  const cardRef = useRef<HTMLElement>(null);
  const committed = useRef(false);
  const alive = useRef(true);
  const onDecideRef = useRef(onDecide);
  onDecideRef.current = onDecide;
  const [dragging, setDragging] = useState(false);

  const release = (direction: Recall, velocity: number) => {
    if (!enabled || committed.current) return;
    committed.current = true;
    const dir = direction === "good" ? 1 : -1;
    if (reduced) {
      onDecideRef.current(direction);
      return;
    }
    const width = cardRef.current?.offsetWidth ?? 720;
    const speed = dir * Math.max(Math.abs(velocity), 1100);
    let settled = false;
    const finish = () => {
      if (settled || !alive.current) return;
      settled = true;
      onDecideRef.current(direction);
    };
    const controls = animate(x, dir * (window.innerWidth + width), {
      type: "spring",
      visualDuration: 0.3,
      bounce: 0,
      velocity: speed,
    });
    const stopWatch = x.on("change", () => {
      const box = cardRef.current?.getBoundingClientRect();
      if (!box) return;
      const off =
        dir > 0 ? box.left >= window.innerWidth - 12 : box.right <= 12;
      if (!off) return;
      stopWatch();
      finish();
    });
    void controls.finished.then(finish, () => {});
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!intent) return;
    release(intent, intent === "good" ? 1400 : -1400);
  }, [intent]);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (!enabled || committed.current) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, a, input, textarea, select")
    ) {
      return;
    }
    dragControls.start(event);
  };

  const onDragEnd = (_event: PointerEvent, info: PanInfo) => {
    setDragging(false);
    if (committed.current) return;
    const { offset, velocity } = info;
    if (offset.x > COMMIT || (velocity.x > 850 && offset.x > 40)) {
      release("good", velocity.x);
    } else if (offset.x < -COMMIT || (velocity.x < -850 && offset.x < -40)) {
      release("again", velocity.x);
    } else {
      animate(x, 0, {
        type: "spring",
        visualDuration: 0.34,
        bounce: 0.24,
        velocity: velocity.x,
      });
    }
  };

  return (
    <div className="swipe-stage">
      <motion.div
        className="swipe-enter"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", visualDuration: 0.38, bounce: 0.18 }}
      >
        <motion.section
          ref={cardRef}
          className={
            "session-card" +
            (enabled ? " is-swipeable" : "") +
            (dragging ? " is-dragging" : "")
          }
          style={{ x, y: lift, rotate }}
          drag={enabled ? "x" : false}
          dragListener={false}
          dragControls={dragControls}
          dragMomentum={false}
          onPointerDown={onPointerDown}
          onDragStart={() => setDragging(true)}
          onDragEnd={onDragEnd}
          aria-roledescription={enabled ? "swipeable card" : undefined}
          aria-describedby={enabled ? "swipe-hint" : undefined}
        >
          {enabled && (
            <>
              <motion.div
                className="swipe-stamp swipe-stamp-yes"
                style={{
                  opacity: yesOpacity,
                  scale: yesScale,
                  rotate: yesRotate,
                }}
                aria-hidden="true"
              >
                <strong>{REMEMBER}</strong>
                <small>{yesWhen}</small>
              </motion.div>
              <motion.div
                className="swipe-stamp swipe-stamp-no"
                style={{ opacity: noOpacity, scale: noScale, rotate: noRotate }}
                aria-hidden="true"
              >
                <strong>{NOT_YET}</strong>
                <small>{noWhen}</small>
              </motion.div>
            </>
          )}
          {enabled ? (
            <div className="session-card-stack">
              <div className="swipe-under" aria-hidden="true" />
              <div className="session-card-sheet">{children}</div>
            </div>
          ) : (
            children
          )}
          {enabled && (
            <p className="swipe-cue" id="swipe-hint">
              <svg viewBox="0 -960 960 960" aria-hidden="true">
                <path d="M473-80q-24 0-46-9t-39-26L184-320l30-31q16-16 37.5-21.5t42.5.5l66 19v-327q0-17 11.5-28.5T400-720q17 0 28.5 11.5T440-680v433l-97-27 102 102q5 5 12.5 8.5T473-160h167q33 0 56.5-23.5T720-240v-160q0-17 11.5-28.5T760-440q17 0 28.5 11.5T800-400v160q0 66-47 113T640-80H473Zm7-280v-160q0-17 11.5-28.5T520-560q17 0 28.5 11.5T560-520v160h-80Zm120 0v-120q0-17 11.5-28.5T640-520q17 0 28.5 11.5T680-480v120h-80Zm-20 80Zm300-400H680v-60h116q-66-58-147-89t-169-31q-88 0-169 31t-147 89h116v60H80v-200h60v81q72-59 159-90t181-31q94 0 181 31t159 90v-81h60v200Z" />
              </svg>
              <span className="swipe-cue-label">
                Swipe left if you do not remember yet. Swipe right if you
                remember.
              </span>
            </p>
          )}
        </motion.section>
      </motion.div>
    </div>
  );
}
