"""Receipt builder: build, hash, chain, and sign — matching the wire format
of the TypeScript reference SDK exactly. Receipts signed here verify with
the TS verifier and vice versa.
"""

from __future__ import annotations

import copy
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .canonicalize import canonicalize_bytes
from .crypto import sha256_hex, sign as ed_sign

GENESIS_HASH = "0" * 64


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_tenant(tenant_id: str) -> str:
    return "".join(c if c.isalnum() or c == "-" else "_" for c in tenant_id)


def _chain_path(tenant_id: str) -> str:
    return os.path.join(".ledger", "chains", f"{_safe_tenant(tenant_id)}.json")


def _load_chain_state(tenant_id: str) -> Dict[str, Any]:
    p = _chain_path(tenant_id)
    if not os.path.exists(p):
        return {
            "tenant_id": tenant_id,
            "chain_height": 0,
            "previous_receipt_hash": GENESIS_HASH,
            "updated_at": _now_iso(),
        }
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_chain_state(state: Dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(_chain_path(state["tenant_id"])), exist_ok=True)
    with open(_chain_path(state["tenant_id"]), "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def _uuid7() -> str:
    """RFC 9562 UUIDv7. Python's uuid module added uuid7 in 3.13;
    fall back to a draft-compatible implementation for 3.10–3.12."""
    if hasattr(uuid, "uuid7"):
        return str(uuid.uuid7())  # type: ignore[attr-defined]
    # Manual UUIDv7: 48-bit unix_ts_ms + 12 bits rand_a + 62 bits rand_b
    import secrets

    ts = int(datetime.now(timezone.utc).timestamp() * 1000) & 0xFFFFFFFFFFFF
    rand_a = secrets.randbits(12)
    rand_b = secrets.randbits(62)
    # bytes layout
    b = (
        (ts << 80)
        | (0x7 << 76)  # version 7
        | (rand_a << 64)
        | (0b10 << 62)  # variant
        | rand_b
    )
    return str(uuid.UUID(int=b))


def sign_receipt(
    event: Dict[str, Any],
    keypair: Dict[str, Any],
    decision: Optional[Dict[str, Any]] = None,
    provenance: Optional[Dict[str, Any]] = None,
    issued_at: Optional[str] = None,
) -> Dict[str, Any]:
    """Build, chain, and sign a receipt for one event.

    Returns the SignedReceipt envelope as a dict.
    """
    tenant_id = event["tenant_id"]
    prev_state = _load_chain_state(tenant_id)

    receipt: Dict[str, Any] = {
        "schema_version": "1.0",
        "receipt_id": _uuid7(),
        "tenant_id": tenant_id,
        "issued_at": issued_at or _now_iso(),
        "event": event,
        "integrity": {
            "previous_receipt_hash": prev_state["previous_receipt_hash"],
            "receipt_hash": "",
            "chain_height": prev_state["chain_height"] + 1,
        },
    }
    if decision is not None:
        receipt["decision"] = decision
    if provenance is not None:
        receipt["provenance"] = provenance

    # Compute receipt_hash over body with receipt_hash=""
    body_for_hash = copy.deepcopy(receipt)
    body_for_hash["integrity"]["receipt_hash"] = ""
    canon = canonicalize_bytes(body_for_hash)
    receipt_hash = sha256_hex(canon)
    receipt["integrity"]["receipt_hash"] = receipt_hash

    # Sign canonical bytes of fully-populated body
    canon_full = canonicalize_bytes(receipt)
    sig_b64 = ed_sign(canon_full, keypair)

    # Update chain state
    new_state = {
        "tenant_id": tenant_id,
        "chain_height": prev_state["chain_height"] + 1,
        "previous_receipt_hash": receipt_hash,
        "last_receipt_id": receipt["receipt_id"],
        "updated_at": _now_iso(),
    }
    _save_chain_state(new_state)

    return {
        "receipt": receipt,
        "signatures": [
            {"alg": "EdDSA", "kid": keypair["kid"], "sig": sig_b64}
        ],
    }
