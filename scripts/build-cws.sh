#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
DIST="$ROOT/dist"
CWS_ZIP="$DIST/pony-browser-mcp-cws-$VERSION.zip"

mkdir -p "$DIST"
node "$ROOT/scripts/validate-release.mjs"

rm -f "$CWS_ZIP"
(cd "$ROOT/extension" && zip -qr "$CWS_ZIP" . -x '*.DS_Store')
unzip -tq "$CWS_ZIP"
shasum -a 256 "$CWS_ZIP" > "$CWS_ZIP.sha256"

npm pack "$ROOT" --pack-destination "$DIST" --registry=https://registry.npmjs.org >/dev/null
NPM_TGZ="$DIST/pony-browser-mcp-$VERSION.tgz"
shasum -a 256 "$NPM_TGZ" > "$NPM_TGZ.sha256"

printf 'Chrome Web Store: %s\n' "$CWS_ZIP"
printf 'npm package:      %s\n' "$NPM_TGZ"
