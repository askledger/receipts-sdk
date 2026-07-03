// Package receipts implements the AskLedger AI Decision Receipt
// protocol — wire-format compatible with the TypeScript reference SDK.
package receipts

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// Canonicalize returns the RFC 8785 canonical string form of v.
// Any value produced by this function must equal the canonical form
// produced by the TypeScript SDK byte-for-byte.
func Canonicalize(v interface{}) (string, error) {
	var buf bytes.Buffer
	if err := writeCanonical(&buf, v); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// CanonicalizeBytes returns canonical UTF-8 bytes.
func CanonicalizeBytes(v interface{}) ([]byte, error) {
	s, err := Canonicalize(v)
	if err != nil {
		return nil, err
	}
	return []byte(s), nil
}

func writeCanonical(buf *bytes.Buffer, v interface{}) error {
	switch x := v.(type) {
	case nil:
		buf.WriteString("null")
	case bool:
		if x {
			buf.WriteString("true")
		} else {
			buf.WriteString("false")
		}
	case string:
		return writeJSONString(buf, x)
	case float64:
		return writeNumber(buf, x)
	case int:
		buf.WriteString(strconv.Itoa(x))
	case int64:
		buf.WriteString(strconv.FormatInt(x, 10))
	case json.Number:
		buf.WriteString(string(x))
	case []interface{}:
		buf.WriteByte('[')
		for i, item := range x {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeCanonical(buf, item); err != nil {
				return err
			}
		}
		buf.WriteByte(']')
	case map[string]interface{}:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		// RFC 8785: sort by UTF-16 code units. Go strings are UTF-8;
		// converting to []rune then UTF-16 code units is rare in
		// practice for ASCII receipt keys. For the receipt schema
		// (ASCII-only keys), byte-wise sort equals UTF-16 sort.
		sort.Slice(keys, func(i, j int) bool {
			return compareUTF16(keys[i], keys[j]) < 0
		})
		buf.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				buf.WriteByte(',')
			}
			if err := writeJSONString(buf, k); err != nil {
				return err
			}
			buf.WriteByte(':')
			if err := writeCanonical(buf, x[k]); err != nil {
				return err
			}
		}
		buf.WriteByte('}')
	default:
		return fmt.Errorf("canonicalize: unsupported type %T", v)
	}
	return nil
}

// compareUTF16 compares two strings as if encoded in UTF-16BE, per RFC 8785.
func compareUTF16(a, b string) int {
	ar := []rune(a)
	br := []rune(b)
	au := utf16Encode(ar)
	bu := utf16Encode(br)
	for i := 0; i < len(au) && i < len(bu); i++ {
		if au[i] != bu[i] {
			if au[i] < bu[i] {
				return -1
			}
			return 1
		}
	}
	if len(au) == len(bu) {
		return 0
	}
	if len(au) < len(bu) {
		return -1
	}
	return 1
}

func utf16Encode(rs []rune) []uint16 {
	out := make([]uint16, 0, len(rs))
	for _, r := range rs {
		if r <= 0xFFFF {
			out = append(out, uint16(r))
		} else {
			r -= 0x10000
			out = append(out, uint16(0xD800+(r>>10)), uint16(0xDC00+(r&0x3FF)))
		}
	}
	return out
}

const hexDigits = "0123456789abcdef"

// writeJSONString serializes s as a JSON string literal following the
// ECMAScript JSON.stringify / RFC 8785 escaping rules: escape only ",
// \, \b \f \n \r \t and other C0 controls (< 0x20) as \u00xx (lowercase
// hex), and emit every other byte verbatim. In particular <>&/ , DEL
// (0x7F), U+2028, U+2029 and all non-ASCII stay raw UTF-8. We iterate
// over bytes; any byte >= 0x80 is part of a multi-byte UTF-8 sequence and
// is copied through unchanged, so valid UTF-8 input is preserved exactly.
func writeJSONString(buf *bytes.Buffer, s string) error {
	buf.WriteByte('"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"':
			buf.WriteString(`\"`)
		case c == '\\':
			buf.WriteString(`\\`)
		case c == '\b':
			buf.WriteString(`\b`)
		case c == '\f':
			buf.WriteString(`\f`)
		case c == '\n':
			buf.WriteString(`\n`)
		case c == '\r':
			buf.WriteString(`\r`)
		case c == '\t':
			buf.WriteString(`\t`)
		case c < 0x20:
			// Other C0 control: \u00XX with lowercase hex, 4 digits.
			buf.WriteString(`\u00`)
			buf.WriteByte(hexDigits[c>>4])
			buf.WriteByte(hexDigits[c&0xF])
		default:
			// All other bytes (printable ASCII incl. <>&/ , DEL 0x7F,
			// and every UTF-8 continuation/lead byte >= 0x80) verbatim.
			buf.WriteByte(c)
		}
	}
	buf.WriteByte('"')
	return nil
}

