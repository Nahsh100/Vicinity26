import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC (not esbuild) so NestJS decorator metadata is emitted for dependency injection.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } } })],
  test: {
    globals: true,
    include: ['test/**/*.spec.ts'],
    setupFiles: ['test/setup-env.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    pool: 'forks',
  },
});
