# Pony Browser MCP

Pony Browser MCP connects an MCP client to the user's existing Chrome profile
through a loopback-only WebSocket. It adds dedicated agent windows, named task
groups, workspace cleanup, and explicit human review prompts to the upstream
Browser MCP implementation.

The project has two local components:

1. The Chrome Web Store extension, installed once per Chrome profile and then
   updated by Chrome.
2. The MCP server, launched on demand by Codex or another MCP client through
   `stdio`.

The server intentionally listens only on `127.0.0.1`. It is not a shared remote
browser service and does not expose browser control on the LAN.

## Codex setup

After the npm package and Chrome Web Store listing are live:

```bash
codex mcp add pony-browser -- npx -y pony-browser-mcp@latest
```

Install the extension from the Chrome Web Store listing linked from the
[project site](https://pssrh.github.io/pony-browser-mcp/). Chrome handles future
extension updates. Developers can still load `extension/` unpacked for local
testing.

## Build and verify

```bash
npm ci
npm test
npm run build:cws
```

The Web Store ZIP and npm tarball are written to `dist/` with SHA-256 files.

## Privacy

The extension has no analytics or vendor backend. Browser data requested by an
MCP client travels over localhost to that client. The client may then send the
data to its configured model provider under the client's own privacy policy.
See the full [privacy policy](store/site/privacy.html).

## Attribution

This project is a fork of [Browser MCP by Agent360](https://github.com/Agent360dk/browser-mcp),
used under the MIT License. See [NOTICE.md](NOTICE.md) and [LICENSE](LICENSE).
