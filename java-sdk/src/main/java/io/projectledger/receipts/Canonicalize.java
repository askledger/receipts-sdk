package io.askledger.receipts;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * RFC 8785 JSON Canonicalization Scheme.
 *
 * Object keys sorted by UTF-16 code units. No insignificant whitespace.
 * Numbers serialized via Jackson (matches ECMAScript for the receipts
 * schema's integer-only numeric fields).
 *
 * Output is byte-identical to the TypeScript reference SDK.
 */
public final class Canonicalize {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private Canonicalize() {}

    /** Return the canonical string form of an arbitrary value. */
    public static String canonicalize(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, MAPPER.valueToTree(value));
        return sb.toString();
    }

    /** Return canonical bytes (UTF-8). */
    public static byte[] canonicalizeBytes(Object value) {
        return canonicalize(value).getBytes(StandardCharsets.UTF_8);
    }

    private static void write(StringBuilder sb, JsonNode node) {
        if (node == null || node.isNull()) {
            sb.append("null");
        } else if (node.isBoolean()) {
            sb.append(node.booleanValue() ? "true" : "false");
        } else if (node.isNumber()) {
            // For receipts (integer-only numeric fields), Jackson's
            // serialization matches ECMAScript's.
            if (node.canConvertToLong() && node.asLong() == node.asDouble()) {
                sb.append(node.asLong());
            } else {
                sb.append(node.numberValue().toString());
            }
        } else if (node.isTextual()) {
            writeString(sb, node.textValue());
        } else if (node.isArray()) {
            sb.append('[');
            for (int i = 0; i < node.size(); i++) {
                if (i > 0) sb.append(',');
                write(sb, node.get(i));
            }
            sb.append(']');
        } else if (node.isObject()) {
            List<String> keys = new ArrayList<>();
            Iterator<String> it = node.fieldNames();
            while (it.hasNext()) keys.add(it.next());
            keys.sort(Canonicalize::compareUtf16);
            sb.append('{');
            for (int i = 0; i < keys.size(); i++) {
                if (i > 0) sb.append(',');
                writeString(sb, keys.get(i));
                sb.append(':');
                write(sb, node.get(keys.get(i)));
            }
            sb.append('}');
        }
    }

    private static int compareUtf16(String a, String b) {
        int al = a.length();
        int bl = b.length();
        int n = Math.min(al, bl);
        for (int i = 0; i < n; i++) {
            char ca = a.charAt(i);
            char cb = b.charAt(i);
            if (ca != cb) return Character.compare(ca, cb);
        }
        return Integer.compare(al, bl);
    }

    private static void writeString(StringBuilder sb, String s) {
        try {
            // Use Jackson to serialize the string with RFC 8259 escapes
            sb.append(MAPPER.writeValueAsString(s));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
