<?php

namespace App\Libraries\Pack;

use App\Libraries\AssetSchema;
use App\Libraries\Json;

/**
 * Packaging (§5 stage 5) in the format the FrameFlow desktop installer reads
 * (worksuite-frameflow electron/asset-pack-io.js): deterministic ZIPs with
 * pack.json + index.json, sha256, and the signed catalog.json.
 * Port of apps/api/src/pack.js.
 */
final class PackBuilder
{
    /** FrameFlow pack id for an asset (its slug; FrameFlow allows up to 64 chars). */
    public static function packIdOf(array $asset): string
    {
        return preg_replace('/-+$/', '', substr((string) $asset['slug'], 0, 64));
    }

    /**
     * The search terms an asset publishes: tags, keywords, category names.
     *
     * @return list<string>
     */
    public static function termsOf(array $asset, ?array $category): array
    {
        $all = array_merge($asset['tags'] ?? [], $asset['keywords'] ?? [], $category ? [mb_strtolower((string) $category['name'])] : []);

        return array_values(array_unique($all));
    }

    private static function json(mixed $v): string
    {
        return Json::pretty($v) . "\n";
    }

    private static function ext(string $filename, string $default = ''): string
    {
        return preg_match('/\.[a-z0-9]+$/', strtolower($filename), $m) ? $m[0] : $default;
    }

    /** index.json in the shape FrameFlow's registry reads for its pack type. */
    private static function indexFor(array $asset, array $version, ?array $category, array $files): array
    {
        $pack = AssetSchema::ASSET_TYPES[$asset['type']]['pack'];
        $main = null;
        $thumb = null;
        foreach ($files as $f) {
            $main  ??= $f['role'] === 'main' ? $f : null;
            $thumb ??= $f['role'] === 'thumbnail' ? $f : null;
        }
        $m = array_merge($asset['meta'] ?? [], $version['meta'] ?? []);
        if ($pack === 'motion') {
            $res = $m['resolution'] ?? ['w' => 1920, 'h' => 1080];
            $own = [];
            foreach ($files as $f) {
                if (str_starts_with($f['path'], $asset['slug'] . '/')) {
                    $own[substr($f['path'], strlen($asset['slug']) + 1)] = ['sha256' => hash('sha256', $f['data'])];
                }
            }
            $durationMs = $m['duration_ms'] ?? 3000;

            return [
                'schema'     => 1,
                'name'       => $asset['title'],
                'license'    => $asset['licence_terms'],
                'categories' => [['id' => $category['slug'] ?? 'library', 'name' => $category['name'] ?? 'Library', 'count' => 1]],
                'assets'     => [[
                    'id'          => $asset['slug'],
                    'name'        => $asset['title'],
                    'category'    => $category['slug'] ?? 'library',
                    'path'        => $asset['slug'],
                    'tags'        => self::termsOf($asset, $category),
                    'durationSec' => self::num($durationMs / 1000),
                    'loop'        => ! empty($m['loop']),
                    'width'       => $res['w'] ?? null,
                    'height'      => $res['h'] ?? null,
                    'colors'      => $m['editable_colors'] ?? [],
                    'files'       => Json::obj($own),
                ]],
            ];
        }
        if ($pack === 'sounds') {
            return ['schema' => 1, 'name' => $asset['title'], 'sounds' => [['id' => $asset['slug'], 'name' => $asset['title'], 'file' => $main['path'], 'sha256' => hash('sha256', $main['data'])]]];
        }
        if ($pack === 'fonts') {
            return ['schema' => 1, 'name' => $asset['title'], 'fonts' => [['family' => $m['family'] ?? $asset['title'], 'weight' => $m['weight'] ?? 400, 'style' => ! empty($m['italic']) ? 'italic' : 'normal', 'file' => $main['path']]]];
        }

        return [
            'schema' => 1,
            'name'   => $asset['title'],
            'items'  => [array_merge(['id' => $asset['slug'], 'name' => $asset['title'], 'file' => $main['path'] ?? null, 'type' => $asset['type'], 'thumbnail' => $thumb['path'] ?? null], $m)],
        ];
    }

    private static function num(float|int $v): float|int
    {
        return is_float($v) && floor($v) === $v ? (int) $v : $v;
    }

