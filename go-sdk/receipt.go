package receipts

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// GenesisHash is the previous_receipt_hash placeholder for the first
// receipt in a tenant's chain.
const GenesisHash = "0000000000000000000000000000000000000000000000000000000000000000"

// SignedReceipt is the on-the-wire envelope.
type SignedReceipt struct {
	Receipt    map[string]interface{} `json:"receipt"`
	Signatures []Signature            `json:"signatures"`
}

// Signature is a single Ed25519 detached signature over the canonical
// receipt body.
type Signature struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
	Sig string `json:"sig"`
}

func safeTenant(t string) string {
	var sb strings.Builder
	for _, r := range t {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' {
			sb.WriteRune(r)
		} else {
			sb.WriteRune('_')
		}
	}
	return sb.String()
}

func chainPath(tenant string) string {
	return filepath.Join(".ledger", "chains", safeTenant(tenant)+".json")
}

type chainState struct {
	TenantID             string `json:"tenant_id"`
	ChainHeight          int64  `json:"chain_height"`
	PreviousReceiptHash  string `json:"previous_receipt_hash"`
	LastReceiptID        string `json:"last_receipt_id,omitempty"`
	UpdatedAt            string `json:"updated_at"`
}

func loadChainState(tenant string) chainState {
	p := chainPath(tenant)
	b, err := os.ReadFile(p)
	if err != nil {
		return chainState{
			TenantID:            tenant,
			ChainHeight:         0,
			PreviousReceiptHash: GenesisHash,
			UpdatedAt:           time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		}
	}
	var s chainState
	_ = json.Unmarshal(b, &s)
	return s
}

