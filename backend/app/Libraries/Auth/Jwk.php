<?php

namespace App\Libraries\Auth;

/** JWK (RSA, EC P-256) → PEM SubjectPublicKeyInfo for openssl_verify. */
final class Jwk
{
    public static function b64url(string $s): string|false
    {
        return base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    }

    private static function len(int $n): string
    {
        if ($n < 0x80) {
            return chr($n);
        }
        $b = ltrim(pack('N', $n), "\0");

        return chr(0x80 | strlen($b)) . $b;
    }

    private static function tlv(int $tag, string $body): string
    {
        return chr($tag) . self::len(strlen($body)) . $body;
    }

    private static function uint(string $bytes): string
    {
        $bytes = ltrim($bytes, "\0");
        if ($bytes === '' || (ord($bytes[0]) & 0x80)) {
            $bytes = "\0" . $bytes;
        }

        return self::tlv(0x02, $bytes);
    }

    public static function toPem(array $jwk): ?string
    {
        $kty = $jwk['kty'] ?? null;
        if ($kty === 'RSA') {
            $n = self::b64url((string) ($jwk['n'] ?? ''));
            $e = self::b64url((string) ($jwk['e'] ?? ''));
            if (! $n || ! $e) {
                return null;
            }
            $alg  = self::tlv(0x30, hex2bin('06092a864886f70d0101010500'));
            $der  = self::tlv(0x30, $alg . self::tlv(0x03, "\0" . self::tlv(0x30, self::uint($n) . self::uint($e))));
        } elseif ($kty === 'EC' && ($jwk['crv'] ?? null) === 'P-256') {
            $x = self::b64url((string) ($jwk['x'] ?? ''));
            $y = self::b64url((string) ($jwk['y'] ?? ''));
            if (strlen((string) $x) !== 32 || strlen((string) $y) !== 32) {
                return null;
            }
            $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . "\x04" . $x . $y;
        } else {
            return null;
        }

        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    /** JOSE r||s (64 bytes) → DER ECDSA signature. */
    public static function ecdsaDer(string $sig): ?string
    {
        if (strlen($sig) !== 64) {
            return null;
        }

        return self::tlv(0x30, self::uint(substr($sig, 0, 32)) . self::uint(substr($sig, 32)));
    }
}
