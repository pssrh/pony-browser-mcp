#!/usr/bin/env bash
set -euo pipefail

EXTENSION_ID=""
UPDATE_URL=""
while (($#)); do
  case "$1" in
    --extension-id) EXTENSION_ID="${2:-}"; shift 2 ;;
    --update-url) UPDATE_URL="${2:-}"; shift 2 ;;
    *) printf 'Usage: %s --extension-id ID --update-url HTTPS_URL\n' "$0" >&2; exit 2 ;;
  esac
done

if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  printf 'Invalid Chrome extension ID.\n' >&2
  exit 2
fi
if [[ ! "$UPDATE_URL" =~ ^https:// ]]; then
  printf 'Update URL must use HTTPS.\n' >&2
  exit 2
fi

policy_path='/etc/opt/chrome/policies/managed/pony-browser-mcp.json'
if [[ ! -d /etc/opt/chrome ]]; then
  policy_path='/etc/chromium/policies/managed/pony-browser-mcp.json'
fi
sudo install -d -m 755 "$(dirname "$policy_path")"
sudo tee "$policy_path" >/dev/null <<JSON
{
  "ExtensionSettings": {
    "$EXTENSION_ID": {
      "installation_mode": "force_installed",
      "update_url": "$UPDATE_URL",
      "override_update_url": true
    }
  }
}
JSON
printf 'Installed Pony Browser MCP Chrome policy at %s\n' "$policy_path"
printf 'Restart Chrome to apply the policy.\n'
