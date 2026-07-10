"""Independent receipt verifier. Compatible with TS-signed receipts."""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .canonicalize import canonicalize_bytes
from .crypto import sha256_hex, verify as ed_verify
from .receipt import GENESIS_HASH


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
    integrity = receipt["integrity"]
    height = integrity.get("chain_height")
    prev_hash_claim = integrity.get("previous_receipt_hash")

    if not isinstance(height, int) or isinstance(height, bool) or height < 1:
        result.chain_link_valid = False
        result.errors.append(f"Invalid chain_height: {height}")
    elif previous_receipt is not None:
        prev = previous_receipt["receipt"]["integrity"]
        link_ok = prev["receipt_hash"] == prev_hash_claim
        height_ok = height == prev["chain_height"] + 1
        result.chain_link_valid = link_ok and height_ok
        if not link_ok:
            result.errors.append(
                f"Chain link broken: previous_receipt_hash "
                f"{prev_hash_claim} does not match "
                f"prev receipt's receipt_hash {prev['receipt_hash']}"
            )
        if not height_ok:
            result.errors.append(
                f"Chain height not contiguous: expected "
                f"{prev['chain_height'] + 1}, got {height}"
            )
    elif height == 1 or prev_hash_claim == GENESIS_HASH:
        # Genesis reference and chain_height 1 must agree with each other.
        genesis_ok = height == 1 and prev_hash_claim == GENESIS_HASH
        result.chain_link_valid = genesis_ok
        if not genesis_ok:
            result.errors.append(
                f"Genesis inconsistency: chain_height {height} with "
                f"previous_receipt_hash {prev_hash_claim} (chain_height 1 must "
                f"reference GENESIS_HASH, and vice-versa)"
            )
    # else: mid-chain (height > 1) without predecessor -> chain_link_valid
    # stays None (unset): position not attested, but not failed.

    result.valid = (
        result.canonical_hash_matches
        and result.signature_valid
        and (result.chain_link_valid is not False)
    )
    return result
