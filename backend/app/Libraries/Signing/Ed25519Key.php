<?php

namespace App\Libraries\Signing;

/**
 * The catalog signing key (Ed25519). Reads the PEM PKCS#8 private key the
 * Node service uses (LIBRARY_SIGNING_KEY), signs with libsodium and serves
 * the public half as SPKI PEM, byte-for-byte what Node's
 * crypto.createPublicKey(...).export({ type: "spki", format: "pem" }) writes.
 */
final class Ed25519Key
{
    /** DER prefixes: PKCS#8 PrivateKeyInfo and SubjectPublicKeyInfo for OID 1.3.101.112. */
    private const PKCS8_PREFIX = '302e020100300506032b657004220420';
    private const SPKI_PREFIX  = '302a300506032b6570032100';

    private function __construct(private readonly string $secretKey, private readonly string $publicKey)
    {
    }

    public static function fromSeed(string $seed): self
    {
        if (strlen($seed) !== SODIUM_CRYPTO_SIGN_SEEDBYTES) {
            throw new \InvalidArgumentException('Ed25519 seed must be 32 bytes');
        }
        $kp = sodium_crypto_sign_seed_keypair($seed);

        return new self(sodium_crypto_sign_secretkey($kp), sodium_crypto_sign_publickey($kp));
    }

    /** From "-----BEGIN PRIVATE KEY-----" PKCS#8 PEM (literal "\n" escapes allowed, as env files often hold them). */
    public static function fromPem(string $pem): self
    {
        $pem = str_replace(['\\n', "\r"], ["\n", ''], trim($pem));
        if (! preg_match('/-----BEGIN PRIVATE KEY-----(.+?)-----END PRIVATE KEY-----/s', $pem, $m)) {
            throw new \InvalidArgumentException('LIBRARY_SIGNING_KEY must be a PEM PKCS#8 Ed25519 private key');
        }
        $der = base64_decode(preg_replace('/\s+/', '', $m[1]), true);
        if ($der === false || strlen($der) < 48 || ! str_contains(bin2hex($der), '06032b6570')) {
            throw new \InvalidArgumentException('LIBRARY_SIGNING_KEY is not an Ed25519 key');
        }
        // The seed is the trailing OCTET STRING (also with the optional public key
        // attribute in PKCS#8 v2, the 32-byte seed sits right after 0420).
        if (str_starts_with(bin2hex($der), self::PKCS8_PREFIX)) {
            return self::fromSeed(substr($der, 16, 32));
        }

        return self::fromSeed(substr($der, -32));
    }

    public static function generate(): self
    {
        return self::fromSeed(random_bytes(SODIUM_CRYPTO_SIGN_SEEDBYTES));
    }

    public function seed(): string
    {
        return substr($this->secretKey, 0, 32);
    }

    public function privatePem(): string
    {
        return self::pem('PRIVATE KEY', hex2bin(self::PKCS8_PREFIX) . $this->seed());
    }

    public function publicPem(): string
    {
        return self::pem('PUBLIC KEY', hex2bin(self::SPKI_PREFIX) . $this->publicKey);
    }

    public function publicKey(): string
    {
        return $this->publicKey;
    }

    /** Detached signature, base64 (what catalog.json.sig and package signatures hold). */
    public function sign(string $data): string
    {
        return base64_encode(sodium_crypto_sign_detached($data, $this->secretKey));
    }

    public function verify(string $data, mixed $signatureB64): bool
    {
        return self::verifyWith($this->publicKey, $data, $signatureB64);
    }

    public static function verifyWith(string $publicKey, string $data, mixed $signatureB64): bool
    {
        if (! is_string($signatureB64)) {
            return false;
        }
        $sig = base64_decode(trim($signatureB64), true);
        if ($sig === false || strlen($sig) !== SODIUM_CRYPTO_SIGN_BYTES) {
            return false;
        }
        try {
            return sodium_crypto_sign_verify_detached($sig, $data, $publicKey);
        } catch (\SodiumException) {
            return false;
        }
    }

    /** Raw 32-byte public key from SPKI PEM. */
    public static function publicKeyFromPem(string $pem): string
    {
        $der = base64_decode(preg_replace('/-----[^-]+-----|\s+/', '', $pem), true);
        if ($der === false || strlen($der) !== 44) {
            throw new \InvalidArgumentException('Not an Ed25519 SPKI public key');
        }

        return substr($der, 12);
    }

    private static function pem(string $label, string $der): string
    {
        return "-----BEGIN {$label}-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END {$label}-----\n";
    }
}
