<?php

namespace App\Services;

use App\Libraries\Json;
use App\Services\Concerns\StoresClientAndAdminRecords;
use App\Models\AssetModel;
use App\Models\AssetVersionModel;
use App\Models\AuditLogModel;
use App\Models\CategoryModel;
use App\Models\DownloadModel;
use App\Models\JobModel;
use App\Models\MetaModel;
use App\Models\SyncEventModel;
use App\Models\UploadModel;
use App\Models\UsageEventModel;
use CodeIgniter\Database\BaseConnection;

/**
 * Maps library records between the database rows (CreateLibraryTables) and
 * the document shapes the API returns (the same shapes the Node service
 * kept in its JSON state). Assets are cached per request in an identity map.
 */
class LibraryStore
{
    use StoresClientAndAdminRecords;

    public readonly BaseConnection $db;

    private AssetModel $assets;
    private AssetVersionModel $versions;
    private CategoryModel $categories;
    private UploadModel $uploads;
    private SyncEventModel $sync;
    private AuditLogModel $audit;
    private DownloadModel $downloads;
    private UsageEventModel $usage;
    private MetaModel $meta;
    private JobModel $jobs;

    /** @var array<string, array>|null id => asset, in insertion order, once all are loaded */
    private ?array $all = null;

    /** @var array<string, array> id => asset */
    private array $cache = [];

    /** @var list<array>|null */
    private ?array $categoryCache = null;

    public function __construct(?BaseConnection $db = null)
    {
        $this->db         = $db ?? db_connect();
        $this->assets     = new AssetModel($this->db);
        $this->versions   = new AssetVersionModel($this->db);
        $this->categories = new CategoryModel($this->db);
        $this->uploads    = new UploadModel($this->db);
        $this->sync       = new SyncEventModel($this->db);
        $this->audit      = new AuditLogModel($this->db);
        $this->downloads  = new DownloadModel($this->db);
        $this->usage      = new UsageEventModel($this->db);
        $this->meta       = new MetaModel($this->db);
        $this->jobs       = new JobModel($this->db);
    }

    /** Drops cached rows (after a rolled-back transaction). */
    public function forget(): void
    {
        $this->all           = null;
        $this->cache         = [];
        $this->categoryCache = null;
    }

    // ---------- assets ----------

    private const ASSET_JSON = ['tags', 'keywords', 'aspect_ratios', 'platforms', 'audience_rules', 'dependencies', 'featured_rank', 'publish_at', 'unpublish_at', 'meta', 'thumbnail_file', 'review'];

    /** @return list<array> every asset, oldest first */
    public function allAssets(): array
    {
        if ($this->all === null) {
            $rows     = $this->assets->orderBy('row_id', 'ASC')->findAll();
            $versions = $this->versionsFor(array_column($rows, 'id'));
            $this->all = [];
            foreach ($rows as $row) {
                $a                       = $this->assetFromRow($row, $versions[$row['id']] ?? []);
                $this->all[$a['id']]     = $this->cache[$a['id']] ?? $a;
                $this->cache[$a['id']]   = $this->all[$a['id']];
            }
        }

        return array_values($this->all);
    }

    public function findAsset(string $idOrSlug): ?array
    {
        if (isset($this->cache[$idOrSlug])) {
            return $this->cache[$idOrSlug];
        }
        foreach ($this->cache as $a) {
            if ($a['slug'] === $idOrSlug) {
                return $a;
            }
        }
        if ($this->all !== null) {
            return null;
        }
        $row = $this->assets->where('id', $idOrSlug)->first() ?? $this->assets->where('slug', $idOrSlug)->first();
        if ($row === null) {
            return null;
        }
        $a                     = $this->assetFromRow($row, $this->versionsFor([$row['id']])[$row['id']] ?? []);
        $this->cache[$a['id']] = $a;

        return $a;
    }

    public function slugTaken(string $slug): bool
    {
        foreach ($this->cache as $a) {
            if ($a['slug'] === $slug) {
                return true;
            }
        }

        return $this->assets->where('slug', $slug)->countAllResults() > 0;
    }

