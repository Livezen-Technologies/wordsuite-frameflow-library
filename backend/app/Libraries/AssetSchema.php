<?php

namespace App\Libraries;

use App\Exceptions\ValidationError;

/**
 * Shared asset model and validation (blueprint §2–§4), ported from
 * packages/asset-schema/index.js. No I/O: the API, the scheduler and the
 * tests apply the same rules.
 */
final class AssetSchema
{
    private const MB = 1024 * 1024;

    /** The 12 asset types (§2). `pack` is the FrameFlow pack type it installs as. */
    public const ASSET_TYPES = [
        'graphic'        => ['name' => 'Graphic Elements & Overlays', 'ext' => ['png', 'svg', 'webp', 'psd', 'mov', 'webm'], 'maxBytes' => 200 * self::MB, 'dir' => 'graphics', 'pack' => 'graphics', 'target' => 'Canvas / overlay track'],
        'sfx'            => ['name' => 'Sound Effects & Audio', 'ext' => ['wav', 'flac', 'mp3', 'aac', 'ogg'], 'maxBytes' => 100 * self::MB, 'dir' => 'audio', 'pack' => 'sounds', 'target' => 'Audio track'],
        'text_template'  => ['name' => 'Text Templates & Animations', 'ext' => ['fftext', 'json'], 'maxBytes' => 500 * self::MB, 'dir' => 'text', 'pack' => 'text-templates', 'target' => 'Text track / title editor'],
        'video_template' => ['name' => 'Video Templates', 'ext' => ['fftemplate'], 'maxBytes' => 2048 * self::MB, 'dir' => 'templates', 'pack' => 'video-templates', 'target' => 'New project / insert sequence'],
        'motion'         => ['name' => 'Motion Graphics & Animated Elements', 'ext' => ['ffmotion', 'mov', 'webm', 'json'], 'maxBytes' => 500 * self::MB, 'dir' => 'motion', 'pack' => 'motion', 'target' => 'Overlay track'],
        'transition'     => ['name' => 'Video Effects & Transitions', 'ext' => ['ffx'], 'maxBytes' => 500 * self::MB, 'dir' => 'effects', 'pack' => 'transitions', 'target' => 'Clip / between-clip'],
        'lut'            => ['name' => 'LUTs & Color Presets', 'ext' => ['cube', '3dl', 'ffcolor'], 'maxBytes' => 10 * self::MB, 'dir' => 'luts', 'pack' => 'luts', 'target' => 'Clip color panel'],
        'font'           => ['name' => 'Fonts & Font Packs', 'ext' => ['ttf', 'otf', 'woff2'], 'maxBytes' => 50 * self::MB, 'dir' => 'fonts', 'pack' => 'fonts', 'target' => 'Text engine'],
        'filter'         => ['name' => 'Video & Image Filters', 'ext' => ['ffx'], 'maxBytes' => 500 * self::MB, 'dir' => 'filters', 'pack' => 'filters', 'target' => 'Clip effects panel'],
        'brand_kit'      => ['name' => 'Brand Kits', 'ext' => ['ffbrand', 'json'], 'maxBytes' => 200 * self::MB, 'dir' => 'brandkits', 'pack' => 'brand-kits', 'target' => 'Brand panel / project defaults'],
        'gif_sticker'    => ['name' => 'GIFs & Animated Stickers', 'ext' => ['gif', 'apng', 'png', 'webp'], 'maxBytes' => 30 * self::MB, 'dir' => 'stickers', 'pack' => 'stickers', 'target' => 'Canvas / overlay track'],
        'lottie'         => ['name' => 'Lottie Animations', 'ext' => ['json', 'lottie'], 'maxBytes' => 5 * self::MB, 'dir' => 'lottie', 'pack' => 'motion', 'target' => 'Canvas / overlay track'],
    ];

    public const STATUSES      = ['draft', 'processing', 'ready_for_review', 'approved', 'published', 'deprecated', 'archived', 'failed'];
    public const VISIBILITIES  = ['draft', 'private', 'internal', 'public', 'unlisted'];
    public const TIERS         = ['free', 'pro', 'business', 'enterprise'];
    public const LICENCE_TERMS = ['royalty_free', 'editorial_only', 'personal_only', 'custom'];
    public const ASPECTS       = ['16:9', '9:16', '1:1', '4:5', 'any'];
    public const PLATFORMS     = ['windows', 'macos', 'linux'];
    public const SLUG          = '/^[a-z0-9-]{3,80}$/';
    public const SEMVER        = '/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/';

    /** Allowed status moves (§3.1 lifecycle). */
    public const TRANSITIONS = [
        'draft'            => ['processing', 'ready_for_review', 'archived'],
        'processing'       => ['draft', 'failed'],
        'failed'           => ['processing', 'draft', 'archived'],
        'ready_for_review' => ['approved', 'draft'],
        'approved'         => ['published', 'draft'],
        'published'        => ['deprecated', 'archived', 'draft'],
        'deprecated'       => ['published', 'archived'],
        'archived'         => ['draft'],
    ];

    /** Transition renderers FrameFlow ships (worksuite-frameflow apps/web/src/transitions/types.ts). */
    public const TRANSITION_ENGINES = ['cross-dissolve', 'dip-to-black', 'blur-dissolve', 'slide', 'push', 'wipe', 'split', 'circle', 'iris-diamond', 'zoom-in', 'zoom-out', 'spin', 'whip-pan'];

    public static function isSemver(mixed $v): bool
    {
        return is_string($v) && preg_match(self::SEMVER, $v) === 1;
    }

    // ---------- semver ----------

