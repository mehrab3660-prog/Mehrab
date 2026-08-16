"use client";

import { motion } from "framer-motion";
import { Product } from "@/lib/types";
import { staggerContainer } from "@/lib/motion";
import ProductCard from "./ProductCard";

export default function ProductGrid({ products }: { products: Product[] }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4"
    >
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </motion.div>
  );
}
