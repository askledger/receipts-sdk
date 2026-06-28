# @projectledger/cursor-receipts

MCP server that emits a Project Ledger receipt for every Cursor
completion — drop-in audit evidence for AI-assisted code.

## Install

```
npm install -g @projectledger/cursor-receipts
```

## Configure Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "project-ledger": {
      "command": "pl-cursor",
      "env": {
        "PL_TENANT":       "acme",
        "PL_INGEST_URL":   "https://ingest.acme.example/v1/receipts",
        "PL_INGEST_TOKEN": "<bearer>"
      }
    }
  }
}
```

Restart Cursor. Every completion now produces a cryptographically-signed
receipt visible in your Project Ledger console.

## Privacy

The server emits SHA-256 hashes of prompts and completions, never the
plaintext. File paths are hashed when present. Personal-mode users can
run with `PL_INGEST_URL` unset; receipts are stored locally and not
transmitted.

## License

Apache-2.0.
