<?php

namespace App\Services\Concerns;

use App\Libraries\Json;
use App\Models\CollectionModel;
use App\Models\DeviceModel;
use App\Models\FavoriteModel;
use App\Models\InstallModel;
use App\Models\SearchMissModel;
use App\Models\SearchTermModel;
use App\Models\WebhookDeliveryModel;
use App\Models\WebhookModel;

/**
 * LibraryStore: rows ↔ API shapes for the CreateClientAndAdminTables
 * tables (devices, favorites, installs, collections, search statistics,
 * webhooks and deliveries), plus the category edits and analytics queries.
 */
trait StoresClientAndAdminRecords
{
    /** @var array<class-string, object> */
    private array $models = [];

    private function model(string $class): object
    {
        return $this->models[$class] ??= new $class($this->db);
    }

    /** Insert, or update the row matching `$where`. */
    private function upsertRow(string $model, array $where, array $row): void
    {
        $m = $this->model($model);
        if ($m->where($where)->countAllResults() > 0) {
            $m->builder()->where($where)->update($row);
        } else {
            $m->builder()->insert($row);
        }
    }

    // ---------- devices ----------

    private static function deviceFromRow(array $r): array
    {
        return ['id' => $r['id'], 'user_id' => $r['user_id'], 'fingerprint_hash' => $r['fingerprint_hash'], 'name' => $r['name'], 'os' => $r['os'], 'app_version' => $r['app_version'], 'revoked' => (bool) $r['revoked'], 'revoked_at' => $r['revoked_at'], 'created_at' => $r['created_at'], 'last_seen_at' => $r['last_seen_at']];
    }

    /** A user's devices, oldest first. */
    public function devicesOf(string $userId, bool $withRevoked = false): array
    {
        $q = $this->model(DeviceModel::class)->where('user_id', $userId)->orderBy('row_id', 'ASC');
        if (! $withRevoked) {
            $q->where('revoked', 0);
        }

        return array_map(self::deviceFromRow(...), $q->findAll());
    }

    public function device(string $id): ?array
    {
        $r = $this->model(DeviceModel::class)->where('id', $id)->first();

        return $r === null ? null : self::deviceFromRow($r);
    }

    public function deviceByFingerprint(string $userId, string $fingerprint): ?array
    {
        $r = $this->model(DeviceModel::class)->where('user_id', $userId)->where('fingerprint_hash', $fingerprint)->first();

        return $r === null ? null : self::deviceFromRow($r);
    }

    public function saveDevice(array $d): void
    {
        $row            = $d;
        $row['revoked'] = empty($d['revoked']) ? 0 : 1;
        $this->upsertRow(DeviceModel::class, ['id' => $d['id']], $row);
    }

    // ---------- favorites ----------

    /** [asset_id => created_at], newest first. */
    public function favoritesOf(string $userId): array
    {
        $rows = $this->model(FavoriteModel::class)->where('user_id', $userId)->orderBy('row_id', 'DESC')->findAll();

        return array_column($rows, 'created_at', 'asset_id');
    }

    /** Adds a favorite; false when it was already there. */
    public function addFavorite(string $userId, string $assetId, string $at): bool
    {
        $m = $this->model(FavoriteModel::class);
        if ($m->where('user_id', $userId)->where('asset_id', $assetId)->countAllResults() > 0) {
            return false;
        }
        $m->builder()->insert(['user_id' => $userId, 'asset_id' => $assetId, 'created_at' => $at]);

        return true;
    }

    /** Removes a favorite; false when there was none. */
    public function removeFavorite(string $userId, string $assetId): bool
    {
        $m = $this->model(FavoriteModel::class);
        if ($m->where('user_id', $userId)->where('asset_id', $assetId)->countAllResults() === 0) {
            return false;
        }
        $m->builder()->where('user_id', $userId)->where('asset_id', $assetId)->delete();

        return true;
    }

    // ---------- download history ----------

    /** A user's downloads newest first, below `$beforeRow` (a cursor); each with `_row`. */
    public function downloadsOfUser(string $userId, ?int $beforeRow, int $limit): array
    {
        $q = $this->db->table('user_downloads')->where('user_id', $userId)->orderBy('row_id', 'DESC');
        if ($beforeRow !== null) {
            $q->where('row_id <', $beforeRow);
        }

        return $q->get($limit)->getResultArray();
    }

