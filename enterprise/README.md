# Enterprise distribution without the Chrome Web Store

Pony Browser MCP can be distributed as a signed CRX through Chrome managed
policies. This route does not require a Chrome Web Store developer account,
store review, or a per-profile "Load unpacked" installation. It does require
one policy setup on each managed device and administrator access for machine
wide installation. Chrome treats this as enterprise deployment: Windows
devices must be joined to a Microsoft Active Directory domain for automatic
installation of an extension that is not in the Web Store, and macOS/Linux
Chrome must use a managed account or managed-on-premise policy.

The extension ID is derived from the signing key. Keep the private key outside
Git and back it up securely. Every later CRX must be signed with that same key
or Chrome will treat it as a different extension.

## Build and publish a release

On the Mac that owns the signing key:

```bash
export PONY_EXTENSION_KEY="$HOME/Library/Application Support/PonyBrowserMCP/pony-browser-mcp-extension.pem"
npm ci
npm run build:enterprise
```

The command writes a CRX and SHA-256 file to `dist/`. Upload the CRX and its
checksum to the matching GitHub release. The update URL must be an HTTPS URL
that returns a Chrome update manifest, for example:

```bash
node scripts/render-update-manifest.mjs \
  --extension-id gdocpeeeaeholmnejpepngifldepehkn \
  --version 1.0.0 \
  --crx-url https://github.com/pssrh/pony-browser-mcp/releases/download/v1.0.0/pony-browser-mcp-enterprise-1.0.0.crx \
  --output store/site/updates/updates.xml
```

Commit and push `store/site/updates/updates.xml` so GitHub Pages serves it at
`https://pssrh.github.io/pony-browser-mcp/updates/updates.xml`.

## Install the policy

Use the same extension ID and update URL on each target. The scripts are
idempotent and only update Pony's extension entry.

macOS (machine-wide managed Chrome policy):

```bash
sudo ./enterprise/macos/install-policy.sh \
  --extension-id gdocpeeeaeholmnejpepngifldepehkn \
  --update-url https://pssrh.github.io/pony-browser-mcp/updates/updates.xml
```

Windows (current user; add `-Machine` from an elevated PowerShell for all
users):

```powershell
.\enterprise\windows\Install-PonyBrowserMcpPolicy.ps1 `
  -ExtensionId gdocpeeeaeholmnejpepngifldepehkn `
  -UpdateUrl https://pssrh.github.io/pony-browser-mcp/updates/updates.xml
```

Linux (Chrome or Chromium):

```bash
sudo ./enterprise/linux/install-policy.sh \
  --extension-id gdocpeeeaeholmnejpepngifldepehkn \
  --update-url https://pssrh.github.io/pony-browser-mcp/updates/updates.xml
```

After restarting Chrome, check `chrome://policy` and then
`chrome://extensions`. The extension should show as force-installed and its
version should come from the update manifest. A policy does not grant access to
the browser to an arbitrary remote host: the MCP server remains loopback-only.
See Google's [Windows policy guide](https://support.google.com/chrome/a/answer/7532015)
and [Mac policy guide](https://support.google.com/chrome/a/answer/7517624) for
the management prerequisites.

## Server installation

The MCP server is separate from the extension. Install a pinned release asset
on each machine that runs an MCP client, or run it from a checked-out release:

```bash
npm install --global https://github.com/pssrh/pony-browser-mcp/releases/download/v1.0.0/pony-browser-mcp-1.0.0.tgz
codex mcp add pony-browser -- pony-browser-mcp
```

No chat content, cookies, tokens, or private signing keys belong in the GitHub
repository.
