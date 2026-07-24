"""
Example 11 — FastAPI endpoint (Python)

Emit a signed, verifiable receipt for an AI decision served from FastAPI, using
the wire-compatible Python SDK. Receipts produced here verify with the
TypeScript reference SDK and vice versa (shared conformance vectors).

Illustrative, matching the other examples: it shows the integration shape.
Copy the `ask` handler into your FastAPI app. To run standalone, drop this into
`main.py` and:

    pip install fastapi uvicorn \
      "askledger @ git+https://github.com/askledger/receipts-sdk.git#subdirectory=python-sdk"
    uvicorn main:app --reload

Load the signing key from your KMS/HSM at startup, never a fresh key per request.
"""
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI
from pydantic import BaseModel

from askledger.receipts import sign_receipt, generate_keypair

app = FastAPI()

# Loaded once at startup. Production: back this with a KMS/HSM.
KEYPAIR = generate_keypair()


class AskRequest(BaseModel):
    prompt: str


@app.post("/ai")
async def ask(body: AskRequest):
    # 1) Your AI call — any vendor, any model.
    answer = await call_your_model(body.prompt)

    # 2) Sign a receipt for the decision. Only hashes and metadata are stored,
    #    never the raw prompt or response.
    event = {
        "schema_version": "1.0",
        "tenant_id": "acme",
        "event_type": "gateway.request",
        "source_system": "fastapi-app",
        "event_id": str(uuid4()),
        "captured_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "subject": {"ai_vendor": "anthropic", "ai_model": "claude-sonnet-4-6"},
        "payload": {
            "input_classification": "internal",
            "output_classification": "internal",
        },
    }
    signed = sign_receipt(event, KEYPAIR)

    # 3) Append to your own append-only ledger, then respond. The id retrieves
    #    and verifies this exact decision later.
    await append_to_ledger(signed)

    return {"answer": answer, "receipt_id": signed["receipt"]["receipt_id"]}


# --- replace these stubs with your real implementations ---
async def call_your_model(prompt: str) -> str:
    return "…model output…"


async def append_to_ledger(receipt: dict) -> None:
    ...  # e.g. INSERT into Postgres, or POST to your hosted AskLedger ledger
