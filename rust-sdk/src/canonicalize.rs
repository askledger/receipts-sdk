//! RFC 8785 JSON Canonicalization Scheme.

use serde_json::Value;
use std::fmt::Write;

/// Return the RFC 8785 canonical string of `v`.
pub fn canonicalize(v: &Value) -> String {
    let mut out = String::new();
    write_value(&mut out, v);
    out
}

/// Format a `serde_json::Number` per RFC 8785 §3.2.2.3 (ECMAScript
/// `Number::toString`, base 10).
///
/// Integers (u64 / i64) are printed exactly by their own decimal form; only
/// non-integer f64 values go through the ES6 shortest-round-trip algorithm.
fn write_number(out: &mut String, n: &serde_json::Number) {
    if let Some(u) = n.as_u64() {
        // Exact non-negative integer.
        let _ = write!(out, "{}", u);
        return;
    }
    if let Some(i) = n.as_i64() {
        // Exact (possibly negative) integer.
        let _ = write!(out, "{}", i);
        return;
    }
    // Otherwise it is a float. serde_json guarantees finite for parsed JSON,
    // but guard anyway.
    let f = n
        .as_f64()
        .expect("serde_json::Number is u64, i64, or f64");
    out.push_str(&format_f64(f));
}

/// ECMAScript `Number::toString` for a finite IEEE-754 double.
///
/// Panics on NaN / ±Infinity (receipts never contain these).
fn format_f64(x: f64) -> String {
    if x.is_nan() || x.is_infinite() {
        panic!("cannot canonicalize non-finite number: {x}");
    }
    // x == 0 covers -0.0 as well.
    if x == 0.0 {
        return "0".to_string();
    }
    if x < 0.0 {
        return format!("-{}", format_f64(-x));
    }

    // Shortest round-tripping scientific form from Rust's LowerExp.
    // e.g. 1e-7 -> "1e-7", 1.2345e3 -> "1.2345e3", 1e20 -> "1e20".
    let sci = format!("{:e}", x);
    let (mantissa, exp_str) = sci
        .split_once('e')
        .expect("LowerExp always contains 'e'");
    // Digits of the mantissa with the '.' removed = significant digits `s`.
    let s: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = s.len() as i64; // number of significant digits
    let big_e: i64 = exp_str.parse().expect("exponent parses as integer");
    let n = big_e + 1; // value == s × 10^(n-k)

    let digits: Vec<u8> = s.bytes().collect(); // ASCII digits '0'..'9'

    let mut result = String::new();
    if k <= n && n <= 21 {
        // Rule 1: s followed by (n - k) zeros.
        result.push_str(&s);
        for _ in 0..(n - k) {
            result.push('0');
        }
    } else if 0 < n && n <= 21 {
        // Rule 2: first n digits of s, '.', remaining k - n digits.
        result.push_str(std::str::from_utf8(&digits[..n as usize]).unwrap());
        result.push('.');
        result.push_str(std::str::from_utf8(&digits[n as usize..]).unwrap());
    } else if -6 < n && n <= 0 {
        // Rule 3: "0.", then (-n) zeros, then s.
        result.push_str("0.");
        for _ in 0..(-n) {
            result.push('0');
        }
        result.push_str(&s);
    } else {
        // Rule 4: exponential form.
        let e = n - 1;
        let exp_out = if e >= 0 {
            format!("e+{}", e)
        } else {
            format!("e-{}", -e)
        };
        if k == 1 {
            result.push_str(&s);
            result.push_str(&exp_out);
        } else {
            result.push(digits[0] as char);
            result.push('.');
            result.push_str(std::str::from_utf8(&digits[1..]).unwrap());
            result.push_str(&exp_out);
        }
    }
    result
}

/// Canonical bytes (UTF-8).
pub fn canonicalize_bytes(v: &Value) -> Vec<u8> {
    canonicalize(v).into_bytes()
}

fn write_value(out: &mut String, v: &Value) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => write_number(out, n),
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
    // Hand-rolled JSON string escaper per RFC 8785 / ECMAScript
    // JSON.stringify. Escape ONLY: " \ \b \f \n \r \t and other C0
    // controls (< 0x20) as lowercase \u00xx. Everything else — including
    // < > & / DEL (0x7F), U+2028, U+2029, and all non-ASCII — is emitted
    // verbatim as UTF-8.
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                // Remaining C0 controls as \u00xx (lowercase hex, 4 digits).
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
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
