# @askledger/claude-code-skill

Claude Code skill that turns every AI action in a project — tool calls,
file edits, plan steps — into a cryptographically signed Project Ledger
receipt.

## Install

```
npm install -g @askledger/claude-code-skill
```

The package ships:
- `SKILL.md` — registered into Claude Code's skill loader.
- `emit.sh` — POSTs the event to your configured ingest, with local
  queue fallback for offline resilience.

## Configure a project

Create `.pl-receipts.json` in the project root:

```json
{
  "tenant_id":        "acme",
  "ingest_url":       "https://ingest.acme.example/v1/receipts",
  "ingest_token_env": "PL_INGEST_TOKEN",
  "include_diffs":    false
}
```

Set the bearer token in your shell:

```
export PL_INGEST_TOKEN=<your-token>
```

Run Claude Code as normal. Every tool call now produces a receipt.

## What is emitted

| Action | event_type |
|---|---|
| Read / Edit / Write / Bash / Grep / Glob | `ide.tool_call` |
| File created | `ide.file_created` |
| File modified | `ide.file_modified` |
| File deleted | `ide.file_deleted` |
| Plan step | `ide.plan_step` |

Receipts carry **path hashes**, not plaintext. With `include_diffs:true`
they also carry diff hashes — never the diff itself.

## Privacy

- Respects `.gitignore` and `.pl-ignore`.
- Plaintext file contents never leave the machine.
- Tokens are read from env, never from files.

## Verification

```
pl verify --receipt receipt.json
```

Or paste the receipt id at `https://askledger.github.io/receipts-sdk/verify.html`.

## License

Apache-2.0.