    /** Inserts or updates an asset and its versions. */
    public function saveAsset(array $asset): void
    {
        $row    = $this->assetToRow($asset);
        $exists = $this->assets->where('id', $asset['id'])->countAllResults() > 0;
        if ($exists) {
            $this->assets->builder()->where('id', $asset['id'])->update($row);
        } else {
            $this->assets->builder()->insert($row);
        }
        $known = array_column($this->versions->select('id')->where('asset_id', $asset['id'])->findAll(), 'id');
        foreach ($asset['versions'] as $v) {
            $vrow = $this->versionToRow($asset['id'], $v);
            if (in_array($v['id'], $known, true)) {
                $this->versions->builder()->where('id', $v['id'])->update($vrow);
            } else {
                $this->versions->builder()->insert($vrow);
            }
        }
        $this->cache[$asset['id']] = $asset;
        if ($this->all !== null) {
            $this->all[$asset['id']] = $asset;
        }
    }

    /** Asset ids with a version holding a file with this sha256. */
    public function assetWithFile(string $sha): ?string
    {
        $rows = $this->versions->select('asset_id, files')->like('files', $sha)->orderBy('row_id', 'ASC')->findAll();
        foreach ($rows as $r) {
            foreach (Json::decode($r['files'], []) as $f) {
                if (($f['sha256'] ?? null) === $sha) {
                    return $r['asset_id'];
                }
            }
        }

        return null;
    }

    /** Which asset version a package zip belongs to; null when none. */
    public function tierOfPackage(callable $nameOf): ?string
    {
        foreach ($this->allAssets() as $a) {
            foreach ($a['versions'] as $v) {
                if ($nameOf($a, $v)) {
                    return $a['licence_tier'];
                }
            }
        }

        return null;
    }

    /** @return array<string, list<array>> */
    private function versionsFor(array $assetIds): array
    {
        if ($assetIds === []) {
            return [];
        }
        $out = [];
        foreach (array_chunk($assetIds, 500) as $chunk) {
            foreach ($this->versions->whereIn('asset_id', $chunk)->orderBy('row_id', 'ASC')->findAll() as $r) {
                $out[$r['asset_id']][] = $this->versionFromRow($r);
            }
        }

        return $out;
    }

    private function assetFromRow(array $r, array $versions): array
    {
        $j = static fn (string $k, mixed $d = null) => Json::decode($r[$k] ?? null, $d);
        $a = [
            'id'                   => $r['id'],
            'type'                 => $r['type'],
            'slug'                 => $r['slug'],
            'title'                => $r['title'],
            'description'          => $r['description'] ?? '',
            'tags'                 => $j('tags', []),
            'keywords'             => $j('keywords', []),
            'min_app_version'      => $r['min_app_version'],
            'licence_tier'         => $r['licence_tier'],
            'licence_terms'        => $r['licence_terms'],
            'visibility'           => $r['visibility'],
            'category_id'          => $r['category_id'],
            'subcategory_id'       => $r['subcategory_id'],
            'licence_text'         => $r['licence_text'] ?? '',
            'attribution_required' => (bool) $r['attribution_required'],
            'attribution_text'     => $r['attribution_text'] ?? '',
            'author'               => $r['author'] ?? '',
            'aspect_ratios'        => $j('aspect_ratios', []),
            'platforms'            => $j('platforms', []),
            'audience_rules'       => $j('audience_rules', []),
            'dependencies'         => $j('dependencies', []),
            'featured'             => (bool) $r['featured'],
            'featured_rank'        => $j('featured_rank'),
            'publish_at'           => $j('publish_at'),
            'unpublish_at'         => $j('unpublish_at'),
            'meta'                 => $j('meta', []),
            'thumbnail_file'       => $j('thumbnail_file'),
            'status'               => $r['status'],
            'current_version'      => $r['current_version'],
            'published_version'    => $r['published_version'],
            'versions'             => $versions,
            'stats'                => ['downloads' => (int) $r['stats_downloads'], 'installs' => (int) $r['stats_installs'], 'favorites' => (int) $r['stats_favorites'], 'applies' => (int) $r['stats_applies']],
            'created_by'           => $r['created_by'],
            'created_at'           => $r['created_at'],
            'updated_by'           => $r['updated_by'],
            'updated_at'           => $r['updated_at'],
            'published_by'         => $r['published_by'],
            'published_at'         => $r['published_at'],
        ];
        // Keys the Node service only had once set.
        if ($r['pending_version'] !== null) {
            $a['pending_version'] = $r['pending_version'];
        }
        if ($r['review'] !== null) {
            $a['review'] = $j('review');
        }

        return $a;
    }

