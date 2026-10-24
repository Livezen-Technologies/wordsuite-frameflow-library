<?php

namespace App\Services\Concerns;

use App\Exceptions\HttpError;
use App\Exceptions\ValidationError;
use App\Libraries\AssetSchema as S;
use App\Libraries\Clock;
use App\Libraries\Uuid7;

/**
 * LibraryService: admin curation (docs/api-v1-additions.md): collections
 * with visibility windows, category edit/reorder/delete and tag merge.
 * Every change is audited.
 */
trait ManagesCuration
{
    /** Built-in rails; admin collections can't take these slugs. */
    public const BUILTIN_COLLECTIONS = ['featured', 'new', 'trending'];

    // ---------- collections ----------

    public static function collectionOut(array $c): array
    {
        return ['id' => $c['id'], 'slug' => $c['slug'], 'title' => $c['title'], 'description' => $c['description'], 'asset_ids' => array_values($c['asset_ids']), 'publish_at' => $c['publish_at'], 'unpublish_at' => $c['unpublish_at'], 'visible' => $c['visible'], 'created_at' => $c['created_at'], 'updated_at' => $c['updated_at']];
    }

    /** Whether a collection shows at `$nowMs`: visible, and inside [publish_at, unpublish_at). */
    public static function collectionLive(array $c, int $nowMs): bool
    {
        $from = Clock::parse($c['publish_at'] ?? null);
        $to   = Clock::parse($c['unpublish_at'] ?? null);

        return ! empty($c['visible']) && ($from === null || $from <= $nowMs) && ($to === null || $to > $nowMs);
    }

    public function adminCollections(): array
    {
        return array_map(self::collectionOut(...), $this->store->collectionsAll());
    }

    public function adminCollection(string $slug): array
    {
        return self::collectionOut($this->store->collectionBySlug($slug) ?? throw HttpError::notFound('Collection'));
    }

    /** Validates `$body` onto `$c` (a new or existing collection). */
    private function applyCollection(array $c, array $body, bool $create): array
    {
        $problems = [];
        if ($create || array_key_exists('title', $body)) {
            $title = S::trim(S::jsString($body['title'] ?? ''));
            if (mb_strlen($title) < 2 || mb_strlen($title) > 255) {
                $problems[] = ['field' => 'title', 'rule' => 'title.required', 'value' => $title];
            }
            $c['title'] = $title;
        }
        if ($create || array_key_exists('slug', $body)) {
            $slug = is_string($body['slug'] ?? null) && $body['slug'] !== '' ? $body['slug'] : S::slugify($c['title']);
            if (! preg_match(S::SLUG, $slug)) {
                $problems[] = ['field' => 'slug', 'rule' => 'slug.format', 'value' => $slug];
            } elseif (in_array($slug, self::BUILTIN_COLLECTIONS, true)) {
                $problems[] = ['field' => 'slug', 'rule' => 'slug.reserved', 'value' => $slug];
            } elseif ($slug !== ($c['slug'] ?? null) && $this->store->collectionBySlug($slug) !== null) {
                $problems[] = ['field' => 'slug', 'rule' => 'slug.unique', 'value' => $slug];
            }
            $c['slug'] = $slug;
        }
        if (array_key_exists('description', $body)) {
            $c['description'] = S::jsString($body['description'] ?? '');
        }
        if (array_key_exists('asset_ids', $body)) {
            $ids = $body['asset_ids'];
            $out = [];
            if (! is_array($ids) || ! array_is_list($ids) || count($ids) > 500) {
                $problems[] = ['field' => 'asset_ids', 'rule' => 'collection.assets', 'value' => null];
            } else {
                foreach ($ids as $id) {
                    $a = is_string($id) ? $this->store->findAsset($id) : null;
                    if ($a === null) {
                        $problems[] = ['field' => 'asset_ids', 'rule' => 'collection.asset', 'value' => $id];
                    } elseif (! in_array($a['id'], $out, true)) {
                        $out[] = $a['id'];
                    }
                }
            }
            $c['asset_ids'] = $out;
        }
        foreach (['publish_at', 'unpublish_at'] as $k) {
            if (array_key_exists($k, $body)) {
                $v = $body[$k];
                if ($v === null || $v === '') {
                    $c[$k] = null;
                } elseif (($ms = Clock::parse(is_string($v) ? $v : null)) === null) {
                    $problems[] = ['field' => $k, 'rule' => 'date.format', 'value' => $v];
                } else {
                    $c[$k] = Clock::iso($ms);
                }
            }
        }
        if (! empty($c['publish_at']) && ! empty($c['unpublish_at']) && Clock::parse($c['unpublish_at']) <= Clock::parse($c['publish_at'])) {
            $problems[] = ['field' => 'unpublish_at', 'rule' => 'collection.window', 'value' => $c['unpublish_at']];
        }
        if (array_key_exists('visible', $body)) {
            $c['visible'] = ! empty($body['visible']);
        }
        if ($problems !== []) {
            throw new ValidationError("Invalid {$problems[0]['field']}.", $problems);
        }

        return $c;
    }

