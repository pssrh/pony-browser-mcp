#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionDir = join(root, 'extension');
const manifest = JSON.parse(await readFile(join(extensionDir, 'manifest.json'), 'utf8'));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

assert(manifest.manifest_version === 3, 'manifest_version must be 3');
assert(manifest.name === 'Pony Browser MCP', 'unexpected extension name');
assert(manifest.version === packageJson.version, 'package and extension versions differ');
assert(packageJson.name === 'pony-browser-mcp', 'unexpected npm package name');
assert(
  manifest.content_security_policy.extension_pages.includes('ws://127.0.0.1:*'),
  'extension CSP must allow the loopback WebSocket bridge',
);

const permissions = new Set(manifest.permissions);
for (const permission of [
  'tabs',
  'tabGroups',
  'cookies',
  'scripting',
  'storage',
  'offscreen',
  'notifications',
  'webNavigation',
]) {
  assert(permissions.has(permission), `missing permission: ${permission}`);
}

const htmlFiles = (await readdir(extensionDir)).filter((name) => name.endsWith('.html'));
for (const name of htmlFiles) {
  const html = await readFile(join(extensionDir, name), 'utf8');
  assert(!/<script[^>]+src=["']https?:/i.test(html), `${name} loads remote JavaScript`);
}

for (const [size, name] of [[16, 'icon-16.png'], [48, 'icon-48.png'], [128, 'icon-128.png']]) {
  const png = await readFile(join(extensionDir, 'icons', name));
  assert(png.toString('ascii', 1, 4) === 'PNG', `${name} is not a PNG`);
  assert(png.readUInt32BE(16) === size, `${name} width is not ${size}`);
  assert(png.readUInt32BE(20) === size, `${name} height is not ${size}`);
}

console.log(`Validated Pony Browser MCP ${manifest.version}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
