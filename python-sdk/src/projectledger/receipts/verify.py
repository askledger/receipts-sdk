"""Independent receipt verifier. Compatible with TS-signed receipts."""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .canonicalize import canonicalize_bytes
from .crypto import sha256_hex, verify as ed_verify


@dataclass
class VerifyResult:
    valid: bool = False
    canonical_hash_matches: bool = False
    signature_valid: bool = False
    chain_link_valid: Optional[bool] = None
    errors: List[str] = field(default_factory=list)


def verify_receipt(
    signed: Dict[str, Any],
    public_keys: Dict[str, str],
    previous_receipt: Optional[Dict[str, Any]] = None,
) -> VerifyResult:
    """Verify a signed receipt.

    Args:
      signed: the SignedReceipt envelope (`{receipt, signatures, ...}`)
      public_keys: map of kid -> base64 public key
      previous_receipt: optional prior SignedReceipt for chain-link check
    """
    result = VerifyResult()

    # 1. Recompute receipt_hash
    receipt = signed["receipt"]
    body = copy.deepcopy(receipt)
    body["integrity"]["receipt_hash"] = ""
    expected_hash = sha256_hex(canonicalize_bytes(body))
    if expected_hash == receipt["integrity"]["receipt_hash"]:
        result.canonical_hash_matches = True
    else:
        result.errors.append(
            f"Canonical hash mismatch: expected {expected_hash}, got "
            f"{receipt['integrity']['receipt_hash']}"
        )

    # 2. Verify at least one signature
    canon_signing = canonicalize_bytes(receipt)
    any_valid = False
    for sig in signed["signatures"]:
        kid = sig["kid"]
        # §3: reject any signature whose alg is not exactly "EdDSA" before
        # running Ed25519 verification (prevents algorithm confusion).
        alg = sig.get("alg")
        if alg != "EdDSA":
            result.errors.append(
                f"Unsupported signature alg={alg!r} for kid={kid} (expected 'EdDSA')"
            )
            continue
        pk = public_keys.get(kid)
        if not pk:
            result.errors.append(f"No public key supplied for kid={kid}")
            continue
        if ed_verify(canon_signing, sig["sig"], pk):
            any_valid = True
        else:
            result.errors.append(f"Signature invalid for kid={kid}")
    result.signature_valid = any_valid

    # 3. Chain link
    if previous_receipt is not None:
        prev_hash = previous_receipt["receipt"]["integrity"]["receipt_hash"]
        if prev_hash == receipt["integrity"]["previous_receipt_hash"]:
            result.chain_link_valid = True
        else:
            result.chain_link_valid = False
            result.errors.append(
                f"Chain link broken: previous_receipt_hash "
                f"{receipt['integrity']['previous_receipt_hash']} does not match "
                f"prev receipt's receipt_hash {prev_hash}"
            )

    result.valid = (
        result.canonical_hash_matches
        and result.signature_valid
        and (result.chain_link_valid is not False)
    )
    return result
