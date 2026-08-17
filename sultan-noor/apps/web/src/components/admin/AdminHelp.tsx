"use client";

import { useEffect, useState } from "react";

interface AdminHelpProps {
  /** Unique key for remembering collapse state per section, e.g. "products". */
  storageKey: string;
  title?: string;
  children: React.ReactNode;
}

/**
 * Plain-language "how do I use this page" box for non-technical store
 * managers. Open by default; the collapsed/open state is remembered per
 * section (per storageKey) in localStorage so a manager who reads it once
 * and closes it doesn't see it pop open again on every visit.
 */
export default function AdminHelp({ storageKey, title = "راهنمای این بخش", children }: AdminHelpProps) {
  const key = `admin-help-${storageKey}`;
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(key);
    if (saved !== null) setOpen(saved === "1");
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      window.localStorage.setItem(key, next ? "1" : "0");
      return next;
    });
  }

  if (!ready) return null;

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-dashed border-brand/40 bg-surface">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-brand">
          <span aria-hidden>💡</span>
          {title}
        </span>
        <span className="text-xs text-foreground/50">{open ? "بستن راهنما ▲" : "نمایش راهنما ▼"}</span>
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border-color px-4 py-3 text-sm leading-7 text-foreground/70">
          {children}
        </div>
      )}
    </div>
  );
}
