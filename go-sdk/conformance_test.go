package receipts

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type canonVector struct {
	Name     string      `json:"name"`
	Input    interface{} `json:"input"`
	Expected string      `json:"expected"`
}
type shaVector struct {
	Name        string `json:"name"`
	Input       string `json:"input"`
	ExpectedHex string `json:"expected_hex"`
}

type canonFile struct {
	Vectors []canonVector `json:"vectors"`
}
type shaFile struct {
	Vectors []shaVector `json:"vectors"`
}

func loadFile(t *testing.T, name string, into interface{}) {
	t.Helper()
	p := filepath.Join("..", "test", "conformance", name)
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read %s: %v", p, err)
	}
	if err := json.Unmarshal(b, into); err != nil {
		t.Fatalf("parse %s: %v", p, err)
	}
}

func TestCanonicalizeConformance(t *testing.T) {
	var f canonFile
	loadFile(t, "canonicalize.json", &f)
	for _, v := range f.Vectors {
		t.Run(v.Name, func(t *testing.T) {
			got, err := Canonicalize(v.Input)
			if err != nil {
				t.Fatalf("canonicalize: %v", err)
			}
			if got != v.Expected {
				t.Fatalf("vector %q: got %q want %q", v.Name, got, v.Expected)
			}
		})
	}
}

func TestSHA256Conformance(t *testing.T) {
	var f shaFile
	loadFile(t, "sha256.json", &f)
	for _, v := range f.Vectors {
		t.Run(v.Name, func(t *testing.T) {
			h := sha256.Sum256([]byte(v.Input))
			got := hex.EncodeToString(h[:])
			if got != v.ExpectedHex {
				t.Fatalf("vector %q: got %s want %s", v.Name, got, v.ExpectedHex)
			}
		})
	}
}

func TestSignVerifyRoundtrip(t *testing.T) {
	kp, err := GenerateKeyPair()
	if err != nil {
		t.Fatal(err)
	}
	event := map[string]interface{}{
		"schema_version":  "1.0",
		"tenant_id":       "go-test",
		"event_type":      "ide.completion",
		"source_system":  "go-runner",
		"event_id":        "evt-go-001",
		"captured_at":     "2026-05-13T10:00:00.000Z",
		"subject": map[string]interface{}{
			"ai_vendor": "anthropic",
			"ai_model":  "claude-sonnet-4-6",
		},
		"payload": map[string]interface{}{
			"input_classification":  "internal",
			"output_classification": "internal",
		},
	}
	r, err := SignReceipt(event, kp)
	if err != nil {
		t.Fatal(err)
	}
	res := VerifyReceipt(r, map[string]string{kp.Kid: kp.PublicKey}, nil)
	if !res.Valid {
		t.Fatalf("verify failed: %#v", res)
	}
}
