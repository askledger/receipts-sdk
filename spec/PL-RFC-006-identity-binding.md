# PL-RFC-006 · Identity Binding

**Status:** Draft v0.1
**Date:** 2026-06-13

## 1 · Purpose

Define how an actor's corporate identity (from an OIDC provider) is
bound into a Receipt's `event.context.user_id` so a regulator can
attribute every AI call to a named human or workload.

## 2 · Producer modes

An implementation operates in one of two modes:

- **personal** — `user_id` is an opaque, locally-generated stable
  handle (e.g. UUIDv7). No corporate identity is attached.
- **corporate-managed** — `user_id` is set from an OIDC ID-token claim
  validated against an issuer configured via managed policy.

## 3 · Claim mapping

For `corporate-managed`:

| Receipt field | OIDC source claim | Notes |
|---|---|---|
| `event.context.user_id` | `sub` | Stable across renames |
| `event.context.email` | `email` (verified) | Optional |
| `event.context.session_id` | from auth response | Per-session UUIDv7 |
| `event.context.identity_provider` | `iss` | Used for re-verification |
| `event.context.roles` | `roles` or `groups` | Optional, mapped to RBAC |

The ID token's `iss` and `aud` claims **MUST** be validated. Signature
verification against the IdP's JWKS **MUST** succeed before the token's
claims are trusted.

## 4 · Managed policy

In corporate-managed mode the configuration is delivered through the
host platform's managed-policy channel (Chrome managed policy via
Google Admin / Microsoft Intune / Jamf for browser extensions; mobile
MDM profile; Kubernetes ConfigMap for server-side).

Required policy keys:

```
{
  "corporate_mode": true,
  "ingest_endpoint": "https://ingest.acme.example/v1",
  "oidc_issuer": "https://acme.okta.com",
  "oidc_client_id": "pl-ext-prod",
  "tenant_id": "acme"
}
```

## 5 · Personal-mode privacy

Personal-mode implementations **MUST NOT** emit any field that could be
used for cross-site identity correlation (no email, no IP, no UA
fingerprint). The `user_id` is a locally-stored UUID and rotates on
extension uninstall.

## 6 · Mode switching

Switching from personal to corporate-managed **MUST** invalidate the
prior `user_id` and emit a `pl.identity.transition` receipt that the
admin's audit log records. Switching back **SHOULD** clear local
corporate state.

## 7 · References

- RFC 6749 — OAuth 2.0.
- RFC 7519 — JSON Web Token.
- OIDC Core 1.0.
- PL-RFC-001 — Receipt Schema.