    /** Download rows started in [from, to), optionally for one asset. */
    public function downloadsBetween(string $from, string $to, ?string $assetId = null): array
    {
        $q = $this->db->table('user_downloads')->select('asset_id, version, status, device_id, started_at, finished_at')->where('started_at >=', $from)->where('started_at <', $to)->orderBy('row_id', 'ASC');
        if ($assetId !== null) {
            $q->where('asset_id', $assetId);
        }

        return $q->get()->getResultArray();
    }

    /** Usage events in [from, to) of the given kinds, optionally for one asset. */
    public function usageCount(string $from, string $to, array $events, ?string $assetId = null): int
    {
        $q = $this->db->table('usage_events')->where('at >=', $from)->where('at <', $to)->whereIn('event', $events);
        if ($assetId !== null) {
            $q->where('asset_id', $assetId);
        }

        return $q->countAllResults();
    }

    public function installsCountBetween(string $from, string $to, ?string $assetId = null): int
    {
        $q = $this->db->table('user_downloads')->where('status', 'installed')->where('finished_at >=', $from)->where('finished_at <', $to);
        if ($assetId !== null) {
            $q->where('asset_id', $assetId);
        }

        return $q->countAllResults();
    }

    // ---------- installs mirror ----------

    private static function installFromRow(array $r): array
    {
        return ['device_id' => $r['device_id'], 'asset_id' => $r['asset_id'], 'version' => $r['version'], 'installed_at' => $r['installed_at'], 'last_used_at' => $r['last_used_at']];
    }

    public function installsOf(string $userId, ?string $deviceId = null): array
    {
        $q = $this->model(InstallModel::class)->where('user_id', $userId)->orderBy('row_id', 'ASC');
        if ($deviceId !== null && $deviceId !== '') {
            $q->where('device_id', $deviceId);
        }

        return array_map(self::installFromRow(...), $q->findAll());
    }

    public function install(string $userId, string $deviceId, string $assetId): ?array
    {
        $r = $this->model(InstallModel::class)->where(['user_id' => $userId, 'device_id' => $deviceId, 'asset_id' => $assetId])->first();

        return $r === null ? null : self::installFromRow($r);
    }

    public function saveInstall(string $userId, array $i): void
    {
        $this->upsertRow(InstallModel::class, ['user_id' => $userId, 'device_id' => $i['device_id'], 'asset_id' => $i['asset_id']], ['user_id' => $userId] + $i);
    }

    public function deleteInstalls(string $userId, string $assetId, ?string $deviceId): void
    {
        $b = $this->model(InstallModel::class)->builder()->where('user_id', $userId)->where('asset_id', $assetId);
        if ($deviceId !== null && $deviceId !== '') {
            $b->where('device_id', $deviceId);
        }
        $b->delete();
    }

    public function touchInstall(string $userId, string $deviceId, string $assetId, string $at): void
    {
        $this->model(InstallModel::class)->builder()->where(['user_id' => $userId, 'device_id' => $deviceId, 'asset_id' => $assetId])->update(['last_used_at' => $at]);
    }

    // ---------- collections ----------

