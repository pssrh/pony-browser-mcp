#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const command = process.argv[2];

if (!command) {
  await import('../index.js');
} else if (command === 'install') {
  installInstructions(process.argv.includes('--unpacked'));
} else if (command === '--help' || command === '-h' || command === 'help') {
  printHelp();
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

function installInstructions(copyUnpacked) {
  let unpackedLine = '';

  if (copyUnpacked) {
    const source = join(packageRoot, 'extension');
    const destination = join(homedir(), '.pony-browser-mcp', 'extension');
    if (!existsSync(source)) {
      throw new Error('Packaged extension files are missing');
    }
    mkdirSync(destination, { recursive: true });
    cpSync(source, destination, { recursive: true });
    unpackedLine = `\nDevelopment extension copied to ${destination}.`;
  }

  console.log(`
Pony Browser MCP

Codex CLI:
  codex mcp add pony-browser -- npx -y pony-browser-mcp@latest

Chrome extension:
  https://pssrh.github.io/pony-browser-mcp/

Chrome Web Store installs update automatically. Use --unpacked only for local
development and load the copied directory from chrome://extensions.${unpackedLine}
`);
}

function printHelp() {
  console.log(`
Pony Browser MCP

Usage:
  pony-browser-mcp                Start the stdio MCP server
  pony-browser-mcp install        Print Codex and Chrome setup instructions
  pony-browser-mcp install --unpacked
                                  Copy a development extension to the user home

Project: https://github.com/pssrh/pony-browser-mcp
`);
}
