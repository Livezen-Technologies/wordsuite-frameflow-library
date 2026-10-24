<?php

namespace App\Database\Migrations;

use App\Database\SchemaHelper;
use CodeIgniter\Database\Migration;

/**
 * Library tables (blueprint §16): assets, asset_versions, categories,
 * uploads, sync_events, audit_log, user_downloads, usage_events and
 * library_meta (signing key, settings). Every table keeps an
 * auto-increment `row_id` (or `seq`) for stable insertion order; `id` is the
 * public UUID v7.
 */
class CreateLibraryTables extends Migration
{
    use SchemaHelper;

    public function up(): void
    {
        $this->table('categories', [
            'row_id'    => $this->serial(),
            'id'        => $this->uuid(),
            'type'      => $this->str(32),
            'name'      => $this->str(120),
            'slug'      => $this->str(120),
            'parent_id' => $this->uuid(true),
            'sort'      => $this->int(),
            'icon'      => $this->str(191, true),
            'visible'   => $this->bool(true),
        ], 'row_id', ['type'], ['id']);

        $this->table('assets', [
            'row_id'               => $this->serial(),
            'id'                   => $this->uuid(),
            'type'                 => $this->str(32),
            'slug'                 => $this->str(80),
            'title'                => $this->str(255),
            'description'          => $this->text(),
            'tags'                 => $this->json(),
            'keywords'             => $this->json(),
            'min_app_version'      => $this->str(64),
            'licence_tier'         => $this->str(16),
            'licence_terms'        => $this->str(32),
            'visibility'           => $this->str(16),
            'category_id'          => $this->uuid(true),
            'subcategory_id'       => $this->uuid(true),
            'licence_text'         => $this->text(),
            'attribution_required' => $this->bool(),
            'attribution_text'     => $this->text(),
            'author'               => $this->str(255, true),
            'aspect_ratios'        => $this->json(),
            'platforms'            => $this->json(),
            'audience_rules'       => $this->json(),
            'dependencies'         => $this->json(),
            'featured'             => $this->bool(),
            'featured_rank'        => $this->json(),
            'publish_at'           => $this->json(),
            'unpublish_at'         => $this->json(),
            'meta'                 => $this->json(),
            'thumbnail_file'       => $this->json(),
            'status'               => $this->str(24),
            'current_version'      => $this->str(64, true),
            'published_version'    => $this->str(64, true),
            'pending_version'      => $this->str(64, true),
            'review'               => $this->json(),
            'stats_downloads'      => $this->bigint(),
            'stats_installs'       => $this->bigint(),
            'stats_favorites'      => $this->bigint(),
            'stats_applies'        => $this->bigint(),
            'created_by'           => $this->str(191, true),
            'created_at'           => $this->ts(),
            'updated_by'           => $this->str(191, true),
            'updated_at'           => $this->ts(),
            'published_by'         => $this->str(191, true),
            'published_at'         => $this->ts(),
        ], 'row_id', ['status', 'type', 'category_id'], ['id', 'slug']);

        $this->table('asset_versions', [
            'row_id'           => $this->serial(),
            'id'               => $this->uuid(),
            'asset_id'         => $this->uuid(),
            'version'          => $this->str(64),
            'changelog'        => $this->text(),
            'is_breaking'      => $this->bool(),
            'min_app_version'  => $this->str(64, true),
            'files'            => $this->json(),
            'checks'           => $this->json(),
            'meta'             => $this->json(),
            'status'           => $this->str(24),
            'package_key'      => $this->str(255, true),
            'size_bytes'       => $this->bigint(true, null),
            'sha256'           => $this->str(64, true),
            'signature'        => $this->text(),
            'thumbnail_ext'    => $this->str(16, true),
            'built_at'         => $this->ts(),
            'retired_at'       => $this->ts(),
            'processing'       => $this->json(),
            'previews'         => $this->json(),
            'created_by'       => $this->str(191, true),
            'created_at'       => $this->ts(),
        ], 'row_id', ['asset_id'], ['id', ['asset_id', 'version']]);

        $this->table('uploads', [
            'row_id'       => $this->serial(),
            'id'           => $this->uuid(),
            'filename'     => $this->str(255),
            'sha256'       => $this->str(64),
            'size'         => $this->bigint(),
            'type'         => $this->str(32, true),
            'checks'       => $this->json(),
            'meta'         => $this->json(),
            'duplicate_of' => $this->uuid(true),
            'created_by'   => $this->str(191, true),
            'created_at'   => $this->ts(),
        ], 'row_id', ['sha256'], ['id']);

        $this->table('sync_events', [
            'seq'        => $this->serial(),
            'op'         => $this->str(24),
            'asset_id'   => $this->uuid(true),
            'type'       => $this->str(32, true),
            'version'    => $this->str(64, true),
            'payload'    => $this->json(),
            'created_at' => $this->ts(),
        ], 'seq', ['asset_id']);

        $this->table('audit_log', [
            'row_id'     => $this->serial(),
            'id'         => $this->uuid(),
            'actor_id'   => $this->str(191, true),
            'actor_role' => $this->str(32, true),
            'action'     => $this->str(64),
            'entity'     => $this->str(32),
            'entity_id'  => $this->str(191, true),
            'diff'       => $this->json(),
            'ip'         => $this->str(64, true),
            'at'         => $this->ts(),
        ], 'row_id', ['entity_id'], ['id']);

        $this->table('user_downloads', [
            'row_id'      => $this->serial(),
            'id'          => $this->uuid(),
            'user_id'     => $this->str(191, true),
            'device_id'   => $this->str(191, true),
            'asset_id'    => $this->uuid(),
            'version'     => $this->str(64),
            'status'      => $this->str(16),
            'bytes'       => $this->bigint(true, null),
            'duration_ms' => $this->bigint(true, null),
            'started_at'  => $this->ts(),
            'finished_at' => $this->ts(),
        ], 'row_id', ['asset_id', 'started_at'], ['id']);

        $this->table('usage_events', [
            'row_id'    => $this->serial(),
            'id'        => $this->uuid(),
            'user_id'   => $this->str(191, true),
            'device_id' => $this->str(191, true),
            'asset_id'  => $this->uuid(),
            'event'     => $this->str(16),
            'at'        => $this->ts(),
        ], 'row_id', ['asset_id'], ['id']);

        // Processing jobs (§5 stages 2–4) for apps/workers.
        $this->table('jobs', [
            'row_id'      => $this->serial(),
            'id'          => $this->uuid(),
            'asset_id'    => $this->uuid(),
            'version'     => $this->str(64),
            'type'        => $this->str(32),
            'status'      => $this->str(16), // queued | running | done | failed | cancelled
            'attempts'    => $this->int(),
            'lease_until' => $this->ts(),
            'worker_id'   => $this->str(191, true),
            'error'       => $this->text(),
            'previews'    => $this->json(),
            'created_at'  => $this->ts(),
            'started_at'  => $this->ts(),
            'finished_at' => $this->ts(),
        ], 'row_id', ['status', ['asset_id', 'version']], ['id']);

        $this->table('library_meta', [
            'key'   => $this->str(64),
            'value' => $this->text(),
        ], 'key');
    }

    public function down(): void
    {
        foreach (['library_meta', 'jobs', 'usage_events', 'user_downloads', 'audit_log', 'sync_events', 'uploads', 'asset_versions', 'assets', 'categories'] as $t) {
            $this->forge->dropTable($t, true);
        }
    }
}
