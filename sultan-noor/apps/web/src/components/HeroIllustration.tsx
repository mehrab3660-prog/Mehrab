"use client";

import { motion } from "framer-motion";

// Custom abstract composition — a stylised pendant lamp radiating light —
// replaces generic stock-template hero art with something on-brand.
export default function HeroIllustration() {
  return (
    <svg viewBox="0 0 420 420" className="h-full w-full max-w-md" aria-hidden>
      <defs>
        <radialGradient id="glow" cx="50%" cy="38%" r="55%">
          <stop offset="0%" stopColor="#fff4d6" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#f0b93f" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#f0b93f" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff8ea" />
          <stop offset="100%" stopColor="#f0b93f" />
        </linearGradient>
        <linearGradient id="cord" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* ambient glow */}
      <motion.circle
        cx="210"
        cy="170"
        r="150"
        fill="url(#glow)"
        animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.06, 1] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* radiating light rays */}
      <motion.g
        animate={{ rotate: 360 }}
        transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        style={{ originX: "210px", originY: "170px" }}
        opacity={0.35}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <rect
            key={i}
            x="208"
            y="30"
            width="4"
            height="36"
            rx="2"
            fill="#ffffff"
            transform={`rotate(${i * 30} 210 170)`}
          />
        ))}
      </motion.g>

      {/* floating particles */}
      {[
        { cx: 90, cy: 90, r: 4, d: 0 },
        { cx: 330, cy: 120, r: 5, d: 0.6 },
        { cx: 350, cy: 250, r: 3, d: 1.1 },
        { cx: 70, cy: 260, r: 4, d: 1.6 },
      ].map((p, i) => (
        <motion.circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={p.r}
          fill="#ffffff"
          animate={{ y: [0, -14, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: p.d }}
        />
      ))}

      {/* cord */}
      <rect x="207" y="10" width="6" height="60" rx="3" fill="url(#cord)" />

      {/* pendant lamp shade */}
      <motion.g
        animate={{ rotate: [-2, 2, -2] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{ originX: "210px", originY: "70px" }}
      >
        <path d="M170 70 L250 70 L272 150 Q210 168 148 150 Z" fill="url(#shade)" stroke="#fff" strokeOpacity="0.5" />
        <ellipse cx="210" cy="70" rx="40" ry="8" fill="#fff8ea" />
        <ellipse cx="210" cy="150" rx="62" ry="10" fill="#8a5f08" opacity="0.35" />
      </motion.g>

      {/* base beam of light */}
      <motion.path
        d="M148 150 L272 150 L320 340 L100 340 Z"
        fill="#ffffff"
        opacity="0.12"
        animate={{ opacity: [0.08, 0.18, 0.08] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}
