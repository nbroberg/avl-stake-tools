import { defineConfig } from 'vitest/config';

// Separate from vitest.config.ts because this suite needs the Firestore
// emulator (see tests/firestore.rules.test.ts). Run via `npm run
// test:rules`, which wraps it in `firebase emulators:exec`.
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/firestore.rules.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
