import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  signReceipt,
  toExportEvent,
  formatCEF,
  formatSyslog5424,
  exportReceipts,
  SplunkHecSink,
  WebhookSink,
  FileSink,
  SyslogSink,
  type ExportEvent,
  type ExportSink,
  type FetchLike,
  type SinkResult,
} from "../src/index.js";
import type { RawEvent, SignedReceipt } from "../src/types.js";

const kp = generateKeyPair();

const evt = (over: Partial<RawEvent> = {}): RawEvent => ({
  schema_version: "1.0",
  tenant_id: "acme",
  event_type: "loan.decision",
  source_system: "credit-agent",
  event_id: "evt-1",
  captured_at: "2026-06-01T00:00:00.000Z",
  subject: { ai_vendor: "anthropic", ai_model: "claude-sonnet-4-6" },
  payload: { applicant: "A-123", amount: 50000 },
  ...over,
});

const receipt = (over: Partial<RawEvent> = {}): SignedReceipt =>
  signReceipt({ event: evt(over), keypair: kp });

// A fake fetch that records the last request and returns a scripted response.
function fakeFetch(res: { ok: boolean; status: number; body?: string } = { ok: true, status: 200 }) {
  const calls: Array<{ url: string; init: { method: string; headers: Record<string, string>; body: string } }> = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return { ok: res.ok, status: res.status, text: async () => res.body ?? "" };
  };
  return { impl, calls };
}

describe("toExportEvent", () => {
  it("projects the identity and integrity fields a SIEM needs", () => {
    const r = receipt();
    const ev = toExportEvent(r);
    expect(ev.receipt_id).toBe(r.receipt.receipt_id);
    expect(ev.tenant_id).toBe("acme");
    expect(ev.event_type).toBe("loan.decision");
    expect(ev.source_system).toBe("credit-agent");
    expect(ev.receipt_hash).toBe(r.receipt.integrity.receipt_hash);
    expect(ev.chain_height).toBe(r.receipt.integrity.chain_height);
    expect(ev.signed).toBe(true);
    expect(ev.signature_kid).toBe(kp.kid);
    expect(ev.ai_model).toBe("claude-sonnet-4-6");
  });

  it("excludes business payload by default and includes it only on request", () => {
    const r = receipt();
    expect(toExportEvent(r).payload).toBeUndefined();
    expect(toExportEvent(r, { includePayload: true }).payload).toEqual({
      applicant: "A-123",
      amount: 50000,
    });
  });

  it("can embed the full receipt so the SIEM record stays verifiable", () => {
    const r = receipt();
    expect(toExportEvent(r).receipt).toBeUndefined();
    const withReceipt = toExportEvent(r, { includeReceipt: true });
    expect(withReceipt.receipt?.receipt.receipt_id).toBe(r.receipt.receipt_id);
    expect(withReceipt.receipt?.signatures.length).toBeGreaterThan(0);
  });

  it("attaches the assurance grade on request", () => {
    const ev = toExportEvent(receipt(), { includeAssurance: true });
    expect(ev.assurance_level).toMatch(/^L[0-3]$/);
    expect(typeof ev.assurance_name).toBe("string");
  });
});

describe("SIEM wire formats", () => {
  it("formats CEF with header, escaping and receipt identity", () => {
    const ev = toExportEvent(receipt());
    const line = formatCEF(ev);
    expect(line.startsWith("CEF:0|AskLedger|Receipts|")).toBe(true);
    expect(line).toContain("loan.decision");
    expect(line).toContain(`externalId=${ev.receipt_id}`);
    expect(line).toContain("deviceCustomString1=acme");
  });

  it("raises CEF severity for a blocked decision", () => {
    const base = toExportEvent(receipt());
    const allow: ExportEvent = { ...base, decision: "allow" };
    const block: ExportEvent = { ...base, decision: "block" };
    const sev = (l: string): number => Number(l.split("|")[6]);
    expect(sev(formatCEF(block))).toBeGreaterThan(sev(formatCEF(allow)));
  });

  it("formats RFC 5424 syslog with structured data", () => {
    const ev = toExportEvent(receipt());
    const line = formatSyslog5424(ev, { hostname: "host1", appName: "askledger" });
    expect(line).toMatch(/^<\d+>1 /);
    expect(line).toContain("host1");
    expect(line).toContain(`receiptId="${ev.receipt_id}"`);
    expect(line).toContain('tenantId="acme"');
  });
});

