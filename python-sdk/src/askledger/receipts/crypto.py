"""SHA-256 and Ed25519 primitives, using the `cryptography` package."""

from __future__ import annotations

import base64
import hashlib
import secrets
from typing import Any, Dict, Tuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.exceptions import InvalidSignature


def sha256_hex(data: bytes) -> str:
    """Compute SHA-256 of bytes, return lowercase hex."""
    return hashlib.sha256(data).hexdigest()


def generate_keypair() -> Dict[str, Any]:
    """Generate an Ed25519 keypair in the same JSON shape as the TS SDK."""
    priv = Ed25519PrivateKey.generate()
    pub = priv.public_key()
    priv_bytes = priv.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_bytes = pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    kid = "py-" + secrets.token_hex(6)
    from datetime import datetime, timezone

    return {
        "kid": kid,
        "public_key": base64.b64encode(pub_bytes).decode("ascii"),
        "private_key": base64.b64encode(priv_bytes).decode("ascii"),
        "algorithm": "EdDSA",
        "curve": "ed25519",
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def sign(payload: bytes, keypair: Dict[str, Any]) -> str:
    """Sign payload with keypair's private key, return base64 signature."""
    priv_bytes = base64.b64decode(keypair["private_key"])
    if len(priv_bytes) != 32:
        raise ValueError(f"Ed25519 private key must be 32 bytes, got {len(priv_bytes)}")
    priv = Ed25519PrivateKey.from_private_bytes(priv_bytes)
    sig = priv.sign(payload)
    return base64.b64encode(sig).decode("ascii")


def verify(payload: bytes, signature_b64: str, public_key_b64: str) -> bool:
    """Verify a signature; return True/False, never raise."""
    try:
        sig = base64.b64decode(signature_b64)
        pub_bytes = base64.b64decode(public_key_b64)
        if len(pub_bytes) != 32 or len(sig) != 64:
            return False
        pub = Ed25519PublicKey.from_public_bytes(pub_bytes)
        pub.verify(sig, payload)
        return True
    except (InvalidSignature, ValueError):
        return False
    except Exception:
        return False
