#!/usr/bin/env node
import { startProxy } from "./server.js";

const args = parseArgs(process.argv.slice(2));
if (args.help || !args.tenant) {
  process.stdout.write(`pl-proxy — signs every OpenAI-compatible call routed through it

  pl-proxy start --tenant <id> [--listen 0.0.0.0:4000] [--upstream https://api.openai.com] \\
                 [--ingest <url>] [--ingest-token <bearer>]

Point any IDE at http://127.0.0.1:4000 (or set HTTPS_PROXY).
`);
  process.exit(args.help ? 0 : 2);
}

const [, , host = "0.0.0.0", portStr = "4000"] = (args.listen || "0.0.0.0:4000").match(/^([^:]+):(\d+)$/) ?? [];
startProxy({
  tenantId: args.tenant,
  listen: { host, port: Number(portStr) },
  upstream: args.upstream || "https://api.openai.com",
  ingestUrl: args.ingest,
  ingestToken: args["ingest-token"],
});

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { out.help = "true"; continue; }
    if (a.startsWith("--")) { out[a.slice(2)] = argv[i + 1]?.startsWith("--") ? "true" : (argv[++i] ?? "true"); }
  }
  return out;
}
