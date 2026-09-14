import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    // Requires the Firestore emulator; run separately via `npm run
    // test:rules`, not as part of the plain unit-test run.
    exclude: ['node_modules/**', 'tests/firestore.rules.test.ts'],
  },
});
