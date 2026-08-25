"use client";

import { useEffect, useState } from "react";

function getRemaining(target: number) {
  const diff = Math.max(target - Date.now(), 0);
  return {
    h: Math.floor(diff / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
  };
}

function two(n: number) {
  return String(n).padStart(2, "0");
}

// Counts down to `target` in real time (re-computed every tick, not faked).
export default function Countdown({ target }: { target: Date }) {
  const [time, setTime] = useState(() => getRemaining(target.getTime()));

  useEffect(() => {
    const timer = setInterval(() => setTime(getRemaining(target.getTime())), 1000);
    return () => clearInterval(timer);
  }, [target]);

  return (
    <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-brand" dir="ltr">
      <span className="rounded-md bg-brand/10 px-2 py-1">{two(time.h)}</span>:
      <span className="rounded-md bg-brand/10 px-2 py-1">{two(time.m)}</span>:
      <span className="rounded-md bg-brand/10 px-2 py-1">{two(time.s)}</span>
    </div>
  );
}
