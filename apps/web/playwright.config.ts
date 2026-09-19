import { defineConfig, devices } from "@playwright/test";

const databaseUrl = "sqlite+pysqlite:////tmp/ai-sales-agent-playwright.db";
const python = process.env.E2E_PYTHON ?? "../../.venv/bin/python";
const sharedApiEnvironment = {
  APP_ENV: "test",
  ASYNC_MODE: "inline",
  CALL_WINDOW_START_HOUR: "0",
  CALL_WINDOW_END_HOUR: "24",
  CRM_MODE: "mock",
  DATABASE_URL: databaseUrl,
  RECORD_AUDIO: "false",
  VOICE_TRANSPORT: "browser",
};

export default defineConfig({
  testDir: "../../tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: [
        `${python} ../../tests/e2e/prepare_database.py`,
        `${python} -m uvicorn app.main:app --app-dir ../api --host 127.0.0.1 --port 8100`,
      ].join(" && "),
      env: sharedApiEnvironment,
      url: "http://127.0.0.1:8100/health/ready",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command:
        `${python} -m uvicorn app.voice_main:app --app-dir ../api --host 127.0.0.1 --port 8101`,
      env: sharedApiEnvironment,
      url: "http://127.0.0.1:8101/health/live",
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
      env: {
        API_BASE_URL: "http://127.0.0.1:8100",
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8100",
        NEXT_PUBLIC_VOICE_WS_URL: "ws://127.0.0.1:8101",
      },
      url: "http://127.0.0.1:3100/login",
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
