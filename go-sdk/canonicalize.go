// Package receipts implements the Project Ledger AI Decision Receipt
// protocol — wire-format compatible with the TypeScript reference SDK.
package receipts

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
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

func writeJSONString(buf *bytes.Buffer, s string) error {
	b, err := json.Marshal(s)
	if err != nil {
		return err
	}
	buf.Write(b)
	return nil
}

func writeNumber(buf *bytes.Buffer, f float64) error {
	if f != f {
		return errors.New("canonicalize: NaN not permitted")
	}
	if f == float64(int64(f)) && f < 1e17 && f > -1e17 {
		buf.WriteString(strconv.FormatInt(int64(f), 10))
		return nil
	}
	buf.WriteString(strconv.FormatFloat(f, 'g', -1, 64))
	return nil
}
