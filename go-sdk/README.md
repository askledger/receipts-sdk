# Project Ledger Receipts — Go SDK

Wire-format-compatible Go implementation of the Project Ledger Receipts protocol. Receipts signed in Go verify in TypeScript and Python, and vice versa.

```bash
go get github.com/askledger/receipts-sdk/go-sdk
```

```go
package main

import (
    "fmt"
    receipts "github.com/askledger/receipts-sdk/go-sdk"
)

func main() {
    kp, _ := receipts.GenerateKeyPair()
    event := map[string]interface{}{
        "schema_version": "1.0",
        "tenant_id":      "acme",
        "event_type":     "ide.completion",
        "source_system":  "vs-code-plugin",
        "event_id":       "evt-001",
        "captured_at":    "2026-05-13T10:00:00.000Z",
        "subject": map[string]interface{}{
            "ai_vendor": "anthropic", "ai_model": "claude-sonnet-4-6",
        },
        "payload": map[string]interface{}{
            "input_classification": "internal", "output_classification": "internal",
        },
    }
    r, _ := receipts.SignReceipt(event, kp)
    res := receipts.VerifyReceipt(r, map[string]string{kp.Kid: kp.PublicKey}, nil)
    fmt.Println("valid:", res.Valid)
}
```

Spec: see [../docs/RECEIPTS_PROTOCOL.md](../docs/RECEIPTS_PROTOCOL.md). License: Apache-2.0.