func saveChainState(s chainState) error {
	if err := os.MkdirAll(filepath.Dir(chainPath(s.TenantID)), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(chainPath(s.TenantID), b, 0o644)
}

// uuidv7 produces a draft-ietf-uuidrev compatible UUIDv7 string.
func uuidv7() string {
	ts := time.Now().UnixMilli()
	var b [16]byte
	binary.BigEndian.PutUint64(b[0:8], uint64(ts)<<16)
	if _, err := rand.Read(b[6:]); err != nil {
		panic(err)
	}
	// version 7
	b[6] = (b[6] & 0x0f) | 0x70
	// variant
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func deepCopyMap(in map[string]interface{}) map[string]interface{} {
	b, _ := json.Marshal(in)
	var out map[string]interface{}
	_ = json.Unmarshal(b, &out)
	return out
}

// SignReceipt builds, chains, and signs a receipt for one event.
func SignReceipt(event map[string]interface{}, kp KeyPair) (SignedReceipt, error) {
	tenantID, _ := event["tenant_id"].(string)
	if tenantID == "" {
		return SignedReceipt{}, fmt.Errorf("event.tenant_id required")
	}
	prev := loadChainState(tenantID)
	receipt := map[string]interface{}{
		"schema_version": "1.0",
		"receipt_id":     uuidv7(),
		"tenant_id":      tenantID,
		"issued_at":      time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
		"event":          event,
		"integrity": map[string]interface{}{
			"previous_receipt_hash": prev.PreviousReceiptHash,
			"receipt_hash":          "",
			"chain_height":          float64(prev.ChainHeight + 1),
		},
	}

	// 1. hash with receipt_hash=""
	canonForHash, err := CanonicalizeBytes(receipt)
	if err != nil {
		return SignedReceipt{}, err
	}
	rhHex := SHA256Hex(canonForHash)

	// 2. populate receipt_hash
	receipt["integrity"].(map[string]interface{})["receipt_hash"] = rhHex

	// 3. canonical bytes of full body, sign
	canonForSign, err := CanonicalizeBytes(receipt)
	if err != nil {
		return SignedReceipt{}, err
	}
	sig, err := Sign(canonForSign, kp)
	if err != nil {
		return SignedReceipt{}, err
	}

	// 4. persist chain
	_ = saveChainState(chainState{
		TenantID:            tenantID,
		ChainHeight:         prev.ChainHeight + 1,
		PreviousReceiptHash: rhHex,
		LastReceiptID:       receipt["receipt_id"].(string),
		UpdatedAt:           time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
	})

	return SignedReceipt{
		Receipt:    receipt,
		Signatures: []Signature{{Alg: "EdDSA", Kid: kp.Kid, Sig: sig}},
	}, nil
}

// VerifyResult is the verifier's structured output.
type VerifyResult struct {
	Valid                 bool     `json:"valid"`
	CanonicalHashMatches  bool     `json:"canonical_hash_matches"`
	SignatureValid        bool     `json:"signature_valid"`
	ChainLinkValid        *bool    `json:"chain_link_valid,omitempty"`
	Errors                []string `json:"errors"`
}

// VerifyReceipt verifies a SignedReceipt independently.
func VerifyReceipt(
	signed SignedReceipt,
	publicKeys map[string]string,
	previousReceipt *SignedReceipt,
) VerifyResult {
	result := VerifyResult{}

	// 1. recompute receipt_hash
	if signed.Receipt == nil {
		result.Errors = append(result.Errors, "receipt missing")
		return result
	}
	body := deepCopyMap(signed.Receipt)
	integrity, ok := body["integrity"].(map[string]interface{})
	if !ok {
		result.Errors = append(result.Errors, "integrity block missing or not an object")
		return result
	}
	integrity["receipt_hash"] = ""
	canon, err := CanonicalizeBytes(body)
	if err != nil {
		result.Errors = append(result.Errors, "canonicalize failed: "+err.Error())
		return result
	}
	expected := SHA256Hex(canon)
	var got string
	if si, ok := signed.Receipt["integrity"].(map[string]interface{}); ok {
		got, _ = si["receipt_hash"].(string)
	}
	if expected == got {
		result.CanonicalHashMatches = true
	} else {
		result.Errors = append(result.Errors, fmt.Sprintf("canonical hash mismatch: expected %s, got %s", expected, got))
	}

	// 2. verify signature(s)
	canonSign, _ := CanonicalizeBytes(signed.Receipt)
	any := false
	for _, sig := range signed.Signatures {
		// Defense-in-depth (spec §3): reject any signature whose algorithm
		// is not exactly "EdDSA" before running Ed25519 verification, to
		// prevent algorithm-confusion. This does not change the signed bytes.
		if sig.Alg != "EdDSA" {
			result.Errors = append(result.Errors, "unsupported signature alg="+sig.Alg+" for kid="+sig.Kid)
			continue
		}
		pk, ok := publicKeys[sig.Kid]
		if !ok {
			result.Errors = append(result.Errors, "no public key for kid="+sig.Kid)
			continue
		}
		if Verify(canonSign, sig.Sig, pk) {
			any = true
		} else {
			result.Errors = append(result.Errors, "signature invalid for kid="+sig.Kid)
		}
	}
	result.SignatureValid = any

	// 3. optional chain link
	if previousReceipt != nil {
		var prevHash, thisPrev string
		if pi, ok := previousReceipt.Receipt["integrity"].(map[string]interface{}); ok {
			prevHash, _ = pi["receipt_hash"].(string)
		}
		if ti, ok := signed.Receipt["integrity"].(map[string]interface{}); ok {
			thisPrev, _ = ti["previous_receipt_hash"].(string)
		}
		ok := prevHash == thisPrev
		result.ChainLinkValid = &ok
		if !ok {
			result.Errors = append(result.Errors, "chain link broken")
		}
	}

	chainOK := result.ChainLinkValid == nil || *result.ChainLinkValid
	result.Valid = result.CanonicalHashMatches && result.SignatureValid && chainOK
	return result
}

// keep an unused hex import in case future code paths need it
var _ = hex.EncodeToString
