//! RFC 8785 JSON Canonicalization Scheme.

use serde_json::Value;
use std::fmt::Write;

/// Return the RFC 8785 canonical string of `v`.
pub fn canonicalize(v: &Value) -> String {
    let mut out = String::new();
    write_value(&mut out, v);
    out
}

/// Canonical bytes (UTF-8).
pub fn canonicalize_bytes(v: &Value) -> Vec<u8> {
    canonicalize(v).into_bytes()
}

fn write_value(out: &mut String, v: &Value) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&n.to_string()),
        Value::String(s) => write_string(out, s),
        Value::Array(a) => {
            out.push('[');
            for (i, item) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_value(out, item);
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            // RFC 8785 §3.2.3: sort by UTF-16 code units
            keys.sort_by(|a, b| compare_utf16(a, b));
            out.push('{');
            for (i, k) in keys.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(out, k);
                out.push(':');
                write_value(out, &map[*k]);
            }
            out.push('}');
        }
    }
}

fn write_string(out: &mut String, s: &str) {
    // serde_json's escaping matches RFC 8259 §7 (and thus RFC 8785) for
    // the receipts schema (ASCII keys, ordinary user strings).
    let serialized = serde_json::to_string(s).expect("string serialize");
    out.push_str(&serialized);
}

fn compare_utf16(a: &str, b: &str) -> std::cmp::Ordering {
    let au: Vec<u16> = a.encode_utf16().collect();
    let bu: Vec<u16> = b.encode_utf16().collect();
    au.cmp(&bu)
}

/// Implementation detail re-export for tests.
#[doc(hidden)]
pub fn _write_string_for_tests(s: &str) -> String {
    let mut out = String::new();
    write_string(&mut out, s);
    let _ = std::fmt::Write::write_str(&mut String::new(), "");
    out
}
