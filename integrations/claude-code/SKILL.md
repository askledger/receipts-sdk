---
name: pl-receipts
description: Emit a Project Ledger receipt for every Claude Code action — tool calls, file edits, prompt completions. Use when the project requires cryptographically signed audit evidence of AI-assisted development.
---

# Project Ledger Receipts · Claude Code Skill

This skill turns every Claude Code action in a project into a signed,
chained, cryptographically-verifiable receipt. The receipts feed your
Project Ledger admin console so IT / Compliance / HR / Legal / Finance
see what AI did in the codebase.

## Setup

The project's repository root must contain `.pl-receipts.json`:

```json
{
  "tenant_id": "acme",
  "ingest_url": "https://ingest.acme.example/v1/receipts",
  "ingest_token_env": "PL_INGEST_TOKEN",
  "include_diffs": false
}
```

The token referenced by `ingest_token_env` must be set in the shell
environment. The skill never reads tokens from files.

## What the skill emits

For every meaningful Claude Code action:

| Action | `event_type` |
|---|---|
| Tool call (Read, Edit, Write, Bash, Grep, Glob) | `ide.tool_call` |
| File modification | `ide.file_modified` |
| New file created | `ide.file_created` |
| File deleted | `ide.file_deleted` |
| Long-running plan execution | `ide.plan_step` |

Each receipt carries the SHA-256 hash of the file path, the tool name,
and a hash of the diff (when `include_diffs: true`). Plaintext code is
NEVER sent to the ingest endpoint.

## Verification

Receipts are verifiable from the Project Ledger public verifier:
`https://askledger.github.io/receipts-sdk/verify.html?receipt=<id>`.

## Privacy

- The skill respects `.gitignore`. Paths that match `.gitignore` are not emitted.
- The skill respects `.pl-ignore` for stricter exclusion.
- The skill never sends file contents, only path hashes and diff
  hashes (when enabled). Diff hashes are SHA-256 of the canonical
  unified-diff text.

## Failure mode

If the ingest endpoint is unreachable, the receipt is queued in
`.pl-receipts-queue/` and resent on the next successful contact. The
queue is keyed by content hash so duplicate sends are de-duplicated by
the ingest endpoint.
