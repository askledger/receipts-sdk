# Chrome Web Store · Publishing kit

End-to-end checklist to get the Project Ledger browser extension from
unsigned source to officially-published, enterprise-deployable extension.

## 1 · Developer account

- [ ] Register `developer@github.com/askledger/receipts-sdk` as a Chrome Web Store developer ($5 one-time).
- [ ] Enable 2FA. Hardware key required for the publisher account.
- [ ] Add at least one backup publisher (so we don't lose the listing if the primary leaves).

## 2 · Signing keys

- [ ] Generate the extension signing key in our HSM (not on a laptop).
- [ ] Store the key ID in `extension_signing_kid` (KMS reference, not the key material).
- [ ] Set up the per-release signing pipeline so only CI on a tagged commit can produce a signed artifact.

## 3 · Listing assets

- [ ] App name: **Project Ledger — AI Receipts**
- [ ] Short description (132 chars): *Cryptographic receipts for every AI interaction. Built for IT, Compliance, HR, Legal, Finance.*
- [ ] Detailed description (Markdown rendered): paste from `browser-extension/store-listing.md` (to be generated).
- [ ] Icon: 128×128 PNG. Match the brand mark used on the site.
- [ ] Screenshots: minimum 1, maximum 5, 1280×800 PNG. Capture:
  1. The popup showing an active receipt being signed.
  2. The popup showing identity binding to a corporate SSO.
  3. The console dashboard the receipts feed.
  4. The receipt-detail page on the public verifier.
- [ ] Promotional tile: 440×280 PNG.
- [ ] Marquee tile (if featured): 1400×560 PNG.

## 4 · Required policies

- [ ] **Privacy policy** at `https://github.com/askledger/receipts-sdk/privacy`. Must enumerate every category of data the extension can access, every purpose, and every recipient (us; no third parties).
- [ ] **Permissions justification** for each entry in `manifest.json`. Write the customer-visible text NOW so review is fast.
- [ ] **Single purpose statement**: "Sign receipts of AI interactions for compliance and audit purposes."
- [ ] **Remote code disclosure**: NONE. Confirm CSP `script-src 'self'` and no eval/Function constructor anywhere.

## 5 · Enterprise-deployment manifest

- [ ] Publish `chrome-extension://<id>/managed-policy-schema.json` documenting every key an admin can set via Google Admin / Microsoft Intune / Jamf:

```json
{
  "type": "object",
  "properties": {
    "corporate_mode":   { "type": "boolean", "default": false },
    "ingest_endpoint":  { "type": "string", "format": "uri" },
    "oidc_issuer":      { "type": "string", "format": "uri" },
    "oidc_client_id":   { "type": "string" },
    "tenant_id":        { "type": "string" }
  },
  "required": ["corporate_mode","ingest_endpoint","tenant_id"]
}
```

- [ ] Write the Google Admin Console deployment guide.
- [ ] Write the Microsoft Intune deployment guide.
- [ ] Write the Jamf deployment guide.

## 6 · Submission package

- [ ] Build with `npm run build:extension` from a clean checkout on a tagged commit.
- [ ] Verify SHA-256 of the produced ZIP matches the SLSA L3 provenance attestation.
- [ ] Upload to Chrome Web Store dashboard.
- [ ] Select **published as Public** (so customers can install) but with **enterprise-managed-only** deployment policy.
- [ ] Submit for review.

## 7 · Review timelines (realistic)

- First submission: 2-3 weeks for review (Chrome team scrutinizes new MV3 extensions closely).
- Subsequent updates: 1-3 business days.

## 8 · Post-publish

- [ ] Document the extension ID in `docs/operations/RUNBOOK.md` so on-call knows the identifier.
- [ ] Add the extension ID to the managed-policy template we ship to customers.
- [ ] Set up a Chrome Web Store status alert (we get paged if the extension is delisted).

## 9 · Compliance with Manifest V3 best practices

- [ ] No remote code execution.
- [ ] No `host_permissions: ["<all_urls>"]` unless absolutely required; document why.
- [ ] No `unsafe-eval`, no `unsafe-inline` in CSP.
- [ ] Background service worker is event-driven, not always-on.
- [ ] All network calls go to `ingest_endpoint` from the managed policy; no hard-coded origins.

## 10 · Removal-ready

We document the disable path so customers can pull the extension cleanly:
1. Remove from managed policy → extension auto-uninstalls on next sync.
2. Local data is `chrome.storage.session` — cleared on browser restart.
3. No persistent local artifacts.
