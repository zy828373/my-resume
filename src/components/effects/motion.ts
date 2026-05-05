import type { SpringOptions, Transition, Variants } from "framer-motion";

export const springSoft: SpringOptions = {
  damping: 25,
  stiffness: 180,
  mass: 0.5,
};

export const springTight: SpringOptions = {
  damping: 15,
  stiffness: 200,
  mass: 0.4,
};

export const springSoftTransition: Transition = { type: "spring", ...springSoft };
export const springTightTransition: Transition = { type: "spring", ...springTight };

export const easeOutExpo: Transition = {
  duration: 0.42,
  ease: [0.16, 1, 0.3, 1],
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: easeOutExpo,
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: {
    opacity: 1,
    scale: 1,
    transition: { ...springSoft, mass: 0.6 },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: easeOutExpo,
  },
};
