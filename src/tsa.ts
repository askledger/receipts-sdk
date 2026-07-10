/**
 * RFC 3161 Time-Stamp Protocol client.
 *
 * This module produces a TimeStampReq (ASN.1 DER), POSTs it to a TSA
 * over HTTP (Content-Type: application/timestamp-query), and returns
 * the TimeStampResp bytes. The bytes are stored verbatim inside a
 * `TimestampToken` entry on the SignedReceipt envelope.
 *
 * Default TSA: FreeTSA (https://freetsa.org). Production deployments
 * SHOULD configure a commercial TSA (DigiCert, GlobalSign, Sectigo).
 *
 * RFC 3161 reference: https://datatracker.ietf.org/doc/html/rfc3161
 *
 * Wire format we build:
 *
 *   TimeStampReq ::= SEQUENCE  {
 *     version              INTEGER  { v1(1) },
 *     messageImprint       MessageImprint,
 *     reqPolicy            TSAPolicyId          OPTIONAL,
 *     nonce                INTEGER              OPTIONAL,
 *     certReq              BOOLEAN              DEFAULT FALSE,
 *     extensions           [0] IMPLICIT Extensions OPTIONAL
 *   }
 *
 *   MessageImprint ::= SEQUENCE  {
 *     hashAlgorithm        AlgorithmIdentifier,
 *     hashedMessage        OCTET STRING
 *   }
 *
 * We use SHA-256 as the message imprint algorithm
 * (OID 2.16.840.1.101.3.4.2.1).
 */

import { sha256 as sha256Fn } from "@noble/hashes/sha2";
import { randomBytes } from "node:crypto";
import type { TimestampToken } from "./types.js";

const DEFAULT_TSA_URL = "https://freetsa.org/tsr";

// ---------- minimal ASN.1 DER encoder ----------
// Just enough to encode a RFC 3161 TimeStampReq with SHA-256 imprint.
// We do not need a general-purpose ASN.1 library; the message is small
// and structurally fixed.