    /**
     * Builds the pack zip for one version: pack.json, index.json,
     * manifest.json (frameflow.asset/1), licence.txt, the payload and its
     * thumbnail. `$readFile(sha256)` returns an uploaded file's bytes.
     *
     * @return array{zip: string, sha256: string, size: int, packJson: array, manifest: array, thumbnail: ?array}
     */
    public static function buildPackage(array $asset, array $version, ?array $category, callable $readFile): array
    {
        $slug  = $asset['slug'];
        $files = [];
        foreach ($version['files'] as $f) {
            $ext  = self::ext($f['filename']);
            $name = $f['role'] === 'thumbnail' ? "thumbnail{$ext}" : ($f['role'] === 'main' ? "{$slug}{$ext}" : preg_replace('/[^A-Za-z0-9_.-]/', '_', $f['filename']));
            $files[] = ['role' => $f['role'], 'path' => "{$slug}/{$name}", 'data' => $readFile($f['sha256'])];
        }
        $hasThumb = false;
        foreach ($files as $f) {
            $hasThumb = $hasThumb || $f['role'] === 'thumbnail';
        }
        if (! empty($asset['thumbnail_file']) && ! $hasThumb) {
            $ext     = self::ext($asset['thumbnail_file']['filename'], '.png');
            $files[] = ['role' => 'thumbnail', 'path' => "{$slug}/thumbnail{$ext}", 'data' => $readFile($asset['thumbnail_file']['sha256'])];
        }
        $packType    = AssetSchema::ASSET_TYPES[$asset['type']]['pack'];
        $attribution = ! empty($asset['attribution_required']);
        $licence     = "{$asset['title']}\nLicence: {$asset['licence_tier']} · {$asset['licence_terms']}\n" . ($asset['licence_text'] ?? '') . "\n"
            . ($attribution ? "Attribution: {$asset['attribution_text']}\n" : '')
            . (! empty($asset['author']) ? "Author: {$asset['author']}\n" : '');
        $minApp   = $version['min_app_version'] ?? $asset['min_app_version'];
        $packJson = [
            'id'            => self::packIdOf($asset),
            'type'          => $packType,
            'version'       => $version['version'],
            'title'         => $asset['title'],
            'description'   => ($asset['description'] ?? '') !== '' ? $asset['description'] : $asset['title'],
            'tags'          => AssetSchema::tagsByScript(self::termsOf($asset, $category)),
            'languages'     => ['en'],
            'licence'       => $asset['licence_terms'] . ($attribution ? " (attribution: {$asset['attribution_text']})" : ''),
            'minAppVersion' => $minApp,
            'plan'          => AssetSchema::planOf($asset['licence_tier']),
        ];
        $main = null;
        foreach ($files as $f) {
            $main ??= $f['role'] === 'main' ? $f : null;
        }
        $manifest = [
            'schema'          => 'frameflow.asset/1',
            'id'              => $asset['id'],
            'slug'            => $slug,
            'type'            => $asset['type'],
            'version'         => $version['version'],
            'min_app_version' => $minApp,
            'entry'           => $main['path'] ?? null,
            'files'           => array_map(static fn ($f) => ['path' => $f['path'], 'sha256' => hash('sha256', $f['data']), 'size' => strlen($f['data'])], $files),
            'dependencies'    => $asset['dependencies'] ?? [],
            'params'          => $asset['meta']['params'] ?? [],
            'licence'         => ['tier' => $asset['licence_tier'], 'terms' => $asset['licence_terms']],
        ];
        $entries = [
            ['name' => 'pack.json', 'data' => self::json($packJson)],
            ['name' => 'index.json', 'data' => self::json(self::indexFor($asset, $version, $category, $files))],
            ['name' => 'manifest.json', 'data' => self::json($manifest)],
            ['name' => 'licence.txt', 'data' => $licence],
        ];
        foreach ($files as $f) {
            $entries[] = ['name' => $f['path'], 'data' => $f['data']];
        }
        $zip   = Zip::create($entries);
        $thumb = null;
        foreach ($files as $f) {
            $thumb ??= $f['role'] === 'thumbnail' ? $f : null;
        }

        return ['zip' => $zip, 'sha256' => hash('sha256', $zip), 'size' => strlen($zip), 'packJson' => $packJson, 'manifest' => $manifest, 'thumbnail' => $thumb];
    }

    /**
     * catalog.json for a channel (FrameFlow schema 1). `$entries` are
     * `['asset', 'version', 'category']` for each published asset.
     */
    public static function buildCatalog(string $channel, array $entries, string $generatedAt): array
    {
        $entries = array_values(array_filter($entries, static fn ($e) => ! empty($e['version']['package'])));
        $coll    = class_exists(\Collator::class) ? new \Collator('root') : null;
        usort($entries, static fn ($a, $b) => $coll ? $coll->compare($a['asset']['slug'], $b['asset']['slug']) : strcmp($a['asset']['slug'], $b['asset']['slug']));
        $packs = [];
        foreach ($entries as ['asset' => $asset, 'version' => $version, 'category' => $category]) {
            $id    = self::packIdOf($asset);
            $base  = "packs/{$id}-{$version['version']}";
            $thumb = $version['package']['thumbnail'] ?? null;
            $packs[] = [
                'id'             => $id,
                'type'           => AssetSchema::ASSET_TYPES[$asset['type']]['pack'],
                'version'        => $version['version'],
                'title'          => $asset['title'],
                'description'    => ($asset['description'] ?? '') !== '' ? $asset['description'] : $asset['title'],
                'tags'           => AssetSchema::tagsByScript(self::termsOf($asset, $category)),
                'languages'      => ['en'],
                'sizeBytes'      => $version['package']['size'],
                'sha256'         => $version['package']['sha256'],
                'licence'        => $asset['licence_terms'],
                'minAppVersion'  => $version['min_app_version'] ?? $asset['min_app_version'],
                'thumbnailUrl'   => $thumb ? $base . $thumb['ext'] : null,
                'previewUrl'     => $thumb ? $base . $thumb['ext'] : null,
                'files'          => "{$base}.zip",
                'plan'           => AssetSchema::planOf($asset['licence_tier']),
                'assetCount'     => 1,
                'assetIds'       => [$asset['slug']],
                'libraryAssetId' => $asset['id'],
                'libraryType'    => $asset['type'],
            ];
        }

        return ['schema' => 1, 'channel' => $channel, 'generatedAt' => $generatedAt, 'packs' => $packs];
    }
}
