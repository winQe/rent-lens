// Bundles the API, and the shared package it imports as TypeScript source, into
// single ESM files. The same bundles are what a Lambda deployment would ship.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// npm dependencies stay external and are installed in the image; the workspace package is bundled.
const external = Object.keys(pkg.dependencies).filter((name) => !name.startsWith('@rent-lens/'));

await build({
  entryPoints: {
    migrate: 'src/cli/migrate.ts',
    ingest: 'src/cli/ingest.ts',
  },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external,
});