function derLen(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  if (len <= 0xff) return new Uint8Array([0x81, len]);
  if (len <= 0xffff) return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
  if (len <= 0xffffff)
    return new Uint8Array([0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  throw new Error("DER length too large");
}

function derWrap(tag: number, contents: Uint8Array): Uint8Array {
  const len = derLen(contents.length);
  const out = new Uint8Array(1 + len.length + contents.length);
  out[0] = tag;
  out.set(len, 1);
  out.set(contents, 1 + len.length);
  return out;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const a of arrs) n += a.length;
  const out = new Uint8Array(n);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function derInteger(n: number): Uint8Array {
  if (n === 0) return derWrap(0x02, new Uint8Array([0]));
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  // Add leading 0x00 if top bit set (positive integer)
  if (bytes[0] & 0x80) bytes.unshift(0);
  return derWrap(0x02, new Uint8Array(bytes));
}

function derIntegerBytes(bytes: Uint8Array): Uint8Array {
  // Strip leading zeros but always keep one byte; prepend 0x00 if top bit set
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  let body = bytes.subarray(i);
  if (body[0] & 0x80) body = concat(new Uint8Array([0]), body);
  return derWrap(0x02, body);
}

function derOctetString(b: Uint8Array): Uint8Array {
  return derWrap(0x04, b);
}

function derNull(): Uint8Array {
  return new Uint8Array([0x05, 0x00]);
}

function derSequence(...children: Uint8Array[]): Uint8Array {
  return derWrap(0x30, concat(...children));
}

/**
 * Encode an OID into DER. Accepts a string like "2.16.840.1.101.3.4.2.1".
 */
function derOid(oid: string): Uint8Array {
  const parts = oid.split(".").map((p) => parseInt(p, 10));
  if (parts.length < 2) throw new Error(`Invalid OID: ${oid}`);
  const bytes: number[] = [];
  bytes.push(parts[0] * 40 + parts[1]);
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    const stack: number[] = [];
    do {
      stack.push(v & 0x7f);
      v = v >> 7;
    } while (v > 0);
    while (stack.length > 1) {
      bytes.push(stack.pop()! | 0x80);
    }
    bytes.push(stack.pop()!);
  }
  return derWrap(0x06, new Uint8Array(bytes));
}

const SHA256_OID = "2.16.840.1.101.3.4.2.1";

/**
 * Build an RFC 3161 TimeStampReq for the given SHA-256 message imprint.
 *
 * Returns the DER-encoded bytes ready to POST to a TSA.
 */
export function buildTimeStampReq(messageImprintSha256: Uint8Array): Uint8Array {
  if (messageImprintSha256.length !== 32) {
    throw new Error(
      `SHA-256 message imprint must be 32 bytes, got ${messageImprintSha256.length}`
    );
  }

  const messageImprint = derSequence(
    derSequence(derOid(SHA256_OID), derNull()),
    derOctetString(messageImprintSha256)
  );

  const nonce = derIntegerBytes(randomBytes(8));
  const certReq = new Uint8Array([0x01, 0x01, 0xff]); // BOOLEAN TRUE

  return derSequence(derInteger(1), messageImprint, nonce, certReq);
}

// ---------- network client ----------

export interface TSAClientOptions {
  /** TSA URL. Defaults to FreeTSA. */
  url?: string;
  /** Optional Basic Auth username for commercial TSAs. */
  username?: string;
  /** Optional Basic Auth password for commercial TSAs. */
  password?: string;
  /** Timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Override fetch (useful for tests). */
  fetchImpl?: typeof fetch;
}

/**
 * Network RFC 3161 client. Sends a TimeStampReq to the configured TSA
 * and returns the raw DER-encoded TimeStampResp.
 *
 * The response is opaque to this SDK, it is stored verbatim in the
 * receipt envelope. Verification of the TSA signature is the verifier's
 * responsibility (they hold the TSA's CA certificate).
 */
export class TSAClient {
  private readonly url: string;
  private readonly auth?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: TSAClientOptions = {}) {
    this.url = opts.url ?? DEFAULT_TSA_URL;
    this.timeoutMs = opts.timeoutMs ?? 10000;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (opts.username && opts.password) {
      this.auth =
        "Basic " + Buffer.from(`${opts.username}:${opts.password}`).toString("base64");
    }
  }

  /**
   * Timestamp the SHA-256 hash of a payload.
   *
   * Returns a TimestampToken suitable for embedding in a SignedReceipt.
   */
  async timestamp(payload: Uint8Array): Promise<TimestampToken> {
    const imprint = sha256Fn(payload);
    const req = buildTimeStampReq(imprint);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/timestamp-query",
        Accept: "application/timestamp-reply",
      };
      if (this.auth) headers.Authorization = this.auth;

      const res = await this.fetchImpl(this.url, {
        method: "POST",
        headers,
        body: req,
        signal: ctrl.signal,
      });
      if (!res.ok) {
        throw new Error(`TSA ${this.url} returned HTTP ${res.status}`);
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      return {
        tsa: this.url,
        timestamp_token: Buffer.from(buf).toString("base64"),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Synchronous in-process TSA stub for tests and offline development.
 *
 * Produces a deterministic non-network token containing the imprint and
 * a timestamp string. NOT a valid RFC 3161 token, for tests only.
 */
export class StubTSAClient {
  constructor(public readonly id: string = "stub-tsa") {}

  async timestamp(payload: Uint8Array): Promise<TimestampToken> {
    const imprint = sha256Fn(payload);
    const token = {
      stub: true,
      tsa: this.id,
      issued_at: new Date().toISOString(),
      imprint: Buffer.from(imprint).toString("hex"),
    };
    return {
      tsa: this.id,
      timestamp_token: Buffer.from(JSON.stringify(token)).toString("base64"),
    };
  }
}
