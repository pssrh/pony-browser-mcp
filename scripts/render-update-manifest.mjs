#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const args = parseArgs(process.argv.slice(2));
const extensionId = args['extension-id'];
const codebase = args['crx-url'];
const version = args.version || packageJson.version;
const output = args.output;

if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
  fail('--extension-id must be the 32-character Chrome extension ID.');
}
if (!codebase || !/^https:\/\//.test(codebase)) {
  fail('--crx-url must be an HTTPS URL.');
}
if (!/^\d+\.\d+\.\d+(?:\.[0-9]+)?$/.test(version)) {
  fail(`Invalid extension version: ${version}`);
}
if (!output) fail('Provide --output path/to/updates.xml.');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${escapeXml(extensionId)}">
    <updatecheck codebase="${escapeXml(codebase)}" version="${escapeXml(version)}" />
  </app>
</gupdate>
`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, xml, 'utf8');
console.log(`Wrote ${output} for ${extensionId} ${version}`);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for --${name}.`);
    parsed[name] = value;
    i += 1;
  }
  return parsed;
}

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function fail(message) {
  console.error(`render-update-manifest: ${message}`);
  process.exit(1);
}
