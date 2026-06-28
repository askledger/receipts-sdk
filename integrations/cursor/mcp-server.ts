// Cursor MCP server that emits a Project Ledger receipt for every model
// invocation Cursor makes. Drop into `~/.cursor/mcp.json` as a stdio
// server.
//
// Add to ~/.cursor/mcp.json:
// {
//   "mcpServers": {
//     "project-ledger-receipts": {
//       "command": "npx",
//       "args": ["-y", "@projectledger/cursor-receipts"],
//       "env": {
//         "PL_TENANT": "acme",
//         "PL_INGEST_URL": "https://ingest.acme.example/v1/receipts",
//         "PL_INGEST_TOKEN": "<token>"
//       }
//     }
//   }
// }
//
// The server exposes one tool: pl_record_completion.

import { createInterface } from "node:readline";
import { stdin, stdout, env } from "node:process";
import { createHash } from "node:crypto";

interface CompletionEvent {
  prompt: string;
  completion: string;
  model: string;
  file_path?: string;
  input_tokens?: number;
  output_tokens?: number;
}

const TENANT = env.PL_TENANT ?? "anonymous";
const INGEST = env.PL_INGEST_URL ?? "";
const TOKEN  = env.PL_INGEST_TOKEN ?? "";

function rpc(method: string, params: unknown, id: number | string) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params });
}

function reply(id: number | string, result: unknown) {
  stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function err(id: number | string, code: number, message: string) {
  stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf-8").digest("hex");

async function emitReceipt(e: CompletionEvent) {
  if (!INGEST) return; // dev mode — no ingest configured
  const event = {
    schema_version: "1.0",
    tenant_id: TENANT,
    event_type: "ide.completion",
    source_system: "cursor",
    event_id: `cursor-${Date.now()}-${sha256(e.prompt).slice(0, 12)}`,
    captured_at: new Date().toISOString(),
    context: { user_id: env.USER || env.USERNAME || "unknown", environment: "ide" },
    subject: { ai_vendor: e.model.includes("claude") ? "anthropic" : "unknown", ai_model: e.model },
    payload: {
      input_hash: sha256(e.prompt),
      output_hash: sha256(e.completion),
      input_token_count: e.input_tokens ?? 0,
      output_token_count: e.output_tokens ?? 0,
      file_path_hash: e.file_path ? sha256(e.file_path) : null,
    },
  };
  await fetch(INGEST, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, "x-pl-source": "cursor" },
    body: JSON.stringify(event),
  }).catch(() => undefined); // non-blocking
}

const rl = createInterface({ input: stdin });
rl.on("line", async (line) => {
  let msg: { id?: number | string; method?: string; params?: { name?: string; arguments?: CompletionEvent } };
  try { msg = JSON.parse(line); } catch { return; }
  const id = msg.id ?? 0;

  if (msg.method === "initialize") {
    return reply(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "project-ledger-receipts", version: "0.1.0" },
    });
  }

  if (msg.method === "tools/list") {
    return reply(id, {
      tools: [{
        name: "pl_record_completion",
        description: "Emit a Project Ledger receipt for a Cursor completion",
        inputSchema: {
          type: "object",
          required: ["prompt", "completion", "model"],
          properties: {
            prompt: { type: "string" },
            completion: { type: "string" },
            model: { type: "string" },
            file_path: { type: "string" },
            input_tokens: { type: "number" },
            output_tokens: { type: "number" },
          },
        },
      }],
    });
  }

  if (msg.method === "tools/call" && msg.params?.name === "pl_record_completion") {
    try {
      await emitReceipt(msg.params.arguments as CompletionEvent);
      return reply(id, { content: [{ type: "text", text: "receipt-emitted" }] });
    } catch (e) {
      return err(id, -32000, String((e as Error).message));
    }
  }

  err(id, -32601, "method not found");
});

// Suppress the dummy import so the file is treated as a module.
export const _stub = (s: string) => rpc("noop", null, s);
