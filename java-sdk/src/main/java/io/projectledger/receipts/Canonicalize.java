package io.projectledger.receipts;

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
            // RFC 8785 §3.2.2.3: numbers use the ECMAScript Number::toString
            // (base 10) algorithm on the IEEE-754 double value.
            sb.append(numberToString(node.asDouble()));
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

    /**
     * Escape a JSON string exactly as ECMAScript JSON.stringify / RFC 8785:
     * escape only ", \\, and C0 controls (< 0x20) with the short forms
     * \b \f \n \r \t or a 6-char backslash-u escape (lowercase hex).
     * Everything else — including
     * < > & /, DEL 0x7F, U+2028, U+2029 and all non-ASCII — is emitted raw.
     */
    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        int len = s.length();
        for (int i = 0; i < len; i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        sb.append("\\u");
                        String hex = Integer.toHexString(c);
                        for (int p = hex.length(); p < 4; p++) sb.append('0');
                        sb.append(hex);
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }

    /**
     * ECMAScript Number::toString (base 10), RFC 8785 §3.2.2.3. Ported from
     * the cyberphone/json-canonicalization NumberToJSON algorithm: derive the
     * shortest round-tripping (digits, exponent) pair from Double.toString and
     * apply the ES2015 7.1.12.1 range rules (steps 6–10).
     */
    static String numberToString(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            throw new IllegalArgumentException("Non-finite number not representable in JCS: " + value);
        }
        // -0 and +0 both format as "0".
        if (value == 0.0) {
            return "0";
        }
        StringBuilder result = new StringBuilder();
        if (value < 0) {
            result.append('-');
            value = -value;
        }

        // Derive the shortest round-tripping decimal as a significant-digit
        // string `s` and integer `n` such that the value equals
        // s * 10^(n - k), where k = s.length(). We find the fewest significant
        // digits (1..17) whose scientific formatting parses back to the exact
        // same double. This is guaranteed shortest and round-tripping — more
        // robust than Double.toString, which is not always shortest (e.g. the
        // min subnormal prints as "4.9E-324" though "5E-324" round-trips).
        String sci = null;
        for (int prec = 0; prec <= 16; prec++) {
            String cand = String.format(java.util.Locale.ROOT, "%." + prec + "e", value);
            if (Double.parseDouble(cand) == value) {
                sci = cand;
                break;
            }
        }
        if (sci == null) {
            // Fallback (should not happen): 17 significant digits always suffice.
            sci = String.format(java.util.Locale.ROOT, "%.16e", value);
        }

        // sci looks like "d.dddde[+-]XX" (or "de[+-]XX" for prec 0). Split it.
        int eIdx = sci.indexOf('e');
        String mantissa = sci.substring(0, eIdx);
        int sciExp = Integer.parseInt(sci.substring(eIdx + 1));
        // mantissa = d0[.d1d2...]; combine into a single digit string.
        String digits = mantissa.replace(".", "");
        // Value == digits * 10^(sciExp - (digits.length() - 1)).
        // So with s == digits and k == digits.length(), n == sciExp + 1.
        // Strip trailing zeros from `digits` (keep >= 1 digit); n stays the same
        // because dropping low-order zeros only removes least-significant digits.
        int end = digits.length();
        while (end > 1 && digits.charAt(end - 1) == '0') {
            end--;
        }
        String s = digits.substring(0, end);

        int k = s.length();
        int n = sciExp + 1; // value == s * 10^(n - k)

        if (k <= n && n <= 21) {
            // Rule 6: digits followed by (n - k) zeros.
            result.append(s);
            for (int i = 0; i < n - k; i++) result.append('0');
        } else if (0 < n && n <= 21) {
            // Rule 7: first n digits, ".", remaining k - n digits.
            result.append(s, 0, n).append('.').append(s, n, k);
        } else if (-6 < n && n <= 0) {
            // Rule 8: "0.", (-n) zeros, then s.
            result.append("0.");
            for (int i = 0; i < -n; i++) result.append('0');
            result.append(s);
        } else {
            // Rules 9/10: exponential.
            int e = n - 1;
            if (k == 1) {
                result.append(s);
            } else {
                result.append(s.charAt(0)).append('.').append(s, 1, k);
            }
            result.append('e');
            if (e >= 0) {
                result.append('+').append(e);
            } else {
                result.append('-').append(-e);
            }
        }
        return result.toString();
    }
}
