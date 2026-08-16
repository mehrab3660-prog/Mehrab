"use client";

import { motion } from "framer-motion";
import { staggerContainer, fadeUp } from "@/lib/motion";
import { Brand } from "@/lib/types";

// Renders only real brands from our own database — never third-party
// trademarked logos we don't have rights to display.
export default function TrustedBrands({ brands }: { brands: Brand[] }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6"
    >
      {brands.map((brand) => (
        <motion.div
          key={brand.id}
          variants={fadeUp}
          whileHover={{ y: -3 }}
          className="flex h-20 items-center justify-center rounded-xl surface-card px-3 text-center transition-shadow hover:glow-shadow"
        >
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name} className="max-h-10 max-w-full object-contain opacity-80" />
          ) : (
            <span className="text-sm font-bold text-foreground/70">{brand.name}</span>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}
