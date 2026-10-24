<?php

namespace App\Services\Concerns;

use App\Exceptions\HttpError;
use App\Exceptions\ValidationError;
use App\Libraries\AssetSchema as S;
use App\Libraries\Clock;
use App\Libraries\Json;
use App\Libraries\Rbac;

/**
 * LibraryService: analytics additions (overview by type, installs and
 * applies; per-asset stats; search terms and misses, §13).
 */
trait ReportsAnalytics
{
    /**
     * `from`/`to` (ISO dates or times; a bare date `to` includes that day) →
     * [fromIso, toIso), default the last 30 days.
     */
    public static function window(array $q): array
    {
        $now  = Clock::ms();
        $from = isset($q['from']) && $q['from'] !== '' ? Clock::parse($q['from']) : $now - 30 * 86_400_000;
        $to   = isset($q['to']) && $q['to'] !== '' ? Clock::parse($q['to']) : $now + 1;
        if ($from === null || $to === null) {
            throw new ValidationError('from and to must be ISO dates.', [['field' => $from === null ? 'from' : 'to', 'rule' => 'date.format', 'value' => $from === null ? $q['from'] : $q['to']]]);
        }
        if (isset($q['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $q['to'])) {
            $to += 86_400_000;
        }

        return [Clock::iso($from), Clock::iso($to)];
    }

    /** The overview's window additions (merged into overview()). */
    private function overviewAdditions(array $dl, string $from, string $to): array
    {
        $types  = [];
        foreach ($dl as $d) {
            $type         = $this->store->findAsset($d['asset_id'])['type'] ?? 'unknown';
            $types[$type] = ($types[$type] ?? 0) + 1;
        }
        arsort($types);

        return [
            'from'              => $from,
            'to'                => $to,
            'downloads_by_type' => Json::obj($types),
            'installs_30d'      => $this->store->installsCountBetween($from, $to),
            'applies_30d'       => $this->store->usageCount($from, $to, ['apply', 'insert']),
        ];
    }

    public function assetAnalytics(?array $actor, string $id, array $q): array
    {
        $a = $this->mustAsset($id);
        if (! Rbac::can($actor['role'] ?? null, 'analytics.view') && ! (Rbac::can($actor['role'] ?? null, 'analytics.view.own') && ($a['created_by'] ?? null) === ($actor['id'] ?? null))) {
            throw $actor === null ? HttpError::unauthenticated() : HttpError::forbidden('analytics.view');
        }
        [$from, $to] = self::window($q);
        $dl          = $this->store->downloadsBetween($from, $to, $a['id']);
        $byDay       = [];
        $byVersion   = [];
        foreach ($dl as $d) {
            $day                        = substr($d['started_at'], 0, 10);
            $byDay[$day]                = ($byDay[$day] ?? 0) + 1;
            $byVersion[$d['version']] = ($byVersion[$d['version']] ?? 0) + 1;
        }
        ksort($byDay);
        $versions = array_column($a['versions'], 'version');
        usort($versions, [S::class, 'compareSemver']);

        return [
            'id'               => $a['id'],
            'from'             => $from,
            'to'               => $to,
            'downloads_by_day' => Json::obj($byDay),
            'downloads'        => count($dl),
            'installs'         => $this->store->installsCountBetween($from, $to, $a['id']),
            'applies'          => $this->store->usageCount($from, $to, ['apply', 'insert'], $a['id']),
            'favorites'        => $a['stats']['favorites'],
            'versions'         => array_map(static fn ($v) => ['version' => $v, 'downloads' => $byVersion[$v] ?? 0], array_reverse($versions)),
        ];
    }

    /** Normalized search term, or null for an empty query. */
    public static function searchTerm(mixed $q): ?string
    {
        $t = mb_substr(preg_replace('/\s+/u', ' ', mb_strtolower(S::trim(S::jsString($q ?? '')))), 0, 120);

        return $t === '' ? null : $t;
    }

    /** Counts a client search; zero results also count as a miss. */
    public function recordSearch(mixed $q, int $total): void
    {
        $term = self::searchTerm($q);
        if ($term !== null) {
            $this->store->countSearch($term, $total === 0, $this->iso());
        }
    }

    public function searchAnalytics(): array
    {
        return [
            'top'    => array_map(static fn ($r) => ['term' => $r['term'], 'count' => $r['count']], $this->store->topSearches('terms', 20)),
            'misses' => $this->store->topSearches('misses', 50),
        ];
    }
}