    private static function collectionFromRow(array $r): array
    {
        return ['id' => $r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'description' => $r['description'] ?? '', 'asset_ids' => Json::decode($r['asset_ids'], []), 'publish_at' => $r['publish_at'], 'unpublish_at' => $r['unpublish_at'], 'visible' => (bool) $r['visible'], 'created_by' => $r['created_by'], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at']];
    }

    /** Admin collections, oldest first. */
    public function collectionsAll(): array
    {
        return array_map(self::collectionFromRow(...), $this->model(CollectionModel::class)->orderBy('row_id', 'ASC')->findAll());
    }

    public function collectionBySlug(string $slug): ?array
    {
        $r = $this->model(CollectionModel::class)->where('slug', $slug)->first();

        return $r === null ? null : self::collectionFromRow($r);
    }

    public function saveCollection(array $c): void
    {
        $row              = $c;
        $row['asset_ids'] = Json::encode(array_values($c['asset_ids']));
        $row['visible']   = empty($c['visible']) ? 0 : 1;
        $this->upsertRow(CollectionModel::class, ['id' => $c['id']], $row);
    }

    public function deleteCollection(string $id): void
    {
        $this->model(CollectionModel::class)->builder()->where('id', $id)->delete();
    }

    // ---------- categories ----------

    public function updateCategory(array $c): void
    {
        $this->db->table('categories')->where('id', $c['id'])->update(['name' => $c['name'], 'slug' => $c['slug'], 'parent_id' => $c['parent_id'], 'sort' => (int) $c['sort'], 'icon' => is_string($c['icon']) ? $c['icon'] : null, 'visible' => $c['visible'] ? 1 : 0]);
        $this->categoryCache = null;
    }

    public function deleteCategory(string $id): void
    {
        $this->db->table('categories')->where('id', $id)->delete();
        $this->categoryCache = null;
    }

    /** Assets and child categories that use a category. */
    public function categoryUsage(string $id): array
    {
        return [
            'assets'   => $this->db->table('assets')->groupStart()->where('category_id', $id)->orWhere('subcategory_id', $id)->groupEnd()->countAllResults(),
            'children' => $this->db->table('categories')->where('parent_id', $id)->countAllResults(),
        ];
    }

    // ---------- search statistics ----------

    /** Counts a query term; `$miss` also counts it as a zero-result search. */
    public function countSearch(string $term, bool $miss, string $at): void
    {
        foreach ($miss ? [SearchTermModel::class, SearchMissModel::class] : [SearchTermModel::class] as $class) {
            $m = $this->model($class);
            $r = $m->where('term', $term)->first();
            if ($r === null) {
                $m->builder()->insert(['term' => $term, 'count' => 1, 'last_at' => $at]);
            } else {
                $m->builder()->where('term', $term)->update(['count' => (int) $r['count'] + 1, 'last_at' => $at]);
            }
        }
    }

    /** Most counted terms (`terms` or `misses`). */
    public function topSearches(string $which, int $limit): array
    {
        $m = $this->model($which === 'misses' ? SearchMissModel::class : SearchTermModel::class);

        return array_map(static fn ($r) => ['term' => $r['term'], 'count' => (int) $r['count'], 'last_at' => $r['last_at']], $m->orderBy('count', 'DESC')->orderBy('last_at', 'DESC')->findAll($limit));
    }

    // ---------- webhooks ----------

    private static function webhookFromRow(array $r): array
    {
        return ['id' => $r['id'], 'url' => $r['url'], 'events' => Json::decode($r['events'], []), 'active' => (bool) $r['active'], 'secret' => $r['secret'], 'created_by' => $r['created_by'], 'created_at' => $r['created_at'], 'updated_at' => $r['updated_at']];
    }

    public function webhooks(): array
    {
        return array_map(self::webhookFromRow(...), $this->model(WebhookModel::class)->orderBy('row_id', 'ASC')->findAll());
    }

    public function webhook(string $id): ?array
    {
        $r = $this->model(WebhookModel::class)->where('id', $id)->first();

        return $r === null ? null : self::webhookFromRow($r);
    }

    public function saveWebhook(array $w): void
    {
        $row           = $w;
        $row['events'] = Json::encode(array_values($w['events']));
        $row['active'] = empty($w['active']) ? 0 : 1;
        $this->upsertRow(WebhookModel::class, ['id' => $w['id']], $row);
    }

    public function deleteWebhook(string $id): void
    {
        $this->model(WebhookDeliveryModel::class)->builder()->where('webhook_id', $id)->delete();
        $this->model(WebhookModel::class)->builder()->where('id', $id)->delete();
    }

    private static function deliveryFromRow(array $r): array
    {
        return ['id' => $r['id'], 'webhook_id' => $r['webhook_id'], 'event' => $r['event'], 'payload' => $r['payload'], 'status' => $r['status'], 'attempt' => (int) $r['attempt'], 'next_attempt_at' => $r['next_attempt_at'], 'status_code' => $r['status_code'] === null ? null : (int) $r['status_code'], 'ok' => (bool) $r['ok'], 'error' => $r['error'], 'created_at' => $r['created_at'], 'finished_at' => $r['finished_at']];
    }

    public function saveDelivery(array $d): void
    {
        $row       = $d;
        $row['ok'] = empty($d['ok']) ? 0 : 1;
        $this->upsertRow(WebhookDeliveryModel::class, ['id' => $d['id']], $row);
    }

    /** Queued deliveries due at `$now`, oldest first. */
    public function dueDeliveries(string $now, int $limit): array
    {
        return array_map(self::deliveryFromRow(...), $this->model(WebhookDeliveryModel::class)->where('status', 'queued')->where('next_attempt_at <=', $now)->orderBy('row_id', 'ASC')->findAll($limit));
    }

    /** A webhook's deliveries, newest first. */
    public function deliveries(string $webhookId, int $limit): array
    {
        return array_map(self::deliveryFromRow(...), $this->model(WebhookDeliveryModel::class)->where('webhook_id', $webhookId)->orderBy('row_id', 'DESC')->findAll($limit));
    }

    public function delivery(string $id): ?array
    {
        $r = $this->model(WebhookDeliveryModel::class)->where('id', $id)->first();

        return $r === null ? null : self::deliveryFromRow($r);
    }
}
