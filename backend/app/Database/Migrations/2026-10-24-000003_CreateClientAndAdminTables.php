<?php

namespace App\Database\Migrations;

use App\Database\SchemaHelper;
use CodeIgniter\Database\Migration;

/**
 * Tables for docs/api-v1-additions.md: devices (§7.1 device binding), the
 * user's favorites and installs mirror (§8.6), admin collections, search
 * statistics (§13) and webhooks with their delivery queue. Settings live in
 * library_meta (`settings`).
 */
class CreateClientAndAdminTables extends Migration
{
    use SchemaHelper;

    public function up(): void
    {
        $this->table('devices', [
            'row_id'           => $this->serial(),
            'id'               => $this->uuid(),
            'user_id'          => $this->str(191),
            'fingerprint_hash' => $this->str(128),
            'os'               => $this->str(16),
            'app_version'      => $this->str(64),
            'name'             => $this->str(120),
            'revoked'          => $this->bool(),
            'revoked_at'       => $this->ts(),
            'created_at'       => $this->ts(false),
            'last_seen_at'     => $this->ts(false),
        ], 'row_id', ['user_id'], ['id', ['user_id', 'fingerprint_hash']]);

        $this->table('user_favorites', [
            'row_id'     => $this->serial(),
            'user_id'    => $this->str(191),
            'asset_id'   => $this->uuid(),
            'created_at' => $this->ts(false),
        ], 'row_id', ['asset_id'], [['user_id', 'asset_id']]);

        $this->table('user_installs', [
            'row_id'       => $this->serial(),
            'user_id'      => $this->str(191),
            'device_id'    => $this->str(191),
            'asset_id'     => $this->uuid(),
            'version'      => $this->str(64),
            'installed_at' => $this->ts(false),
            'last_used_at' => $this->ts(),
        ], 'row_id', ['asset_id', 'installed_at'], [['user_id', 'device_id', 'asset_id']]);

        $this->table('collections', [
            'row_id'       => $this->serial(),
            'id'           => $this->uuid(),
            'slug'         => $this->str(80),
            'title'        => $this->str(255),
            'description'  => $this->text(),
            'asset_ids'    => $this->json(),
            'publish_at'   => $this->ts(),
            'unpublish_at' => $this->ts(),
            'visible'      => $this->bool(true),
            'created_by'   => $this->str(191, true),
            'created_at'   => $this->ts(false),
            'updated_at'   => $this->ts(false),
        ], 'row_id', [], ['id', 'slug']);

        $this->table('search_terms', [
            'row_id'  => $this->serial(),
            'term'    => $this->str(120),
            'count'   => $this->bigint(),
            'last_at' => $this->ts(false),
        ], 'row_id', ['count'], ['term']);

        $this->table('search_misses', [
            'row_id'  => $this->serial(),
            'term'    => $this->str(120),
            'count'   => $this->bigint(),
            'last_at' => $this->ts(false),
        ], 'row_id', ['count'], ['term']);

        $this->table('webhooks', [
            'row_id'     => $this->serial(),
            'id'         => $this->uuid(),
            'url'        => $this->str(2048),
            'events'     => $this->json(),
            'active'     => $this->bool(true),
            'secret'     => $this->str(255),
            'created_by' => $this->str(191, true),
            'created_at' => $this->ts(false),
            'updated_at' => $this->ts(false),
        ], 'row_id', [], ['id']);

        // One row per (webhook, event); retried in place (attempt, next_attempt_at).
        $this->table('webhook_deliveries', [
            'row_id'          => $this->serial(),
            'id'              => $this->uuid(),
            'webhook_id'      => $this->uuid(),
            'event'           => $this->str(32),
            'payload'         => $this->text(false),
            'status'          => $this->str(16), // queued | sent | failed
            'attempt'         => $this->int(),
            'next_attempt_at' => $this->ts(),
            'status_code'     => $this->int(true, null),
            'ok'              => $this->bool(),
            'error'           => $this->text(),
            'created_at'      => $this->ts(false),
            'finished_at'     => $this->ts(),
        ], 'row_id', ['webhook_id', ['status', 'next_attempt_at']], ['id']);
    }

    public function down(): void
    {
        foreach (['webhook_deliveries', 'webhooks', 'search_misses', 'search_terms', 'collections', 'user_installs', 'user_favorites', 'devices'] as $t) {
            $this->forge->dropTable($t, true);
        }
    }
}
