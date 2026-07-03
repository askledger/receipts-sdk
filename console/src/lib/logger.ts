// Structured logger with PII redaction and trace correlation.
// All log output is single-line JSON so the log collector can index it.

type Level = "debug" | "info" | "warn" | "error";

interface Fields {
  [k: string]: unknown;
}

const REDACT_KEYS = new Set([
  "password", "passcode", "pin", "token", "access_token", "refresh_token",
  "id_token", "authorization", "api_key", "secret", "private_key",
  "cookie", "session", "credit_card", "card_number", "ssn", "tax_id",
]);

const EMAIL_RE = /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const PAN_RE = /\b(?:\d[ -]?){13,19}\b/g;

function redactValue(v: unknown): unknown {
  if (typeof v === "string") return v.replace(PAN_RE, "[redacted-pan]").replace(EMAIL_RE, "$1@…");
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === "object") return redactFields(v as Fields);
  return v;
}

function redactFields(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else {
      out[k] = redactValue(v);
    }
  }
  return out;
}

interface LogContext {
  trace_id?: string;
  tenant_id?: string;
  sub?: string;
  service?: string;
}

export class Logger {
  constructor(private readonly ctx: LogContext = {}) {}

  with(extra: LogContext): Logger {
    return new Logger({ ...this.ctx, ...extra });
  }

  private emit(level: Level, msg: string, fields: Fields): void {
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...this.ctx,
      ...redactFields(fields),
    };
    const line = JSON.stringify(entry);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  debug(msg: string, fields: Fields = {}): void { this.emit("debug", msg, fields); }
  info(msg: string, fields: Fields = {}): void { this.emit("info", msg, fields); }
  warn(msg: string, fields: Fields = {}): void { this.emit("warn", msg, fields); }
  error(msg: string, fields: Fields = {}): void { this.emit("error", msg, fields); }

  /** Security events use a distinct namespace so the log shipper can route them. */
  security(type: string, fields: Fields = {}): void {
    this.emit("error", "[SECURITY]", { security_event: type, ...fields });
  }
}

export const log = new Logger({ service: "pl-console" });
