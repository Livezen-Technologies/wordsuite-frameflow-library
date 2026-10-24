<?php

namespace App\Libraries\Webhooks;

/**
 * Sends one signed webhook request: POST JSON, 10 s timeout, no redirects,
 * the SSRF guard's address pinned. Returns ['status_code' => ?int, 'error' => ?string, 'permanent'?: true].
 */
final class WebhookSender
{
    public const TIMEOUT_S = 10;

    public function __construct(private readonly bool $allowPrivate = false)
    {
    }

    public static function signature(string $secret, string $body): string
    {
        return 'sha256=' . hash_hmac('sha256', $body, $secret);
    }

    /** @param array<string, string> $headers */
    public function __invoke(string $url, string $body, array $headers): array
    {
        try {
            $target = UrlGuard::check($url, $this->allowPrivate);
        } catch (\RuntimeException $e) {
            // A refused or malformed target won't get better on retry.
            return ['status_code' => null, 'error' => $e->getMessage(), 'permanent' => true];
        }
        $ip = str_contains($target['ip'], ':') ? "[{$target['ip']}]" : $target['ip'];
        $ch = curl_init($url);
        $lines = ['Content-Type: application/json', 'User-Agent: FrameFlow-Library-Webhooks/1'];
        foreach ($headers as $k => $v) {
            $lines[] = "{$k}: {$v}";
        }
        curl_setopt_array($ch, [
            CURLOPT_POST             => true,
            CURLOPT_POSTFIELDS       => $body,
            CURLOPT_HTTPHEADER       => $lines,
            CURLOPT_RETURNTRANSFER   => true,
            CURLOPT_FOLLOWLOCATION   => false,
            CURLOPT_TIMEOUT          => self::TIMEOUT_S,
            CURLOPT_CONNECTTIMEOUT   => self::TIMEOUT_S,
            CURLOPT_PROTOCOLS        => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_RESOLVE          => ["{$target['host']}:{$target['port']}:{$ip}"],
            CURLOPT_NOPROXY          => '*',
        ]);
        $out    = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error  = $out === false ? curl_error($ch) : null;
        curl_close($ch);

        return ['status_code' => $status > 0 ? $status : null, 'error' => $error ?: ($status >= 200 && $status < 300 ? null : "HTTP {$status}")];
    }
}
