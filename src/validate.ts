/**
 * Input validation for the public API.
 *
 * The SDK is security-critical, so we are aggressive about rejecting
 * malformed input early with clear error messages rather than producing
 * a malformed signed receipt that fails verification downstream.
 */

import type { RawEvent, KeyPair } from "./types.js";

export class ReceiptsValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`[receipts-sdk] Invalid ${field}: ${message}`);
    this.name = "ReceiptsValidationError";
  }
}

const SCHEMA_VERSION = "1.0";
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const TENANT_ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const EVENT_ID_RE = /^[A-Za-z0-9._:-]{1,256}$/;
const EVENT_TYPE_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

const ALLOWED_CLASSIFICATIONS = new Set([
  "public",
  "internal",
  "pii",
  "pii_redacted",
  "pci",
  "mnpi",
]);

const ALLOWED_ENVIRONMENTS = new Set([
  "production",
  "staging",
  "development",
]);

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * Validate a RawEvent before signing. Throws ReceiptsValidationError on
 * the first problem found.
 */
export function validateEvent(event: RawEvent): void {
  if (!event || typeof event !== "object") {
    throw new ReceiptsValidationError("event", "must be an object");
  }

  if (event.schema_version !== SCHEMA_VERSION) {
    throw new ReceiptsValidationError(
      "event.schema_version",
      `must be "${SCHEMA_VERSION}" (got "${event.schema_version}")`
    );
  }

  if (!isNonEmptyString(event.tenant_id) || !TENANT_ID_RE.test(event.tenant_id)) {
    throw new ReceiptsValidationError(
      "event.tenant_id",
      "must be 1-128 chars of [A-Za-z0-9._:-]"
    );
  }

  if (!isNonEmptyString(event.event_type) || !EVENT_TYPE_RE.test(event.event_type)) {
    throw new ReceiptsValidationError(
      "event.event_type",
      "must be a dotted identifier like 'ide.completion' or 'gateway.request'"
    );
  }

  if (!isNonEmptyString(event.source_system)) {
    throw new ReceiptsValidationError(
      "event.source_system",
      "must be a non-empty string"
    );
  }

  if (!isNonEmptyString(event.event_id) || !EVENT_ID_RE.test(event.event_id)) {
    throw new ReceiptsValidationError(
      "event.event_id",
      "must be 1-256 chars of [A-Za-z0-9._:-]"
    );
  }

  if (!isString(event.captured_at) || !RFC3339.test(event.captured_at)) {
    throw new ReceiptsValidationError(
      "event.captured_at",
      "must be an RFC 3339 timestamp"
    );
  }

  if (event.context && typeof event.context === "object") {
    const env = (event.context as { environment?: string }).environment;
    if (env !== undefined && !ALLOWED_ENVIRONMENTS.has(env)) {
      throw new ReceiptsValidationError(
        "event.context.environment",
        `must be one of ${[...ALLOWED_ENVIRONMENTS].join(", ")} (got "${env}")`
      );
    }
  }

  if (event.payload && typeof event.payload === "object") {
    const inputCls = (event.payload as { input_classification?: string })
      .input_classification;
    if (inputCls !== undefined && !ALLOWED_CLASSIFICATIONS.has(inputCls)) {
      throw new ReceiptsValidationError(
        "event.payload.input_classification",
        `must be one of ${[...ALLOWED_CLASSIFICATIONS].join(", ")} (got "${inputCls}")`
      );
    }
    const outputCls = (event.payload as { output_classification?: string })
      .output_classification;
    if (outputCls !== undefined && !ALLOWED_CLASSIFICATIONS.has(outputCls)) {
      throw new ReceiptsValidationError(
        "event.payload.output_classification",
        `must be one of ${[...ALLOWED_CLASSIFICATIONS].join(", ")} (got "${outputCls}")`
      );
    }
  }
}

/**
 * Validate a KeyPair before signing.
 */
export function validateKeyPair(keypair: KeyPair): void {
  if (!keypair || typeof keypair !== "object") {
    throw new ReceiptsValidationError("keypair", "must be an object");
  }
  if (!isNonEmptyString(keypair.kid)) {
    throw new ReceiptsValidationError(
      "keypair.kid",
      "must be a non-empty string"
    );
  }
  if (!isNonEmptyString(keypair.public_key) || !isNonEmptyString(keypair.private_key)) {
    throw new ReceiptsValidationError(
      "keypair",
      "public_key and private_key must both be non-empty base64 strings"
    );
  }
  // Try decoding to verify base64 validity
  try {
    const pub = Buffer.from(keypair.public_key, "base64");
    const priv = Buffer.from(keypair.private_key, "base64");
    if (pub.length !== 32) {
      throw new ReceiptsValidationError(
        "keypair.public_key",
        `must decode to 32 bytes (got ${pub.length})`
      );
    }
    if (priv.length !== 32) {
      throw new ReceiptsValidationError(
        "keypair.private_key",
        `must decode to 32 bytes (got ${priv.length})`
      );
    }
  } catch (e) {
    if (e instanceof ReceiptsValidationError) throw e;
    throw new ReceiptsValidationError(
      "keypair",
      "public_key and private_key must be valid base64"
    );
  }
}
