/**
 * HSM / KMS signing providers.
 *
 * Each provider implements the SigningProvider interface so the
 * receipts SDK does not need to change to swap signing backends.
 *
 * All providers also support `.asFipsProvider()` which wraps them with
 * a FipsSigningProvider when the underlying configuration meets the
 * FIPS validation requirement (KMS-FIPS endpoint, Managed HSM tier,
 * HSM protection level, vendor-asserted PKCS#11 module).
 */

export {
  AwsKmsSigningProvider,
  type AwsKmsSigningProviderOptions,
  type AwsKmsClientLike,
} from "./aws-kms.js";
export {
  AzureKeyVaultSigningProvider,
  type AzureKeyVaultOptions,
} from "./azure-key-vault.js";
export {
  GcpKmsSigningProvider,
  type GcpKmsSigningProviderOptions,
  type GcpKmsClientLike,
} from "./gcp-kms.js";
export {
  Pkcs11SigningProvider,
  type Pkcs11SigningProviderOptions,
  type Pkcs11ClientLike,
} from "./pkcs11.js";
