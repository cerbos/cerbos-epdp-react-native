import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, 'assets', 'cerbos');
const entry = path.join(projectRoot, 'scripts', 'cerbos-webview-sdk-entry.ts');
const outFile = path.join(outDir, 'embedded-client.bundle.txt');

await mkdir(outDir, { recursive: true });

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  write: false,
});

const code = result.outputFiles?.[0]?.text;
if (!code) {
  throw new Error('Failed to build embedded-client bundle');
}

await writeFile(outFile, code, 'utf8');
console.log(`Wrote ${path.relative(projectRoot, outFile)}`);

