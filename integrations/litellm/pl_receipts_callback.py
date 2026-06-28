"""
LiteLLM success_callback for Project Ledger receipts.

Drop into a LiteLLM deployment to emit a signed receipt for every LLM
call without changing application code. Upstream PR target:
https://github.com/BerriAI/litellm

Usage:
    import litellm
    from pl_receipts_callback import PLReceiptsCallback

    litellm.success_callback = [PLReceiptsCallback(
        tenant_id="acme",
        ingest_url="https://ingest.acme.example/v1/receipts",
        api_key=os.environ["PL_INGEST_API_KEY"],
    )]

Failure modes:
    Non-blocking. A receipt-emit failure does NOT fail the upstream LLM
    call. Failures are logged and surfaced via the standard LiteLLM
    error hooks.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Mapping
from urllib import request as urlrequest

log = logging.getLogger("pl_receipts")


@dataclass
class PLReceiptsCallback:
    tenant_id: str
    ingest_url: str
    api_key: str
    source_system: str = "litellm"
    timeout_seconds: float = 2.0

    def __call__(
        self,
        kwargs: Mapping[str, Any],
        completion_response: Any,
        start_time: float,
        end_time: float,
    ) -> None:
        try:
            event = self._to_event(kwargs, completion_response, start_time, end_time)
            self._send(event)
        except Exception as exc:  # pragma: no cover — defensive
            log.warning("pl-receipts emit failed: %s", exc)

    # internal -----------------------------------------------------------------

    def _to_event(
        self,
        kwargs: Mapping[str, Any],
        completion_response: Any,
        start_time: float,
        end_time: float,
    ) -> dict[str, Any]:
        model = kwargs.get("model", "unknown")
        vendor = _vendor_for(model)
        messages = kwargs.get("messages") or []
        prompt_text = "\n".join(m.get("content", "") for m in messages if isinstance(m, dict))

        try:
            output_text = completion_response.choices[0].message.content
        except Exception:
            output_text = ""

        usage = getattr(completion_response, "usage", None) or {}
        input_tokens = int(getattr(usage, "prompt_tokens", 0) or usage.get("prompt_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "completion_tokens", 0) or usage.get("completion_tokens", 0) or 0)

        return {
            "schema_version": "1.0",
            "tenant_id": self.tenant_id,
            "event_type": "ai.model_invocation",
            "source_system": self.source_system,
            "event_id": f"litellm-{int(time.time() * 1000)}-{_short_hash(prompt_text)}",
            "captured_at": _iso(end_time),
            "context": {
                "user_id": kwargs.get("user") or "anonymous",
                "session_id": kwargs.get("metadata", {}).get("session_id"),
                "environment": os.environ.get("PL_ENV", "production"),
            },
            "subject": {"ai_vendor": vendor, "ai_model": model},
            "payload": {
                "input_hash": _sha256(prompt_text),
                "output_hash": _sha256(output_text),
                "input_token_count": input_tokens,
                "output_token_count": output_tokens,
                "latency_ms": int((end_time - start_time) * 1000),
            },
        }

    def _send(self, event: dict[str, Any]) -> None:
        body = json.dumps(event).encode("utf-8")
        req = urlrequest.Request(
            self.ingest_url,
            data=body,
            headers={
                "content-type": "application/json",
                "authorization": f"Bearer {self.api_key}",
                "x-pl-source": "litellm",
            },
            method="POST",
        )
        with urlrequest.urlopen(req, timeout=self.timeout_seconds) as resp:  # noqa: S310
            if resp.status >= 300:
                raise RuntimeError(f"ingest returned {resp.status}")


# helpers ---------------------------------------------------------------------


def _vendor_for(model: str) -> str:
    model = (model or "").lower()
    if model.startswith("claude") or "anthropic" in model:
        return "anthropic"
    if model.startswith("gpt") or model.startswith("o") or "openai" in model:
        return "openai"
    if "gemini" in model or "vertex" in model or "google" in model:
        return "google"
    if "bedrock" in model:
        return "aws-bedrock"
    if "azure" in model:
        return "azure-openai"
    return "unknown"


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _short_hash(s: str) -> str:
    return _sha256(s)[:12]


def _iso(t: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))
