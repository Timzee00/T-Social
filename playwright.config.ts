import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/browser/setup.ts",
  workers: 1,
  timeout: 30000,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/browser-results.json" }],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: [
    {
      command: "node tests/browser/storage-emulator.mjs",
      url: "http://127.0.0.1:9000/healthz",
      reuseExistingServer: true,
      ignoreHTTPSErrors: true,
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://localhost:3000/api/healthz",
      reuseExistingServer: true,
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