    private function assetToRow(array $a): array
    {
        $row = [];
        foreach (['id', 'type', 'slug', 'title', 'description', 'min_app_version', 'licence_tier', 'licence_terms', 'visibility', 'category_id', 'subcategory_id', 'licence_text', 'attribution_text', 'author', 'status', 'current_version', 'published_version', 'created_by', 'created_at', 'updated_by', 'updated_at', 'published_by', 'published_at'] as $k) {
            $v       = $a[$k] ?? null;
            $row[$k] = is_array($v) || is_bool($v) ? Json::encode($v) : $v;
        }
        foreach (self::ASSET_JSON as $k) {
            $row[$k] = array_key_exists($k, $a) && $a[$k] !== null ? Json::encode($a[$k]) : null;
        }
        $row['attribution_required'] = empty($a['attribution_required']) ? 0 : 1;
        $row['featured']             = empty($a['featured']) ? 0 : 1;
        $row['pending_version']      = $a['pending_version'] ?? null;
        foreach (['downloads', 'installs', 'favorites', 'applies'] as $s) {
            $row["stats_{$s}"] = (int) ($a['stats'][$s] ?? 0);
        }

        return $row;
    }

    private function versionFromRow(array $r): array
    {
        $v = [
            'id'              => $r['id'],
            'version'         => $r['version'],
            'changelog'       => $r['changelog'] ?? '',
            'is_breaking'     => (bool) $r['is_breaking'],
            'min_app_version' => $r['min_app_version'],
            'files'           => Json::decode($r['files'], []),
            'checks'          => Json::decode($r['checks'], []),
            'meta'            => Json::decode($r['meta'], []),
            'status'          => $r['status'],
            'package'         => $r['sha256'] === null ? null : [
                'sha256'    => $r['sha256'],
                'size'      => (int) $r['size_bytes'],
                'signature' => $r['signature'],
                'thumbnail' => $r['thumbnail_ext'] === null ? null : ['ext' => $r['thumbnail_ext']],
                'built_at'  => $r['built_at'],
            ],
            'created_by' => $r['created_by'],
            'created_at' => $r['created_at'],
        ];
        if ($r['retired_at'] !== null) {
            $v['retired_at'] = $r['retired_at'];
        }
        if ($r['processing'] !== null) {
            $v['processing'] = Json::decode($r['processing']);
        }
        if ($r['previews'] !== null) {
            $v['previews'] = Json::decode($r['previews'], []);
        }

        return $v;
    }

    private function versionToRow(string $assetId, array $v): array
    {
        $p = $v['package'] ?? null;

        return [
            'id'              => $v['id'],
            'asset_id'        => $assetId,
            'version'         => $v['version'],
            'changelog'       => is_string($v['changelog'] ?? null) ? $v['changelog'] : Json::encode($v['changelog'] ?? ''),
            'is_breaking'     => empty($v['is_breaking']) ? 0 : 1,
            'min_app_version' => $v['min_app_version'] ?? null,
            'files'           => Json::encode($v['files']),
            'checks'          => Json::encode($v['checks']),
            'meta'            => Json::encode(Json::obj($v['meta'] ?? [])),
            'status'          => $v['status'],
            'package_key'     => $p ? ($v['package_key'] ?? null) : null,
            'size_bytes'      => $p['size'] ?? null,
            'sha256'          => $p['sha256'] ?? null,
            'signature'       => $p['signature'] ?? null,
            'thumbnail_ext'   => $p['thumbnail']['ext'] ?? null,
            'built_at'        => $p['built_at'] ?? null,
            'retired_at'      => $v['retired_at'] ?? null,
            'processing'      => isset($v['processing']) ? Json::encode($v['processing']) : null,
            'previews'        => isset($v['previews']) ? Json::encode(Json::obj($v['previews'])) : null,
            'created_by'      => $v['created_by'] ?? null,
            'created_at'      => $v['created_at'] ?? null,
        ];
    }

    // ---------- categories ----------

    /** @return list<array> in insertion order */
    public function categories(): array
    {
        if ($this->categoryCache === null) {
            $this->categoryCache = array_map(static fn (array $r) => [
                'id'        => $r['id'],
                'type'      => $r['type'],
                'name'      => $r['name'],
                'slug'      => $r['slug'],
                'parent_id' => $r['parent_id'],
                'sort'      => is_numeric($r['sort']) ? (int) $r['sort'] : $r['sort'],
                'icon'      => $r['icon'],
                'visible'   => (bool) $r['visible'],
            ], $this->categories->orderBy('row_id', 'ASC')->findAll());
        }

        return $this->categoryCache;
    }

    public function category(?string $id): ?array
    {
        if ($id === null) {
            return null;
        }
        foreach ($this->categories() as $c) {
            if ($c['id'] === $id) {
                return $c;
            }
        }

        return null;
    }

