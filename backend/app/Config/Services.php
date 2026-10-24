<?php

namespace Config;

use App\Libraries\Search\MeiliSearch;
use App\Libraries\Storage\BlobStoreInterface;
use App\Libraries\Storage\StorageFactory;
use App\Services\AuthContext;
use App\Services\LibraryService;
use App\Services\LibraryStore;
use CodeIgniter\Config\BaseService;

/**
 * Library services: service('library'), service('authContext'), service('blobs').
 */
class Services extends BaseService
{
    public static function blobs(bool $getShared = true): BlobStoreInterface
    {
        if ($getShared) {
            return static::getSharedInstance('blobs');
        }

        return StorageFactory::fromConfig(config(Library::class));
    }

    public static function library(bool $getShared = true): LibraryService
    {
        if ($getShared) {
            return static::getSharedInstance('library');
        }
        $cfg = config(Library::class);
        $lib = new LibraryService(new LibraryStore(), static::blobs(), $cfg->signingKey);
        $lib->requireProcessing    = getenv('LIBRARY_REQUIRE_PROCESSING') === '1';
        $lib->envCorsOrigins       = $cfg->corsOrigins;
        $lib->search               = MeiliSearch::fromEnv();
        $lib->webhooksAllowPrivate = getenv('LIBRARY_WEBHOOKS_ALLOW_PRIVATE') === '1';
        $backoff                   = (string) getenv('LIBRARY_WEBHOOKS_BACKOFF');
        if (preg_match('/^\d+(,\d+)*$/', $backoff)) {
            $lib->webhookBackoff = array_map('intval', explode(',', $backoff));
        }

        return $lib;
    }

    public static function authContext(bool $getShared = true): AuthContext
    {
        if ($getShared) {
            return static::getSharedInstance('authContext');
        }

        return new AuthContext(config(Library::class));
    }

    /** Request id for this request (X-Request-Id or a fresh one). */
    public static function requestId(bool $getShared = true): \ArrayObject
    {
        if ($getShared) {
            return static::getSharedInstance('requestId');
        }

        return new \ArrayObject(['id' => null]);
    }
}
