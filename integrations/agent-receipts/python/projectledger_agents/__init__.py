"""
Shared base for emitting AskLedger receipts from any agent
framework. Concrete shims for AutoGen, CrewAI, smolagents, Pydantic
AI live alongside this module.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping
from urllib import request as urlrequest

log = logging.getLogger("askledger.agents")


@dataclass
class AgentEvent:
    tenant_id: str
    source_system: str
    event_type: str
    agent_role: str
    step_name: str
    model: str
    vendor: str
    input_text: str = ""
    output_text: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def to_raw_event(self) -> dict[str, Any]:
        return {
            "schema_version": "1.0",
            "tenant_id": self.tenant_id,
            "event_type": self.event_type,
            "source_system": self.source_system,
            "event_id": f"{self.source_system}-{int(time.time() * 1000)}-{_short(self.input_text)}",
            "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "context": {"agent_role": self.agent_role, "step": self.step_name},
            "subject": {"ai_vendor": self.vendor, "ai_model": self.model},
            "payload": {
                "input_hash": _sha256(self.input_text),
                "output_hash": _sha256(self.output_text),
                "input_token_count": self.input_tokens,
                "output_token_count": self.output_tokens,
                "latency_ms": self.latency_ms,
                "metadata": dict(self.metadata),
            },
        }


@dataclass
class ReceiptsSink:
    tenant_id: str
    source_system: str
    ingest_url: str
    api_key: str = ""
    timeout: float = 2.0
    redact_pii: bool = True

    def __post_init__(self) -> None:
        self.ingest_url = self.ingest_url or os.environ.get("PL_INGEST_URL", "")
        self.api_key = self.api_key or os.environ.get("PL_INGEST_TOKEN", "")

    def emit(self, ev: AgentEvent) -> None:
        body = json.dumps(ev.to_raw_event()).encode("utf-8")
        if not self.ingest_url:
            log.info("[pl-agents] %s", body.decode("utf-8"))
            return
        try:
            req = urlrequest.Request(
                self.ingest_url,
                data=body,
                headers={
                    "content-type": "application/json",
                    "authorization": f"Bearer {self.api_key}" if self.api_key else "",
                    "x-pl-source": ev.source_system,
                },
                method="POST",
            )
            with urlrequest.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                if resp.status >= 300:
                    log.warning("ingest returned %d", resp.status)
        except Exception as exc:  # pragma: no cover — defensive
            log.warning("pl-agents emit failed: %s", exc)


# Convenience builders -------------------------------------------------------


def vendor_for(model: str) -> str:
    model = (model or "").lower()
    if model.startswith("claude"): return "anthropic"
    if model.startswith("gpt") or model.startswith("o1") or model.startswith("o3") or model.startswith("o4"): return "openai"
    if "gemini" in model: return "google"
    if "bedrock" in model: return "aws-bedrock"
    if "llama" in model: return "meta"
    if "mistral" in model: return "mistral"
    return "openai-compatible"


def _sha256(s: str) -> str:
    return hashlib.sha256((s or "").encode("utf-8")).hexdigest()


def _short(s: str) -> str:
    return _sha256(s)[:12]


# Public adapter entrypoints -------------------------------------------------


def install_autogen(sink: ReceiptsSink, agent_role_provider: Callable[[Any], str] | None = None) -> None:
    """
    Hook AutoGen (autogen-agentchat) so every ConversableAgent reply
    emits a receipt. Idempotent.
    """
    try:
        from autogen import ConversableAgent  # type: ignore
    except Exception:  # pragma: no cover — autogen not installed
        log.info("autogen not present; install_autogen is a no-op")
        return

    if getattr(ConversableAgent, "_pl_wrapped", False):
        return
    original = ConversableAgent.generate_reply

    def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:  # noqa: ANN401
        t0 = time.time()
        result = original(self, *args, **kwargs)
        text = result if isinstance(result, str) else (result.get("content", "") if isinstance(result, dict) else "")
        sink.emit(AgentEvent(
            tenant_id=sink.tenant_id, source_system="autogen",
            event_type="agent.reply",
            agent_role=(agent_role_provider(self) if agent_role_provider else getattr(self, "name", "unknown")),
            step_name="generate_reply",
            model=getattr(self, "llm_config", {}).get("model", "unknown") if isinstance(getattr(self, "llm_config", None), dict) else "unknown",
            vendor=vendor_for(getattr(self, "llm_config", {}).get("model", "") if isinstance(getattr(self, "llm_config", None), dict) else ""),
            input_text=json.dumps(args, default=str),
            output_text=text,
            latency_ms=int((time.time() - t0) * 1000),
        ))
        return result

    ConversableAgent.generate_reply = wrapped  # type: ignore[assignment]
    ConversableAgent._pl_wrapped = True  # type: ignore[attr-defined]


def install_crewai(sink: ReceiptsSink) -> None:
    """Hook CrewAI so every Task.execute emits a receipt."""
    try:
        from crewai import Task  # type: ignore
    except Exception:  # pragma: no cover
        log.info("crewai not present; install_crewai is a no-op")
        return
    if getattr(Task, "_pl_wrapped", False):
        return
    original = Task.execute_sync if hasattr(Task, "execute_sync") else Task.execute

    def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:  # noqa: ANN401
        t0 = time.time()
        out = original(self, *args, **kwargs)
        text = getattr(out, "raw", str(out)) if out is not None else ""
        sink.emit(AgentEvent(
            tenant_id=sink.tenant_id, source_system="crewai",
            event_type="agent.task",
            agent_role=getattr(getattr(self, "agent", None), "role", "unknown"),
            step_name=getattr(self, "description", "")[:80],
            model=getattr(getattr(self, "agent", None), "llm", "") or "unknown",
            vendor=vendor_for(str(getattr(getattr(self, "agent", None), "llm", ""))),
            input_text=getattr(self, "description", ""),
            output_text=text,
            latency_ms=int((time.time() - t0) * 1000),
        ))
        return out

    if hasattr(Task, "execute_sync"):
        Task.execute_sync = wrapped  # type: ignore[assignment]
    else:
        Task.execute = wrapped  # type: ignore[assignment]
    Task._pl_wrapped = True  # type: ignore[attr-defined]


def install_pydantic_ai(sink: ReceiptsSink) -> None:
    """Hook Pydantic AI so every Agent.run emits a receipt."""
    try:
        from pydantic_ai import Agent  # type: ignore
    except Exception:  # pragma: no cover
        log.info("pydantic_ai not present; install_pydantic_ai is a no-op")
        return
    if getattr(Agent, "_pl_wrapped", False):
        return
    original = Agent.run

    async def wrapped(self: Any, prompt: str, **kwargs: Any) -> Any:  # noqa: ANN401
        t0 = time.time()
        result = await original(self, prompt, **kwargs)
        sink.emit(AgentEvent(
            tenant_id=sink.tenant_id, source_system="pydantic-ai",
            event_type="agent.run",
            agent_role=getattr(self, "name", "agent"),
            step_name="run",
            model=str(getattr(self, "model", "unknown")),
            vendor=vendor_for(str(getattr(self, "model", ""))),
            input_text=prompt,
            output_text=str(getattr(result, "data", result)),
            latency_ms=int((time.time() - t0) * 1000),
        ))
        return result

    Agent.run = wrapped  # type: ignore[assignment]
    Agent._pl_wrapped = True  # type: ignore[attr-defined]


def install_smolagents(sink: ReceiptsSink) -> None:
    """Hook smolagents so every tool call emits a receipt."""
    try:
        from smolagents import Tool  # type: ignore
    except Exception:  # pragma: no cover
        log.info("smolagents not present; install_smolagents is a no-op")
        return
    if getattr(Tool, "_pl_wrapped", False):
        return
    original_call = Tool.__call__

    def wrapped(self: Any, *args: Any, **kwargs: Any) -> Any:  # noqa: ANN401
        t0 = time.time()
        out = original_call(self, *args, **kwargs)
        sink.emit(AgentEvent(
            tenant_id=sink.tenant_id, source_system="smolagents",
            event_type="agent.tool_call",
            agent_role=getattr(self, "name", "tool"),
            step_name=getattr(self, "name", ""),
            model="n/a",
            vendor="n/a",
            input_text=json.dumps({"args": args, "kwargs": kwargs}, default=str),
            output_text=str(out),
            latency_ms=int((time.time() - t0) * 1000),
        ))
        return out

    Tool.__call__ = wrapped  # type: ignore[assignment]
    Tool._pl_wrapped = True  # type: ignore[attr-defined]


__all__ = [
    "AgentEvent", "ReceiptsSink", "vendor_for",
    "install_autogen", "install_crewai", "install_pydantic_ai", "install_smolagents",
]
