//! AskLedger Receipts — wire-format compatible Rust SDK.
//!
//! The receipts produced here are byte-identical to those produced by
//! the TypeScript reference SDK, the Python SDK, and the Go SDK. The
//! cross-language conformance vectors enforce this property.

pub mod canonicalize;
pub mod crypto;
pub mod receipt;
pub mod verify;

pub use canonicalize::{canonicalize, canonicalize_bytes};
pub use crypto::{generate_keypair, sha256_hex, sign, verify as verify_sig, KeyPair};
pub use receipt::{sign_receipt, SignedReceipt, Signature, GENESIS_HASH};
pub use verify::{verify_receipt, VerifyResult};
