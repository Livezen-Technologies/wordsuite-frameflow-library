<?php

namespace Config;

use CodeIgniter\Config\BaseConfig;

/**
 * CORS for the admin web (a separate React app). Origins come from
 * LIBRARY_CORS_ORIGINS (comma-separated). The feed sets its own
 * `Access-Control-Allow-Origin: *`.
 */
class Cors extends BaseConfig
{
    public array $default = [
        'allowedOrigins'         => [],
        'allowedOriginsPatterns' => [],
        'supportsCredentials'    => false,
        'allowedHeaders'         => ['Authorization', 'Content-Type', 'X-Filename', 'X-Plan', 'X-App-Version', 'X-Device-Id', 'X-Request-Id', 'If-None-Match', 'Range', 'Idempotency-Key'],
        'exposedHeaders'         => ['ETag', 'X-Request-Id', 'Content-Range', 'Content-Length'],
        'allowedMethods'         => ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
        'maxAge'                 => 7200,
    ];

    public function __construct()
    {
        parent::__construct();
        $this->default['allowedOrigins'] = config(Library::class)->corsOrigins;
    }
}
