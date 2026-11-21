import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  workers: 1,
  use: {
    baseURL: process.env.CHESSBOARD_TEST_URL ?? 'http://127.0.0.1:5173',
    launchOptions: { executablePath: process.env.CHESSBOARD_TEST_BROWSER },
  },
  webServer: {
    command: 'npm run dev',
    url: process.env.CHESSBOARD_TEST_URL ?? 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
})
