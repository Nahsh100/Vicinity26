import { defineConfig } from 'vitest/config';

// Unit tests for framework-independent logic (stores, validation). UI is verified in the running app.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
