import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // Pre-seed the "splash intro already seen" flag so every test starts
    // straight on the real page instead of behind the once-ever brand
    // intro overlay — that overlay has its own dedicated test below.
    storageState: {
      cookies: [],
      origins: [{ origin: BASE_URL, localStorage: [{ name: "sultan-noor-splash-seen", value: "1" }] }],
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
        },
      },
    },
  ],
  // The web server is started manually in CI/dev (real Postgres/Redis-backed
  // API must already be running); we don't spin up `next start` here since
  // this suite exercises the full stack, not an isolated frontend build.
});