    public function createCollection(?array $actor, array $body): array
    {
        $this->requirePerm($actor, 'taxonomy.manage');
        $now = $this->iso();
        $c   = $this->applyCollection(['id' => Uuid7::generate(), 'slug' => null, 'title' => '', 'description' => '', 'asset_ids' => [], 'publish_at' => null, 'unpublish_at' => null, 'visible' => true, 'created_by' => $actor['id'], 'created_at' => $now, 'updated_at' => $now], $body, true);
        $this->store->saveCollection($c);
        $this->audit($actor, 'collection.create', 'collection', $c['id'], null, self::collectionOut($c));

        return self::collectionOut($c);
    }

    public function updateCollection(?array $actor, string $slug, array $body): array
    {
        $this->requirePerm($actor, 'taxonomy.manage');
        $before          = $this->store->collectionBySlug($slug) ?? throw HttpError::notFound('Collection');
        $c               = $this->applyCollection($before, $body, false);
        $c['updated_at'] = $this->iso();
        $this->store->saveCollection($c);
        $this->audit($actor, 'collection.update', 'collection', $c['id'], self::collectionOut($before), self::collectionOut($c));

        return self::collectionOut($c);
    }

    public function deleteCollection(?array $actor, string $slug): void
    {
        $this->requirePerm($actor, 'taxonomy.manage');
        $c = $this->store->collectionBySlug($slug) ?? throw HttpError::notFound('Collection');
        $this->store->deleteCollection($c['id']);
        $this->audit($actor, 'collection.delete', 'collection', $c['id'], self::collectionOut($c), null);
    }

    /** Public rails: visible, in-window admin collections (live assets only, in their order), then the built-ins. */
    public function collections(): array
    {
        $now = Clock::ms();
        $out = [];
        foreach ($this->store->collectionsAll() as $c) {
            if (! self::collectionLive($c, $now)) {
                continue;
            }
            $assets = [];
            foreach ($c['asset_ids'] as $id) {
                $a = $this->store->findAsset($id);
                if ($a !== null && self::isLive($a) && $a['visibility'] === 'public') {
                    $assets[] = $this->publicAsset($a);
                }
            }
            $out[] = ['slug' => $c['slug'], 'title' => $c['title'], 'description' => $c['description'], 'assets' => $assets];
        }

        return array_merge($out, $this->builtinCollections());
    }

    // ---------- categories ----------

    public function updateCategory(?array $actor, string $id, array $body): array
    {
        $this->requirePerm($actor, 'taxonomy.manage');
        $before   = $this->store->category($id) ?? throw HttpError::notFound('Category');
        $c        = $before;
        $problems = [];
        if (array_key_exists('name', $body)) {
            $c['name'] = S::trim(S::jsString($body['name'] ?? ''));
            $c['slug'] = S::slugify($c['name']);
            if (mb_strlen($c['name']) < 2 || mb_strlen($c['name']) > 120) {
                $problems[] = ['field' => 'name', 'rule' => 'name.required', 'value' => $c['name']];
            }
        }
        if (array_key_exists('icon', $body)) {
            $icon = $body['icon'];
            if ($icon !== null && (! is_string($icon) || strlen($icon) > 191)) {
                $problems[] = ['field' => 'icon', 'rule' => 'icon.format', 'value' => $icon];
            }
            $c['icon'] = is_string($icon) && $icon !== '' ? $icon : null;
        }
        if (array_key_exists('visible', $body)) {
            $c['visible'] = ! empty($body['visible']);
        }
        if (array_key_exists('sort', $body)) {
            if (! is_int($body['sort'])) {
                $problems[] = ['field' => 'sort', 'rule' => 'sort.integer', 'value' => $body['sort']];
            } else {
                $c['sort'] = $body['sort'];
            }
        }
        $parentKey = array_key_exists('parent_id', $body) ? 'parent_id' : (array_key_exists('parent', $body) ? 'parent' : null);
        if ($parentKey !== null) {
            $pid = $body[$parentKey];
            if ($pid === null || $pid === '') {
                $c['parent_id'] = null;
            } else {
                $p  = is_string($pid) ? $this->store->category($pid) : null;
                $ok = $p !== null && $p['type'] === $c['type'] && $p['id'] !== $c['id'];
                // No cycles: the new parent must not sit under this category.
                for ($walk = $p, $guard = 0; $ok && $walk !== null && $guard < 100; $guard++) {
                    $ok   = $walk['id'] !== $c['id'];
                    $walk = $this->store->category($walk['parent_id']);
                }
                if (! $ok) {
                    $problems[] = ['field' => 'parent_id', 'rule' => 'category.parent', 'value' => $pid];
                }
                $c['parent_id'] = $ok ? $p['id'] : $c['parent_id'];
            }
        }
        if ($problems !== []) {
            throw new ValidationError("Invalid {$problems[0]['field']}.", $problems);
        }
        $this->store->updateCategory($c);
        $this->audit($actor, 'category.update', 'category', $c['id'], $before, $c);
        $this->store->addSyncEvent('category_change', null, ['category_id' => $c['id'], 'change' => 'update'], $this->iso());

        return $c;
    }

