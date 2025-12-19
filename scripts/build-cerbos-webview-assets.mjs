import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const outDir = path.join(projectRoot, 'assets', 'cerbos');
const bridgeEntry = path.join(projectRoot, 'scripts', 'cerbos-webview-bridge.ts');
const bridgeBundleFile = path.join(outDir, 'bridge.bundle');
const bridgeHtmlFile = path.join(outDir, 'bridge.html');

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [bridgeEntry],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  outfile: bridgeBundleFile,
});

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cerbos Embedded Runtime</title>
    <style>
      html, body { margin: 0; padding: 0; font-family: -apple-system, system-ui, sans-serif; }
      body { padding: 10px; }
      .muted { color: #666; font-size: 12px; }
    </style>
  </head>
  <body>
    <div>Cerbos Embedded Runtime</div>
    <div class="muted" id="status">Loading...</div>
    <script src="${path.basename(bridgeBundleFile)}" type="text/javascript"></script>
  </body>
</html>`;

await writeFile(bridgeHtmlFile, html, 'utf8');
console.log(`Wrote ${path.relative(projectRoot, bridgeBundleFile)}`);
console.log(`Wrote ${path.relative(projectRoot, bridgeHtmlFile)}`);
