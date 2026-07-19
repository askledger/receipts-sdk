/**
 * Evidence export sinks.
 *
 * A sink delivers a batch of `ExportEvent`s to a system the customer already
 * runs. Every sink is configured explicitly by the operator: the SDK never
 * transmits anything on its own, and there is no default endpoint. This is the
 * opposite of telemetry, it is the customer pushing their own evidence into
 * their own systems.
 *
 * Transports are injectable (`fetchImpl`, `transport`) so sinks are unit
 * testable without a network, matching the pattern used for TSA clients.
 */

import { appendFile } from "node:fs/promises";
import { formatCEF, formatSyslog5424, type ExportEvent } from "./event.js";

export interface SinkResult {
  sink: string;
  ok: boolean;
  delivered: number;
  error?: string;
}

export interface ExportSink {
  readonly name: string;
  send(events: ExportEvent[]): Promise<SinkResult>;
}

/** Minimal fetch shape, so the SDK stays free of DOM lib assumptions. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

function defaultFetch(): FetchLike {
  const f = (globalThis as { fetch?: unknown }).fetch;
  if (typeof f !== "function") {
    throw new Error("global fetch is unavailable; pass fetchImpl explicitly (Node >= 18 required)");
  }
  return f as unknown as FetchLike;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* --------------------------------------------------------------------------
 * Splunk HTTP Event Collector
 * ----------------------------------------------------------------------- */

export interface SplunkHecConfig {
  /** Collector base URL, e.g. https://splunk.example.com:8088 (or the full /services/collector/event URL). */
  url: string;
  /** HEC token. */
  token: string;
  index?: string;
  sourcetype?: string;
  source?: string;
  host?: string;
  fetchImpl?: FetchLike;
}

/**
 * Splunk HEC sink. Sends newline-delimited JSON event envelopes, which is what
 * the collector expects for batched delivery.
 */
export class SplunkHecSink implements ExportSink {
  readonly name = "splunk-hec";
  constructor(private readonly cfg: SplunkHecConfig) {}

  private endpoint(): string {
    const u = this.cfg.url.replace(/\/+$/, "");
    return u.includes("/services/collector") ? u : `${u}/services/collector/event`;
  }

  async send(events: ExportEvent[]): Promise<SinkResult> {
    if (events.length === 0) return { sink: this.name, ok: true, delivered: 0 };
    const body = events
      .map((ev) => {
        const envelope: Record<string, unknown> = {
          time: (Date.parse(ev.captured_at) || Date.now()) / 1000, // Splunk expects epoch seconds
          sourcetype: this.cfg.sourcetype ?? "askledger:receipt",
          event: ev,
        };
        if (this.cfg.index) envelope.index = this.cfg.index;
        if (this.cfg.source) envelope.source = this.cfg.source;
        if (this.cfg.host) envelope.host = this.cfg.host;
        return JSON.stringify(envelope);
      })
      .join("\n");

    try {
      const doFetch = this.cfg.fetchImpl ?? defaultFetch();
      const res = await doFetch(this.endpoint(), {
        method: "POST",
        headers: {
          Authorization: `Splunk ${this.cfg.token}`,
          "Content-Type": "application/json",
        },
        body,
      });
      if (!res.ok) {
        return { sink: this.name, ok: false, delivered: 0, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      return { sink: this.name, ok: true, delivered: events.length };
    } catch (e) {
      return { sink: this.name, ok: false, delivered: 0, error: errText(e) };
    }
  }
}

/* --------------------------------------------------------------------------
 * Generic webhook (Sentinel, Elastic, Chronicle, custom pipelines)
 * ----------------------------------------------------------------------- */

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  method?: string;
  /** "array" posts a JSON array; "ndjson" posts newline-delimited JSON. */
  encoding?: "array" | "ndjson";
  fetchImpl?: FetchLike;
}

/** Generic HTTP sink. Covers Microsoft Sentinel, Elastic, Chronicle and in-house pipelines. */
export class WebhookSink implements ExportSink {
  readonly name = "webhook";
  constructor(private readonly cfg: WebhookConfig) {}

