# @projectledger/openai-proxy

A drop-in HTTP proxy that signs every OpenAI-compatible call routed
through it. Designed so a single install covers every IDE, agent, and
script that calls `/v1/chat/completions`, `/v1/completions`, or
`/v1/embeddings`.

## Why this exists

Most AI tools — Aider, Cline, Windsurf, Codeium, Tabnine, Sourcegraph
Cody, Zed, Continue — let you point at a custom base URL or honor
`HTTPS_PROXY`. None of them ship native receipt support. Rather than
writing one adapter per tool, this proxy intercepts the traffic itself
and signs every call.

## Install

```
npm install -g @projectledger/openai-proxy
```

## Run

```
pl-proxy --tenant acme \
         --listen 0.0.0.0:4000 \
         --upstream https://api.openai.com \
         --ingest https://ingest.acme.example/v1/receipts \
         --ingest-token "$PL_INGEST_TOKEN"
```

## Point your tool at the proxy

Most tools accept an `OPENAI_BASE_URL` env var:

```
export OPENAI_BASE_URL=http://127.0.0.1:4000/v1
```

That works out of the box for Aider, the OpenAI SDK, Cursor's API
mode, Cline, Continue, and most agent frameworks. Tools that ignore
`OPENAI_BASE_URL` usually accept `HTTPS_PROXY`:

```
export HTTPS_PROXY=http://127.0.0.1:4000
```

## What gets signed

- The HTTP method, the path, and the inbound headers (sans Authorization).
- A SHA-256 hash of the request body (no plaintext leaves the host).
- A SHA-256 hash of the response body.
- Token counts, status code, latency, vendor + model inferred from the model name.

## Streaming

SSE responses are handled correctly: the proxy reassembles the
`data: …` lines, extracts the final aggregated content, and hashes
that text before signing.

## License

Apache-2.0.
