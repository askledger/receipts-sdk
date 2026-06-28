# Vendor bundle

This folder must contain the bundled crypto + canonicalize sources so the extension can run under Manifest V3's strict CSP (no remote scripts).

Run from the repo root:

```bash
cd browser-extension/vendor
# noble-ed25519 v2
curl -sL https://esm.sh/@noble/ed25519@2.1.0/index.js -o noble-ed25519.js
# noble-hashes sha2
curl -sL https://esm.sh/@noble/hashes@1.4.0/sha2 -o noble-hashes-sha256.js
curl -sL https://esm.sh/@noble/hashes@1.4.0/sha2 -o noble-hashes-sha512.js
# canonicalize
curl -sL https://esm.sh/canonicalize@2.0.0 -o canonicalize.js
```

Then verify the SHA-256 of each file matches what's in this folder's `SHA256SUMS` (we publish that with each release).

## Production release process

For published store builds we replace this with bundled modules pinned to the SHA-256 SDK conformance hashes — so the extension cannot diverge from the SDK's wire format.
