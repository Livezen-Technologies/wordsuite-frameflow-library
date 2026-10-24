<?php

namespace App\Libraries\Webhooks;

/**
 * SSRF guard for webhook targets: http(s) only, and every address the host
 * resolves to must be public (no loopback, private, link-local, CGNAT,
 * multicast or reserved ranges) unless private targets are allowed
 * (LIBRARY_WEBHOOKS_ALLOW_PRIVATE=1). The checked address is pinned for the
 * request (CURLOPT_RESOLVE), so a DNS answer can't change between check and send.
 */
final class UrlGuard
{
    /** Blocked IPv4 ranges besides what FILTER_FLAG_NO_PRIV_RANGE / NO_RES_RANGE cover. */
    private const V4_BLOCKED = ['0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4'];

    /** Syntax only (stored webhooks): an absolute http(s) URL with a host and no credentials. */
    public static function wellFormed(mixed $url): bool
    {
        if (! is_string($url) || strlen($url) > 2048 || preg_match('/\s/', $url)) {
            return false;
        }
        $u = parse_url($url);

        return $u !== false && in_array(strtolower($u['scheme'] ?? ''), ['http', 'https'], true) && ($u['host'] ?? '') !== '' && ! isset($u['user']) && ! isset($u['pass']);
    }

    /**
     * @param callable(string): list<string>|null $resolve host → addresses (tests)
     *
     * @return array{host: string, port: int, ip: string}
     *
     * @throws \RuntimeException when the URL may not be called
     */
    public static function check(string $url, bool $allowPrivate, ?callable $resolve = null): array
    {
        if (! self::wellFormed($url)) {
            throw new \RuntimeException('Webhook URLs must be absolute http(s) URLs.');
        }
        $u    = parse_url($url);
        $host = strtolower(trim($u['host'], '[]'));
        $port = (int) ($u['port'] ?? (strtolower($u['scheme']) === 'https' ? 443 : 80));
        $ips  = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : ($resolve ?? self::resolve(...))($host);
        if ($ips === []) {
            throw new \RuntimeException("Can't resolve {$host}.");
        }
        foreach ($ips as $ip) {
            if (! $allowPrivate && ! self::isPublic($ip)) {
                throw new \RuntimeException("Refused: {$host} resolves to a private or reserved address ({$ip}).");
            }
        }

        return ['host' => $host, 'port' => $port, 'ip' => $ips[0]];
    }

    /** @return list<string> */
    public static function resolve(string $host): array
    {
        $ips = [];
        foreach (@dns_get_record($host, DNS_A | DNS_AAAA) ?: [] as $r) {
            $ips[] = $r['ip'] ?? $r['ipv6'] ?? null;
        }
        $ips = array_values(array_filter($ips));
        if ($ips === []) {
            $ips = @gethostbynamel($host) ?: [];
        }

        return array_values(array_unique($ips));
    }

    public static function isPublic(string $ip): bool
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            foreach (self::V4_BLOCKED as $cidr) {
                if (self::inV4($ip, $cidr)) {
                    return false;
                }
            }

            return true;
        }
        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            return false;
        }
        $bin = inet_pton($ip);
        // IPv4-mapped / -compatible (::ffff:a.b.c.d, ::a.b.c.d) and NAT64 (64:ff9b::/96): check the embedded IPv4.
        if (str_starts_with($bin, str_repeat("\0", 10) . "\xff\xff") || str_starts_with($bin, str_repeat("\0", 12)) || str_starts_with($bin, "\x00\x64\xff\x9b" . str_repeat("\0", 8))) {
            return self::isPublic(inet_ntop(substr($bin, 12)));
        }
        $first = ord($bin[0]);
        $second = ord($bin[1]);

        return ! ($bin === inet_pton('::1')
            || ($first & 0xFE) === 0xFC              // fc00::/7 unique local
            || ($first === 0xFE && ($second & 0xC0) === 0x80) // fe80::/10 link-local
            || ($first === 0xFE && ($second & 0xC0) === 0xC0) // fec0::/10 site-local
            || $first === 0xFF                       // multicast
            || str_starts_with($bin, "\x20\x01\x0d\xb8")); // 2001:db8::/32 documentation
    }

    private static function inV4(string $ip, string $cidr): bool
    {
        [$net, $bits] = explode('/', $cidr);
        $mask         = $bits === '0' ? 0 : (~0 << (32 - (int) $bits)) & 0xFFFFFFFF;

        return (ip2long($ip) & $mask) === (ip2long($net) & $mask);
    }
}
