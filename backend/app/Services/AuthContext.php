<?php

namespace App\Services;

use App\Libraries\Auth\OidcVerifier;
use App\Libraries\Auth\StaticTokens;
use App\Libraries\AssetSchema;
use CodeIgniter\HTTP\RequestInterface;
use Config\Library;

/**
 * Who is calling (resolved once per request by AuthFilter): a static
 * token's principal, a verified OIDC user, or nobody.
 */
class AuthContext
{
    /** Principal: ['id', 'role', 'plan', …] or null. */
    public ?array $who = null;

    private bool $resolved = false;

    private ?OidcVerifier $verifier = null;

    /** @var array<string, array{id: string, role: string}> */
    private array $tokens;

    public function __construct(private readonly Library $cfg)
    {
        $spec = $cfg->adminTokens;
        // Like the Node server's entry point: a dev token when none are configured (never in production).
        if (! $cfg->adminTokensSet && ENVIRONMENT !== 'production') {
            $spec = 'dev-admin:super_admin:admin';
        }
        $this->tokens = StaticTokens::parse($spec);
        if ($cfg->oidcIssuer !== '') {
            $this->verifier = new OidcVerifier($cfg->oidcIssuer, $cfg->oidcAudience, $cfg->oidcRoleClaim);
        }
    }

    public function oidcEnabled(): bool
    {
        return $this->verifier !== null;
    }

    public function resolve(RequestInterface $request): ?array
    {
        if ($this->resolved) {
            return $this->who;
        }
        $this->resolved = true;
        if (! preg_match('/^Bearer\s+(.+)$/i', $request->getHeaderLine('Authorization'), $m)) {
            return null;
        }
        $token = $m[1];
        if (isset($this->tokens[$token])) {
            return $this->who = $this->tokens[$token] + ['plan' => 'enterprise'];
        }
        try {
            return $this->who = $this->verifier?->principal($token);
        } catch (\Throwable) {
            return null;
        }
    }

    /** An admin: a principal with a library role. */
    public function actor(): ?array
    {
        return ! empty($this->who['role']) ? $this->who : null;
    }

    /** Plan, device and app version of the client (§7.2). `$withWho` mirrors where Node passed the principal. */
    public function client(RequestInterface $request, bool $withWho = true): array
    {
        $who   = $withWho ? $this->who : null;
        $plan  = $who['plan'] ?? ($this->verifier ? 'free' : ($request->getHeaderLine('X-Plan') ?: 'free'));
        $dev   = $who['device_id'] ?? ($request->getHeaderLine('X-Device-Id') ?: null);
        $appV  = $request->getHeaderLine('X-App-Version') ?: null;

        return ['plan' => in_array($plan, AssetSchema::TIERS, true) || ! $this->verifier ? $plan : 'free', 'device_id' => $dev, 'user_id' => $who['id'] ?? null, 'appVersion' => $appV];
    }
}
