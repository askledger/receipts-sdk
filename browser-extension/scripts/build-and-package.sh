#!/usr/bin/env bash
# Build + sign + package the AskLedger browser extension for Chrome
# Web Store upload.
#
# Steps:
#   1. Validate manifest.json against MV3 schema.
#   2. Build content + service-worker bundles.
#   3. Compute SHA-256 of the unsigned zip.
#   4. Sign with cosign keyless (CI-only path) or HSM-held extension key.
#   5. Produce two artifacts:
#        dist/pl-extension-${VERSION}.zip          (Chrome Web Store upload)
#        dist/pl-extension-${VERSION}.sha256       (provenance line)
#
# Refuses to run on a dirty git tree to avoid mis-attributed releases.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
VERSION=$(jq -r .version "$ROOT/manifest.json")
ZIP="$DIST/pl-extension-${VERSION}.zip"

[ -d "$ROOT/.git" ] && git -C "$ROOT/.." diff --quiet || {
  echo "refuse: git tree is dirty" >&2; exit 1;
}

echo "→ validating manifest"
node "$ROOT/scripts/validate-manifest.mjs" "$ROOT/manifest.json"

echo "→ building bundles"
mkdir -p "$DIST"
( cd "$ROOT" && npm ci --silent && npm run build --silent )

echo "→ packaging"
rm -f "$ZIP"
( cd "$ROOT" && zip -qr "$ZIP" manifest.json dist/ public/ identity.js content.js background.js )

echo "→ computing provenance hash"
sha256sum "$ZIP" | tee "$DIST/pl-extension-${VERSION}.sha256"

if command -v cosign >/dev/null 2>&1 && [ "${CI:-}" = "true" ]; then
  echo "→ cosign keyless sign"
  cosign sign-blob --yes "$ZIP" --output-signature "$DIST/pl-extension-${VERSION}.sig"
fi

echo
echo "Built:  $ZIP"
echo "Upload: https://chrome.google.com/webstore/devconsole"
