const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  webServer: [
    {
      command: "python3 tests/serve.py 8767",
      url: "http://127.0.0.1:8767",
      reuseExistingServer: false
    },
    {
      command: "npm run build && python3 tests/serve.py 8768 --directory dist",
      url: "http://127.0.0.1:8768",
      reuseExistingServer: false
    }
  ],
  use: {
    baseURL: process.env.FONTANA_BASE_URL || "http://127.0.0.1:8767",
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    permissions: ["clipboard-read", "clipboard-write"]
  }
});
