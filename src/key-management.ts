/**
 * Key rotation, revocation, and historical verification.
 *
 * In a long-lived deployment the issuer's signing key rotates, every
 * 90 days under most BFSI cryptographic-key-management standards
 * (NIST SP 800-57 Part 1 §6.5). Receipts signed with an old key MUST
 * still be verifiable forever; the verifier needs to know the key was
 * valid at the time of signing.
 *
 * This module models a key registry that carries:
 *   - kid -> public_key
 *   - kid -> validity window [issued_at, retired_at]
 *   - kid -> status (active | retired | revoked)
 *
 * A `revoked` key is treated as if it were never valid (compromise
 * scenario). A `retired` key is valid for receipts signed during its
 * validity window, but not for receipts signed after it was retired.
 */

export type KeyStatus = "active" | "retired" | "revoked";

export interface KeyRecord {
  kid: string;
  public_key: string; // base64
  algorithm: "EdDSA";
  curve: "ed25519";
  status: KeyStatus;
  issued_at: string; // RFC 3339
  retired_at?: string; // RFC 3339, only when status != active
  revoked_at?: string; // RFC 3339, only when status === revoked
  revocation_reason?: string;
}

export class KeyRegistry {
  private readonly records = new Map<string, KeyRecord>();

  /** Add a new key as active. Multiple active keys can coexist (overlap window). */
  add(record: Omit<KeyRecord, "status" | "issued_at"> & { issued_at?: string }): KeyRecord {
    const r: KeyRecord = {
      ...record,
      status: "active",
      issued_at: record.issued_at ?? new Date().toISOString(),
    };
    this.records.set(r.kid, r);
    return r;
  }

  /**
   * Retire a key. Receipts signed during its validity window remain
   * verifiable; receipts signed after retirement will fail.
   */
  retire(kid: string, when: Date = new Date()): KeyRecord {
    const r = this.records.get(kid);
    if (!r) throw new Error(`Unknown kid: ${kid}`);
    if (r.status === "revoked") {
      throw new Error(`Cannot retire a revoked key: ${kid}`);
    }
    r.status = "retired";
    r.retired_at = when.toISOString();
    return r;
  }

  /**
   * Revoke a key. Treat as if it were never valid. Use this on
   * confirmed compromise. Receipts signed by a revoked key fail
   * verification even if they were signed before revocation.
   */
  revoke(kid: string, reason: string, when: Date = new Date()): KeyRecord {
    const r = this.records.get(kid);
    if (!r) throw new Error(`Unknown kid: ${kid}`);
    r.status = "revoked";
    r.revoked_at = when.toISOString();
    r.revocation_reason = reason;
    return r;
  }

  /** Get the full record. */
  get(kid: string): KeyRecord | undefined {
    return this.records.get(kid);
  }

  /**
   * Return the `publicKeys` map shape that verifyReceipt() accepts.
   * Excludes revoked keys entirely.
   *
   * Optional `at` filters to keys that were valid (not retired) at the
   * specified time, useful when verifying historical receipts.
   */
  trustedKeys(at?: Date): Record<string, string> {
    const out: Record<string, string> = {};
    for (const r of this.records.values()) {
      if (r.status === "revoked") continue;
      if (at && r.status === "retired" && r.retired_at) {
        const retiredAt = new Date(r.retired_at).getTime();
        if (at.getTime() > retiredAt) continue;
      }
      out[r.kid] = r.public_key;
    }
    return out;
  }

  /** List all key records. */
  list(): KeyRecord[] {
    return [...this.records.values()];
  }

  /** Export as JSON for persistence. */
  toJSON(): KeyRecord[] {
    return this.list();
  }

  /** Hydrate from a previously persisted JSON list. */
  static fromJSON(records: KeyRecord[]): KeyRegistry {
    const reg = new KeyRegistry();
    for (const r of records) {
      reg.records.set(r.kid, { ...r });
    }
    return reg;
  }
}