    public static function compareSemver(mixed $a, mixed $b): int
    {
        $parse = static function ($v): array {
            $parts = explode('-', preg_replace('/^v/', '', (string) $v), 3);
            $nums  = array_map(static fn ($n) => (int) (preg_match('/^\s*[-+]?\d+/', $n, $m) ? (int) $m[0] : 0), explode('.', $parts[0]));

            return ['nums' => $nums, 'pre' => $parts[1] ?? null];
        };
        $x = $parse($a);
        $y = $parse($b);
        for ($i = 0; $i < 3; $i++) {
            $xi = $x['nums'][$i] ?? 0;
            $yi = $y['nums'][$i] ?? 0;
            if ($xi !== $yi) {
                return $xi > $yi ? 1 : -1;
            }
        }
        if ($x['pre'] === $y['pre']) {
            return 0;
        }
        if ($x['pre'] === null) {
            return 1;
        }
        if ($y['pre'] === null) {
            return -1;
        }

        return strcmp($x['pre'], $y['pre']) > 0 ? 1 : -1;
    }

    public static function bumpSemver(string $v, string $part = 'minor'): string
    {
        [$maj, $min, $pat] = array_map('intval', array_pad(explode('.', explode('-', $v)[0]), 3, '0'));
        if ($part === 'major') {
            return ($maj + 1) . '.0.0';
        }
        if ($part === 'patch') {
            return "{$maj}.{$min}." . ($pat + 1);
        }

        return "{$maj}." . ($min + 1) . '.0';
    }

    // ---------- metadata (§3.1) ----------

    private static function str(mixed $v): string
    {
        return is_string($v) ? self::trim($v) : '';
    }

    /** String#trim(): ASCII and Unicode whitespace plus the BOM. */
    public static function trim(string $v): string
    {
        return preg_replace('/^[\s\x{FEFF}\x{A0}]+|[\s\x{FEFF}\x{A0}]+$/u', '', $v) ?? trim($v);
    }

    public static function jsString(mixed $v): string
    {
        return match (true) {
            $v === null  => 'null',
            $v === true  => 'true',
            $v === false => 'false',
            is_array($v) => implode(',', array_map([self::class, 'jsString'], $v)),
            default      => (string) $v,
        };
    }

    public static function slugify(mixed $title): string
    {
        $s = mb_strtolower(self::str($title));
        if (class_exists(\Normalizer::class)) {
            $s = \Normalizer::normalize($s, \Normalizer::FORM_KD) ?: $s;
        }
        $s = preg_replace('/[^A-Za-z0-9_\s-]/u', '', $s);
        $s = preg_replace('/[\s_]+/u', '-', $s);
        $s = preg_replace('/-+/', '-', $s);
        $s = preg_replace('/^-|-$/', '', $s);

        return substr($s, 0, 80);
    }

    /** @return list<string> */
    public static function normalizeTags(mixed $tags): array
    {
        $list = is_array($tags) ? array_values($tags) : (is_string($tags) ? explode(',', $tags) : []);
        $out  = [];
        foreach ($list as $t) {
            $t = mb_strtolower(self::trim(self::jsString($t)));
            if ($t !== '' && ! in_array($t, $out, true)) {
                $out[] = $t;
            }
        }

        return $out;
    }

    private static function jsLength(string $s): int
    {
        // String#length counts UTF-16 code units.
        return intdiv(strlen(mb_convert_encoding($s, 'UTF-16LE', 'UTF-8')), 2);
    }

    /**
     * Field problems for asset metadata, as `{ field, rule, value }`.
     * `partial` checks only the fields present (for PATCH).
     *
     * @return list<array<string, mixed>>
     */
    public static function metadataProblems(array $meta, bool $partial = false): array
    {
        $out = [];
        $has = static fn (string $k) => ! $partial || array_key_exists($k, $meta);
        $bad = static function (string $field, string $rule, mixed $value) use (&$out) {
            $out[] = ['field' => $field, 'rule' => $rule, 'value' => $value];
        };
        if ($has('type') && ! array_key_exists((string) ($meta['type'] ?? ''), self::ASSET_TYPES)) {
            $bad('type', 'type.enum', $meta['type'] ?? null);
        }
        if ($has('slug') && preg_match(self::SLUG, self::jsString($meta['slug'] ?? '')) !== 1) {
            $bad('slug', 'slug.pattern', $meta['slug'] ?? null);
        }
        if ($has('title')) {
            $n = self::jsLength(self::str($meta['title'] ?? null));
            if ($n < 3 || $n > 120) {
                $bad('title', 'title.length', $n);
            }
        }
        if ($has('description') && self::jsLength(self::str($meta['description'] ?? null)) > 2000) {
            $bad('description', 'description.max', self::jsLength(self::str($meta['description'])));
        }
        if ($has('tags')) {
            $tags = self::normalizeTags($meta['tags'] ?? null);
            if (count($tags) > 20) {
                $bad('tags', 'tags.max', count($tags));
            }
            foreach ($tags as $t) {
                if (self::jsLength($t) < 2 || self::jsLength($t) > 32) {
                    $bad('tags', 'tag.length', $t);
                }
            }
        }
        if ($has('keywords') && count(self::normalizeTags($meta['keywords'] ?? null)) > 30) {
            $bad('keywords', 'keywords.max', count(self::normalizeTags($meta['keywords'])));
        }
        if ($has('aspect_ratios')) {
            foreach ((array) ($meta['aspect_ratios'] ?? []) as $a) {
                if (! in_array($a, self::ASPECTS, true)) {
                    $bad('aspect_ratios', 'aspect.enum', $a);
                }
            }
        }
        if ($has('platforms')) {
            foreach ((array) ($meta['platforms'] ?? []) as $p) {
                if (! in_array($p, self::PLATFORMS, true)) {
                    $bad('platforms', 'platform.enum', $p);
                }
            }
        }
        if ($has('min_app_version') && preg_match(self::SEMVER, self::jsString($meta['min_app_version'] ?? '')) !== 1) {
            $bad('min_app_version', 'semver', $meta['min_app_version'] ?? null);
        }
        if ($has('licence_tier') && ! in_array($meta['licence_tier'] ?? null, self::TIERS, true)) {
            $bad('licence_tier', 'tier.enum', $meta['licence_tier'] ?? null);
        }
        if ($has('licence_terms') && ! in_array($meta['licence_terms'] ?? null, self::LICENCE_TERMS, true)) {
            $bad('licence_terms', 'terms.enum', $meta['licence_terms'] ?? null);
        }
        if ($has('visibility') && ! in_array($meta['visibility'] ?? null, self::VISIBILITIES, true)) {
            $bad('visibility', 'visibility.enum', $meta['visibility'] ?? null);
        }
        if ($has('attribution_required') && ! empty($meta['attribution_required']) && self::str($meta['attribution_text'] ?? null) === '') {
            $bad('attribution_text', 'attribution.required', null);
        }

        return $out;
    }

