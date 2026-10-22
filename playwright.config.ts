import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 41789);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PLAYWRIGHT_PORT must be an integer between 1 and 65535");
}

const runId = (process.env.PLAYWRIGHT_RUN_ID ?? "local").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "local";
const artifactDirectory = `output/playwright/${runId}`;
const configuredWorkers = process.env.PLAYWRIGHT_WORKERS;
const workers = configuredWorkers === undefined ? undefined : Number(configuredWorkers);
if (workers !== undefined && (!Number.isInteger(workers) || workers < 1)) {
  throw new Error("PLAYWRIGHT_WORKERS must be a positive integer");
}

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: `${artifactDirectory}/test-results`,
  snapshotDir: "tests/e2e/__screenshots__",
  fullyParallel: true,
  workers,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: `${artifactDirectory}/report`, open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" }
  },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], browserName: "chromium" } }
  ]
});
