import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// Real Durable Objects, real SQLite, real `transactionSync` inside workerd.
// Nothing about the storage layer is mocked.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // Tests inject a locally generated JWKS, so no token ever reaches Google.
        bindings: {
          FIREBASE_PROJECT_ID: 'test-project',
          ALLOWED_ORIGINS: 'http://localhost:5173',
          GEMINI_MODEL: 'gemini-3.5-flash-lite',
          AI_ENABLED: 'false',
          APP_ENV: 'test',
          BUILD_COMMIT: 'test',
        },
      },
    }),
  ],
  test: {
    name: 'api',
    include: ['../../tests/api/**/*.test.ts'],
  },
})
