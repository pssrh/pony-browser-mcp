#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const required = [
  'scripts/build-enterprise-crx.mjs',
  'scripts/render-update-manifest.mjs',
  'enterprise/macos/install-policy.sh',
  'enterprise/windows/Install-PonyBrowserMcpPolicy.ps1',
  'enterprise/linux/install-policy.sh',
  'enterprise/linux/policy.example.json',
  'enterprise/README.md',
];
for (const relativePath of required) {
  await access(join(root, relativePath));
}

const windows = await readFile(join(root, 'enterprise/windows/Install-PonyBrowserMcpPolicy.ps1'), 'utf8');
if (!windows.includes('ExtensionSettings') || !windows.includes('force_installed')) {
  throw new Error('Windows policy script is missing ExtensionSettings force installation.');
}
if (windows.includes('-AsHashtable')) {
  throw new Error('Windows policy script must remain compatible with PowerShell 5.1.');
}
const mac = await readFile(join(root, 'enterprise/macos/install-policy.sh'), 'utf8');
if (!mac.includes('com.google.Chrome.plist') || !mac.includes('force_installed')) {
  throw new Error('macOS policy script is missing Chrome managed policy installation.');
}
const linux = JSON.parse(await readFile(join(root, 'enterprise/linux/policy.example.json'), 'utf8'));
if (linux.installation_mode !== 'force_installed' || linux.override_update_url !== true) {
  throw new Error('Linux policy example must force-install and pin the update URL.');
}
console.log('Validated enterprise distribution templates');
