<?php

namespace App\Libraries\Search;

use App\Libraries\AssetSchema;
use App\Libraries\Json;

/**
 * Optional Meilisearch index of live assets (blueprint §13): title, slug,
 * tags, keywords, category, author, type and tier, with typo tolerance and
 * Sinhala/Tamil keywords registered as synonyms of the asset's English tags.
 * Enabled by MEILI_URL (+ MEILI_KEY, MEILI_INDEX default `library_assets`).
 * Every call has a short timeout; callers fall back to SQL search on failure.
 */
class MeiliSearch
{
    private bool $configured = false;

    public function __construct(
        private readonly string $url,
        private readonly string $key = '',
        public readonly string $index = 'library_assets',
        private readonly int $timeoutMs = 3000,
    ) {
    }

    public static function fromEnv(): ?self
    {
        $url = getenv('MEILI_URL') ?: '';

        return $url === '' ? null : new self(rtrim($url, '/'), (string) (getenv('MEILI_KEY') ?: ''), (string) (getenv('MEILI_INDEX') ?: 'library_assets'));
    }

    /** @return array{0: int, 1: mixed} status and decoded body */
    protected function request(string $method, string $path, mixed $body = null): array
    {
        $ch = curl_init($this->url . $path);
        $headers = ['Content-Type: application/json'];
        if ($this->key !== '') {
            $headers[] = 'Authorization: Bearer ' . $this->key;
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT_MS     => $this->timeoutMs,
            CURLOPT_FOLLOWLOCATION => false,
        ] + ($body === null ? [] : [CURLOPT_POSTFIELDS => Json::encode($body)]));
        $out    = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err    = curl_error($ch);
        curl_close($ch);
        if ($out === false || $status === 0) {
            throw new \RuntimeException("Meilisearch unreachable: {$err}");
        }
        if ($status >= 400) {
            throw new \RuntimeException("Meilisearch {$method} {$path}: HTTP {$status}");
        }

        return [$status, Json::decode((string) $out)];
    }

    /** Creates the index and its settings once per process. */
    private function ensureIndex(): void
    {
        if ($this->configured) {
            return;
        }
        $this->request('PATCH', "/indexes/{$this->index}/settings", [
            'searchableAttributes' => ['title', 'slug', 'tags', 'keywords', 'category', 'author', 'type'],
            'filterableAttributes' => ['type', 'tier', 'category_id'],
            'typoTolerance'        => ['enabled' => true],
        ]);
        $this->configured = true;
    }

    /** The document indexed for an asset (public fields only). */
    public static function document(array $asset, ?array $category): array
    {
        return [
            'id'          => $asset['id'],
            'title'       => $asset['title'],
            'slug'        => $asset['slug'],
            'tags'        => array_values($asset['tags']),
            'keywords'    => array_values($asset['keywords']),
            'category'    => $category['name'] ?? '',
            'category_id' => $asset['category_id'],
            'author'      => $asset['author'],
            'type'        => $asset['type'],
            'tier'        => $asset['licence_tier'],
        ];
    }

    /** Sinhala/Tamil keywords ↔ the asset's English tags (both directions). */
    public static function synonymsFor(array $asset): array
    {
        $by  = AssetSchema::tagsByScript(array_values(array_unique(array_merge($asset['tags'], $asset['keywords']))));
        $en  = $by['en'];
        $loc = array_merge($by['si'], $by['ta']);
        $out = [];
        if ($en === [] || $loc === []) {
            return $out;
        }
        foreach ($loc as $l) {
            $out[$l] = $en;
        }
        foreach ($en as $e) {
            $out[$e] = $loc;
        }

        return $out;
    }

    public function upsert(array $asset, ?array $category): void
    {
        $this->ensureIndex();
        $this->request('POST', "/indexes/{$this->index}/documents?primaryKey=id", [self::document($asset, $category)]);
        $add = self::synonymsFor($asset);
        if ($add !== []) {
            [, $current] = $this->request('GET', "/indexes/{$this->index}/settings/synonyms");
            $merged      = is_array($current) ? $current : [];
            foreach ($add as $word => $syn) {
                $merged[$word] = array_values(array_unique(array_merge($merged[$word] ?? [], $syn)));
            }
            if ($merged != $current) {
                $this->request('PUT', "/indexes/{$this->index}/settings/synonyms", $merged);
            }
        }
    }

    public function delete(string $assetId): void
    {
        $this->request('DELETE', "/indexes/{$this->index}/documents/" . rawurlencode($assetId));
    }

    /** Matching asset ids, best first. */
    public function search(string $q, int $limit = 1000): array
    {
        [, $res] = $this->request('POST', "/indexes/{$this->index}/search", ['q' => $q, 'limit' => $limit, 'attributesToRetrieve' => ['id']]);

        return array_values(array_filter(array_map(static fn ($h) => is_array($h) ? ($h['id'] ?? null) : null, $res['hits'] ?? [])));
    }
}
