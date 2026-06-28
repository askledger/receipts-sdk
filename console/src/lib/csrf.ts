/**
 * CSRF token primitive — double-submit cookie pattern.
 *
 * Tokens are HMAC'd with the per-session secret so a stolen cookie value
 * alone cannot mint a valid header. All mutating server actions and
 * route handlers MUST call `verifyCsrf` at the top.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET = process.env.CSRF_SECRET ?? "";
if (!SECRET && process.env.NODE_ENV === "production") {
  throw new Error("CSRF_SECRET environment variable required in production");
}

const ALG = "sha256";

export function newCsrfToken(sessionId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const sig = createHmac(ALG, SECRET || "dev-only-secret")
    .update(`${sessionId}.${nonce}`)
    .digest("hex");
  return `${nonce}.${sig}`;
}

export function verifyCsrf(sessionId: string, token: string): boolean {
  const [nonce, sig] = (token ?? "").split(".");
  if (!nonce || !sig) return false;
  const expected = createHmac(ALG, SECRET || "dev-only-secret")
    .update(`${sessionId}.${nonce}`)
    .digest("hex");
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
