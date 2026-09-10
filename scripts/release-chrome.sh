#!/usr/bin/env bash
# Build signed CRX and update feed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

KEY="${YAMATO_CRX_KEY:-$ROOT/dist-chrome.pem}"
CHROMIUM_BIN="${CHROMIUM_BIN:-}"
RELEASE_DIR="${RELEASE_DIR:-$ROOT/release}"

if [[ ! -r "$KEY" ]]; then
  echo "CRX signing key not found: $KEY" >&2
  echo "Set YAMATO_CRX_KEY to the private key created by Chromium on the first release." >&2
  exit 1
fi

if [[ -z "$CHROMIUM_BIN" ]]; then
  for candidate in chromium chromium-browser google-chrome google-chrome-stable; do
    if command -v "$candidate" >/dev/null 2>&1; then
      CHROMIUM_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "$CHROMIUM_BIN" ]]; then
  echo "No Chromium/Chrome binary found. Set CHROMIUM_BIN=/path/to/chromium." >&2
  exit 1
fi

read_manifest() {
  deno eval --quiet \
    'const m = JSON.parse(await Deno.readTextFile("manifest.chrome.json")); console.log(m[Deno.args[0]] ?? "");' "$1"
}

VERSION="$(read_manifest version)"
UPDATE_URL="$(read_manifest update_url)"
if [[ -z "$VERSION" || -z "$UPDATE_URL" ]]; then
  echo "manifest.chrome.json must have version and update_url." >&2
  exit 1
fi

CRX_URL="${YAMATO_CRX_URL:-https://github.com/fedsfarm/yamato/releases/download/${VERSION}/yamato-chrome.crx}"
EXTENSION_ID="lcjglagcjlajleojohmbcfmjdhbgkadc"
KEY_EXTENSION_ID="$(openssl pkey -in "$KEY" -pubout -outform DER 2>/dev/null | sha256sum | awk '{print substr($1, 1, 32)}' | tr '0123456789abcdef' 'abcdefghijklmnop')"
if [[ "$KEY_EXTENSION_ID" != "$EXTENSION_ID" ]]; then
  echo "Signing key has ID $KEY_EXTENSION_ID; expected stable Yamato ID $EXTENSION_ID." >&2
  exit 1
fi

bash ./build.sh chrome
mkdir -p "$RELEASE_DIR"

PACK_DIR="$(mktemp -d)"
cleanup() { rm -rf "$PACK_DIR"; }
trap cleanup EXIT
cp -a dist-chrome "$PACK_DIR/extension"
"$CHROMIUM_BIN" --headless=new --no-message-box --user-data-dir="$PACK_DIR/profile" \
  --pack-extension="$PACK_DIR/extension" --pack-extension-key="$KEY"

if [[ ! -s "$PACK_DIR/extension.crx" ]]; then
  echo "Chrome did not produce a signed CRX." >&2
  exit 1
fi

mv "$PACK_DIR/extension.crx" "$RELEASE_DIR/yamato-chrome.crx"
cp yamato-chrome.zip "$RELEASE_DIR/yamato-chrome.zip"
cat > "$RELEASE_DIR/updates.xml" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">
  <app appid="${EXTENSION_ID}">
    <updatecheck codebase="${CRX_URL}" version="${VERSION}" />
  </app>
</gupdate>
EOF
cat > "$RELEASE_DIR/${EXTENSION_ID}.json" <<EOF
{
  "external_update_url": "${UPDATE_URL}"
}
EOF

printf 'Built %s (ID %s)\n' "$RELEASE_DIR/yamato-chrome.crx" "$EXTENSION_ID"
printf 'Publish %s at %s and the CRX at %s\n' "$RELEASE_DIR/updates.xml" "$UPDATE_URL" "$CRX_URL"
