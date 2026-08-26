import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "output/playwright/test-results",
  snapshotDir: "tests/e2e/__screenshots__",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { outputFolder: "output/playwright/report", open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:41789",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "reduce" }
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 41789",
    url: "http://127.0.0.1:41789",
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["iPhone 13"] } }
  ]
});
