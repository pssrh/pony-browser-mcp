#!/usr/bin/env node
/**
 * Pony Browser MCP Server
 *
 * Bridges Claude Code (stdio MCP) to Chrome Extension (WebSocket).
 * Auto-selects first available port in range 9876-9885 for multi-session support.
 *
 * Architecture:
 *   Claude Code ←(stdio)→ this process ←(WS :port)→ Offscreen Doc ←(sendMessage)→ Service Worker → Chrome APIs
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebSocketServer } from 'ws';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { TOOLS, PROVIDER_PAGES } from './tools.js';

// Read version from package.json — single source of truth, never drifts
const PKG_VERSION = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8')
).version;

const BASE_PORT = 9876;
const MAX_PORT = 9895; // 20 ports instead of 10 — zombies die within 5s via parent check
let extensionSocket = null;
let activePort = null;
let wss = null; // Track WSS for graceful shutdown
let cmdId = 0;
let lastActivity = Date.now();
const pending = new Map();

// Timers hoisted to module scope so gracefulShutdown can clear them deterministically.
let heartbeat = null;
let parentCheck = null;

// ── WebSocket Server ───────────────────────────────────────────────────────

function createWSS(port = BASE_PORT) {
  const server = new WebSocketServer({ host: '127.0.0.1', port });
  wss = server;

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (port < MAX_PORT) {
        process.stderr.write(`[MCP] Port ${port} in use, trying ${port + 1}...\n`);
        createWSS(port + 1);
      } else {
        process.stderr.write(`[MCP] All ports ${BASE_PORT}-${MAX_PORT} in use. Cannot start.\n`);
      }
    } else {
      process.stderr.write(`[MCP] WebSocket error: ${err.message}\n`);
    }
  });

  server.on('connection', (ws) => {
    extensionSocket = ws;
    process.stderr.write(`[MCP] Chrome extension connected on port ${port}\n`);

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }

      if (msg.type === 'terminate') {
        gracefulShutdown('Terminate signal from extension (last tab closed)');
        return;
      }

      const { id, result, error } = msg;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      clearTimeout(p.timer);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    });

    ws.on('close', () => {
      if (extensionSocket === ws) {
        extensionSocket = null;
        process.stderr.write(`[MCP] Chrome extension disconnected\n`);
      }
    });
  });

  server.on('listening', () => {
    activePort = port;
    process.stderr.write(`[MCP] WebSocket server listening on ws://127.0.0.1:${port}\n`);
  });

  // Heartbeat + idle timeout (4 hours) — hoisted to module scope so gracefulShutdown can clear it
  heartbeat = setInterval(() => {
    if (extensionSocket && extensionSocket.readyState === 1) {
      extensionSocket.ping();
    }
    if (Date.now() - lastActivity > 4 * 60 * 60 * 1000) {
      gracefulShutdown('Idle timeout (4h)');
    }
  }, 20000);
}

createWSS();

// ── Send command to extension ───────────────────────────────────────────────

async function sendToExtension(method, params = {}, timeoutMs = 30000, _retries = 5) {
  // Retry if extension is temporarily disconnected (reconnects every 2s)
  if (!extensionSocket || extensionSocket.readyState !== 1) {
    if (_retries > 0) {
      await new Promise(r => setTimeout(r, 1500));
      return sendToExtension(method, params, timeoutMs, _retries - 1);
    }
    throw new Error('Chrome extension not connected after 5 retries. Open Chrome and ensure Pony Browser MCP is installed.');
  }
  return new Promise((resolve, reject) => {
    const id = ++cmdId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    extensionSocket.send(JSON.stringify({ id, method, params }));
  });
}

// ── MCP Server ──────────────────────────────────────────────────────────────

const INSTRUCTIONS = `You control the user's real Chrome browser via this MCP server.

## Task tab groups (required for parallel work)
- ALWAYS pass task="短任务名" on browser_navigate. That string becomes the Chrome tab group title.
- Example: task="LINUX DO 最新" and task="小傅哥知识星球" → two colored groups named exactly that.
- workspace / group are aliases of task. Parallel tasks MUST use different task names.
- If you omit task, the group falls back to the site hostname (e.g. linux.do) — still prefer an explicit task name.
- browser_use_workspace({ task: "..." }) switches the active group.

## Debugger / yellow banner
- chrome.debugger is OFF by default (no "已开始调试此浏览器" banner).
- Only pass use_debugger=true when scripting fails on CSP-strict sites.

## Key behaviors
- Use browser_ask_user for credentials / 2FA / CAPTCHA help.
- Close tabs with browser_close_tab when done.
- Check browser_list_tabs before opening duplicates.

## Screenshots
- browser_screenshot uses captureVisibleTab by default (no debugger banner)

## Text-based selectors (preferred for dynamic sites)
- browser_click("text=Get started") — clicks any element containing "Get started"
- browser_click("button:text(Submit)") — clicks a button containing "Submit"
- browser_fill("text=Email", "user@example.com") — fills input near "Email" label
- browser_wait("text=Success") — waits for text to appear
- These work on ALL sites including Google Cloud, Stripe, Slack (CSP-strict)

## Keyboard
- browser_press_key("Enter") — submit forms
- browser_press_key("Tab") — navigate between fields
- browser_press_key("Escape") — close dialogs
- browser_press_key("ArrowDown") — navigate dropdowns
- browser_press_key("a", ctrl=true) — select all

## CAPTCHA handling
Use browser_solve_captcha to detect and solve CAPTCHAs automatically:
1. Call browser_solve_captcha() — detects CAPTCHA type on page
2. If reCAPTCHA v2 checkbox found → call browser_solve_captcha(action="click_checkbox") — auto-clicks; often passes when signed into Google
3. If image challenge appears → call browser_screenshot, analyze the grid visually, then call browser_solve_captcha(action="click_grid", cells=[2,5,7]) with the correct cell indices
4. If all else fails → call browser_solve_captcha(action="ask_human") to show overlay to user
5. After solving, retry the action that was blocked

For image grid challenges: cells are 0-indexed, left-to-right, top-to-bottom. A 3x3 grid has cells 0-8. A 4x4 grid has cells 0-15.

## OAuth popups
- OAuth popups (Google, Microsoft, GitHub, Slack, HubSpot) are automatically intercepted and added to your session's tab group
- Use browser_get_new_tab to access them, or they'll become your active tab automatically

## Shadow DOM (Shopify, Salesforce, etc.)
- CSS selectors automatically search inside shadow DOM
- If a standard selector fails, the extension recursively searches shadow roots
- Text-based selectors ("text=Submit") also traverse shadow DOM

## Hard inputs — use the specialised tools first
- **Date inputs** → use browser_set_date (NOT browser_fill). Handles native date inputs, masked text inputs (MM/DD/YYYY etc.), AND calendar pickers (MUI, react-datepicker, AntD, Lexical/Meta). 3-path fallback with read-back verification.
- **Autocomplete / combobox** (Languages on Meta Ads, country selects, async dropdowns) → use browser_set_combobox (NOT browser_select_option). Types partial query, waits for filtered listbox, clicks option. Supports multi-value chips.
- **Drag-drop file zones without visible file input** → use browser_drop_file (NOT browser_upload_file). Finds hidden input in subtree/parent.
- **Annoying popups blocking the flow** (cookie banners, "Don't show again", Advantage+ tooltips, draft-confirm prompts) → call browser_dismiss_overlays before each major step. It only clicks safe close affordances by default; preserves forms with editable text fields.

## When things fail
- Element not found → try text-based selector instead of CSS
- Screenshot fails → debugger fallback is automatic
- Click doesn't work on SPA → debugger mouse events are used automatically
- CAPTCHA blocks page → use browser_ask_user, let human solve it
- browser_fill seemingly succeeds but value reverts → switch to browser_set_date or browser_set_combobox (most reverts are React-controlled validators)

## Extension updates
Chrome Web Store installations update automatically. The MCP server is versioned
separately through npm and never changes a Git checkout at startup.

## Sharing wishes / use-cases / bugs
When the user reports a Pony Browser MCP bug or missing feature, call
browser_about with the matching intent and return the generated GitHub issue
link for review.`;

const mcpServer = new Server(
  { name: 'pony-browser', version: PKG_VERSION },
  { capabilities: { tools: {} } },
  { instructions: INSTRUCTIONS },
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  lastActivity = Date.now();

  try {
    const methodMap = {
      browser_navigate: 'navigate',
      browser_use_workspace: 'use_workspace',
      browser_set_options: 'set_options',
      browser_get_page_content: 'get_page_content',
      browser_screenshot: 'screenshot',
      browser_execute_script: 'execute_script',
      browser_click: 'click',
      browser_fill: 'fill',
      browser_wait: 'wait',
      browser_press_key: 'press_key',
      browser_scroll: 'scroll',
      browser_hover: 'hover',
      browser_fetch: 'fetch',
      browser_select_option: 'select_option',
      browser_handle_dialog: 'handle_dialog',
      browser_wait_for_network: 'wait_for_network',
      browser_list_tabs: 'list_tabs',
      browser_get_cookies: 'get_cookies',
      browser_get_local_storage: 'get_local_storage',
      browser_ask_user: 'ask_user',
      browser_select_frame: 'select_frame',
      browser_list_frames: 'list_frames',
      browser_get_new_tab: 'get_new_tab',
      browser_switch_tab: 'switch_tab',
      browser_close_tab: 'close_tab',
      browser_upload_file: 'upload_file',
      browser_set_cookies: 'set_cookies',
      browser_set_local_storage: 'set_local_storage',
      browser_console_logs: 'console_logs',
      browser_solve_captcha: 'solve_captcha',
      browser_set_date: 'set_date',
      browser_dismiss_overlays: 'dismiss_overlays',
      browser_set_combobox: 'set_combobox',
      browser_drop_file: 'drop_file',
      browser_copy_to_clipboard: 'copy_to_clipboard',
      browser_paste_from_clipboard: 'paste_from_clipboard',
      browser_clipboard_stats: 'clipboard_stats',
      browser_double_click: 'double_click',
      browser_right_click: 'right_click',
      browser_click_xy: 'click_xy',
      browser_reattach_debugger: 'reattach_debugger',
    };

    if (name === 'browser_about') {
      return handleAbout(args);
    }

    if (name === 'browser_extract_token') {
      return await handleExtractToken(args);
    }

    const method = methodMap[name];
    if (!method) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }

    const timeout = method === 'ask_user' ? (args?.timeout || 120000) + 5000 :
                    method === 'solve_captcha' ? 60000 : 30000;
    const result = await sendToExtension(method, args || {}, timeout);

    if (name === 'browser_screenshot' && result?.image) {
      const isJpeg = result.image.startsWith('data:image/jpeg');
      const prefix = isJpeg ? /^data:image\/jpeg;base64,/ : /^data:image\/png;base64,/;
      const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
      const base64 = result.image.replace(prefix, '');

      if (args && args.path) {
        const targetPath = resolve(process.cwd(), args.path);
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, Buffer.from(base64, 'base64'));
        return {
          content: [
            { type: 'text', text: `Screenshot successfully saved to: ${targetPath}` },
            { type: 'image', data: base64, mimeType }
          ]
        };
      }

      return { content: [{ type: 'image', data: base64, mimeType }] };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const REPO_URL = 'https://github.com/pssrh/pony-browser-mcp';
const ISSUE_TEMPLATES = { wish: 'wish.yml', use_case: 'use-case.yml', bug: 'bug.yml' };

function handleAbout(args) {
  const intent = args?.intent || 'info';
  const title = args?.title || '';
  const body = args?.body || '';

  const submit_url = intent === 'info' || !ISSUE_TEMPLATES[intent]
    ? `${REPO_URL}/issues/new/choose`
    : `${REPO_URL}/issues/new?template=${ISSUE_TEMPLATES[intent]}` +
      (title ? `&title=${encodeURIComponent(title)}` : '') +
      (body ? `&body=${encodeURIComponent(body)}` : '');

  const instruction =
    intent === 'wish'
      ? `Share this exact submission link with the user as a clickable link, with a short note like "Click to submit your wish — it'll open a pre-filled GitHub issue you can review before submitting": ${submit_url}`
      : intent === 'use_case'
      ? `Share this exact submission link with the user as a clickable link, with a short note like "Click to share your use-case — pre-filled, you can edit before submitting": ${submit_url}`
      : intent === 'bug'
      ? `Share this exact bug-report link with the user as a clickable link, with a short note like "Click to report — pre-filled, please add reproduction steps before submitting": ${submit_url}`
      : `Pony Browser MCP is open source. Submit feedback at ${REPO_URL}/issues/new/choose`;

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        name: 'Pony Browser MCP',
        version: PKG_VERSION,
        repo: REPO_URL,
        wishlist: `${REPO_URL}/blob/main/WISHLIST.md`,
        use_cases: `${REPO_URL}/blob/main/USE_CASES.md`,
        submit_url,
        instruction,
      }, null, 2),
    }],
  };
}

async function handleExtractToken(args) {
  const { provider } = args;
  const info = PROVIDER_PAGES[provider];

  if (!info) {
    return {
      content: [{
        type: 'text',
        text: `Unknown provider: ${provider}. Known: ${Object.keys(PROVIDER_PAGES).join(', ')}\n\nYou can still use browser_navigate + browser_get_page_content to extract tokens from any provider manually.`,
      }],
    };
  }

  const nav = await sendToExtension('navigate', { url: info.url });
  return {
    content: [
      { type: 'text', text: `Navigated to ${info.url} (${nav.title})\n\nInstructions: ${info.instructions}\n\nUse browser_get_page_content or browser_screenshot to find the token, then use browser_execute_script to extract it.` },
    ],
  };
}

// ── Graceful shutdown ──────────────────────────────────────────────────────
// All shutdown paths funnel through gracefulShutdown so the cleanup chain runs
// deterministically — even on abrupt parent-exit. Without this, process.exit(0)
// was racing against WS close-handshake, leaving zombie tabs in Chrome.

let shuttingDown = false;
function gracefulShutdown(reason, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stderr.write(`[MCP] ${reason} — shutting down\n`);

  // Stop timers so they can't re-enter gracefulShutdown
  if (parentCheck) clearInterval(parentCheck);
  if (heartbeat) clearInterval(heartbeat);

  // Close WS with explicit close-frame so extension's onclose handler fires
  if (extensionSocket && extensionSocket.readyState === 1) {
    try { extensionSocket.close(1000, 'mcp-shutdown'); } catch {}
  }
  if (wss) try { wss.close(); } catch {}

  // 300ms grace for FIN-flush + extension session_disconnect cleanup
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('exit', () => {
  // Safety net for direct process.exit calls that bypass gracefulShutdown
  if (wss) try { wss.close(); } catch {}
  if (extensionSocket) try { extensionSocket.close(); } catch {}
});

// Detect Claude Code exit — check if parent process is still alive
// stdin.on('end') doesn't work because MCP SDK's StdioServerTransport owns stdin
const parentPid = process.ppid;
parentCheck = setInterval(() => {
  try {
    process.kill(parentPid, 0); // signal 0 = check if process exists
  } catch {
    gracefulShutdown(`Parent process ${parentPid} died`);
  }
}, 5000); // check every 5 seconds

// Also listen for stdin close as backup
process.stdin.on('end', () => gracefulShutdown('stdin closed'));

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
process.stderr.write(`[MCP] Pony Browser MCP server running (stdio)\n`);
