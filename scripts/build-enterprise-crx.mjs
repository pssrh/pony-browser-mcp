#!/usr/bin/env node

import { createHash, createPublicKey } from 'node:crypto';
import { access, cp, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const args = parseArgs(process.argv.slice(2));
const keyPath = resolve(args.key || process.env.PONY_EXTENSION_KEY || '');
const chromePath = args.chrome || process.env.CHROME_BIN || findChrome();
const outputPath = resolve(
  args.output || join(root, 'dist', `pony-browser-mcp-enterprise-${packageJson.version}.crx`),
);

if (!args.key && !process.env.PONY_EXTENSION_KEY) {
  fail('Provide --key /path/to/extension.pem or PONY_EXTENSION_KEY.');
}
if (!chromePath) fail('Chrome executable not found. Provide --chrome /path/to/chrome.');
await access(keyPath).catch(() => fail(`Extension key does not exist: ${keyPath}`));
await access(chromePath).catch(() => fail(`Chrome executable does not exist: ${chromePath}`));

const extensionDir = join(root, 'extension');
const manifest = JSON.parse(await readFile(join(extensionDir, 'manifest.json'), 'utf8'));
if (manifest.version !== packageJson.version) {
  fail(`Extension version ${manifest.version} does not match package version ${packageJson.version}.`);
}

const publicKeyDer = createPublicKey(await readFile(keyPath)).export({ type: 'spki', format: 'der' });
const extensionId = extensionIdFromPublicKey(publicKeyDer);
const workDir = await mkdtemp(join(tmpdir(), 'pony-browser-mcp-crx-'));
const stagedExtension = join(workDir, 'extension');
const profileDir = join(workDir, 'profile');
const generatedCrx = join(workDir, 'extension.crx');

try {
  await cp(extensionDir, stagedExtension, { recursive: true });
  await run(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-crash-reporter',
    '--user-data-dir=' + profileDir,
    '--pack-extension=' + stagedExtension,
    '--pack-extension-key=' + keyPath,
  ]);
  await access(generatedCrx).catch(() => fail(`Chrome did not produce ${generatedCrx}.`));
  await mkdir(dirname(outputPath), { recursive: true });
  await copyFile(generatedCrx, outputPath);
  const digest = await sha256(outputPath);
  const checksumPath = outputPath + '.sha256';
  await writeFile(checksumPath, `${digest}  ${basename(outputPath)}\n`, 'utf8');
  console.log(`CRX:          ${outputPath}`);
  console.log(`SHA-256:      ${digest}`);
  console.log(`Extension ID: ${extensionId}`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}

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

function findChrome() {
  const candidates = [];
  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    );
  } else if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles;
    const localAppData = process.env.LOCALAPPDATA;
    if (programFiles) candidates.push(join(programFiles, 'Google/Chrome/Application/chrome.exe'));
    if (localAppData) candidates.push(join(localAppData, 'Google/Chrome/Application/chrome.exe'));
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }
  return candidates.find((candidate) => existsSync(candidate));
}

function extensionIdFromPublicKey(publicKeyDer) {
  const hash = createHash('sha256').update(publicKeyDer).digest('hex').slice(0, 32);
  return hash.replace(/[0-9a-f]/g, (nibble) => 'abcdefghijklmnop'[parseInt(nibble, 16)]);
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function run(command, argv) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) return resolvePromise();
      reject(new Error(`Chrome packaging failed (code=${code}, signal=${signal}): ${stderr.trim()}`));
    });
  });
}

function fail(message) {
  console.error(`build-enterprise-crx: ${message}`);
  process.exit(1);
}
