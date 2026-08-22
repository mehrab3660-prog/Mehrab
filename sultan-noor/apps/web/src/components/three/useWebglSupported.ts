"use client";

import { useEffect, useState } from "react";

// Real feature detection (not a UA sniff) — a device can report a
// WebGL-capable UA string yet still fail to create a context (old GPU,
// driver blocklist, embedded webview). Returns null while unknown so
// callers can render nothing/a neutral loading state until the check runs.
export function useWebglSupported(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      setSupported(!!gl);
    } catch {
      setSupported(false);
    }
  }, []);

  return supported;
}
