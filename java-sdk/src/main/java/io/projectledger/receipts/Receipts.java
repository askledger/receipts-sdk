package io.projectledger.receipts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

/**
 * Receipt builder and verifier. Wire-format compatible with TS, Python,
 * Go, and Rust SDKs.
 */
public final class Receipts {

    public static final String GENESIS_HASH =
        "0000000000000000000000000000000000000000000000000000000000000000";

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final SecureRandom RNG = new SecureRandom();
    private static final HexFormat HEX = HexFormat.of();

    private Receipts() {}

    private static String safeTenant(String t) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (Character.isLetterOrDigit(c) || c == '-') sb.append(c);
            else sb.append('_');
        }
        return sb.toString();
    }

    private static Path chainPath(String tenant) {
        return Path.of(".ledger", "chains", safeTenant(tenant) + ".json");
    }

    private static ObjectNode loadChain(String tenant) {
        try {
            Path p = chainPath(tenant);
            if (Files.exists(p)) {
                return (ObjectNode) MAPPER.readTree(Files.readAllBytes(p));
            }
        } catch (IOException ignored) {}
        ObjectNode out = MAPPER.createObjectNode();
        out.put("tenant_id", tenant);
        out.put("chain_height", 0);
        out.put("previous_receipt_hash", GENESIS_HASH);
        out.put("updated_at", Instant.now().toString());
        return out;
    }

    private static void saveChain(ObjectNode state) throws IOException {
        Path p = chainPath(state.get("tenant_id").asText());
        new File(p.getParent().toString()).mkdirs();
        Files.write(p, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsBytes(state));
    }

    /** RFC 9562 UUIDv7. */
    private static String uuidv7() {
        long ts = System.currentTimeMillis();
        byte[] rand = new byte[10];
        RNG.nextBytes(rand);
        long msb = (ts << 16)
            | ((long) (rand[0] & 0x0f | 0x70) << 8)
            | (long) (rand[1] & 0xff);
        long lsb = ((long) (rand[2] & 0x3f | 0x80) << 56)
            | ((long) (rand[3] & 0xff) << 48)
            | ((long) (rand[4] & 0xff) << 40)
            | ((long) (rand[5] & 0xff) << 32)
            | ((long) (rand[6] & 0xff) << 24)
            | ((long) (rand[7] & 0xff) << 16)
            | ((long) (rand[8] & 0xff) << 8)
            | (long) (rand[9] & 0xff);
        return new UUID(msb, lsb).toString();
    }

    public static class SignedReceipt {
        public ObjectNode receipt;
        public java.util.List<Signature> signatures;
    }

    public static class Signature {
        public String alg = "EdDSA";
        public String kid;
        public String sig;
    }

    /** Build, chain, and sign a receipt for one event. */
    public static SignedReceipt signReceipt(JsonNode event, Crypto.KeyPair kp) throws IOException {
        String tenant = event.get("tenant_id").asText();
        ObjectNode prev = loadChain(tenant);

        ObjectNode receipt = MAPPER.createObjectNode();
        String receiptId = uuidv7();
        receipt.put("schema_version", "1.0");
        receipt.put("receipt_id", receiptId);
        receipt.put("tenant_id", tenant);
        receipt.put("issued_at", Instant.now().toString());
        receipt.set("event", event);

        ObjectNode integrity = MAPPER.createObjectNode();
        integrity.put("previous_receipt_hash", prev.get("previous_receipt_hash").asText());
        integrity.put("receipt_hash", "");
        integrity.put("chain_height", prev.get("chain_height").asLong() + 1);
        receipt.set("integrity", integrity);

        // hash with receipt_hash=""
        byte[] canonForHash = Canonicalize.canonicalizeBytes(receipt);
        String rhash = Crypto.sha256Hex(canonForHash);

        // set receipt_hash
        integrity.put("receipt_hash", rhash);

        // sign canonical bytes of full body
        byte[] canonForSign = Canonicalize.canonicalizeBytes(receipt);
        String sig = Crypto.sign(canonForSign, kp);

        // persist chain
        ObjectNode newState = MAPPER.createObjectNode();
        newState.put("tenant_id", tenant);
        newState.put("chain_height", prev.get("chain_height").asLong() + 1);
        newState.put("previous_receipt_hash", rhash);
        newState.put("last_receipt_id", receiptId);
        newState.put("updated_at", Instant.now().toString());
        try {
            saveChain(newState);
        } catch (IOException ignored) {}

        SignedReceipt out = new SignedReceipt();
        out.receipt = receipt;
        Signature s = new Signature();
        s.kid = kp.kid;
        s.sig = sig;
        out.signatures = java.util.List.of(s);
        return out;
    }

    public static class VerifyResult {
        public boolean valid;
        public boolean canonical_hash_matches;
        public boolean signature_valid;
        public Boolean chain_link_valid;
        public java.util.List<String> errors = new java.util.ArrayList<>();
    }

    public static VerifyResult verifyReceipt(
        SignedReceipt signed,
        Map<String, String> publicKeys,
        SignedReceipt previousReceipt
    ) {
        VerifyResult r = new VerifyResult();

        // guard: receipt / integrity block must be present and well-formed
        if (signed == null || signed.receipt == null) {
            r.errors.add("receipt missing");
            return r;
        }
        JsonNode integrityNode = signed.receipt.get("integrity");
        if (integrityNode == null || !integrityNode.isObject()) {
            r.errors.add("integrity block missing or not an object");
            return r;
        }

        // recompute receipt_hash
        ObjectNode body = signed.receipt.deepCopy();
        ((ObjectNode) body.get("integrity")).put("receipt_hash", "");
        String expected = Crypto.sha256Hex(Canonicalize.canonicalizeBytes(body));
        JsonNode receiptHashNode = integrityNode.get("receipt_hash");
        String got = receiptHashNode != null ? receiptHashNode.asText() : "";
        if (expected.equals(got)) r.canonical_hash_matches = true;
        else r.errors.add("canonical hash mismatch: expected " + expected + ", got " + got);

        // verify signatures
        byte[] canonSign = Canonicalize.canonicalizeBytes(signed.receipt);
        boolean any = false;
        if (signed.signatures == null) {
            r.errors.add("signatures missing");
            r.valid = false;
            return r;
        }
        for (Signature s : signed.signatures) {
            // Reject unknown signature algorithms before Ed25519 verification
            // (defense-in-depth against algorithm confusion). Per spec §3.
            if (s.alg == null || !s.alg.equals("EdDSA")) {
                r.errors.add("unsupported signature alg=" + s.alg + " for kid=" + s.kid);
                continue;
            }
            String pk = publicKeys.get(s.kid);
            if (pk == null) {
                r.errors.add("no public key for kid=" + s.kid);
                continue;
            }
            if (Crypto.verify(canonSign, s.sig, pk)) any = true;
            else r.errors.add("signature invalid for kid=" + s.kid);
        }
        r.signature_valid = any;

        // 3. chain link.
        //    - chain_height must be a positive integer (>= 1).
        //    - with a supplied predecessor: its receipt_hash must match this
        //      receipt's previous_receipt_hash AND chain_height must be exactly
        //      one greater.
        //    - genesis consistency (checkable without predecessor):
        //      chain_height == 1 iff previous_receipt_hash == GENESIS_HASH.
        //    A mid-chain receipt (height > 1) verified without its predecessor
        //    leaves chain_link_valid null: position not attested, but not failed.
        String thisPrev = textAt(signed.receipt, "integrity", "previous_receipt_hash");
        JsonNode heightNode = integrityNode.get("chain_height");

        if (heightNode == null || !heightNode.isIntegralNumber()) {
            r.chain_link_valid = false;
            r.errors.add("Invalid chain_height: " + (heightNode == null ? "null" : heightNode.asText()));
        } else {
            long height = heightNode.asLong();
            if (height < 1) {
                r.chain_link_valid = false;
                r.errors.add("Invalid chain_height: " + height);
            } else if (previousReceipt != null) {
                String prevHash = textAt(previousReceipt.receipt, "integrity", "receipt_hash");
                long prevHeight = longAt(previousReceipt.receipt, "integrity", "chain_height");
                boolean linkOk = prevHash.equals(thisPrev);
                boolean heightOk = height == prevHeight + 1;
                r.chain_link_valid = linkOk && heightOk;
                if (!linkOk) {
                    r.errors.add("Chain link broken: previous_receipt_hash " + thisPrev
                        + " does not match previous receipt's receipt_hash " + prevHash);
                }
                if (!heightOk) {
                    r.errors.add("Chain height not contiguous: expected " + (prevHeight + 1)
                        + ", got " + height);
                }
            } else if (height == 1 || thisPrev.equals(GENESIS_HASH)) {
                // Genesis reference and chain_height 1 must agree with each other.
                boolean genesisOk = height == 1 && thisPrev.equals(GENESIS_HASH);
                r.chain_link_valid = genesisOk;
                if (!genesisOk) {
                    r.errors.add("Genesis inconsistency: chain_height " + height
                        + " with previous_receipt_hash " + thisPrev
                        + " (chain_height 1 must reference GENESIS_HASH, and vice-versa)");
                }
            }
            // else: mid-chain (height > 1) without predecessor -> chain_link_valid
            // stays null: position not attested, but not failed.
        }

        boolean chainOk = r.chain_link_valid == null || r.chain_link_valid;
        r.valid = r.canonical_hash_matches && r.signature_valid && chainOk;
        return r;
    }

    /** Null-safe nested text lookup: returns "" if the receipt, the object,
     * or the field is missing/null rather than throwing on untrusted input. */
    private static String textAt(JsonNode receipt, String objField, String field) {
        if (receipt == null) return "";
        JsonNode obj = receipt.get(objField);
        if (obj == null) return "";
        JsonNode val = obj.get(field);
        return val != null ? val.asText() : "";
    }

    /** Null-safe nested long lookup: returns 0 if the receipt, the object, or
     * the field is missing/null rather than throwing on untrusted input. */
    private static long longAt(JsonNode receipt, String objField, String field) {
        if (receipt == null) return 0;
        JsonNode obj = receipt.get(objField);
        if (obj == null) return 0;
        JsonNode val = obj.get(field);
        return val != null ? val.asLong() : 0;
    }
}
