import { defineConfig, devices } from "playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || process.env.E2E_PORT || "8788";
const E2E_DATA_DIR = process.env.AGH_DATA_DIR || path.resolve(__dirname, "test-results", "e2e-data");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
      },
    },
  ],
  webServer: {
    command: `PORT=${PORT} AGH_DATA_DIR="${E2E_DATA_DIR}" DATA_DIR="${E2E_DATA_DIR}" node server/index.mjs`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
    env: {
      ...process.env,
      PORT: String(PORT),
      AGH_DATA_DIR: E2E_DATA_DIR,
      DATA_DIR: E2E_DATA_DIR,
    },
  },
});