// writeNumber serializes f using the ECMAScript Number::toString (base 10)
// algorithm (ES2015 7.1.12.1), as required by RFC 8785 §3.2.2.3.
func writeNumber(buf *bytes.Buffer, f float64) error {
	s, err := numberToString(f)
	if err != nil {
		return err
	}
	buf.WriteString(s)
	return nil
}

// numberToString implements ECMAScript Number::toString for a finite
// IEEE-754 double, producing the JCS canonical representation.
func numberToString(f float64) (string, error) {
	// NaN / ±Inf are not representable in JSON.
	if math.IsNaN(f) {
		return "", errors.New("canonicalize: NaN not permitted")
	}
	if math.IsInf(f, 0) {
		return "", errors.New("canonicalize: Infinity not permitted")
	}
	// 0 (and -0) -> "0".
	if f == 0 {
		return "0", nil
	}
	// Negative -> "-" + format(-f).
	if f < 0 {
		rest, err := numberToString(-f)
		if err != nil {
			return "", err
		}
		return "-" + rest, nil
	}

	// Obtain the shortest round-tripping decimal in scientific form:
	//   d0[.d1d2...dm]e±EE
	// FormatFloat with 'e', prec -1 gives shortest mantissa, e.g.
	// "1e-07", "1.2345e+03", "9.007199254740992e+15", "5e-324".
	sci := strconv.FormatFloat(f, 'e', -1, 64)

	// Split on 'e'.
	ei := strings.IndexByte(sci, 'e')
	mantissa := sci[:ei]
	expPart := sci[ei+1:]

	E, err := strconv.Atoi(expPart) // handles leading '+'/'-' and zero padding
	if err != nil {
		return "", fmt.Errorf("canonicalize: bad exponent in %q: %w", sci, err)
	}

	// s = mantissa digits with the '.' removed (no leading/trailing zeros,
	// guaranteed by shortest formatting). k = number of significant digits.
	var sb strings.Builder
	for i := 0; i < len(mantissa); i++ {
		if mantissa[i] != '.' {
			sb.WriteByte(mantissa[i])
		}
	}
	digits := sb.String()
	k := len(digits)
	n := E + 1

	// Apply the ES Number::toString range rules.
	switch {
	case k <= n && n <= 21:
		// Rule 1: s followed by (n-k) zeros.
		out := make([]byte, 0, n)
		out = append(out, digits...)
		for i := 0; i < n-k; i++ {
			out = append(out, '0')
		}
		return string(out), nil
	case 0 < n && n <= 21:
		// Rule 2: first n digits, '.', remaining k-n digits.
		return digits[:n] + "." + digits[n:], nil
	case -6 < n && n <= 0:
		// Rule 3: "0.", (-n) zeros, then s.
		out := make([]byte, 0, 2+(-n)+k)
		out = append(out, '0', '.')
		for i := 0; i < -n; i++ {
			out = append(out, '0')
		}
		out = append(out, digits...)
		return string(out), nil
	default:
		// Rule 4: exponential. e = n-1.
		e := n - 1
		var expStr string
		if e >= 0 {
			expStr = "e+" + strconv.Itoa(e)
		} else {
			expStr = "e-" + strconv.Itoa(-e)
		}
		if k == 1 {
			return digits + expStr, nil
		}
		return digits[:1] + "." + digits[1:] + expStr, nil
	}
}
