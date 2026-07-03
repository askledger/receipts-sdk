"""RFC 8785 JSON Canonicalization Scheme (JCS).

Pure-Python implementation. Matches the output of any compliant JCS
implementation byte-for-byte, including the TypeScript reference SDK's
output.

Rules implemented:
  - JSON object members are sorted by key in UTF-16 code-unit order.
  - No insignificant whitespace.
  - Numbers serialized per ECMAScript Number::toString base 10
    (ECMA-262 7.1.12.1), matching RFC 8785 §3.2.2.3.
  - Strings escaped per RFC 8785 §3.2.2.2 (JSON.stringify semantics):
    only ", \\, and the C0 controls are escaped; <>&/ and all
    non-ASCII (including DEL 0x7F, U+2028, U+2029) are emitted raw.
"""

from __future__ import annotations

from typing import Any

# Characters with dedicated short escapes (RFC 8785 §3.2.2.2).
_SHORT_ESCAPES = {
    0x08: "\\b",
    0x09: "\\t",
    0x0A: "\\n",
    0x0C: "\\f",
    0x0D: "\\r",
    0x22: '\\"',
    0x5C: "\\\\",
}


def _escape_string(s: str) -> str:
    """Serialize a JSON string value per ECMAScript JSON.stringify.

    Escapes ONLY: " \\ and the C0 controls (< 0x20). Everything else --
    including < > & /, DEL 0x7F, U+2028, U+2029, and all non-ASCII -- is
    emitted raw (encoded as UTF-8 at the byte layer). Short escapes are
    used for \\b \\f \\n \\r \\t; other C0 controls use \\u00XX (lowercase
    hex, 4 digits).
    """
    out = ['"']
    for ch in s:
        code = ord(ch)
        esc = _SHORT_ESCAPES.get(code)
        if esc is not None:
            out.append(esc)
        elif code < 0x20:
            out.append("\\u%04x" % code)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _format_number(x: float) -> str:
    """Format a finite double per ECMAScript Number::toString base 10.

    Implements ECMA-262 7.1.12.1 steps 6-10. Uses Python ``repr`` to obtain
    the shortest round-tripping decimal (mantissa digits ``s`` and exponent
    giving ``n`` where value == s x 10^(n-k), k == len(s)), then applies the
    range rules.
    """
    if x != x or x in (float("inf"), float("-inf")):
        raise ValueError("Non-finite numbers not allowed in JCS")

    if x == 0:
        # Covers +0 and -0.
        return "0"

    if x < 0:
        return "-" + _format_number(-x)

    # Obtain shortest round-trip decimal from repr, e.g. '0.1', '1234.5',
    # '1e-07', '1e+21', '5e-324', '100000000000000000000'.
    r = repr(x)

    # Split mantissa and exponent.
    if "e" in r or "E" in r:
        mant, _, exp_str = r.replace("E", "e").partition("e")
        exp = int(exp_str)
    else:
        mant = r
        exp = 0

    # Split mantissa into integer and fractional parts.
    if "." in mant:
        int_part, frac_part = mant.split(".", 1)
    else:
        int_part, frac_part = mant, ""

    # Build the significant-digit string s and the decimal exponent n such
    # that value == s x 10^(n - k), where k = len(s).
    digits = int_part + frac_part
    # Position of the decimal point measured from the left of `digits`:
    # int_part contributes len(int_part) integer digits, then `exp` shifts it.
    point_pos = len(int_part) + exp

    # Strip leading zeros (adjusting the point position accordingly).
    lead = 0
    while lead < len(digits) - 1 and digits[lead] == "0":
        lead += 1
    digits = digits[lead:]
    point_pos -= lead

    # Strip trailing zeros (these do not affect point_pos).
    digits = digits.rstrip("0")
    if digits == "":
        # Value collapsed to zero (shouldn't happen since x != 0).
        return "0"

    s = digits
    k = len(s)
    n = point_pos

    # Apply ECMA-262 7.1.12.1 range rules.
    if k <= n <= 21:
        # Step 6: s followed by (n - k) zeros.
        return s + "0" * (n - k)
    if 0 < n <= 21:
        # Step 7: first n digits, '.', remaining k - n digits.
        return s[:n] + "." + s[n:]
    if -6 < n <= 0:
        # Step 8: '0.', (-n) zeros, then s.
        return "0." + "0" * (-n) + s
    # Step 9/10: exponential form.
    e = n - 1
    if e >= 0:
        exp_out = "e+" + str(e)
    else:
        exp_out = "e-" + str(-e)
    if k == 1:
        return s + exp_out
    return s[0] + "." + s[1:] + exp_out


def _serialize(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        # Integers print with no decimal point and no exponent.
        return str(value)
    if isinstance(value, float):
        return _format_number(value)
    if isinstance(value, str):
        return _escape_string(value)
    if isinstance(value, list):
        parts = [_serialize(v) for v in value]
        return "[" + ",".join(parts) + "]"
    if isinstance(value, dict):
        # RFC 8785 §3.2.3: sort by UTF-16 code units.
        items = sorted(value.items(), key=lambda kv: kv[0].encode("utf-16-be"))
        parts = [f"{_escape_string(k)}:{_serialize(v)}" for k, v in items]
        return "{" + ",".join(parts) + "}"
    raise TypeError(f"Cannot canonicalize value of type {type(value).__name__}")


def canonicalize(value: Any) -> str:
    """Return the RFC 8785 canonical string form of `value`."""
    return _serialize(value)


def canonicalize_bytes(value: Any) -> bytes:
    """Return the RFC 8785 canonical bytes (UTF-8) of `value`."""
    return canonicalize(value).encode("utf-8")
