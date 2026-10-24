<?php

namespace Config;

use CodeIgniter\Config\BaseConfig;

/**
 * FrameFlow Asset Library settings. Everything comes from the environment
 * (same variable names as the Node service; see README.md).
 */
class Library extends BaseConfig
{
    /** "token:role:userId,…" static admin tokens (dev and server-to-server). */
    public string $adminTokens = '';

    /** Whether LIBRARY_ADMIN_TOKENS was set at all (unset → dev token outside production). */
    public bool $adminTokensSet = false;

    public string $oidcIssuer    = '';
    public string $oidcAudience  = 'frameflow-library';
    public string $oidcRoleClaim = 'library_roles';

    /** PEM PKCS#8 Ed25519 private key; empty → a development key kept in the database. */
    public string $signingKey = '';

    /** Local blob folder (originals/, packages/). */
    public string $dataDir = WRITEPATH . 'library';

    public string $s3Endpoint        = '';
    public string $s3Bucket          = '';
    public string $s3AccessKeyId     = '';
    public string $s3SecretAccessKey = '';
    public string $s3Region          = 'auto';
    public string $s3Prefix          = '';

    /** @var list<string> Origins allowed to call the API from a browser (the admin web). */
    public array $corsOrigins = [];

    /** Largest upload body, bytes (Node: 2 GiB). */
    public int $maxUploadBytes = 2 * 1024 * 1024 * 1024;

    /** Largest JSON body, bytes. */
    public int $maxJsonBytes = 5 * 1024 * 1024;

    public function __construct()
    {
        parent::__construct();
        $env = static function (string $name): ?string {
            $v = getenv($name);
            if ($v === false) {
                $v = $_ENV[$name] ?? $_SERVER[$name] ?? null;
            }

            return is_string($v) ? $v : null;
        };
        $tokens               = $env('LIBRARY_ADMIN_TOKENS');
        $this->adminTokensSet = $tokens !== null;
        $this->adminTokens    = $tokens ?? '';
        $this->oidcIssuer     = $env('LIBRARY_OIDC_ISSUER') ?? '';
        $this->oidcAudience   = ($env('LIBRARY_OIDC_AUDIENCE') ?? '') ?: 'frameflow-library';
        $this->oidcRoleClaim  = ($env('LIBRARY_OIDC_ROLE_CLAIM') ?? '') ?: 'library_roles';
        $this->signingKey     = $env('LIBRARY_SIGNING_KEY') ?? '';
        $this->dataDir        = ($env('LIBRARY_DATA_DIR') ?? '') ?: WRITEPATH . 'library';
        $this->s3Endpoint        = $env('LIBRARY_S3_ENDPOINT') ?? '';
        $this->s3Bucket          = $env('LIBRARY_S3_BUCKET') ?? '';
        $this->s3AccessKeyId     = $env('LIBRARY_S3_ACCESS_KEY_ID') ?? '';
        $this->s3SecretAccessKey = $env('LIBRARY_S3_SECRET_ACCESS_KEY') ?? '';
        $this->s3Region          = ($env('LIBRARY_S3_REGION') ?? '') ?: 'auto';
        $this->s3Prefix          = $env('LIBRARY_S3_PREFIX') ?? '';
        $cors                    = $env('LIBRARY_CORS_ORIGINS') ?? '';
        $this->corsOrigins       = array_values(array_filter(array_map('trim', explode(',', $cors))));
    }
}
