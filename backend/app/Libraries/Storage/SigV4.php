<?php

namespace App\Libraries\Storage;

/**
 * AWS Signature Version 4 (header auth), as S3, Cloudflare R2 and MinIO verify it.
 * Port of the signer in apps/api/src/storage.js, split so the core can be
 * checked against the AWS documentation's example vectors.
 */
final class SigV4
{
    public const UNSIGNED = 'UNSIGNED-PAYLOAD';

    /**
     * Signs a request. `$headers` must include `host` and `x-amz-date`
     * (YYYYMMDD'T'HHMMSS'Z'); names are matched case-insensitively.
     *
     * @param array<string, string> $headers
     * @param array<string, string> $query  decoded name => value
     *
     * @return array{authorization: string, signature: string, canonical: string, stringToSign: string, signedHeaders: string}
     */
    public static function sign(
        string $method,
        string $canonicalPath,
        array $query,
        array $headers,
        string $payloadHash,
        string $region,
        string $service,
        string $accessKeyId,
        string $secretAccessKey,
    ): array {
        $lower = [];
        foreach ($headers as $k => $v) {
            $lower[strtolower($k)] = preg_replace('/\s+/', ' ', trim((string) $v));
        }
        ksort($lower, SORT_STRING);
        $names   = array_keys($lower);
        $amzDate = $lower['x-amz-date'] ?? throw new \InvalidArgumentException('x-amz-date header required');
        $day     = substr($amzDate, 0, 8);

        $q = [];
        foreach ($query as $k => $v) {
            $q[self::encode((string) $k)] = self::encode((string) $v);
        }
        ksort($q, SORT_STRING);
        $qs = implode('&', array_map(static fn ($k, $v) => "{$k}={$v}", array_keys($q), $q));

        $canonical = implode("\n", [
            $method,
            $canonicalPath,
            $qs,
            implode('', array_map(static fn ($n) => "{$n}:{$lower[$n]}\n", $names)),
            implode(';', $names),
            $payloadHash,
        ]);
        $scope        = "{$day}/{$region}/{$service}/aws4_request";
        $stringToSign = implode("\n", ['AWS4-HMAC-SHA256', $amzDate, $scope, hash('sha256', $canonical)]);
        $kDate        = hash_hmac('sha256', $day, 'AWS4' . $secretAccessKey, true);
        $kRegion      = hash_hmac('sha256', $region, $kDate, true);
        $kService     = hash_hmac('sha256', $service, $kRegion, true);
        $kSigning     = hash_hmac('sha256', 'aws4_request', $kService, true);
        $signature    = hash_hmac('sha256', $stringToSign, $kSigning);
        $signed       = implode(';', $names);

        return [
            'authorization' => "AWS4-HMAC-SHA256 Credential={$accessKeyId}/{$scope}, SignedHeaders={$signed}, Signature={$signature}",
            'signature'     => $signature,
            'canonical'     => $canonical,
            'stringToSign'  => $stringToSign,
            'signedHeaders' => $signed,
        ];
    }

    /** RFC 3986 encoding (encodeURIComponent plus !'()*). */
    public static function encode(string $s): string
    {
        return str_replace('%7E', '~', rawurlencode($s));
    }

    /** Encodes each segment of an object key, keeping the slashes. */
    public static function encodeKey(string $key): string
    {
        return implode('/', array_map([self::class, 'encode'], explode('/', $key)));
    }

    public static function amzDate(int $unix): string
    {
        return gmdate('Ymd\THis\Z', $unix);
    }
}