    public function deleteCategory(?array $actor, string $id): void
    {
        $this->requirePerm($actor, 'taxonomy.manage');
        $c   = $this->store->category($id) ?? throw HttpError::notFound('Category');
        $use = $this->store->categoryUsage($id);
        if ($use['assets'] > 0 || $use['children'] > 0) {
            $details = [];
            if ($use['assets'] > 0) {
                $details[] = ['field' => 'category', 'rule' => 'category.in_use', 'value' => $use['assets']];
            }
            if ($use['children'] > 0) {
                $details[] = ['field' => 'category', 'rule' => 'category.has_children', 'value' => $use['children']];
            }

            throw new HttpError(409, 'CATEGORY_IN_USE', 'Move its assets and subcategories first.', $details);
        }
        $this->store->deleteCategory($id);
        $this->audit($actor, 'category.delete', 'category', $id, $c, null);
        $this->store->addSyncEvent('category_change', null, ['category_id' => $id, 'change' => 'delete'], $this->iso());
    }

    /** Sets `sort` to each listed category's position. Returns every category, sorted. */
    public function reorderCategories(?array $actor, array $body): array
    {
        $this->requirePerm($actor, 'taxonomy.manage');
        $ids = $body['ids'] ?? null;
        if (! is_array($ids) || ! array_is_list($ids) || $ids === []) {
            throw new ValidationError('ids must list category ids.', [['field' => 'ids', 'rule' => 'ids.required', 'value' => null]]);
        }
        $problems = [];
        foreach ($ids as $id) {
            if (! is_string($id) || $this->store->category($id) === null) {
                $problems[] = ['field' => 'ids', 'rule' => 'category.id', 'value' => $id];
            }
        }
        if ($problems !== []) {
            throw new ValidationError('Unknown category.', $problems);
        }
        $before = [];
        foreach (array_values(array_unique($ids)) as $i => $id) {
            $c                 = $this->store->category($id);
            $before[$id]       = $c['sort'];
            $c['sort']         = $i;
            $this->store->updateCategory($c);
        }
        $this->audit($actor, 'category.reorder', 'category', null, ['sort' => $before], ['sort' => array_flip(array_values(array_unique($ids)))]);
        $this->store->addSyncEvent('category_change', null, ['change' => 'reorder'], $this->iso());

        return $this->categories(null);
    }

    // ---------- tags ----------

    /** Rewrites `from` tags to `into` on every asset. */
    public function mergeTags(?array $actor, array $body): array
    {
        $this->requirePerm($actor, 'taxonomy.manage');
        $into = S::normalizeTags([$body['into'] ?? ''])[0] ?? null;
        $from = array_values(array_diff(S::normalizeTags(is_array($body['from'] ?? null) ? $body['from'] : []), [$into]));
        if ($into === null) {
            throw new ValidationError('Pick the tag to merge into.', [['field' => 'into', 'rule' => 'tag.required', 'value' => $body['into'] ?? null]]);
        }
        if ($from === []) {
            throw new ValidationError('List the tags to merge.', [['field' => 'from', 'rule' => 'tags.required', 'value' => $body['from'] ?? null]]);
        }
        $changed = [];
        foreach ($this->store->allAssets() as $a) {
            if (array_intersect($a['tags'], $from) === []) {
                continue;
            }
            $before              = $a;
            $a['tags']           = S::normalizeTags(array_map(static fn ($t) => in_array($t, $from, true) ? $into : $t, $a['tags']));
            $a['updated_by']     = $actor['id'];
            $a['updated_at']     = $this->iso();
            $this->store->saveAsset($a);
            $this->audit($actor, 'asset.update', 'asset', $a['id'], $before, $a);
            if ($a['status'] === 'published') {
                $this->syncEvent('upsert', $a, ['changed' => ['tags'], 'update_available' => false, 'breaking' => false]);
                $this->notify(['asset.updated'], $a);
            }
            $changed[] = $a['id'];
        }
        $this->audit($actor, 'tag.merge', 'tag', $into, ['tags' => $from], ['tag' => $into, 'assets' => count($changed)]);

        return ['into' => $into, 'from' => $from, 'updated' => count($changed), 'asset_ids' => $changed];
    }
}
