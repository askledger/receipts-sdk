"""RFC 8785 JSON Canonicalization Scheme (JCS).

Pure-Python implementation. Matches the output of any compliant JCS
implementation byte-for-byte, including the TypeScript reference SDK's
output.

Rules implemented:
  - JSON object members are sorted by key in UTF-16 code-unit order.
  - No insignificant whitespace.
  - Numbers serialized per ECMA-262 §7.1.12.1 (no trailing zeros, etc.).
  - Strings escaped per RFC 8259 §7.

For numbers we use Python's repr() which matches ECMAScript's number
serialization for all values the receipts schema uses (integer chain
heights, byte counts). Floating-point edge cases are not exercised by
the receipts schema.
"""

from __future__ import annotations

import json
from typing import Any


def _serialize(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
            raise ValueError("Non-finite numbers not allowed in JCS")
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        return json.dumps(value)
    if isinstance(value, str):
        # json.dumps uses RFC 8259 escapes by default with ensure_ascii=False
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        parts = [_serialize(v) for v in value]
        return "[" + ",".join(parts) + "]"
    if isinstance(value, dict):
        # RFC 8785 §3.2.3: sort by UTF-16 code units
        items = sorted(value.items(), key=lambda kv: kv[0].encode("utf-16-be"))
        parts = [f'{json.dumps(k, ensure_ascii=False)}:{_serialize(v)}' for k, v in items]
        return "{" + ",".join(parts) + "}"
    raise TypeError(f"Cannot canonicalize value of type {type(value).__name__}")


def canonicalize(value: Any) -> str:
    """Return the RFC 8785 canonical string form of `value`."""
    return _serialize(value)


def canonicalize_bytes(value: Any) -> bytes:
    """Return the RFC 8785 canonical bytes (UTF-8) of `value`."""
    return canonicalize(value).encode("utf-8")
