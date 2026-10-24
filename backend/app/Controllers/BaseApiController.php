<?php

namespace App\Controllers;

use App\Exceptions\HttpError;
use App\Libraries\Http\ApiResponse;
use App\Libraries\Json;
use App\Services\AuthContext;
use App\Services\LibraryService;
use CodeIgniter\Controller;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Library;

/**
 * Base for the /api/v1 controllers. Each action runs through `handle()`:
 * scheduled publishes first, then the handler in one database transaction
 * (writes are stored before the response says they happened), rendered as
 * JSON with an ETag on GETs and { error: { code, message, details, request_id } }
 * on failure (blueprint §4.4).
 */
abstract class BaseApiController extends Controller
{
    protected LibraryService $lib;
    protected AuthContext $auth;

    /** Status for a successful response when the default (200, 201 on admin creates) doesn't fit. */
    protected ?int $status = null;

    public function _remap(string $method, ...$params)
    {
        $this->lib      = service('library');
        $this->auth     = service('authContext');
        $this->lib->ip  = $this->request->getIPAddress();
        $this->auth->resolve($this->request);
        if (! method_exists($this, $method) || str_starts_with($method, '_')) {
            return $this->notFound();
        }
        $params = array_map(static fn ($p) => rawurldecode((string) $p), $params);

        return $this->handle(fn () => $this->{$method}(...$params));
    }

    protected function notFound(): ResponseInterface
    {
        // Also reached through the 404 override, where after-filters don't run.
        return ApiResponse::headers(
            ApiResponse::error(404, 'NOT_FOUND', 'No route for ' . strtoupper($this->request->getMethod()) . ' ' . $this->request->getUri()->getPath() . '.'),
            ['X-Request-Id' => ApiResponse::requestId(), 'X-Content-Type-Options' => 'nosniff'],
        );
    }

    protected function handle(callable $fn): ResponseInterface
    {
        $db     = $this->lib->store->db;
        $method = strtoupper($this->request->getMethod());
        try {
            $this->transaction(function () {
                if ($this->lib->scheduleDue()) {
                    $this->lib->runSchedule();
                }
            });
            $out = $method === 'GET' ? $fn() : $this->transaction($fn);
        } catch (\Throwable $e) {
            return ApiResponse::fromException($e);
        }
        if ($out instanceof ResponseInterface) {
            return $out;
        }
        if ($out === null && in_array($method, ['POST', 'PUT', 'DELETE'], true)) {
            return $this->response->setStatusCode(204)->setBody('');
        }
        $body = Json::encode(self::objectify($out));
        if ($method === 'GET') {
            $etag = '"' . substr(hash('sha256', $body), 0, 27) . '"';
            $this->response->setHeader('ETag', $etag);
            if ($this->request->getHeaderLine('If-None-Match') === $etag) {
                return ApiResponse::text('', 304, ['ETag' => $etag]);
            }
        }
        $path    = '/' . trim($this->request->getUri()->getPath(), '/');
        $created = $method === 'POST' && preg_match('#/admin/(assets|uploads|categories|collections|webhooks)$#', $path);

        return ApiResponse::text($body, $this->status ?? ($created ? 201 : 200), ['Content-Type' => 'application/json; charset=utf-8'] + ($method === 'GET' ? ['ETag' => $etag] : []));
    }

    /** Keys whose value is a JSON object in the Node API even when empty. */
    private const OBJECT_KEYS = ['meta' => 1, 'previews' => 1, 'preview' => 1, 'detail' => 1, 'downloads_by_day' => 1, 'downloads_by_type' => 1, 'before' => 1, 'after' => 1, 'stats' => 1, 'diff' => 1, 'device_limits' => 1, 'feed' => 1];

    /** PHP can't tell `{}` from `[]`: turns empty arrays under object keys into objects. */
    public static function objectify(mixed $v, ?string $key = null): mixed
    {
        if (! is_array($v)) {
            return $v;
        }
        if ($v === []) {
            return $key !== null && isset(self::OBJECT_KEYS[$key]) ? new \stdClass() : [];
        }
        foreach ($v as $k => $x) {
            $v[$k] = self::objectify($x, is_string($k) ? $k : null);
        }

        return $v;
    }

    /** Runs `$fn` in a transaction; rolls back (and drops cached rows) when it throws. */
    protected function transaction(callable $fn): mixed
    {
        $db = $this->lib->store->db;
        $db->transBegin();
        try {
            $out = $fn();
            $db->transCommit();

            return $out;
        } catch (\Throwable $e) {
            $db->transRollback();
            $this->lib->store->forget();

            throw $e;
        }
    }

    /** JSON body (any content type, like Node): {} when empty, 400 BAD_JSON when invalid. */
    protected function json(): array
    {
        $raw = (string) $this->request->getBody();
        if (strlen($raw) > config(Library::class)->maxJsonBytes) {
            throw new HttpError(413, 'TOO_LARGE', 'Upload is too large.');
        }
        if ($raw === '') {
            return [];
        }
        try {
            $data = json_decode($raw, true, 512, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        } catch (\JsonException) {
            throw new HttpError(400, 'BAD_JSON', "Body isn't valid JSON.");
        }

        return is_array($data) ? $data : [];
    }

    /** Raw body with a size limit (413 TOO_LARGE). */
    protected function rawBody(int $limit): string
    {
        $len = (int) $this->request->getHeaderLine('Content-Length');
        if ($len > $limit) {
            throw new HttpError(413, 'TOO_LARGE', 'Upload is too large.');
        }
        $raw = (string) $this->request->getBody();
        if (strlen($raw) > $limit) {
            throw new HttpError(413, 'TOO_LARGE', 'Upload is too large.');
        }

        return $raw;
    }

    /** Query parameters as Node's Object.fromEntries(url.searchParams) (last value wins). */
    protected function query(): array
    {
        $out = [];
        foreach (explode('&', (string) $this->request->getUri()->getQuery()) as $pair) {
            if ($pair === '') {
                continue;
            }
            [$k, $v]                          = array_pad(explode('=', $pair, 2), 2, '');
            $out[urldecode($k)] = urldecode($v);
        }

        return $out;
    }

    protected function q(string $name): ?string
    {
        $q = $this->query();

        return $q[$name] ?? null;
    }

    protected function actor(): ?array
    {
        return $this->auth->actor();
    }
}
