// Substrate-agnostic-credentials sanity tests. Proves that the same
// signing path that produces AI receipts also produces document
// credentials, and that the document binding round-trips cleanly.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { buildSalarySlipEvent, verifyDocumentBinding, hashName, hashDocument } from "../src/credentials/index.js";
import { signReceipt, verifyReceipt, generateKeyPair } from "../src/index.js";
import { canonicalize } from "../src/canonicalize.js";

const TENANT = "doc-creds-" + Math.random().toString(36).slice(2, 8);

describe("Document credentials · employment salary slip", () => {
  it("builds a RawEvent the existing substrate signs without modification", () => {
    process.env.RECEIPTS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pl-cred-"));
    const kp = generateKeyPair();

    const event = buildSalarySlipEvent({
      tenant_id: TENANT,
      issuer_id: "tcs-payroll-mumbai",
      issuer_role: "employer",
      slip: {
        employer_id: "tcs-payroll-mumbai",
        employee_id: "emp-90213",
        employee_name: "Arif Khan",
        period_start: "2026-05-01",
        period_end: "2026-05-31",
        gross_pay: 145_000,
        net_pay: 118_300,
        currency: "INR",
        taxes: 21_700,
        deductions: 5_000,
        jurisdiction: "IN",
      },
    });

    const signed = signReceipt({ event, keypair: kp });
    expect(signed.receipt.event.event_type).toBe("credential.employment.salary_slip");
    expect(signed.receipt.integrity.chain_height).toBe(1);

    const v = verifyReceipt(signed, { publicKeys: { [kp.kid]: kp.public_key } });
    expect(v.valid).toBe(true);
  });

  it("document binding round-trips — same canonical bytes → same hash", () => {
    const slip = {
      employer_id: "tcs-payroll-mumbai",
      employee_id: "emp-90213",
      employee_name: "Arif Khan",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
      gross_pay: 145_000,
      net_pay: 118_300,
      currency: "INR",
      taxes: 21_700,
      deductions: 5_000,
      jurisdiction: "IN",
    };
    const ev = buildSalarySlipEvent({ tenant_id: TENANT + "-x", issuer_id: "x", issuer_role: "employer", slip });
    const canonicalDoc = canonicalize(slip);
    expect(verifyDocumentBinding(ev, canonicalDoc)).toBe(true);
  });

  it("any field mutation breaks the document binding", () => {
    const slip = {
      employer_id: "tcs-payroll-mumbai",
      employee_id: "emp-90213",
      employee_name: "Arif Khan",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
      gross_pay: 145_000,
      net_pay: 118_300,
      currency: "INR",
      taxes: 21_700,
      deductions: 5_000,
      jurisdiction: "IN",
    };
    const ev = buildSalarySlipEvent({ tenant_id: TENANT + "-y", issuer_id: "x", issuer_role: "employer", slip });
    const tamperedDoc = canonicalize({ ...slip, net_pay: 999_999 });
    expect(verifyDocumentBinding(ev, tamperedDoc)).toBe(false);
  });

  it("name hash is NFKC-normalised + lowercased so equivalent renderings match", () => {
    const a = hashName("Arif Khan");
    const b = hashName("  ARIF KHAN  ");
    expect(a).toBe(b);
  });

  it("document hash is independent of object-key order in the source slip", () => {
    const a = hashDocument(canonicalize({ a: 1, b: 2, c: 3 }));
    const b = hashDocument(canonicalize({ c: 3, a: 1, b: 2 }));
    expect(a).toBe(b);
  });
});
