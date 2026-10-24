<?php

namespace App\Libraries\Storage;

/**
 * Library blobs (blueprint §15): `originals/<sha256>` and `packages/<file>`.
 */
interface BlobStoreInterface
{
    public function kind(): string;

    public function has(string $key): bool;

    public function put(string $key, string $data, string $contentType = 'application/octet-stream'): void;

    /** The bytes, or null when missing. */
    public function get(string $key): ?string;

    /** @return array{size: int, etag: ?string}|null */
    public function head(string $key): ?array;

    /** Writes bytes [start, end] (inclusive) to `$out` in chunks. */
    public function stream(string $key, int $start, int $end, callable $out): void;
}
