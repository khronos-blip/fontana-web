const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  use: {
    baseURL: process.env.FONTANA_BASE_URL || "http://127.0.0.1:8765",
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    permissions: ["clipboard-read", "clipboard-write"]
  }
});
