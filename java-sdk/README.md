# Project Ledger Receipts — Java SDK

Wire-format compatible. Cross-verified via shared conformance vectors. Apache-2.0.

```xml
<dependency>
  <groupId>io.askledger</groupId>
  <artifactId>receipts-sdk</artifactId>
  <version>0.1.0</version>
</dependency>
```

```java
import io.askledger.receipts.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

Crypto.KeyPair kp = Crypto.generateKeyPair();
var event = new ObjectMapper().readTree(
  "{\"schema_version\":\"1.0\",\"tenant_id\":\"acme\",\"event_type\":\"ide.completion\"," +
  "\"source_system\":\"vs-code-plugin\",\"event_id\":\"evt-001\"," +
  "\"captured_at\":\"2026-05-13T10:00:00.000Z\"," +
  "\"subject\":{\"ai_vendor\":\"anthropic\",\"ai_model\":\"claude-sonnet-4-6\"}," +
  "\"payload\":{\"input_classification\":\"internal\",\"output_classification\":\"internal\"}}"
);
Receipts.SignedReceipt r = Receipts.signReceipt(event, kp);
Receipts.VerifyResult res = Receipts.verifyReceipt(r, Map.of(kp.kid, kp.public_key), null);
System.out.println("valid: " + res.valid);
```

Spec: [../docs/RECEIPTS_PROTOCOL.md](../docs/RECEIPTS_PROTOCOL.md)
