import { defineConfig } from 'vitest/config'

// Two pools: the domain is plain TypeScript and runs on the default node pool; the API
// tests need real Durable Objects and a real `transactionSync`, so they run inside
// workerd via @cloudflare/vitest-pool-workers. Nothing about the DO is mocked.
export default defineConfig({
  test: {
    projects: ['packages/domain/vitest.config.ts', 'apps/api/vitest.config.ts', 'apps/web/vitest.config.ts'],
  },
})
