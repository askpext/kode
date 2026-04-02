import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  bundle: true,
  external: ['better-sqlite3'],
  outDir: 'dist',
  target: 'node18',
  platform: 'node',
});