    // ---------- upload gate (§4.1) ----------

    private static function u32be(string $b, int $o): int
    {
        return strlen($b) >= $o + 4 ? unpack('N', $b, $o)[1] : -1;
    }

    private static function u32le(string $b, int $o): int
    {
        return strlen($b) >= $o + 4 ? unpack('V', $b, $o)[1] : -1;
    }

    private static function u16le(string $b, int $o): int
    {
        return strlen($b) >= $o + 2 ? unpack('v', $b, $o)[1] : 0;
    }

    private static function u16be(string $b, int $o): int
    {
        if (strlen($b) < $o + 2) {
            throw new \RangeException('out of range');
        }

        return unpack('n', $b, $o)[1];
    }

    private static function byte(string $b, int $o): ?int
    {
        return $o >= 0 && $o < strlen($b) ? ord($b[$o]) : null;
    }

    private static function ascii(string $b, int $start, int $end): string
    {
        return substr($b, $start, max(0, $end - $start));
    }

    /** The container format sniffed from the first bytes, or "text" / "unknown". */
    public static function sniff(string $b): string
    {
        $n     = strlen($b);
        $magic = [
            'png'   => fn () => $n > 8 && self::u32be($b, 0) === 0x89504E47,
            'gif'   => fn () => $n > 6 && self::ascii($b, 0, 4) === 'GIF8',
            'webp'  => fn () => $n > 12 && self::ascii($b, 0, 4) === 'RIFF' && self::ascii($b, 8, 12) === 'WEBP',
            'wav'   => fn () => $n > 12 && self::ascii($b, 0, 4) === 'RIFF' && self::ascii($b, 8, 12) === 'WAVE',
            'flac'  => fn () => self::ascii($b, 0, 4) === 'fLaC',
            'ogg'   => fn () => self::ascii($b, 0, 4) === 'OggS',
            'mp3'   => fn () => self::ascii($b, 0, 3) === 'ID3' || (self::byte($b, 0) === 0xFF && ((self::byte($b, 1) ?? 0) & 0xE0) === 0xE0),
            'aac'   => fn () => self::byte($b, 0) === 0xFF && ((self::byte($b, 1) ?? 0) & 0xF6) === 0xF0,
            'ttf'   => fn () => $n > 4 && (self::u32be($b, 0) === 0x00010000 || self::ascii($b, 0, 4) === 'true'),
            'otf'   => fn () => self::ascii($b, 0, 4) === 'OTTO',
            'woff2' => fn () => self::ascii($b, 0, 4) === 'wOF2',
            'psd'   => fn () => self::ascii($b, 0, 4) === '8BPS',
            'webm'  => fn () => $n > 4 && self::u32be($b, 0) === 0x1A45DFA3,
            'mov'   => fn () => $n > 12 && in_array(self::ascii($b, 4, 8), ['ftyp', 'moov', 'wide', 'mdat'], true),
            'zip'   => fn () => $n > 4 && self::u32le($b, 0) === 0x04034B50,
        ];
        foreach ($magic as $kind => $test) {
            if ($test()) {
                return $kind;
            }
        }
        $first = substr($b, 0, 512);
        $head  = preg_replace('/^[\s\x{FEFF}\x{A0}]+/u', '', mb_scrub($first, 'UTF-8')) ?? ltrim($first);
        if (str_starts_with($head, '<')) {
            return 'svg-or-xml';
        }
        if (str_starts_with($head, '{') || str_starts_with($head, '[')) {
            return 'json';
        }
        if (preg_match('/^[\x09\x0a\x0d\x20-\x7e]*$/', $first) === 1) {
            return 'text';
        }

        return 'unknown';
    }

    /** What a file extension's content must sniff as. */
    private const EXPECT = [
        'png' => ['png'], 'apng' => ['png'], 'gif' => ['gif'], 'webp' => ['webp'], 'svg' => ['svg-or-xml'], 'psd' => ['psd'], 'mov' => ['mov'], 'webm' => ['webm'],
        'wav' => ['wav'], 'flac' => ['flac'], 'mp3' => ['mp3'], 'aac' => ['aac', 'mov'], 'ogg' => ['ogg'],
        'ttf' => ['ttf'], 'otf' => ['otf'], 'woff2' => ['woff2'],
        'cube' => ['text'], '3dl' => ['text'], 'ffcolor' => ['json'],
        'json' => ['json'], 'lottie' => ['zip'],
        'fftext' => ['zip', 'json'], 'fftemplate' => ['zip', 'json'], 'ffmotion' => ['zip'], 'ffx' => ['zip', 'json'], 'ffbrand' => ['zip', 'json'],
    ];

