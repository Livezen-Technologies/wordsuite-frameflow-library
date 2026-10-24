<?php

namespace App\Controllers;

use App\Libraries\AssetSchema;
use App\Libraries\Http\ApiResponse;
use App\Libraries\Http\BlobResponse;
use App\Services\AuthContext;
use App\Services\LibraryService;
use CodeIgniter\Controller;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * The FrameFlow feed: the signed catalog, pack zips and thumbnails (HTTP
 * Range, ETag, Pro gating), the public key, worker previews and /healthz.
 */
class FeedController extends Controller
{
    private function lib(): LibraryService
    {
        return service('library');
    }

    private function guard(callable $fn): ResponseInterface
    {
        try {
            return $fn();
        } catch (\Throwable $e) {
            return ApiResponse::fromException($e);
        }
    }

    public function catalog(string $channel)
    {
        return $this->guard(function () use ($channel) {
            $f       = $this->lib()->feed($channel);
            $headers = ['ETag' => $f['etag'], 'Cache-Control' => 'no-cache', 'Access-Control-Allow-Origin' => '*'];
            if ($this->request->getHeaderLine('If-None-Match') === $f['etag']) {
                return ApiResponse::text('', 304, $headers);
            }

            return ApiResponse::text($f['text'], 200, ['Content-Type' => 'application/json; charset=utf-8'] + $headers);
        });
    }

    public function signature(string $channel)
    {
        return $this->guard(function () use ($channel) {
            $f = $this->lib()->feed($channel);

            return ApiResponse::text($f['sig'], 200, ['ETag' => $f['etag'], 'Cache-Control' => 'no-cache', 'Access-Control-Allow-Origin' => '*']);
        });
    }

    public function pack(string $channel, string $file)
    {
        return $this->guard(function () use ($file) {
            $file = rawurldecode($file);
            $lib  = $this->lib();
            $blob = $lib->packageFile($file);
            if ($blob === null) {
                return ApiResponse::text('Not found', 404);
            }
            $tier = $lib->packageTier($file);
            if ($tier !== 'free') {
                // Pro and above: a signed-in plan that covers the tier, or a download grant's signed URL.
                $granted = $lib->verifyDownloadToken($file, $this->request->getGet('expires'), $this->request->getGet('sig'));
                /** @var AuthContext $auth */
                $auth = service('authContext');
                $who  = $granted ? null : $auth->resolve($this->request);
                if (! $granted && AssetSchema::planRank($auth->client($this->request)['plan']) < AssetSchema::planRank($tier)) {
                    return $who !== null
                        ? ApiResponse::error(403, 'NOT_ENTITLED', "This pack needs a {$tier} plan.")
                        : ApiResponse::error(401, 'UNAUTHENTICATED', "This pack needs a {$tier} plan.");
                }

                return $this->blob($blob, ['Cache-Control' => 'private, no-store']);
            }

            return $this->blob($blob, ['Cache-Control' => 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin' => '*']);
        });
    }

    public function preview(string $assetId, string $version, string $file)
    {
        return $this->guard(function () use ($assetId, $version, $file) {
            $blob = $this->lib()->previewFile($assetId, $version, $file);
            if ($blob === null) {
                return ApiResponse::text('Not found', 404);
            }

            return $this->blob($blob, ['Cache-Control' => 'public, max-age=3600', 'Access-Control-Allow-Origin' => '*']);
        });
    }

    private function blob(array $blob, array $extra): ResponseInterface
    {
        return BlobResponse::serve(service('blobs'), $blob, $this->request->getMethod(), $this->request->getHeaderLine('Range'), $this->request->getHeaderLine('If-None-Match'), $extra);
    }

    public function publicKey()
    {
        return $this->guard(fn () => ApiResponse::text($this->lib()->publicKeyPem()));
    }

    public function healthz()
    {
        return $this->guard(function () {
            $this->lib()->store->db->query('SELECT 1');

            return ApiResponse::json(['ok' => true]);
        });
    }
}
