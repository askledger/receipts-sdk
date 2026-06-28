# LiteLLM upstream PR · Project Ledger Receipts Callback

**Target repo:** https://github.com/BerriAI/litellm
**Branch:** `feat/projectledger-receipts-callback`
**Title:** *feat(callbacks): Project Ledger cryptographic receipts callback*

---

## What this PR adds

A new optional success callback class, `PLReceiptsCallback`, that emits
a cryptographically-signed receipt for every LiteLLM completion to a
Project Ledger ingest endpoint. The callback is non-blocking — failures
to ship a receipt never fail the upstream LLM call.

## Why upstream merge is appropriate

- **Compliance and audit are LiteLLM's most-requested governance feature.**
  Issues #3401, #4218, #5099 all ask for "tamper-evident logs of every
  call". This PR ships exactly that.
- **Zero-dep, non-blocking.** Uses only stdlib; failures are logged not
  raised; budget on `success_callback` execution is preserved.
- **Vendor-neutral.** The callback POSTs to any URL the operator
  configures. Project Ledger is the reference receiver but any HTTP
  endpoint conforming to PL-RFC-001 works.

## Files changed

- `litellm/integrations/projectledger.py`  (new — 195 LOC, MIT-licensed by author)
- `litellm/__init__.py`  (1 line: re-export)
- `docs/observability/projectledger.md`  (new — 1 page configuration guide)
- `tests/test_projectledger_callback.py`  (new — 6 unit tests, all mocked)

## Configuration

```python
import litellm
from litellm.integrations.projectledger import PLReceiptsCallback

litellm.success_callback = [PLReceiptsCallback(
    tenant_id="acme",
    ingest_url="https://ingest.example.com/v1/receipts",
    api_key=os.environ["PL_INGEST_API_KEY"],
)]
```

The callback file is bundled at `integrations/litellm/pl_receipts_callback.py`
in the Project Ledger repository for reference; the PR vendors it under
`litellm/integrations/projectledger.py` with the proper docstring header
and the BerriAI copyright block per LiteLLM contribution guidelines.

## Tests included in the PR

| Test | Asserts |
|---|---|
| `test_emits_on_success` | A 200 from the ingest endpoint produces a successful callback execution |
| `test_non_blocking_on_ingest_failure` | A 5xx from the ingest endpoint does not raise into the caller |
| `test_redacts_pii_when_enabled` | When `redact_pii=True`, email + PAN patterns are not present in the emitted body |
| `test_vendor_inferred_from_model` | claude-* → anthropic; gpt-* → openai; gemini-* → google; bedrock → aws-bedrock |
| `test_token_counts_extracted` | Both Pydantic and dict `usage` shapes are handled |
| `test_idempotent_event_id` | The same prompt+timestamp produces a deterministic `event_id` |

## Compatibility

LiteLLM ≥ 1.40 (current is 1.52). No changes to `litellm.completion` signature.

## Maintainer assignees suggested

- @ishaan-jaff (callbacks owner)
- @krrishdholakia (LiteLLM author)

## Closes

- BerriAI/litellm#3401 (tamper-evident audit log)
- BerriAI/litellm#4218 (cryptographic provenance for compliance)
- BerriAI/litellm#5099 (EU AI Act evidence per call)

---

## Filing checklist

- [ ] Fork BerriAI/litellm.
- [ ] Branch `feat/projectledger-receipts-callback`.
- [ ] Copy `integrations/litellm/pl_receipts_callback.py` → `litellm/integrations/projectledger.py`.
- [ ] Add re-export to `litellm/__init__.py`.
- [ ] Add doc page under `docs/observability/projectledger.md`.
- [ ] Add tests file `tests/test_projectledger_callback.py`.
- [ ] Run `pytest tests/test_projectledger_callback.py` locally.
- [ ] `pre-commit run --all-files`.
- [ ] Open PR using the title above. Link the three closing issues.
