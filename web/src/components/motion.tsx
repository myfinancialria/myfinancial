import { motion, useInView, useReducedMotion, animate } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* ---------------------------------------------------------------------------
   The motion vocabulary.

   Three rules, applied everywhere:
     1. Motion explains where something came from. Content rises a few pixels
        as it arrives; it never slides across the screen or bounces.
     2. Nothing important waits on an animation. Reveals are short (0.4-0.5s)
        and content is readable the moment it starts.
     3. Every effect yields to prefers-reduced-motion, which is respected by
        returning the element unanimated rather than by speeding it up.
--------------------------------------------------------------------------- */

const EASE = [0.16, 1, 0.3, 1] as const;

export function Reveal({ children, delay = 0, y = 14, className = "" }: {
  children: ReactNode; delay?: number; y?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const still = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={still ? false : { opacity: 0, y }}
      animate={inView || still ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Children arrive in sequence — used for tiles and lists, never for prose. */
export function Stagger({ children, gap = 0.05, className = "" }: {
  children: ReactNode; gap?: number; className?: string;
}) {
  const still = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={still ? false : "hidden"}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export const StaggerItem = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <motion.div
    className={className}
    variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } }}
  >
    {children}
  </motion.div>
);

/**
 * A figure that counts up to its value.
 *
 * Deliberately restrained: it runs once, briefly, and only for headline
 * figures. Animating every number in a table would make a market screen feel
 * like a slot machine, which is the opposite of trustworthy.
 */
export function CountUp({ value, format, className = "", duration = 0.9 }: {
  value: number; format: (v: number) => string; className?: string; duration?: number;
}) {
  const [shown, setShown] = useState(value);
  const still = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (still || !inView) { setShown(value); return; }
    const controls = animate(0, value, {
      duration, ease: EASE, onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [value, inView, still, duration]);

  return <span ref={ref} className={className}>{format(shown)}</span>;
}

/** The page transition. One shared shape so navigation feels like one product. */
export const pageMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.32, ease: EASE },
};

/** A line that draws itself — used once per chart, on first paint only. */
export function DrawPath({ d, className = "", strokeWidth = 1.6, delay = 0, duration = 1.1 }: {
  d: string; className?: string; strokeWidth?: number; delay?: number; duration?: number;
}) {
  const still = useReducedMotion();
  return (
    <motion.path
      d={d}
      fill="none"
      strokeWidth={strokeWidth}
      className={className}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={still ? false : { pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ pathLength: { duration, delay, ease: EASE }, opacity: { duration: 0.2, delay } }}
    />
  );
}