    public function insertCategory(array $c): void
    {
        $this->categories->builder()->insert(['id' => $c['id'], 'type' => $c['type'], 'name' => $c['name'], 'slug' => $c['slug'], 'parent_id' => $c['parent_id'], 'sort' => (int) $c['sort'], 'icon' => is_string($c['icon']) ? $c['icon'] : null, 'visible' => $c['visible'] ? 1 : 0]);
        $this->categoryCache = null;
    }

    public function categoryCount(): int
    {
        return $this->categories->countAllResults();
    }

    // ---------- uploads ----------

    public function upload(string $id): ?array
    {
        $r = $this->uploads->where('id', $id)->first();

        return $r === null ? null : [
            'id'           => $r['id'],
            'filename'     => $r['filename'],
            'sha256'       => $r['sha256'],
            'size'         => (int) $r['size'],
            'type'         => $r['type'],
            'checks'       => Json::decode($r['checks'], []),
            'meta'         => Json::decode($r['meta'], []),
            'duplicate_of' => $r['duplicate_of'],
            'created_by'   => $r['created_by'],
            'created_at'   => $r['created_at'],
        ];
    }

    public function saveUpload(array $u): void
    {
        $row = ['id' => $u['id'], 'filename' => $u['filename'], 'sha256' => $u['sha256'], 'size' => $u['size'], 'type' => $u['type'], 'checks' => Json::encode($u['checks']), 'meta' => Json::encode(Json::obj($u['meta'])), 'duplicate_of' => $u['duplicate_of'], 'created_by' => $u['created_by'], 'created_at' => $u['created_at']];
        if ($this->uploads->where('id', $u['id'])->countAllResults() > 0) {
            $this->uploads->builder()->where('id', $u['id'])->update($row);
        } else {
            $this->uploads->builder()->insert($row);
        }
    }

    // ---------- sync events ----------

    /** Appends an event; returns its seq. */
    public function addSyncEvent(string $op, ?array $asset, array $extra, string $at): int
    {
        $this->sync->builder()->insert(['op' => $op, 'asset_id' => $asset['id'] ?? null, 'type' => $asset['type'] ?? null, 'version' => $asset['current_version'] ?? null, 'payload' => Json::encode(Json::obj($extra)), 'created_at' => $at]);

        return (int) $this->db->insertID();
    }

    private function syncFromRow(array $r): array
    {
        $e = ['seq' => (int) $r['seq'], 'op' => $r['op'], 'asset_id' => $r['asset_id'], 'type' => $r['type'], 'version' => $r['version']];
        foreach (Json::decode($r['payload'], []) as $k => $v) {
            $e[$k] = $v;
        }
        $e['created_at'] = $r['created_at'];

        return $e;
    }

    /** @return list<array> */
    public function syncEventsAfter(int $since, int $limit): array
    {
        return array_map(fn ($r) => $this->syncFromRow($r), $this->sync->where('seq >', $since)->orderBy('seq', 'ASC')->findAll(max(0, $limit)));
    }

    public function firstSyncEvent(): ?array
    {
        $r = $this->sync->orderBy('seq', 'ASC')->first();

        return $r === null ? null : $this->syncFromRow($r);
    }

    public function lastSyncEvent(): ?array
    {
        $r = $this->sync->orderBy('seq', 'DESC')->first();

        return $r === null ? null : $this->syncFromRow($r);
    }

    public function hasSyncAfter(int $seq): bool
    {
        return $this->sync->where('seq >', $seq)->countAllResults() > 0;
    }

    // ---------- audit ----------

    public function addAudit(array $e): void
    {
        $this->audit->builder()->insert(['id' => $e['id'], 'actor_id' => $e['actor_id'], 'actor_role' => $e['actor_role'], 'action' => $e['action'], 'entity' => $e['entity'], 'entity_id' => $e['entity_id'], 'diff' => Json::encode($e['diff']), 'ip' => $e['ip'], 'at' => $e['at']]);
    }

    /** Newest first. */
    public function auditLog(?string $entityId, int $limit): array
    {
        $q = $this->audit->orderBy('row_id', 'DESC');
        if ($entityId !== null && $entityId !== '') {
            $q->where('entity_id', $entityId);
        }

        return array_map(static fn ($r) => ['id' => $r['id'], 'actor_id' => $r['actor_id'], 'actor_role' => $r['actor_role'], 'action' => $r['action'], 'entity' => $r['entity'], 'entity_id' => $r['entity_id'], 'diff' => Json::decode($r['diff']), 'ip' => $r['ip'], 'at' => $r['at']], $q->findAll($limit));
    }

