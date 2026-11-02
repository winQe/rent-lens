// Builds the two Lambda packages the Terraform deploys (infra/lambda.tf):
//   build/api.zip     the Express API (main.mjs), started by run.sh through the Lambda Web Adapter
//   build/ingest.zip  the fetch and load handlers (fetch.mjs, load.mjs)
// Each entry point is bundled with all its dependencies into one file, so the zips need no
// node_modules. Both include the RDS CA bundle (rds-ca.pem), which the Lambdas use to check TLS.
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const OUT = new URL('../../build/', import.meta.url);
const CA_URL = 'https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem';

const packages = {
  api: { main: 'src/main.ts' },
  ingest: { fetch: 'src/lambda/fetch.ts', load: 'src/lambda/load.ts' },
};

// RDS_CA_BUNDLE points at a local copy, for building without internet access.
const ca = process.env.RDS_CA_BUNDLE ? await readFile(process.env.RDS_CA_BUNDLE, 'utf8') : await (await fetch(CA_URL)).text();
if (!ca.includes('BEGIN CERTIFICATE')) throw new Error(`The RDS CA bundle from ${CA_URL} is not a certificate file`);

await rm(OUT, { recursive: true, force: true });
for (const [name, entryPoints] of Object.entries(packages)) {
  const dir = new URL(`lambda/${name}/`, OUT);
  await build({
    entryPoints,
    outdir: dir.pathname,
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    // Some dependencies are CommonJS and call require(); an ES module bundle has to provide it.
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    // pg loads its optional native driver only when asked; the pure JS driver is used.
    external: ['pg-native'],
    logLevel: 'warning',
  });
  await writeFile(new URL('rds-ca.pem', dir), ca);
  if (name === 'api') {
    await writeFile(new URL('run.sh', dir), '#!/bin/sh\nexec node main.mjs\n');
    await chmod(new URL('run.sh', dir), 0o755);
  }
  await mkdir(OUT, { recursive: true });
  execFileSync('zip', ['-qrX', new URL(`${name}.zip`, OUT).pathname, '.'], { cwd: dir.pathname });
  console.log(`built build/${name}.zip`);
}
