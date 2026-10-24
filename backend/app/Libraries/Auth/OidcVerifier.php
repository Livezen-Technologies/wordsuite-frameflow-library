<?php

namespace App\Libraries\Auth;

/**
 * OneAuth / Worksuite Cloud access tokens (blueprint §7.1): verifies a JWT
 * against the issuer's JWKS (RS256, ES256 or EdDSA), its issuer, audience
 * and expiry, and maps claims to a library principal
 * `{ id, plan, org_id, device_id, role, scopes }`. Port of apps/api/src/auth.js.
 */
final class OidcVerifier
{
    private const PLANS = ['free', 'pro', 'business', 'enterprise'];

    /** Library admin roles OIDC can grant, highest first. */
    private const ROLES = ['super_admin', 'library_manager', 'content_editor', 'reviewer', 'analyst'];

    private string $base;

    /** @var \Closure(string): ?array fetches JSON */
    private \Closure $fetch;

    public function __construct(
        string $issuer,
        private readonly string $audience = 'frameflow-library',
        private readonly string $roleClaim = 'library_roles',
        ?callable $fetch = null,
        private readonly int $cacheTtl = 600,
    ) {
        $this->base  = rtrim($issuer, '/');
        $this->fetch = $fetch !== null ? \Closure::fromCallable($fetch) : self::httpJson(...);
    }

    private static function httpJson(string $url): ?array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_FOLLOWLOCATION => true, CURLOPT_HTTPHEADER => ['Accept: application/json']]);
        $body   = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (! is_string($body) || $status < 200 || $status >= 300) {
            return null;
        }
        $j = json_decode($body, true);

        return is_array($j) ? $j : null;
    }

    /** @return list<array> */
    private function keys(bool $force = false): array
    {
        $cacheKey = 'oidc_jwks_' . substr(hash('sha256', $this->base), 0, 16);
        $cache    = function_exists('cache') ? cache() : null;
        if (! $force && $cache !== null && is_array($hit = $cache->get($cacheKey))) {
            return $hit;
        }
        $conf = ($this->fetch)("{$this->base}/.well-known/openid-configuration");
        $jwks = is_string($conf['jwks_uri'] ?? null) ? ($this->fetch)($conf['jwks_uri']) : null;
        if ($jwks === null) {
            throw new \RuntimeException('JWKS fetch failed');
        }
        $keys = array_values(array_filter($jwks['keys'] ?? [], 'is_array'));
        $cache?->save($cacheKey, $keys, $this->cacheTtl);

        return $keys;
    }

    private static function find(array $keys, mixed $kid): ?array
    {
        foreach ($keys as $k) {
            if (($k['kid'] ?? null) === $kid) {
                return $k;
            }
        }

        return null;
    }

    /** The verified claims, or null when the token isn't valid. */
    public function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        $header = json_decode((string) Jwk::b64url($parts[0]), true);
        $claims = json_decode((string) Jwk::b64url($parts[1]), true);
        if (! is_array($header) || ! is_array($claims)) {
            return null;
        }
        $alg = $header['alg'] ?? null;
        if (! in_array($alg, ['RS256', 'ES256', 'EdDSA'], true)) {
            return null;
        }
        try {
            // Unknown kid: the issuer may have rotated keys.
            $jwk = self::find($this->keys(), $header['kid'] ?? null) ?? self::find($this->keys(true), $header['kid'] ?? null);
        } catch (\Throwable) {
            return null;
        }
        if ($jwk === null) {
            return null;
        }
        $data = "{$parts[0]}.{$parts[1]}";
        $sig  = Jwk::b64url($parts[2]);
        if ($sig === false) {
            return null;
        }
        $ok = false;
        if ($alg === 'EdDSA') {
            $x  = Jwk::b64url((string) ($jwk['x'] ?? ''));
            $ok = ($jwk['crv'] ?? null) === 'Ed25519' && is_string($x) && strlen($x) === 32 && strlen($sig) === 64 && sodium_crypto_sign_verify_detached($sig, $data, $x);
        } else {
            $pem = Jwk::toPem($jwk);
            if ($alg === 'ES256') {
                $sig = Jwk::ecdsaDer($sig);
            }
            $ok = $pem !== null && $sig !== null && openssl_verify($data, $sig, $pem, OPENSSL_ALGO_SHA256) === 1;
        }
        if (! $ok) {
            return null;
        }
        $t = time();
        if (($claims['iss'] ?? null) !== $this->base && ($claims['iss'] ?? null) !== $this->base . '/') {
            return null;
        }
        $aud = is_array($claims['aud'] ?? null) ? $claims['aud'] : [$claims['aud'] ?? null];
        if (! in_array($this->audience, $aud, true)) {
            return null;
        }
        if (! is_int($claims['exp'] ?? null) && ! is_float($claims['exp'] ?? null) || $claims['exp'] < $t - 30) {
            return null;
        }
        if ((is_int($claims['nbf'] ?? null) || is_float($claims['nbf'] ?? null)) && $claims['nbf'] > $t + 30) {
            return null;
        }

        return $claims;
    }

    /** A library principal from a bearer token, or null. */
    public function principal(string $token): ?array
    {
        $c = $this->verify($token);
        if ($c === null || empty($c['sub'])) {
            return null;
        }
        $claim = $c[$this->roleClaim] ?? [];
        $roles = is_array($claim) ? $claim : [$claim];
        $role  = null;
        foreach (self::ROLES as $r) {
            if (in_array($r, $roles, true)) {
                $role = $r;
                break;
            }
        }

        return [
            'id'        => (string) $c['sub'],
            'plan'      => in_array($c['plan'] ?? null, self::PLANS, true) ? $c['plan'] : 'free',
            'org_id'    => $c['org_id'] ?? null,
            'device_id' => $c['device_id'] ?? null,
            'role'      => $role,
            'scopes'    => array_values(array_filter(explode(' ', (string) ($c['scope'] ?? '')))),
        ];
    }
}
