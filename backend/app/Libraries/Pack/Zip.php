<?php

namespace App\Libraries\Pack;

/**
 * Deterministic ZIPs in the format FrameFlow's installer reads
 * (worksuite-frameflow electron/asset-pack-io.js): fixed 1980-01-01 times,
 * UTF-8 names, deflate only when it is smaller, regular-file mode 0644.
 */
final class Zip
{
    /** Safe relative entry name, or null (no absolute paths, `..`, backslashes, NULs). */
    public static function safeEntryName(mixed $name): ?string
    {
        if (! is_string($name) || $name === '' || mb_strlen($name) > 512) {
            return null;
        }
        if (str_contains($name, "\0") || str_contains($name, '\\') || str_starts_with($name, '/') || preg_match('/^[a-zA-Z]:/', $name)) {
            return null;
        }
        $parts = explode('/', $name);
        if (end($parts) === '') {
            array_pop($parts);
        }
        if ($parts === []) {
            return null;
        }
        foreach ($parts as $p) {
            if ($p === '' || $p === '.' || $p === '..') {
                return null;
            }
        }

        return $name;
    }

    /**
     * @param list<array{name: string, data: string}> $entries
     */
    public static function create(array $entries): string
    {
        $locals   = '';
        $centrals = '';
        $offset   = 0;
        foreach ($entries as ['name' => $name, 'data' => $raw]) {
            if (self::safeEntryName($name) === null) {
                throw new \InvalidArgumentException("Bad zip entry name: {$name}");
            }
            $deflated   = gzdeflate($raw, 9, ZLIB_ENCODING_RAW);
            $useDeflate = strlen($deflated) < strlen($raw);
            $body       = $useDeflate ? $deflated : $raw;
            $crc        = crc32($raw);
            $method     = $useDeflate ? 8 : 0;
            // local header: sig, version, flags (UTF-8), method, time 0, date 1980-01-01
            $h = pack('VvvvvvVVVvv', 0x04034B50, 20, 0x0800, $method, 0, 0x21, $crc, strlen($body), strlen($raw), strlen($name), 0);
            $locals .= $h . $name . $body;
            $c = pack('VvvvvvvVVVvvvvvVV', 0x02014B50, 0x031E, 20, 0x0800, $method, 0, 0x21, $crc, strlen($body), strlen($raw), strlen($name), 0, 0, 0, 0, (0o100644 << 16) & 0xFFFFFFFF, $offset);
            $centrals .= $c . $name;
            $offset += strlen($h) + strlen($name) + strlen($body);
        }
        $n   = count($entries);
        $end = pack('VvvvvVVv', 0x06054B50, 0, 0, $n, $n, strlen($centrals), $offset, 0);

        return $locals . $centrals . $end;
    }

    /**
     * Lists a ZIP's entries for the upload gate (§4.1 path safety, zip-bomb
     * guard). Throws ZipProblem on unsafe names, symlinks, > 10k entries or > 100:1 ratio.
     *
     * @return list<string>
     */
    public static function inspect(string $buf): array
    {
        $len = strlen($buf);
        $end = -1;
        for ($i = $len - 22; $i >= max(0, $len - 22 - 0xFFFF); $i--) {
            if (substr($buf, $i, 4) === "PK\x05\x06") {
                $end = $i;
                break;
            }
        }
        if ($end < 0) {
            throw new ZipProblem('Not a zip file', 'zip.format');
        }
        $u16   = static fn (int $o) => $o + 2 <= $len ? unpack('v', $buf, $o)[1] : throw new ZipProblem('Corrupt zip directory', 'zip.format');
        $u32   = static fn (int $o) => $o + 4 <= $len ? unpack('V', $buf, $o)[1] : throw new ZipProblem('Corrupt zip directory', 'zip.format');
        $count = $u16($end + 10);
        if ($count > 10000) {
            throw new ZipProblem('Archive has more than 10,000 entries', 'zip.entries', $count);
        }
        $p     = $u32($end + 16);
        $total = 0;
        $names = [];
        for ($i = 0; $i < $count; $i++) {
            if ($u32($p) !== 0x02014B50) {
                throw new ZipProblem('Corrupt zip directory', 'zip.format');
            }
            $total += $u32($p + 24);
            $nameLen = $u16($p + 28);
            $name    = substr($buf, $p + 46, $nameLen);
            $mode    = ($u32($p + 38) >> 16) & 0o170000;
            if (self::safeEntryName($name) === null) {
                throw new ZipProblem("Archive contains an unsafe path: {$name}", 'zip.path', $name);
            }
            if ($mode === 0o120000) {
                throw new ZipProblem("Archive contains a symlink: {$name}", 'zip.symlink', $name);
            }
            $names[] = $name;
            $p += 46 + $nameLen + $u16($p + 30) + $u16($p + 32);
        }
        if ($total > $len * 100) {
            throw new ZipProblem('Archive expands more than 100:1', 'zip.ratio', (int) round($total / $len));
        }

        return $names;
    }
}
