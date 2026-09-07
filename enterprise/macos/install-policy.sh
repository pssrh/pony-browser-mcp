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

TARGET='/Library/Managed Preferences/com.google.Chrome.plist'
tmp="$(mktemp /tmp/pony-browser-mcp-policy.XXXXXX.plist)"
trap 'rm -f "$tmp"' EXIT

if [[ -f "$TARGET" ]]; then
  sudo cp "$TARGET" "$tmp"
else
  printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict/></plist>' > "$tmp"
fi

sudo plutil -insert ExtensionSettings -dict "$tmp" 2>/dev/null || true
sudo plutil -remove "ExtensionSettings.$EXTENSION_ID" "$tmp" 2>/dev/null || true
sudo plutil -insert "ExtensionSettings.$EXTENSION_ID" -dict "$tmp"
sudo plutil -insert "ExtensionSettings.$EXTENSION_ID.installation_mode" -string force_installed "$tmp"
sudo plutil -insert "ExtensionSettings.$EXTENSION_ID.update_url" -string "$UPDATE_URL" "$tmp"
sudo plutil -insert "ExtensionSettings.$EXTENSION_ID.override_update_url" -bool true "$tmp"
sudo install -d -m 755 '/Library/Managed Preferences'
sudo install -m 644 "$tmp" "$TARGET"
printf 'Installed Pony Browser MCP Chrome policy at %s\n' "$TARGET"
printf 'Restart Chrome to apply the policy.\n'