describe("sinks", () => {
  it("SplunkHecSink posts ndjson envelopes to the collector with the HEC token", async () => {
    const { impl, calls } = fakeFetch();
    const sink = new SplunkHecSink({ url: "https://splunk.example:8088", token: "tok-1", index: "ai", fetchImpl: impl });
    const res = await sink.send([toExportEvent(receipt()), toExportEvent(receipt())]);

    expect(res.ok).toBe(true);
    expect(res.delivered).toBe(2);
    expect(calls[0].url).toBe("https://splunk.example:8088/services/collector/event");
    expect(calls[0].init.headers.Authorization).toBe("Splunk tok-1");
    const lines = calls[0].init.body.split("\n");
    expect(lines).toHaveLength(2);
    const env = JSON.parse(lines[0]);
    expect(env.sourcetype).toBe("askledger:receipt");
    expect(env.index).toBe("ai");
    expect(typeof env.time).toBe("number"); // epoch seconds
    expect(env.event.tenant_id).toBe("acme");
  });

  it("SplunkHecSink reports an HTTP failure instead of throwing", async () => {
    const { impl } = fakeFetch({ ok: false, status: 403, body: "forbidden" });
    const sink = new SplunkHecSink({ url: "https://splunk.example:8088", token: "bad", fetchImpl: impl });
    const res = await sink.send([toExportEvent(receipt())]);
    expect(res.ok).toBe(false);
    expect(res.delivered).toBe(0);
    expect(res.error).toContain("403");
  });

  it("WebhookSink supports array and ndjson encodings", async () => {
    const a = fakeFetch();
    await new WebhookSink({ url: "https://x.example/in", fetchImpl: a.impl }).send([toExportEvent(receipt())]);
    expect(Array.isArray(JSON.parse(a.calls[0].init.body))).toBe(true);

    const b = fakeFetch();
    await new WebhookSink({ url: "https://x.example/in", encoding: "ndjson", fetchImpl: b.impl }).send([
      toExportEvent(receipt()),
      toExportEvent(receipt()),
    ]);
    expect(b.calls[0].init.body.split("\n")).toHaveLength(2);
  });

  it("FileSink appends newline-delimited JSON", async () => {
    const written: string[] = [];
    const sink = new FileSink({ path: "/tmp/x.jsonl", write: async (_p, d) => { written.push(d); } });
    const res = await sink.send([toExportEvent(receipt()), toExportEvent(receipt())]);
    expect(res.ok).toBe(true);
    const lines = written[0].trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).tenant_id).toBe("acme");
  });

  it("SyslogSink formats CEF by default and delivers via the transport", async () => {
    const sent: string[][] = [];
    const sink = new SyslogSink({ host: "siem.local", transport: async (lines) => { sent.push(lines); } });
    const res = await sink.send([toExportEvent(receipt())]);
    expect(res.ok).toBe(true);
    expect(sent[0][0].startsWith("CEF:0|AskLedger")).toBe(true);
  });

  it("SyslogSink can emit RFC 5424 instead", async () => {
    const sink = new SyslogSink({ host: "siem.local", format: "rfc5424", transport: async () => {} });
    expect(sink.format([toExportEvent(receipt())])[0]).toMatch(/^<\d+>1 /);
  });
});

describe("exportReceipts", () => {
  const okSink = (name: string): ExportSink & { batches: number } => ({
    name,
    batches: 0,
    async send(events): Promise<SinkResult> {
      (this as unknown as { batches: number }).batches++;
      return { sink: name, ok: true, delivered: events.length };
    },
  });

  it("batches, fans out to every sink, and aggregates the report", async () => {
    const a = okSink("a");
    const b = okSink("b");
    const receipts = Array.from({ length: 5 }, () => receipt());

    const report = await exportReceipts(receipts, { sinks: [a, b], batchSize: 2 });

    expect(report.ok).toBe(true);
    expect(report.events).toBe(5);
    expect(report.batches).toBe(3); // 2 + 2 + 1
    expect(report.results).toHaveLength(2);
    for (const r of report.results) expect(r.delivered).toBe(5);
    expect(a.batches).toBe(3);
  });

  it("retries a failing sink and succeeds on the retry", async () => {
    let attempts = 0;
    const flaky: ExportSink = {
      name: "flaky",
      async send(events) {
        attempts++;
        return attempts === 1
          ? { sink: "flaky", ok: false, delivered: 0, error: "boom" }
          : { sink: "flaky", ok: true, delivered: events.length };
      },
    };
    const report = await exportReceipts([receipt()], {
      sinks: [flaky],
      retries: 1,
      sleep: async () => {},
    });
    expect(attempts).toBe(2);
    expect(report.ok).toBe(true);
  });

  it("one failing sink never blocks the others, and never throws", async () => {
    const good = okSink("good");
    const thrower: ExportSink = {
      name: "thrower",
      async send() { throw new Error("network down"); },
    };
    const report = await exportReceipts([receipt(), receipt()], {
      sinks: [good, thrower],
      retries: 0,
      sleep: async () => {},
    });

    expect(report.ok).toBe(false);
    const goodResult = report.results.find((r) => r.sink === "good");
    const badResult = report.results.find((r) => r.sink === "thrower");
    expect(goodResult?.ok).toBe(true);
    expect(goodResult?.delivered).toBe(2);
    expect(badResult?.ok).toBe(false);
    expect(badResult?.error).toContain("network down");
  });
});