  async send(events: ExportEvent[]): Promise<SinkResult> {
    if (events.length === 0) return { sink: this.name, ok: true, delivered: 0 };
    const body =
      this.cfg.encoding === "ndjson"
        ? events.map((e) => JSON.stringify(e)).join("\n")
        : JSON.stringify(events);
    try {
      const doFetch = this.cfg.fetchImpl ?? defaultFetch();
      const res = await doFetch(this.cfg.url, {
        method: this.cfg.method ?? "POST",
        headers: { "Content-Type": "application/json", ...(this.cfg.headers ?? {}) },
        body,
      });
      if (!res.ok) {
        return { sink: this.name, ok: false, delivered: 0, error: `HTTP ${res.status}: ${await res.text()}` };
      }
      return { sink: this.name, ok: true, delivered: events.length };
    } catch (e) {
      return { sink: this.name, ok: false, delivered: 0, error: errText(e) };
    }
  }
}

/* --------------------------------------------------------------------------
 * File / object-storage drop (JSONL)
 * ----------------------------------------------------------------------- */

export interface FileSinkConfig {
  /** Destination path. Every SIEM can ingest a JSONL file or an object-storage drop. */
  path: string;
  /** Optional writer override, for tests. */
  write?: (path: string, data: string) => Promise<void>;
}

/** Appends newline-delimited JSON. The universal fallback ingestion path. */
export class FileSink implements ExportSink {
  readonly name = "file";
  constructor(private readonly cfg: FileSinkConfig) {}

  async send(events: ExportEvent[]): Promise<SinkResult> {
    if (events.length === 0) return { sink: this.name, ok: true, delivered: 0 };
    const data = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    try {
      const write = this.cfg.write ?? ((p: string, d: string) => appendFile(p, d, "utf8"));
      await write(this.cfg.path, data);
      return { sink: this.name, ok: true, delivered: events.length };
    } catch (e) {
      return { sink: this.name, ok: false, delivered: 0, error: errText(e) };
    }
  }
}

/* --------------------------------------------------------------------------
 * Syslog (QRadar, ArcSight, rsyslog)
 * ----------------------------------------------------------------------- */

export interface SyslogConfig {
  host: string;
  port?: number;
  /** udp (default) or tcp. */
  protocol?: "udp" | "tcp";
  /** cef (default, best for QRadar/ArcSight) or rfc5424. */
  format?: "cef" | "rfc5424";
  hostname?: string;
  appName?: string;
  /** Transport override, for tests. Receives the formatted lines. */
  transport?: (lines: string[], cfg: SyslogConfig) => Promise<void>;
}

async function udpSend(lines: string[], cfg: SyslogConfig): Promise<void> {
  const { createSocket } = await import("node:dgram");
  const sock = createSocket("udp4");
  try {
    for (const line of lines) {
      await new Promise<void>((resolve, reject) => {
        sock.send(Buffer.from(line, "utf8"), cfg.port ?? 514, cfg.host, (err) =>
          err ? reject(err) : resolve()
        );
      });
    }
  } finally {
    sock.close();
  }
}

async function tcpSend(lines: string[], cfg: SyslogConfig): Promise<void> {
  const { connect } = await import("node:net");
  await new Promise<void>((resolve, reject) => {
    const sock = connect({ host: cfg.host, port: cfg.port ?? 514 }, () => {
      sock.write(lines.map((l) => l + "\n").join(""), (err) => {
        if (err) return reject(err);
        sock.end();
        resolve();
      });
    });
    sock.on("error", reject);
  });
}

/** Syslog sink. CEF by default, which QRadar and ArcSight ingest natively. */
export class SyslogSink implements ExportSink {
  readonly name = "syslog";
  constructor(private readonly cfg: SyslogConfig) {}

  /** Format a batch without sending, useful for tests and dry runs. */
  format(events: ExportEvent[]): string[] {
    return events.map((ev) =>
      this.cfg.format === "rfc5424"
        ? formatSyslog5424(ev, { hostname: this.cfg.hostname, appName: this.cfg.appName })
        : formatCEF(ev)
    );
  }

  async send(events: ExportEvent[]): Promise<SinkResult> {
    if (events.length === 0) return { sink: this.name, ok: true, delivered: 0 };
    const lines = this.format(events);
    try {
      const transport =
        this.cfg.transport ?? (this.cfg.protocol === "tcp" ? tcpSend : udpSend);
      await transport(lines, this.cfg);
      return { sink: this.name, ok: true, delivered: events.length };
    } catch (e) {
      return { sink: this.name, ok: false, delivered: 0, error: errText(e) };
    }
  }
}
