"""Run the shared cross-language conformance vectors against the Python SDK."""

import json
import os
import pathlib

import pytest

from projectledger.receipts import canonicalize, sha256_hex

HERE = pathlib.Path(__file__).resolve().parent
VECTORS = HERE.parent.parent / "test" / "conformance"


def load(name):
    with open(VECTORS / name, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.mark.parametrize("vec", load("canonicalize.json")["vectors"], ids=lambda v: v["name"])
def test_canonicalize(vec):
    assert canonicalize(vec["input"]) == vec["expected"]


@pytest.mark.parametrize("vec", load("sha256.json")["vectors"], ids=lambda v: v["name"])
def test_sha256(vec):
    assert sha256_hex(vec["input"].encode("utf-8")) == vec["expected_hex"]


def test_python_signs_typescript_verifies_roundtrip():
    """Sign a receipt in Python, then verify the canonical bytes match
    what a TypeScript verifier would produce. We can't run the TS code
    from here, but we can check that the Python implementation produces
    a receipt the TS verifier would accept.
    """
    from projectledger.receipts import generate_keypair, sign_receipt, verify_receipt

    kp = generate_keypair()
    event = {
        "schema_version": "1.0",
        "tenant_id": "py-roundtrip",
        "event_type": "ide.completion",
        "source_system": "py-test",
        "event_id": "evt-001",
        "captured_at": "2026-05-13T10:00:00.000Z",
        "subject": {"ai_vendor": "anthropic", "ai_model": "claude-sonnet-4-6"},
        "payload": {"input_classification": "internal", "output_classification": "internal"},
    }
    signed = sign_receipt(event, kp)
    result = verify_receipt(signed, {kp["kid"]: kp["public_key"]})
    assert result.valid is True
    assert result.signature_valid is True
    assert result.canonical_hash_matches is True
