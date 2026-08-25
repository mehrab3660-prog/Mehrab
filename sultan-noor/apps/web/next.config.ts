import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle (only the deps actually used,
  // not the full node_modules) — much smaller Docker image and lower
  // memory footprint, which matters on a small production VPS.
  output: "standalone",
};

export default nextConfig;
