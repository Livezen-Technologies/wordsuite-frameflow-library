<?php

namespace App\Libraries\Storage;

/** Blobs in a local folder (development, single-node deployments). */
final class FileBlobStore implements BlobStoreInterface
{
    private string $root;

    public function __construct(string $root)
    {
        if (! is_dir($root)) {
            mkdir($root, 0775, true);
        }
        $this->root = rtrim(realpath($root) ?: $root, '/');
    }

    public function kind(): string
    {
        return 'file';
    }

    /** Full path for a key; refuses keys that leave the folder. */
    public function path(string $key): string
    {
        $parts = [];
        foreach (explode('/', str_replace('\\', '/', $key)) as $seg) {
            if ($seg === '' || $seg === '.') {
                continue;
            }
            if ($seg === '..') {
                if ($parts === []) {
                    throw new \InvalidArgumentException("Bad blob key {$key}");
                }
                array_pop($parts);

                continue;
            }
            $parts[] = $seg;
        }
        if ($parts === [] || str_contains($key, "\0")) {
            throw new \InvalidArgumentException("Bad blob key {$key}");
        }

        return $this->root . '/' . implode('/', $parts);
    }

    public function has(string $key): bool
    {
        return is_file($this->path($key));
    }

    public function put(string $key, string $data, string $contentType = 'application/octet-stream'): void
    {
        $full = $this->path($key);
        if (! is_dir(dirname($full))) {
            mkdir(dirname($full), 0775, true);
        }
        $tmp = $full . '.' . getmypid() . '.' . bin2hex(random_bytes(4)) . '.tmp';
        if (file_put_contents($tmp, $data) !== strlen($data)) {
            @unlink($tmp);

            throw new \RuntimeException("Couldn't write blob {$key}");
        }
        rename($tmp, $full);
    }

    public function get(string $key): ?string
    {
        $full = $this->path($key);
        if (! is_file($full)) {
            return null;
        }
        $data = file_get_contents($full);

        return $data === false ? null : $data;
    }

    public function head(string $key): ?array
    {
        $full = $this->path($key);
        clearstatcache(true, $full);
        if (! is_file($full)) {
            return null;
        }
        $size = filesize($full);

        return ['size' => $size, 'etag' => '"' . dechex($size) . '-' . dechex(filemtime($full) * 1000) . '"'];
    }

    public function stream(string $key, int $start, int $end, callable $out): void
    {
        $fh = fopen($this->path($key), 'rb');
        if ($fh === false) {
            throw new \RuntimeException("Missing blob {$key}");
        }
        try {
            fseek($fh, $start);
            $left = $end - $start + 1;
            while ($left > 0 && ! feof($fh)) {
                $chunk = fread($fh, min(1 << 20, $left));
                if ($chunk === false || $chunk === '') {
                    break;
                }
                $left -= strlen($chunk);
                $out($chunk);
            }
        } finally {
            fclose($fh);
        }
    }
}
