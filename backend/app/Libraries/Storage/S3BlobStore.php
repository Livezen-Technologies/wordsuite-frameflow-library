<?php

namespace App\Libraries\Storage;

/**
 * Blobs in an S3-compatible bucket (Cloudflare R2, AWS S3, MinIO), path-style
 * requests signed with SigV4. Payloads of PUTs are signed; reads use
 * UNSIGNED-PAYLOAD, like the Node service.
 */
final class S3BlobStore implements BlobStoreInterface
{
    /** @var \Closure(): int unix seconds */
    private \Closure $now;

    public function __construct(
        private readonly string $endpoint,
        private readonly string $bucket,
        private readonly string $accessKeyId,
        private readonly string $secretAccessKey,
        private readonly string $region = 'auto',
        private readonly string $prefix = '',
        ?callable $now = null,
    ) {
        $this->now = $now !== null ? \Closure::fromCallable($now) : static fn (): int => time();
    }

    public function kind(): string
    {
        return 's3';
    }

    private function fullKey(string $key): string
    {
        return ($this->prefix !== '' ? rtrim($this->prefix, '/') . '/' : '') . $key;
    }

    /**
     * The URL and headers a request is sent with (also used by the tests).
     *
     * @param array<string, string> $headers
     *
     * @return array{url: string, host: string, path: string, headers: array<string, string>}
     */
    public function signRequest(string $method, string $key, array $headers = [], ?string $body = null): array
    {
        $u      = parse_url($this->endpoint);
        $scheme = $u['scheme'] ?? 'https';
        $host   = strtolower($u['host'] ?? '');
        $port   = $u['port'] ?? null;
        if ($port !== null && ! (($scheme === 'https' && $port === 443) || ($scheme === 'http' && $port === 80))) {
            $host .= ':' . $port;
        }
        $basePath = rtrim($u['path'] ?? '', '/');
        $path     = $basePath . '/' . $this->bucket . '/' . SigV4::encodeKey($this->fullKey($key));
        $amzDate  = SigV4::amzDate(($this->now)());
        $payload  = $body !== null ? hash('sha256', $body) : SigV4::UNSIGNED;
        $all      = [];
        foreach ($headers as $k => $v) {
            $all[strtolower($k)] = trim((string) $v);
        }
        $all['host']                 = $host;
        $all['x-amz-content-sha256'] = $payload;
        $all['x-amz-date']           = $amzDate;
        $sig                         = SigV4::sign($method, $path, [], $all, $payload, $this->region, 's3', $this->accessKeyId, $this->secretAccessKey);
        unset($all['host']);
        $all['authorization'] = $sig['authorization'];

        return ['url' => "{$scheme}://{$host}{$path}", 'host' => $host, 'path' => $path, 'headers' => $all];
    }

    /**
     * @return array{status: int, headers: array<string, string>, body: string}|null null for 404
     */
    private function call(string $method, string $key, array $headers = [], ?string $body = null, ?callable $sink = null): ?array
    {
        $req = $this->signRequest($method, $key, $headers, $body);
        $ch  = curl_init($req['url']);
        $out = [];
        foreach ($req['headers'] as $k => $v) {
            $out[] = "{$k}: {$v}";
        }
        $out[] = 'Expect:';
        $respHeaders = [];
        $status      = 0;
        $buffer      = '';
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $out,
            CURLOPT_NOBODY         => $method === 'HEAD',
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$respHeaders, &$status) {
                if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $m)) {
                    $status      = (int) $m[1];
                    $respHeaders = [];
                } elseif (str_contains($line, ':')) {
                    [$k, $v]                          = explode(':', $line, 2);
                    $respHeaders[strtolower(trim($k))] = trim($v);
                }

                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => static function ($ch, string $chunk) use (&$buffer, &$status, $sink) {
                if ($sink !== null && ($status === 200 || $status === 206)) {
                    $sink($chunk);
                } else {
                    $buffer .= $chunk;
                }

                return strlen($chunk);
            },
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $ok  = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($ok === false) {
            throw new \RuntimeException("Object store {$method} {$key} failed: {$err}");
        }
        if ($status === 404) {
            return null;
        }
        if ($status < 200 || $status >= 300) {
            throw new \RuntimeException("Object store {$method} {$key} failed ({$status}): " . substr($buffer, 0, 200));
        }

        return ['status' => $status, 'headers' => $respHeaders, 'body' => $buffer];
    }

    public function has(string $key): bool
    {
        return $this->call('HEAD', $key) !== null;
    }

    public function put(string $key, string $data, string $contentType = 'application/octet-stream'): void
    {
        $this->call('PUT', $key, ['content-type' => $contentType], $data);
    }

    public function get(string $key): ?string
    {
        return $this->call('GET', $key)['body'] ?? null;
    }

    public function head(string $key): ?array
    {
        $res = $this->call('HEAD', $key);

        return $res === null ? null : ['size' => (int) ($res['headers']['content-length'] ?? 0), 'etag' => $res['headers']['etag'] ?? null];
    }

    public function stream(string $key, int $start, int $end, callable $out): void
    {
        if ($this->call('GET', $key, ['range' => "bytes={$start}-{$end}"], null, $out) === null) {
            throw new \RuntimeException("Missing object {$key}");
        }
    }
}
