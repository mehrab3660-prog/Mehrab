"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";

interface Hit {
  id: string;
  name: string;
  slug: string;
  basePrice: number;
  imageUrl: string | null;
}

export default function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<{ hits: Hit[] }>(`/search/products?q=${encodeURIComponent(query)}`)
        .then((res) => setHits(res.hits.slice(0, 5)))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOpen(false);
    router.push(`/products?q=${encodeURIComponent(query)}`);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-brand"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="جستجو در محصولات، برندها، دسته‌ها..."
            className="w-full rounded-xl border border-border-color bg-surface py-2.5 pr-10 pl-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/25"
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          type="submit"
          className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-[#0b0e14] transition-colors hover:bg-brand-light"
        >
          جستجو
        </motion.button>
      </form>

      <AnimatePresence>
        {open && query.trim() && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-border-color bg-surface shadow-2xl shadow-black/40"
          >
            {hits.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted">نتیجه‌ای یافت نشد.</p>
            ) : (
              hits.map((h) => (
                <Link
                  key={h.id}
                  href={`/products/${h.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 border-b border-border-color/60 p-3 text-sm transition-colors last:border-0 hover:bg-surface-2"
                >
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-brand/50">
                    {h.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.imageUrl} alt={h.name} className="h-full w-full object-cover" />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.7.8.7 1.3v.3h5.6v-.3c0-.5.3-1 .7-1.3A6 6 0 0 0 12 3ZM9 18h6M10 21h4" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="line-clamp-1">{h.name}</p>
                    <p className="text-xs text-brand">{Number(h.basePrice).toLocaleString("fa-IR")} تومان</p>
                  </div>
                </Link>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
