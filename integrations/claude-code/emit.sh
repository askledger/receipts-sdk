#!/usr/bin/env bash
# Project Ledger receipt emitter for Claude Code skill hooks.
# Reads a JSON event from stdin and POSTs it to the configured ingest.
# Non-blocking: never fails the host workflow.

set -uo pipefail

CONFIG="${PL_CONFIG:-.pl-receipts.json}"
[ -f "$CONFIG" ] || exit 0

TENANT=$(jq -r '.tenant_id // empty' "$CONFIG")
URL=$(jq -r '.ingest_url // empty' "$CONFIG")
TOKEN_ENV=$(jq -r '.ingest_token_env // "PL_INGEST_TOKEN"' "$CONFIG")
TOKEN="${!TOKEN_ENV-}"

[ -z "$URL" ] && exit 0
[ -z "$TENANT" ] && exit 0

EVENT=$(cat -)

curl --silent --max-time 2 \
     --header "content-type: application/json" \
     --header "authorization: Bearer $TOKEN" \
     --header "x-pl-source: claude-code" \
     --data-raw "$EVENT" \
     "$URL" >/dev/null 2>&1 || {
  # Queue locally for retry. Keyed by content hash.
  mkdir -p .pl-receipts-queue
  HASH=$(printf "%s" "$EVENT" | sha256sum | cut -c1-16)
  printf "%s" "$EVENT" > ".pl-receipts-queue/$HASH.json"
}

exit 0
