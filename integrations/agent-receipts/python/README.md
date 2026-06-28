# askledger-agents (Python)

Project Ledger receipts for the major Python agent frameworks.

```
pip install askledger-agents
```

## Use

One line per framework, hooked from your boot script:

```python
from askledger_agents import (
    ReceiptsSink,
    install_autogen,
    install_crewai,
    install_pydantic_ai,
    install_smolagents,
)

sink = ReceiptsSink(
    tenant_id="acme",
    source_system="my-app",
    ingest_url="https://ingest.acme.example/v1/receipts",
)

# Call only the ones you use; missing frameworks no-op silently.
install_autogen(sink)
install_crewai(sink)
install_pydantic_ai(sink)
install_smolagents(sink)
```

Every agent reply, task, run, or tool call from that point forward
emits a Project Ledger receipt. The wrappers are idempotent and
non-blocking — a receipt-emit failure never breaks the agent.

LangChain / LangGraph callers should use the existing
[`@askledger/receipts-sdk`](../../../) JS adapter — both Python
and JS handlers are conformant per PL-RFC-007.

## License

Apache-2.0.
