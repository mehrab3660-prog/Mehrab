"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Notification {
  id: string;
  title: string;
  body?: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationBell() {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accessToken) return;
    api
      .get<Notification[]>("/notifications", accessToken)
      .then(setItems)
      .catch(() => setItems([]));
  }, [accessToken]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!accessToken) return null;

  const unreadCount = items.filter((n) => !n.readAt).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-surface-2 hover:text-brand"
        aria-label="اعلان‌ها"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" strokeLinejoin="round" />
          <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-[#0b0e14]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-xl border border-border-color bg-surface shadow-2xl shadow-black/40"
          >
            <div className="border-b border-border-color p-3 text-sm font-bold">اعلان‌ها</div>
            <div className="max-h-72 overflow-y-auto">
              {items.length === 0 ? (
                <p className="p-4 text-center text-xs text-muted">اعلانی وجود ندارد.</p>
              ) : (
                items.map((n) => (
                  <div key={n.id} className="border-b border-border-color/60 p-3 text-xs last:border-0">
                    <p className={n.readAt ? "text-muted" : "font-bold text-foreground"}>{n.title}</p>
                    {n.body && <p className="mt-1 text-muted">{n.body}</p>}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
