# Chrome Web Store listing

## Product details

- Name: Pony Browser MCP
- Category: Productivity
- Language: English
- Visibility for first release: Unlisted
- Homepage: https://pssrh.github.io/pony-browser-mcp/
- Privacy policy: https://pssrh.github.io/pony-browser-mcp/privacy.html
- Support: https://github.com/pssrh/pony-browser-mcp/issues

## Summary

Connect your MCP client to local Chrome with isolated agent windows and human
review prompts.

## Description

Pony Browser MCP lets an MCP-compatible coding agent operate the Chrome profile
you already use. The extension connects only to a companion MCP server on
127.0.0.1. There is no hosted relay, analytics service, or vendor account.

Use it to inspect authenticated applications, navigate pages, fill forms,
capture screenshots, organize each task in a named tab group, and keep agent
work in a dedicated browser window. Sensitive actions can display a visible
prompt so a person can review or complete the step.

The extension requires the separately installed Pony Browser MCP server. The
server is launched on demand by Codex or another MCP client and communicates
with the extension over localhost.

Pony Browser MCP is open source. It is based on Browser MCP by Agent360 under
the MIT License and includes substantial task isolation and workflow changes.

## Reviewer notes

1. Install Node.js 18 or newer.
2. Run `npx -y pony-browser-mcp@latest` from an MCP client, or run the packaged
   server directly with `node index.js`.
3. The server listens on the first available loopback port from 9876 through
   9895. The extension discovers these local ports automatically.
4. Open Chrome and invoke `browser_list_tabs` from the MCP client to verify the
   connection.
5. No test account is required because the extension operates on pages chosen
   by the reviewer. Its network bridge accepts loopback connections only.
