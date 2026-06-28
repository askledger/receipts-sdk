package receipts

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"
)

// SHA256Hex returns the lowercase hex SHA-256 of bytes.
func SHA256Hex(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

// KeyPair mirrors the JSON shape used by the TypeScript SDK.
type KeyPair struct {
	Kid        string `json:"kid"`
	PublicKey  string `json:"public_key"`  // base64
	PrivateKey string `json:"private_key"` // base64 (seed, 32 bytes)
	Algorithm  string `json:"algorithm"`
	Curve      string `json:"curve"`
	CreatedAt  string `json:"created_at"`
}

// GenerateKeyPair creates a fresh Ed25519 keypair. The private_key field
// is the 32-byte SEED (not the 64-byte expanded private key) — this
// matches the wire format used by @noble/ed25519 v2 and the Python SDK.
func GenerateKeyPair() (KeyPair, error) {
	seed := make([]byte, ed25519.SeedSize)
	if _, err := rand.Read(seed); err != nil {
		return KeyPair{}, err
	}
	priv := ed25519.NewKeyFromSeed(seed)
	pub := priv.Public().(ed25519.PublicKey)
	suffix := make([]byte, 6)
	if _, err := rand.Read(suffix); err != nil {
		return KeyPair{}, err
	}
	return KeyPair{
		Kid:        "go-" + hex.EncodeToString(suffix),
		PublicKey:  base64.StdEncoding.EncodeToString(pub),
		PrivateKey: base64.StdEncoding.EncodeToString(seed),
		Algorithm:  "EdDSA",
		Curve:      "ed25519",
		CreatedAt:  time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
	}, nil
}

// Sign signs payload with the keypair's private key (seed).
func Sign(payload []byte, kp KeyPair) (string, error) {
	seed, err := base64.StdEncoding.DecodeString(kp.PrivateKey)
	if err != nil {
		return "", err
	}
	if len(seed) != ed25519.SeedSize {
		return "", errors.New("private_key must decode to 32 bytes (Ed25519 seed)")
	}
	priv := ed25519.NewKeyFromSeed(seed)
	sig := ed25519.Sign(priv, payload)
	return base64.StdEncoding.EncodeToString(sig), nil
}

// Verify returns true iff the signature is valid.
func Verify(payload []byte, signatureB64 string, publicKeyB64 string) bool {
	sig, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil || len(sig) != ed25519.SignatureSize {
		return false
	}
	pub, err := base64.StdEncoding.DecodeString(publicKeyB64)
	if err != nil || len(pub) != ed25519.PublicKeySize {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(pub), payload, sig)
}
