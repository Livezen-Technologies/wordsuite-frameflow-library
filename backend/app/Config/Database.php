<?php

namespace Config;

use CodeIgniter\Database\Config;

/**
 * Database connections. Production uses PostgreSQL from DATABASE_URL
 * (postgres://user:pass@host:5432/db?sslmode=require); development and the
 * test harness use SQLite3 (DATABASE_URL=sqlite:/abs/path.sqlite, or the
 * default writable/library.sqlite).
 */
class Database extends Config
{
    public string $filesPath = APPPATH . 'Database' . DIRECTORY_SEPARATOR;

    public string $defaultGroup = 'default';

    public array $default = [
        'DSN'         => '',
        'hostname'    => '',
        'username'    => '',
        'password'    => '',
        'database'    => WRITEPATH . 'library.sqlite',
        'DBDriver'    => 'SQLite3',
        'DBPrefix'    => '',
        'pConnect'    => false,
        'DBDebug'     => true,
        'charset'     => 'utf8',
        'DBCollat'    => '',
        'swapPre'     => '',
        'encrypt'     => false,
        'compress'    => false,
        'strictOn'    => false,
        'failover'    => [],
        'port'        => '',
        'foreignKeys' => true,
        'busyTimeout' => 5000,
        'synchronous' => null,
        'dateFormat'  => [
            'date'     => 'Y-m-d',
            'datetime' => 'Y-m-d H:i:s',
            'time'     => 'H:i:s',
        ],
    ];

    /** PHPUnit: in-memory SQLite. */
    public array $tests = [
        'DSN'         => '',
        'hostname'    => '',
        'username'    => '',
        'password'    => '',
        'database'    => ':memory:',
        'DBDriver'    => 'SQLite3',
        'DBPrefix'    => '',
        'pConnect'    => false,
        'DBDebug'     => true,
        'charset'     => 'utf8',
        'DBCollat'    => '',
        'swapPre'     => '',
        'encrypt'     => false,
        'compress'    => false,
        'strictOn'    => true,
        'failover'    => [],
        'port'        => '',
        'foreignKeys' => true,
        'busyTimeout' => 1000,
        'synchronous' => null,
        'dateFormat'  => [
            'date'     => 'Y-m-d',
            'datetime' => 'Y-m-d H:i:s',
            'time'     => 'H:i:s',
        ],
    ];

    public function __construct()
    {
        parent::__construct();

        $url = getenv('DATABASE_URL');
        if (is_string($url) && $url !== '') {
            $this->default = self::fromUrl($url, $this->default);
        }
        if (ENVIRONMENT === 'testing') {
            $this->defaultGroup = 'tests';
        }
    }

    /**
     * @param array<string, mixed> $base
     *
     * @return array<string, mixed>
     */
    public static function fromUrl(string $url, array $base): array
    {
        if (preg_match('#^sqlite3?:(?://)?(.*)$#i', $url, $m)) {
            return ['DBDriver' => 'SQLite3', 'database' => urldecode($m[1]) ?: WRITEPATH . 'library.sqlite', 'hostname' => '', 'port' => ''] + $base;
        }
        $u = parse_url($url);
        if ($u === false || ! in_array($u['scheme'] ?? '', ['postgres', 'postgresql', 'pgsql'], true)) {
            throw new \InvalidArgumentException('DATABASE_URL must be postgres://… or sqlite:/path');
        }
        parse_str($u['query'] ?? '', $q);
        $cfg = [
            'DSN'      => '',
            'DBDriver' => 'Postgre',
            'hostname' => $u['host'] ?? 'localhost',
            'port'     => (int) ($u['port'] ?? 5432),
            'username' => urldecode($u['user'] ?? ''),
            'password' => urldecode($u['pass'] ?? ''),
            'database' => ltrim(urldecode($u['path'] ?? ''), '/'),
            'schema'   => $q['schema'] ?? 'public',
            'charset'  => 'utf8',
            'DBCollat' => '',
        ] + $base;
        if (isset($q['sslmode'])) {
            // CI4's Postgre driver builds a libpq connection string from DSN when given.
            $cfg['DSN'] = sprintf("host='%s' port=%d dbname='%s' user='%s' password='%s' sslmode='%s'", $cfg['hostname'], $cfg['port'], $cfg['database'], addslashes($cfg['username']), addslashes($cfg['password']), $q['sslmode']);
        }

        return $cfg;
    }
}
