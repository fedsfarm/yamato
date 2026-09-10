#!/usr/bin/env bash
# Register Chrome's update feed on Linux.
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "This installer supports Linux only." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
TARGET_DIR="${CHROME_EXTERNAL_EXTENSIONS_DIR:-/opt/google/chrome/extensions}"
EXTENSION_ID="${YAMATO_EXTENSION_ID:-lcjglagcjlajleojohmbcfmjdhbgkadc}"
UPDATE_URL="$(deno eval --quiet 'console.log(JSON.parse(await Deno.readTextFile("manifest.chrome.json")).update_url ?? "")')"
if [[ -z "$UPDATE_URL" ]]; then
  echo "manifest.chrome.json has no update_url." >&2
  exit 1
fi

install -d -m 755 "$TARGET_DIR"
printf '{\n  "external_update_url": "%s"\n}\n' "$UPDATE_URL" \
  | install -m 644 /dev/stdin "$TARGET_DIR/$EXTENSION_ID.json"
printf 'Installed %s. Fully quit and relaunch Chrome, then check chrome://extensions.\n' "$TARGET_DIR/$EXTENSION_ID.json"
