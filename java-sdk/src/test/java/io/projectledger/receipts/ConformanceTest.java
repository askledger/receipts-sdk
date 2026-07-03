package io.projectledger.receipts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import java.io.File;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class ConformanceTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @TestFactory
    List<DynamicTest> canonicalizeVectors() throws Exception {
        JsonNode root = MAPPER.readTree(new File("../test/conformance/canonicalize.json"));
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode v : root.get("vectors")) {
            String name = v.get("name").asText();
            tests.add(DynamicTest.dynamicTest(name, () -> {
                String got = Canonicalize.canonicalize(MAPPER.convertValue(v.get("input"), Object.class));
                assertEquals(v.get("expected").asText(), got, "vector: " + name);
            }));
        }
        return tests;
    }

    @TestFactory
    List<DynamicTest> sha256Vectors() throws Exception {
        JsonNode root = MAPPER.readTree(new File("../test/conformance/sha256.json"));
        List<DynamicTest> tests = new ArrayList<>();
        for (JsonNode v : root.get("vectors")) {
            String name = v.get("name").asText();
            tests.add(DynamicTest.dynamicTest(name, () -> {
                String got = Crypto.sha256HexUtf8(v.get("input").asText());
                assertEquals(v.get("expected_hex").asText(), got);
            }));
        }
        return tests;
    }

    @Test
    void signVerifyRoundtrip() throws Exception {
        Crypto.KeyPair kp = Crypto.generateKeyPair();
        JsonNode event = MAPPER.readTree(
            "{" +
                "\"schema_version\":\"1.0\"," +
                "\"tenant_id\":\"java-test\"," +
                "\"event_type\":\"ide.completion\"," +
                "\"source_system\":\"java-runner\"," +
                "\"event_id\":\"evt-j-001\"," +
                "\"captured_at\":\"2026-05-13T10:00:00.000Z\"," +
                "\"subject\":{\"ai_vendor\":\"anthropic\",\"ai_model\":\"claude-sonnet-4-6\"}," +
                "\"payload\":{\"input_classification\":\"internal\",\"output_classification\":\"internal\"}" +
            "}"
        );
        Receipts.SignedReceipt r = Receipts.signReceipt(event, kp);
        Receipts.VerifyResult res = Receipts.verifyReceipt(
            r, Map.of(kp.kid, kp.public_key), null
        );
        assertTrue(res.valid, "errors: " + res.errors);
    }
}
