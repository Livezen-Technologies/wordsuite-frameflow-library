<?php

namespace App\Libraries\Http;

use App\Libraries\Storage\BlobStoreInterface;
use CodeIgniter\HTTP\Response;
use CodeIgniter\HTTP\ResponseInterface;
use Config\App;

/**
 * Streams a stored blob with ETag, single-range (§9 step 4 resume) and HEAD
 * support, without loading it into memory.
 */
final class BlobResponse extends Response
{
    private const MIME = ['.html' => 'text/html; charset=utf-8', '.js' => 'text/javascript; charset=utf-8', '.css' => 'text/css; charset=utf-8', '.png' => 'image/png', '.webp' => 'image/webp', '.gif' => 'image/gif', '.jpg' => 'image/jpeg', '.zip' => 'application/zip', '.svg' => 'image/svg+xml', '.json' => 'application/json', '.mp4' => 'video/mp4', '.webm' => 'video/webm', '.mp3' => 'audio/mpeg', '.woff2' => 'font/woff2'];

    private ?BlobStoreInterface $store = null;
    private string $key  = '';
    private int $start   = 0;
    private int $end     = -1;
    private bool $stream = false;

    /**
     * @param array{key: string, size: int, etag: ?string} $blob
     * @param array<string, string>                        $extra
     */
    public static function serve(BlobStoreInterface $store, array $blob, string $method, string $range, string $ifNoneMatch, array $extra = []): ResponseInterface
    {
        $res = new self(config(App::class));
        $ext = preg_match('/\.[A-Za-z0-9]+$/', $blob['key'], $m) ? strtolower($m[0]) : '';
        $res->setHeader('Content-Type', self::MIME[$ext] ?? 'application/octet-stream');
        $res->setHeader('Accept-Ranges', 'bytes');
        if (! empty($blob['etag'])) {
            $res->setHeader('ETag', $blob['etag']);
        }
        ApiResponse::headers($res, $extra);
        if (! empty($blob['etag']) && $ifNoneMatch === $blob['etag']) {
            return $res->setStatusCode(304)->setHeader('Content-Type', 'text/plain; charset=utf-8');
        }
        $size  = (int) $blob['size'];
        $start = 0;
        $end   = $size - 1;
        $status = 200;
        if (preg_match('/^bytes=(\d*)-(\d*)$/', $range, $r) && ($r[1] !== '' || $r[2] !== '')) {
            $start = $r[1] !== '' ? (int) $r[1] : $size - (int) $r[2];
            $end   = $r[1] !== '' && $r[2] !== '' ? (int) $r[2] : $size - 1;
            $start = max(0, $start);
            $end   = min($end, $size - 1);
            if ($start > $end) {
                return $res->setStatusCode(416)->setHeader('Content-Range', "bytes */{$size}")->setHeader('Content-Type', 'text/plain; charset=utf-8');
            }
            $status = 206;
            $res->setHeader('Content-Range', "bytes {$start}-{$end}/{$size}");
        }
        $res->setStatusCode($status);
        $res->setHeader('Content-Length', (string) ($end - $start + 1));
        $res->store  = $store;
        $res->key    = $blob['key'];
        $res->start  = $start;
        $res->end    = $end;
        $res->stream = strtoupper($method) !== 'HEAD' && $size > 0;

        return $res;
    }

    public function sendBody()
    {
        if (! $this->stream || $this->store === null) {
            return $this;
        }
        while (ob_get_level() > 0) {
            ob_end_flush();
        }
        $this->store->stream($this->key, $this->start, $this->end, static function (string $chunk) {
            echo $chunk;
            flush();
        });

        return $this;
    }
}
