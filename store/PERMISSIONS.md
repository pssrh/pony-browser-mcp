# Chrome Web Store permission justifications

Pony Browser MCP has one purpose: allow a user-selected local MCP client to
operate the user's Chrome browser. The extension does not run without the local
companion server.

| Permission | Justification |
| --- | --- |
| `tabs`, `activeTab` | List, select, create, close, and inspect tabs requested by the MCP client. |
| `tabGroups` | Keep concurrent agent tasks in stable, named groups. |
| `cookies` | Implement explicit cookie read and write MCP tools. Cookie values are returned only to the local MCP client. |
| `scripting` | Read page content and perform requested DOM interactions without downloading remote code. |
| `debugger` | Optional fallback for reliable input and screenshots on pages where normal scripting is insufficient. It is disabled by default. |
| `storage` | Keep local connection, task, and action-log state. |
| `alarms`, `offscreen` | Maintain the loopback WebSocket while the Manifest V3 service worker sleeps. |
| `notifications` | Tell the user when an operation needs human review. |
| `webNavigation` | Wait for navigation completion before returning tool results. |
| `clipboardRead`, `clipboardWrite` | Implement explicit clipboard tools requested by the MCP client. |
| `<all_urls>` | Operate the site the user chooses and support local WebSocket discovery on `127.0.0.1`. |

The extension bundles all executable JavaScript. It does not download or
evaluate remote code. It has no analytics, advertising, or vendor backend.
