package io.projectledger.receipts;

import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters;
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters;
import org.bouncycastle.crypto.signers.Ed25519Signer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Ed25519 + SHA-256 via Bouncy Castle.
 *
 * Wire shapes for KeyPair match the TypeScript reference SDK.
 */
public final class Crypto {
    private static final SecureRandom RNG = new SecureRandom();
    private static final HexFormat HEX = HexFormat.of();

    private Crypto() {}

    public static String sha256Hex(byte[] bytes) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HEX.formatHex(md.digest(bytes));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public static String sha256HexUtf8(String s) {
        return sha256Hex(s.getBytes(StandardCharsets.UTF_8));
    }

    public static final class KeyPair {
        public String kid;
        public String public_key;
        public String private_key;
        public String algorithm = "EdDSA";
        public String curve = "ed25519";
        public String created_at;

        public KeyPair() {}
    }

    public static KeyPair generateKeyPair() {
        byte[] seed = new byte[32];
        RNG.nextBytes(seed);
        Ed25519PrivateKeyParameters sk = new Ed25519PrivateKeyParameters(seed, 0);
        byte[] pub = sk.generatePublicKey().getEncoded();

        byte[] suffix = new byte[6];
        RNG.nextBytes(suffix);

        KeyPair kp = new KeyPair();
        kp.kid = "java-" + HEX.formatHex(suffix);
        kp.public_key = Base64.getEncoder().encodeToString(pub);
        kp.private_key = Base64.getEncoder().encodeToString(seed);
        kp.created_at = Instant.now().toString();
        return kp;
    }

    public static String sign(byte[] payload, KeyPair kp) {
        byte[] seed = Base64.getDecoder().decode(kp.private_key);
        if (seed.length != 32) {
            throw new IllegalArgumentException("private_key must decode to 32 bytes (Ed25519 seed)");
        }
        Ed25519PrivateKeyParameters sk = new Ed25519PrivateKeyParameters(seed, 0);
        Ed25519Signer signer = new Ed25519Signer();
        signer.init(true, sk);
        signer.update(payload, 0, payload.length);
        byte[] sig = signer.generateSignature();
        return Base64.getEncoder().encodeToString(sig);
    }

    public static boolean verify(byte[] payload, String signatureB64, String publicKeyB64) {
        try {
            byte[] sig = Base64.getDecoder().decode(signatureB64);
            byte[] pub = Base64.getDecoder().decode(publicKeyB64);
            if (sig.length != 64 || pub.length != 32) return false;
            Ed25519PublicKeyParameters pk = new Ed25519PublicKeyParameters(pub, 0);
            Ed25519Signer verifier = new Ed25519Signer();
            verifier.init(false, pk);
            verifier.update(payload, 0, payload.length);
            return verifier.verifySignature(sig);
        } catch (Exception e) {
            return false;
        }
    }
}