    // ---------- downloads and usage ----------

    public function download(string $id): ?array
    {
        $r = $this->downloads->where('id', $id)->first();

        return $r === null ? null : self::downloadFromRow($r);
    }

    private static function downloadFromRow(array $r): array
    {
        $d = ['id' => $r['id'], 'user_id' => $r['user_id'], 'device_id' => $r['device_id'], 'asset_id' => $r['asset_id'], 'version' => $r['version'], 'status' => $r['status'], 'started_at' => $r['started_at'], 'finished_at' => $r['finished_at']];
        if ($r['finished_at'] !== null) {
            $d['bytes']       = $r['bytes'] === null ? null : (int) $r['bytes'];
            $d['duration_ms'] = $r['duration_ms'] === null ? null : (int) $r['duration_ms'];
        }

        return $d;
    }

    public function saveDownload(array $d): void
    {
        $row = ['id' => $d['id'], 'user_id' => $d['user_id'], 'device_id' => $d['device_id'], 'asset_id' => $d['asset_id'], 'version' => $d['version'], 'status' => $d['status'], 'bytes' => is_numeric($d['bytes'] ?? null) ? (int) $d['bytes'] : null, 'duration_ms' => is_numeric($d['duration_ms'] ?? null) ? (int) $d['duration_ms'] : null, 'started_at' => $d['started_at'], 'finished_at' => $d['finished_at']];
        if ($this->downloads->where('id', $d['id'])->countAllResults() > 0) {
            $this->downloads->builder()->where('id', $d['id'])->update($row);
        } else {
            $this->downloads->builder()->insert($row);
        }
    }

    /** @return list<array> */
    public function downloadsSince(string $iso): array
    {
        return array_map(self::downloadFromRow(...), $this->downloads->where('started_at >=', $iso)->orderBy('row_id', 'ASC')->findAll());
    }

    public function addUsage(array $u): void
    {
        $this->usage->builder()->insert($u);
    }

    // ---------- meta ----------

    public function getMeta(string $key): ?string
    {
        $r = $this->meta->where('key', $key)->first();

        return $r['value'] ?? null;
    }

    public function setMeta(string $key, string $value): void
    {
        if ($this->getMeta($key) === null) {
            $this->meta->builder()->insert(['key' => $key, 'value' => $value]);
        } else {
            $this->meta->builder()->where('key', $key)->update(['value' => $value]);
        }
    }

    // ---------- processing jobs ----------

    private static function jobFromRow(array $r): array
    {
        return ['id' => $r['id'], 'asset_id' => $r['asset_id'], 'version' => $r['version'], 'type' => $r['type'], 'status' => $r['status'], 'attempts' => (int) $r['attempts'], 'lease_until' => $r['lease_until'], 'worker_id' => $r['worker_id'], 'error' => $r['error'], 'previews' => Json::decode($r['previews'], []), 'created_at' => $r['created_at'], 'started_at' => $r['started_at'], 'finished_at' => $r['finished_at']];
    }

    public function job(string $id): ?array
    {
        $r = $this->jobs->where('id', $id)->first();

        return $r === null ? null : self::jobFromRow($r);
    }

    /**
     * Jobs oldest first (optionally only some statuses).
     *
     * @param list<string> $statuses
     */
    public function jobsList(array $statuses = [], ?string $assetId = null, ?string $version = null): array
    {
        $q = $this->jobs->orderBy('row_id', 'ASC');
        if ($statuses !== []) {
            $q->whereIn('status', $statuses);
        }
        if ($assetId !== null) {
            $q->where('asset_id', $assetId)->where('version', $version);
        }

        return array_map(self::jobFromRow(...), $q->findAll());
    }

    /** Newest first. */
    public function recentJobs(?string $status, int $limit): array
    {
        $q = $this->jobs->orderBy('row_id', 'DESC');
        if ($status !== null && $status !== '') {
            $q->where('status', $status);
        }

        return array_map(self::jobFromRow(...), $q->findAll($limit));
    }

    public function saveJob(array $j): void
    {
        $row = $j;
        $row['previews'] = Json::encode(Json::obj($j['previews']));
        if ($this->jobs->where('id', $j['id'])->countAllResults() > 0) {
            $this->jobs->builder()->where('id', $j['id'])->update($row);
        } else {
            $this->jobs->builder()->insert($row);
        }
    }
}
