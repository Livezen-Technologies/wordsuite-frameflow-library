<?php

namespace App\Database;

/**
 * Compact column builders shared by migrations. Types are chosen so the same
 * migrations run on PostgreSQL (production) and SQLite3 (dev, tests).
 * JSON columns are TEXT holding JSON; times are ISO-8601 UTC strings with
 * milliseconds (what the API returns), which sort correctly as text.
 */
trait SchemaHelper
{
    protected function serial(): array
    {
        return ['type' => 'BIGINT', 'auto_increment' => true];
    }

    protected function uuid(bool $null = false): array
    {
        return ['type' => 'VARCHAR', 'constraint' => 36, 'null' => $null];
    }

    protected function str(int $len = 191, bool $null = false, ?string $default = null): array
    {
        $col = ['type' => 'VARCHAR', 'constraint' => $len, 'null' => $null];
        if ($default !== null) {
            $col['default'] = $default;
        }

        return $col;
    }

    protected function text(bool $null = true): array
    {
        return ['type' => 'TEXT', 'null' => $null];
    }

    /** JSON document as TEXT. */
    protected function json(bool $null = true): array
    {
        return ['type' => 'TEXT', 'null' => $null];
    }

    protected function int(bool $null = false, ?int $default = 0): array
    {
        $col = ['type' => 'INTEGER', 'null' => $null];
        if ($default !== null) {
            $col['default'] = $default;
        }

        return $col;
    }

    protected function bigint(bool $null = false, ?int $default = 0): array
    {
        $col = ['type' => 'BIGINT', 'null' => $null];
        if ($default !== null) {
            $col['default'] = $default;
        }

        return $col;
    }

    protected function bool(bool $default = false): array
    {
        return ['type' => 'SMALLINT', 'null' => false, 'default' => $default ? 1 : 0];
    }

    /** ISO-8601 timestamp (2026-10-24T09:30:00.000Z). */
    protected function ts(bool $null = true): array
    {
        return ['type' => 'VARCHAR', 'constraint' => 32, 'null' => $null];
    }

    /**
     * @param array<string, array<string, mixed>> $fields
     * @param list<string|list<string>>           $keys
     * @param list<string|list<string>>           $unique
     */
    protected function table(string $name, array $fields, string $primary, array $keys = [], array $unique = []): void
    {
        $this->forge->addField($fields);
        $this->forge->addPrimaryKey($primary);
        foreach ($keys as $k) {
            $this->forge->addKey($k);
        }
        foreach ($unique as $u) {
            $this->forge->addUniqueKey($u);
        }
        $this->forge->createTable($name, true);
    }
}