    public static function extOf(mixed $name): string
    {
        return preg_match('/\.([a-z0-9]+)$/', strtolower((string) $name), $m) ? $m[1] : '';
    }

    /** JSON.parse into objects (stdClass) so `{}` and `[]` stay distinct. */
    private static function parseJson(string $text): mixed
    {
        return json_decode($text, false, 512, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
    }

    private static function prop(mixed $o, string $k): mixed
    {
        return $o instanceof \stdClass && property_exists($o, $k) ? $o->{$k} : null;
    }

    /** Picks a type for a file from its extension and content (§11 A3). */
    public static function detectType(string $filename, string $buf): ?string
    {
        $ext = self::extOf($filename);
        if ($ext === 'json') {
            try {
                $j = self::parseJson($buf);
            } catch (\JsonException) {
                return null;
            }
            if ($j instanceof \stdClass && property_exists($j, 'v') && property_exists($j, 'layers')) {
                return 'lottie';
            }
            if (self::prop($j, 'schema') === 'frameflow.brand/1' || is_array(self::prop($j, 'colors'))) {
                return 'brand_kit';
            }
            if (self::prop($j, 'schema') === 'frameflow.text/1' || is_array(self::prop($j, 'placeholders')) || is_string(self::prop(self::prop($j, 'params'), 'content'))) {
                return 'text_template';
            }
            if (is_array(self::prop($j, 'layers')) && self::truthy(self::prop($j, 'aspect'))) {
                return 'video_template';
            }

            return null;
        }
        if ($ext === 'gif' || $ext === 'apng') {
            return 'gif_sticker';
        }
        if ($ext === 'ffx') {
            return null; // transition or filter: the admin picks
        }
        foreach (self::ASSET_TYPES as $key => $def) {
            if (in_array($ext, $def['ext'], true)) {
                return $key;
            }
        }

        return null;
    }

    private static function truthy(mixed $v): bool
    {
        return ! ($v === null || $v === false || $v === 0 || $v === 0.0 || $v === '' || (is_float($v) && is_nan($v)));
    }

    /**
     * Synchronous upload checks (§4.1).
     *
     * @return list<array{check: string, passed: bool, detail: mixed}>
     */
    public static function uploadChecks(string $filename, ?string $type, string $buf): array
    {
        $results = [];
        $add     = static function (string $check, bool $passed, mixed $detail = null) use (&$results) {
            $results[] = ['check' => $check, 'passed' => $passed, 'detail' => $detail];
        };
        $ext = self::extOf($filename);
        $def = self::ASSET_TYPES[$type ?? ''] ?? null;
        if ($def === null) {
            $add('type', false, ['rule' => 'type.enum', 'value' => $type]);

            return $results;
        }
        $add('extension', in_array($ext, $def['ext'], true), ['rule' => 'extension.allowed', 'value' => $ext, 'allowed' => $def['ext']]);
        $kind = self::sniff($buf);
        $add('magic_bytes', in_array($kind, self::EXPECT[$ext] ?? [], true), ['rule' => 'magic.match', 'value' => $kind, 'expected' => self::EXPECT[$ext] ?? []]);
        $add('size', strlen($buf) <= $def['maxBytes'] && strlen($buf) > 0, ['rule' => 'size.max', 'value' => strlen($buf), 'max' => $def['maxBytes']]);

        return $results;
    }

    // ---------- type validation (§4.2) ----------

    private static function fail(string $message, string $rule, mixed $value, string $field = 'file'): never
    {
        throw new ValidationError($message, [['field' => $field, 'rule' => $rule, 'value' => $value]]);
    }

    /** Number(x) for a token of a .cube line. */
    private static function num(?string $s): float
    {
        if ($s === null) {
            return NAN;
        }
        $s = trim($s);
        if ($s === '') {
            return 0.0;
        }
        if (preg_match('/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/', $s)) {
            return (float) $s;
        }
        if (preg_match('/^0[xX][0-9a-fA-F]+$/', $s)) {
            return (float) hexdec($s);
        }
        if (preg_match('/^[-+]?Infinity$/', $s)) {
            return str_starts_with($s, '-') ? -INF : INF;
        }

        return NAN;
    }

    /** A float that JSON-encodes like JavaScript (integral values without ".0"). */
    private static function jsNum(float $v): float|int|null
    {
        if (is_nan($v) || is_infinite($v)) {
            return null;
        }

        return floor($v) === $v && abs($v) < 2 ** 53 ? (int) $v : $v;
    }

    /** Parses a .cube LUT; throws ValidationError on the first problem. */
    public static function parseCube(string $text): array
    {
        $size  = null;
        $count = 0;
        $min   = [0.0, 0.0, 0.0];
        $max   = [1.0, 1.0, 1.0];
        $title = null;
        foreach (preg_split('/\r?\n/', $text) as $raw) {
            $line = self::trim($raw);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $parts = preg_split('/\s+/', $line);
            $key   = $parts[0];
            $rest  = array_slice($parts, 1);
            if ($key === 'TITLE') {
                $title = preg_replace('/^"|"$/', '', implode(' ', $rest));
            } elseif ($key === 'LUT_3D_SIZE') {
                $size = self::num($rest[0] ?? null);
            } elseif ($key === 'LUT_1D_SIZE') {
                self::fail("1D LUTs aren't supported; use a 3D .cube.", 'lut.dimension', '1D');
            } elseif ($key === 'DOMAIN_MIN') {
                $min = array_map([self::class, 'num'], $rest);
            } elseif ($key === 'DOMAIN_MAX') {
                $max = array_map([self::class, 'num'], $rest);
            } elseif (preg_match('/^[-+\d.eE]/', $key)) {
                $v = array_map([self::class, 'num'], $parts);
                if (count($v) !== 3 || array_filter($v, 'is_nan') !== []) {
                    self::fail("LUT has a bad value row: \"{$line}\".", 'lut.nan', $line);
                }
                for ($i = 0; $i < 3; $i++) {
                    $lo = $min[$i] ?? NAN;
                    $hi = $max[$i] ?? NAN;
                    if ($v[$i] < $lo - 1e-6 || $v[$i] > $hi + 1e-6) {
                        self::fail('LUT values must be within the declared domain (0–1 by default).', 'lut.range', self::jsNum($v[$i]));
                    }
                }
                $count++;
            }
        }
        if (! in_array($size, [17.0, 33.0, 65.0], true)) {
            self::fail('LUT size must be 17, 33 or 65.', 'lut.size', $size === null ? null : self::jsNum($size));
        }
        $n = (int) $size;
        if ($count !== $n ** 3) {
            self::fail("LUT has {$count} rows; a {$n}³ LUT needs " . ($n ** 3) . '.', 'lut.rows', $count);
        }

        return ['lut_size' => $n, 'title' => $title];
    }

    /**
     * SVG problems: scripts, event handlers, external refs, foreignObject.
     *
     * @return list<array<string, mixed>>
     */
    public static function svgProblems(string $text): array
    {
        $p = [];
        if (preg_match('/<script[\s\/>]/i', $text)) {
            $p[] = ['field' => 'file', 'rule' => 'svg.script', 'value' => '<script>'];
        }
        if (preg_match('/<foreignObject[\s\/>]/i', $text)) {
            $p[] = ['field' => 'file', 'rule' => 'svg.foreignObject', 'value' => '<foreignObject>'];
        }
        if (preg_match('/\son[a-z]+\s*=/i', $text, $m)) {
            $p[] = ['field' => 'file', 'rule' => 'svg.event_handler', 'value' => trim($m[0])];
        }
        if (preg_match('/(?:xlink:)?href\s*=\s*["\']\s*(?!#|data:image\/)([^"\']+)/i', $text, $m)) {
            $p[] = ['field' => 'file', 'rule' => 'svg.external_ref', 'value' => $m[1]];
        }
        if (preg_match('/javascript:/i', $text)) {
            $p[] = ['field' => 'file', 'rule' => 'svg.javascript_url', 'value' => 'javascript:'];
        }

        return $p;
    }

    /** Lottie (Bodymovin) checks: no expressions, embedded images only, ≤ 600 frames. */
    public static function lottieInfo(mixed $json): array
    {
        if (! $json instanceof \stdClass || ! property_exists($json, 'v') || ! is_array($json->layers ?? null)) {
            self::fail('Not a Lottie (Bodymovin) file.', 'lottie.schema', null);
        }
        $op     = $json->op ?? 0;
        $ip     = $json->ip ?? 0;
        $diff   = (is_numeric($op) ? (float) $op : NAN) - (is_numeric($ip) ? (float) $ip : NAN);
        $frames = is_nan($diff) ? NAN : floor($diff + 0.5);
        if (! ($frames > 0)) {
            self::fail('Lottie has no frames (op must be greater than ip).', 'lottie.frames', is_nan($frames) ? null : self::jsNum($frames));
        }
        if ($frames > 600) {
            self::fail('Lottie animations can have at most 600 frames.', 'lottie.frames', self::jsNum($frames));
        }
        $text = Json::encode($json);
        if (preg_match('/"x"\s*:\s*"/', $text)) {
            self::fail("Lottie expressions aren't allowed.", 'lottie.expressions', true);
        }
        $assets = is_array($json->assets ?? null) ? $json->assets : [];
        foreach ($assets as $a) {
            $p = self::prop($a, 'p');
            if (self::truthy($p) && ! (self::prop($a, 'e') === 1 || str_starts_with(self::jsString($p), 'data:'))) {
                self::fail('Lottie images must be embedded (base64), not external files.', 'lottie.external_image', $p);
            }
        }
        $fr      = $json->fr ?? null;
        $usesImg = false;
        foreach ($assets as $a) {
            $usesImg = $usesImg || self::truthy(self::prop($a, 'p'));
        }
        $text_layers = [];
        foreach ($json->layers as $l) {
            if (self::prop($l, 'ty') === 5) {
                $text_layers[] = self::prop($l, 'nm') ?? '';
            }
        }

        return [
            'lottie_version'   => self::jsString($json->v),
            'frame_rate'       => $fr,
            'in_point'         => $json->ip ?? 0,
            'out_point'        => $json->op ?? null,
            'duration_ms'      => self::jsNum(floor(($frames / (self::truthy($fr) && is_numeric($fr) ? (float) $fr : 30.0)) * 1000 + 0.5)),
            'resolution'       => ['w' => $json->w ?? null, 'h' => $json->h ?? null],
            'uses_expressions' => false,
            'uses_images'      => $usesImg,
            'text_layers'      => $text_layers,
        ];
    }

    /** Reads width/height from PNG, GIF and WebP headers. */
    public static function imageSize(string $buf): ?array
    {
        $kind = self::sniff($buf);
        try {
            if ($kind === 'png') {
                return ['w' => self::u32beStrict($buf, 16), 'h' => self::u32beStrict($buf, 20)];
            }
            if ($kind === 'gif') {
                return ['w' => self::u16le($buf, 6), 'h' => self::u16le($buf, 8)];
            }
            if ($kind === 'webp') {
                $chunk = self::ascii($buf, 12, 16);
                if ($chunk === 'VP8X') {
                    return ['w' => 1 + self::u24le($buf, 24), 'h' => 1 + self::u24le($buf, 27)];
                }
                if ($chunk === 'VP8L') {
                    $b = self::u32le($buf, 21);

                    return ['w' => ($b & 0x3FFF) + 1, 'h' => (($b >> 14) & 0x3FFF) + 1];
                }
                if ($chunk === 'VP8 ') {
                    return ['w' => self::u16le($buf, 26) & 0x3FFF, 'h' => self::u16le($buf, 28) & 0x3FFF];
                }
            }
        } catch (\RangeException) {
            throw new \RuntimeException('Image header is truncated');
        }

        return null;
    }

    private static function u32beStrict(string $b, int $o): int
    {
        if (strlen($b) < $o + 4) {
            throw new \RangeException('out of range');
        }

        return unpack('N', $b, $o)[1];
    }

    private static function u24le(string $b, int $o): int
    {
        if (strlen($b) < $o + 3) {
            throw new \RangeException('out of range');
        }

        return ord($b[$o]) | (ord($b[$o + 1]) << 8) | (ord($b[$o + 2]) << 16);
    }

    /** Counts GIF frames (image descriptors) and reads the loop flag. */
    public static function gifInfo(string $buf): array
    {
        $frames = 0;
        $loop   = false;
        $p      = 13;
        $len    = strlen($buf);
        $flags  = self::byte($buf, 10) ?? 0;
        if ($flags & 0x80) {
            $p += 3 * 2 ** (($flags & 7) + 1);
        }
        $skipBlocks = static function () use (&$p, $buf, $len) {
            while ($p < $len && ord($buf[$p]) !== 0) {
                $p += ord($buf[$p]) + 1;
            }
            $p++;
        };
        while ($p < $len) {
            $b = ord($buf[$p]);
            if ($b === 0x3B) {
                break;
            }
            if ($b === 0x21) {
                if (self::byte($buf, $p + 1) === 0xFF && self::ascii($buf, $p + 3, $p + 14) === 'NETSCAPE2.0') {
                    $loop = true;
                }
                $p += 2;
                $skipBlocks();
            } elseif ($b === 0x2C) {
                $frames++;
                $lf = self::byte($buf, $p + 9) ?? 0;
                $p += 10;
                if ($lf & 0x80) {
                    $p += 3 * 2 ** (($lf & 7) + 1);
                }
                $p++; // LZW min code size
                $skipBlocks();
            } else {
                break;
            }
        }

        return ['frame_count' => $frames, 'loop' => $loop];
    }

    /** WAV header: sample rate, bit depth, channels, duration. */
    public static function wavInfo(string $buf): array
    {
        $p   = 12;
        $fmt = null;
        $len = strlen($buf);
        while ($p + 8 <= $len) {
            $id   = substr($buf, $p, 4);
            $size = unpack('V', $buf, $p + 4)[1];
            if ($id === 'fmt ' && $len >= $p + 24) {
                $fmt = ['channels' => self::u16le($buf, $p + 10), 'sample_rate' => self::u32le($buf, $p + 12), 'byteRate' => self::u32le($buf, $p + 16), 'bit_depth' => self::u16le($buf, $p + 22)];
            }
            if ($id === 'data' && $fmt !== null) {
                $dur = $fmt['byteRate'] > 0 ? self::jsNum(floor(($size / $fmt['byteRate']) * 1000 + 0.5)) : null;

                return ['channels' => $fmt['channels'], 'sample_rate' => $fmt['sample_rate'], 'bit_depth' => $fmt['bit_depth'], 'duration_ms' => $dur];
            }
            $p += 8 + $size + ($size & 1);
        }
        self::fail('WAV file has no fmt/data chunk.', 'sfx.decode', null);
    }

    /** Family name from a TTF/OTF `name` table (nameID 1), when present. */
    public static function fontFamily(string $buf): ?string
    {
        try {
            $n = self::u16be($buf, 4);
            for ($i = 0; $i < $n; $i++) {
                $rec = 12 + $i * 16;
                if (substr($buf, $rec, 4) !== 'name') {
                    continue;
                }
                $off     = self::u32beStrict($buf, $rec + 8);
                $count   = self::u16be($buf, $off + 2);
                $strings = $off + self::u16be($buf, $off + 4);
                for ($j = 0; $j < $count; $j++) {
                    $r        = $off + 6 + $j * 12;
                    $platform = self::u16be($buf, $r);
                    $nameId   = self::u16be($buf, $r + 6);
                    if ($nameId !== 1) {
                        continue;
                    }
                    $l     = self::u16be($buf, $r + 8);
                    $start = $strings + self::u16be($buf, $r + 10);
                    $raw   = substr($buf, $start, $l);
                    if ($platform === 3 || $platform === 0) {
                        return mb_convert_encoding(strlen($raw) % 2 ? substr($raw, 0, -1) : $raw, 'UTF-8', 'UTF-16BE');
                    }

                    return mb_convert_encoding($raw, 'UTF-8', 'ISO-8859-1');
                }
            }
        } catch (\Throwable) {
            // fall through
        }

        return null;
    }

    /**
     * Type validation (§4.2) for one main file. Returns `['meta', 'checks']`
     * with type-specific metadata. Throws ValidationError for a failed check.
     */
    public static function validateFile(string $type, string $filename, string $buf): array
    {
        $ext    = self::extOf($filename);
        $checks = [];
        $pass   = static function (string $check, mixed $detail = null) use (&$checks) {
            $checks[] = ['check' => $check, 'passed' => true, 'detail' => $detail];
        };
        $meta = [];
        if ($type === 'lut') {
            if ($ext !== 'cube') {
                self::fail('Only .cube LUTs are processed in v1.', 'lut.format', $ext);
            }
            $meta += self::parseCube($buf);
            $pass('lut.size', ['value' => $meta['lut_size']]);
            $pass('lut.range');
        } elseif ($type === 'lottie') {
            if ($ext !== 'json') {
                self::fail('Upload Lottie as Bodymovin .json in v1.', 'lottie.format', $ext);
            }
            try {
                $json = self::parseJson($buf);
            } catch (\JsonException) {
                self::fail("Lottie file isn't valid JSON.", 'lottie.json', null);
            }
            $meta += self::lottieInfo($json);
            $pass('lottie.schema');
            $pass('lottie.expressions');
            $pass('lottie.frames', ['value' => self::jsNum((float) $meta['out_point'] - (float) $meta['in_point'])]);
        } elseif ($type === 'graphic' || $type === 'gif_sticker') {
            if ($ext === 'svg') {
                $problems = self::svgProblems($buf);
                if ($problems !== []) {
                    throw new ValidationError('SVG contains unsafe content.', $problems);
                }
                $meta['vector'] = true;
                $pass('svg.sanitized');
            } else {
                $size = self::imageSize($buf);
                if ($size !== null) {
                    $meta['resolution'] = $size;
                    if ($type === 'graphic' && min($size['w'], $size['h']) < 512) {
                        self::fail('Graphics must be at least 512 px on the shortest side.', 'graphic.min_size', min($size['w'], $size['h']));
                    }
                    if ($type === 'gif_sticker' && max($size['w'], $size['h']) > 1080) {
                        self::fail('Stickers can be at most 1080 px.', 'gif.max_size', max($size['w'], $size['h']));
                    }
                    $pass('image.decodable', $size);
                }
                if ($ext === 'gif') {
                    $meta = array_merge($meta, self::gifInfo($buf));
                    if ($meta['frame_count'] > 1000) {
                        self::fail('GIFs can have at most 1,000 frames.', 'gif.frames', $meta['frame_count']);
                    }
                    $pass('gif.frames', ['value' => $meta['frame_count']]);
                }
            }
            $meta['has_alpha'] = in_array($ext, ['png', 'webp', 'gif', 'svg', 'mov', 'webm'], true);
        } elseif ($type === 'sfx') {
            if ($ext === 'wav') {
                $meta += self::wavInfo($buf);
                if (! in_array($meta['sample_rate'], [44100, 48000], true)) {
                    self::fail('Audio must be 44.1 or 48 kHz.', 'sfx.sample_rate', $meta['sample_rate']);
                }
                if ($meta['duration_ms'] > 10 * 60 * 1000) {
                    self::fail('Audio can be at most 10 minutes.', 'sfx.duration', $meta['duration_ms']);
                }
                $pass('sfx.decode', ['sample_rate' => $meta['sample_rate']]);
            }
        } elseif ($type === 'font') {
            $family = $ext === 'woff2' ? null : self::fontFamily($buf);
            if ($family !== null && $family !== '') {
                $meta['family'] = $family;
            }
            $pass('font.parse', ['family' => $family]);
        } elseif ($type === 'brand_kit' && $ext === 'json') {
            $j      = json_decode($buf, true);
            $colors = is_array($j) && is_array($j['colors'] ?? null) && array_is_list($j['colors']) ? $j['colors'] : [];
            foreach ($colors as $c) {
                $hex = is_array($c) ? ($c['hex'] ?? null) : null;
                if (preg_match('/^#[0-9a-f]{6}([0-9a-f]{2})?$/i', self::jsString($hex ?? '')) !== 1) {
                    self::fail('Brand kit colours must be hex.', 'brand.hex', $hex, 'colors');
                }
            }
            $meta['colors'] = $colors;
            $pass('brand.colors', ['count' => count($colors)]);
        } elseif (in_array($type, ['text_template', 'video_template', 'transition', 'filter'], true)) {
            // FrameFlow applies these as JSON presets over its built-in renderers.
            try {
                $j = self::parseJson($buf);
            } catch (\JsonException) {
                self::fail('Upload ' . preg_replace('/_/', ' ', $type, 1) . 's as a JSON preset in v1.', 'preset.json', $ext);
            }
            $bad = static fn (string $rule, string $message) => self::fail($message, $rule, null);
            $arr = static fn ($v) => json_decode(Json::encode($v), true);
            if ($type === 'text_template') {
                if (! is_string(self::prop(self::prop($j, 'params'), 'content'))) {
                    $bad('text.params', 'Text templates need params with a content string.');
                }
                $meta['placeholders'] = is_array(self::prop($j, 'placeholders')) ? $arr($j->placeholders) : [];
                $meta['font_refs']    = is_array(self::prop($j, 'font_refs')) ? $arr($j->font_refs) : [];
            } elseif ($type === 'video_template') {
                $layers = self::prop($j, 'layers');
                $aspect = self::prop($j, 'aspect');
                $isNum  = static fn ($v) => is_int($v) || is_float($v);
                if (! is_array($layers) || $layers === [] || ! $isNum(self::prop($aspect, 'width')) || ! $isNum(self::prop($aspect, 'height'))) {
                    $bad('template.layers', 'Video templates need aspect (width, height) and layers.');
                }
                $meta['scenes'] = count(array_filter($layers, static fn ($l) => self::prop($l, 'kind') === 'media'));
                $end            = max(array_map(static fn ($l) => (float) (self::prop($l, 'start') ?? 0) + (float) (self::prop($l, 'duration') ?? 0), $layers));
                $meta['total_duration_ms'] = self::jsNum(floor($end * 1000 + 0.5));
            } elseif ($type === 'transition') {
                $v = self::prop($j, 'value') ?? $j;
                if (! in_array(self::prop($v, 'type'), self::TRANSITION_ENGINES, true)) {
                    $bad('transition.type', "Transition type must be one of FrameFlow's: " . implode(', ', self::TRANSITION_ENGINES) . '.');
                }
                $meta['render_engine']       = $v->type;
                $meta['default_duration_ms'] = self::jsNum(floor((float) (self::prop($v, 'duration') ?? 0.8) * 1000 + 0.5));
            } else {
                $grade = self::prop($j, 'grade');
                if (! $grade instanceof \stdClass || get_object_vars($grade) === []) {
                    $bad('filter.grade', 'Filters need a grade object (colour-grade params).');
                }
            }
            $pass('preset.schema');
        }

        return ['meta' => $meta, 'checks' => $checks];
    }

    // ---------- publish gate (§4.3) ----------

    /**
     * Problems that block publishing `asset` (empty when it can go out).
     *
     * @param list<array<string, mixed>> $dependencies
     *
     * @return list<array{field: string, rule: string, message: string}>
     */
    public static function publishProblems(array $asset, bool $direct = false, array $dependencies = []): array
    {
        $p   = [];
        $bad = static function (string $rule, string $message) use (&$p) {
            $p[] = ['field' => explode('.', $rule)[0], 'rule' => $rule, 'message' => $message];
        };
        $status = $asset['status'] ?? null;
        if ($status !== 'approved' && ! ($direct && in_array($status, ['draft', 'ready_for_review', 'approved', 'deprecated'], true))) {
            $bad('status.approved', 'The asset must be approved first.');
        }
        if (empty($asset['thumbnail_file'])) {
            $bad('thumbnail.required', 'A thumbnail is required.');
        }
        if (empty($asset['category_id'])) {
            $bad('category.required', 'A category is required.');
        }
        if (! self::isSemver($asset['min_app_version'] ?? '')) {
            $bad('min_app_version.required', 'Minimum FrameFlow version is required.');
        }
        if (! in_array($asset['licence_tier'] ?? null, self::TIERS, true) || ! in_array($asset['licence_terms'] ?? null, self::LICENCE_TERMS, true)) {
            $bad('licence.complete', 'Licence tier and terms are required.');
        }
        if (($asset['licence_terms'] ?? null) === 'custom' && self::str($asset['licence_text'] ?? null) === '') {
            $bad('licence.custom_text', 'Custom licence terms need text.');
        }
        if (! empty($asset['attribution_required']) && self::str($asset['attribution_text'] ?? null) === '') {
            $bad('attribution.text', 'Attribution text is required.');
        }
        $versions = $asset['versions'] ?? [];
        $version  = null;
        foreach ($versions as $v) {
            if (($v['version'] ?? null) === ($asset['current_version'] ?? null)) {
                $version = $v;
                break;
            }
        }
        $version ??= $versions === [] ? null : $versions[array_key_last($versions)];
        if ($version === null) {
            $bad('version.required', 'Upload a file first.');
        } else {
            foreach ($version['checks'] ?? [] as $c) {
                if (empty($c['passed'])) {
                    $bad('checks.passed', 'A validation check failed.');
                    break;
                }
            }
        }
        foreach ($dependencies as $d) {
            if (($d['status'] ?? null) !== 'published') {
                $bad('dependencies.published', 'Dependency ' . ($d['slug'] ?? $d['id'] ?? '') . " isn't published.");
            }
        }
        $allow = false;
        foreach ($asset['audience_rules'] ?? [] as $r) {
            $allow = $allow || (is_array($r) && ($r['effect'] ?? null) === 'allow');
        }
        if (! in_array($asset['visibility'] ?? null, ['public', 'unlisted'], true) && ! $allow) {
            $bad('audience.rule', 'Non-public assets need at least one allow audience rule.');
        }

        return $p;
    }

    // ---------- FrameFlow mapping ----------

    /**
     * Splits search terms into the en/si/ta buckets FrameFlow's catalog uses.
     *
     * @param list<string> $terms
     */
    public static function tagsByScript(array $terms): array
    {
        $out = ['en' => [], 'si' => [], 'ta' => []];
        foreach ($terms as $t) {
            if (preg_match('/[\x{0D80}-\x{0DFF}]/u', $t)) {
                $out['si'][] = $t;
            } elseif (preg_match('/[\x{0B80}-\x{0BFF}]/u', $t)) {
                $out['ta'][] = $t;
            } else {
                $out['en'][] = $t;
            }
        }

        return $out;
    }

    /** FrameFlow's pack plan for a licence tier (the app knows free and pro). */
    public static function planOf(?string $tier): string
    {
        return $tier === 'free' ? 'free' : 'pro';
    }

    public static function planRank(?string $plan): int
    {
        $i = array_search($plan, self::TIERS, true);

        return $i === false ? 0 : $i;
    }
}
