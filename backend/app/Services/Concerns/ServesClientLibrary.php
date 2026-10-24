<?php

namespace App\Services\Concerns;

use App\Exceptions\HttpError;
use App\Exceptions\ValidationError;
use App\Libraries\AssetSchema as S;
use App\Libraries\Uuid7;

/**
 * LibraryService: the signed-in user's side (docs/api-v1-additions.md):
 * device binding with per-plan limits (§7.1), favorites, download history
 * and the installs mirror (§8.6). "User" is the principal's id (OIDC `sub`
 * or a static token's user id).
 */
trait ServesClientLibrary
{
    public const DEVICE_OS = ['windows' => 'Windows', 'macos' => 'macOS', 'linux' => 'Linux'];

    private function mustUser(?array $who): string
    {
        $id = $who['id'] ?? null;
        if (! is_string($id) || $id === '') {
            throw HttpError::unauthenticated();
        }

        return $id;
    }

    // ---------- devices ----------

    public static function deviceOut(array $d): array
    {
        return ['id' => $d['id'], 'name' => $d['name'], 'os' => $d['os'], 'app_version' => $d['app_version'], 'created_at' => $d['created_at'], 'last_seen_at' => $d['last_seen_at']];
    }

    public function deviceLimit(?string $plan): int
    {
        $limits = $this->settings()['device_limits'];

        return (int) ($limits[$plan ?? 'free'] ?? $limits['free']);
    }

    /**
     * Registers (or re-registers) the caller's device. Returns
     * ['device' => public shape, 'created' => bool]; 409 DEVICE_LIMIT when the plan's limit is reached.
     */
    public function registerDevice(?array $who, ?string $plan, array $body): array
    {
        $user     = $this->mustUser($who);
        $problems = [];
        $fp       = $body['fingerprint_hash'] ?? null;
        if (! is_string($fp) || ! preg_match('/^[A-Za-z0-9+\/=_:.-]{8,128}$/', $fp)) {
            $problems[] = ['field' => 'fingerprint_hash', 'rule' => 'device.fingerprint', 'value' => is_string($fp) ? mb_substr($fp, 0, 20) : $fp];
        }
        $os = $body['os'] ?? null;
        if (! is_string($os) || ! isset(self::DEVICE_OS[$os])) {
            $problems[] = ['field' => 'os', 'rule' => 'device.os', 'value' => $os];
        }
        $app = $body['app_version'] ?? null;
        if (! is_string($app) || S::trim($app) === '' || strlen($app) > 64) {
            $problems[] = ['field' => 'app_version', 'rule' => 'device.app_version', 'value' => $app];
        }
        $name = $body['name'] ?? null;
        if ($name !== null && (! is_string($name) || mb_strlen(S::trim($name)) > 120)) {
            $problems[] = ['field' => 'name', 'rule' => 'device.name', 'value' => $name];
        }
        if ($problems !== []) {
            throw new ValidationError("Invalid {$problems[0]['field']}.", $problems);
        }
        $now      = $this->iso();
        $name     = is_string($name) && S::trim($name) !== '' ? S::trim($name) : self::DEVICE_OS[$os] . ' device';
        $existing = $this->store->deviceByFingerprint($user, $fp);
        if ($existing !== null && ! $existing['revoked']) {
            $existing = ['os' => $os, 'app_version' => S::trim($app), 'last_seen_at' => $now] + (isset($body['name']) ? ['name' => $name] : []) + $existing;
            $this->store->saveDevice($existing);

            return ['device' => self::deviceOut($existing), 'created' => false];
        }
        $limit = $this->deviceLimit($plan);
        if (count($this->store->devicesOf($user)) >= $limit) {
            throw new HttpError(409, 'DEVICE_LIMIT', "Your plan allows {$limit} devices. Remove one in your account first.", [['field' => 'device', 'rule' => 'device.limit', 'value' => $limit]]);
        }
        // A device the user removed comes back as the same record.
        $d = ['id' => $existing['id'] ?? Uuid7::generate(), 'user_id' => $user, 'fingerprint_hash' => $fp, 'name' => $name, 'os' => $os, 'app_version' => S::trim($app), 'revoked' => false, 'revoked_at' => null, 'created_at' => $existing['created_at'] ?? $now, 'last_seen_at' => $now];
        $this->store->saveDevice($d);

        return ['device' => self::deviceOut($d), 'created' => $existing === null];
    }

    public function myDevices(?array $who): array
    {
        return array_map(self::deviceOut(...), $this->store->devicesOf($this->mustUser($who)));
    }

    public function revokeDevice(?array $who, string $id): void
    {
        $user = $this->mustUser($who);
        $d    = $this->store->device($id);
        if ($d === null || $d['user_id'] !== $user || $d['revoked']) {
            throw HttpError::notFound('Device');
        }
        $d['revoked']    = true;
        $d['revoked_at'] = $this->iso();
        $this->store->saveDevice($d);
    }

    /** The caller's active device `$id` (last_seen_at updated); 403 DEVICE_REQUIRED otherwise. */
    public function mustOwnDevice(?string $userId, mixed $id): array
    {
        $d = is_string($id) && $id !== '' && $userId !== null ? $this->store->device($id) : null;
        if ($d === null || $d['user_id'] !== $userId || $d['revoked']) {
            throw new HttpError(403, 'DEVICE_REQUIRED', 'Register this device (POST /api/v1/devices/register) and send its id as X-Device-Id.');
        }
        $d['last_seen_at'] = $this->iso();
        $this->store->saveDevice($d);

        return $d;
    }

    // ---------- favorites ----------

    public function favorites(?array $who): array
    {
        $out = [];
        foreach ($this->store->favoritesOf($this->mustUser($who)) as $assetId => $at) {
            $a = $this->store->findAsset((string) $assetId);
            if ($a !== null && self::isLive($a)) {
                $out[] = $this->publicAsset($a);
            }
        }

        return $out;
    }

    /** Idempotent: adding twice or removing a missing favorite changes nothing. */
    public function setFavorite(?array $who, string $assetId, bool $on): void
    {
        $user = $this->mustUser($who);
        $a    = $this->store->findAsset($assetId);
        if ($on && ($a === null || ! self::isLive($a))) {
            throw HttpError::notFound('Asset');
        }
        if ($a === null) {
            return;
        }
        $changed = $on ? $this->store->addFavorite($user, $a['id'], $this->iso()) : $this->store->removeFavorite($user, $a['id']);
        if ($changed) {
            $a['stats']['favorites'] = max(0, $a['stats']['favorites'] + ($on ? 1 : -1));
            $this->store->saveAsset($a);
        }
    }

    // ---------- download history ----------

    public function myDownloads(?array $who, mixed $cursor, mixed $limit): array
    {
        $user  = $this->mustUser($who);
        $n     = is_numeric($limit) && (int) $limit > 0 ? min(100, (int) $limit) : 50;
        $rows  = $this->store->downloadsOfUser($user, is_numeric($cursor) ? (int) $cursor : null, $n + 1);
        $more  = count($rows) > $n;
        $rows  = array_slice($rows, 0, $n);
        $data  = [];
        foreach ($rows as $r) {
            $a      = $this->store->findAsset($r['asset_id']);
            $data[] = ['id' => $r['id'], 'asset' => $a !== null && self::isLive($a) ? $this->publicAsset($a) : null, 'version' => $r['version'], 'device_id' => $r['device_id'], 'status' => $r['status'], 'bytes' => $r['bytes'] === null ? null : (int) $r['bytes'], 'started_at' => $r['started_at'], 'finished_at' => $r['finished_at']];
        }

        return ['data' => $data, 'next_cursor' => $more && $rows !== [] ? (string) end($rows)['row_id'] : null];
    }

    // ---------- installs mirror ----------

    public function myInstalls(?array $who, ?string $deviceId): array
    {
        return $this->store->installsOf($this->mustUser($who), $deviceId);
    }

    /** Upserts what a device has installed. `$strictDevice`: the device must be the caller's (OIDC). */
    public function saveMyInstall(?array $who, array $body, bool $strictDevice): array
    {
        $user     = $this->mustUser($who);
        $deviceId = $body['device_id'] ?? null;
        if (! is_string($deviceId) || $deviceId === '' || strlen($deviceId) > 191) {
            throw new ValidationError('A device_id is required.', [['field' => 'device_id', 'rule' => 'device_id.required', 'value' => $deviceId]]);
        }
        if ($strictDevice) {
            $this->mustOwnDevice($user, $deviceId);
        }
        $a = is_string($body['asset_id'] ?? null) ? $this->store->findAsset($body['asset_id']) : null;
        if ($a === null) {
            throw HttpError::notFound('Asset');
        }
        $version = $body['version'] ?? null;
        $v       = is_string($version) ? self::versionOf($a, $version) : null;
        if ($v === null || empty($v['package'])) {
            throw new ValidationError('That version was never published.', [['field' => 'version', 'rule' => 'version.published', 'value' => $version]]);
        }
        $now  = $this->iso();
        $prev = $this->store->install($user, $deviceId, $a['id']);
        $i    = ['device_id' => $deviceId, 'asset_id' => $a['id'], 'version' => $version, 'installed_at' => $prev !== null && $prev['version'] === $version ? $prev['installed_at'] : $now, 'last_used_at' => $prev['last_used_at'] ?? null];
        $this->store->saveInstall($user, $i);

        return $i;
    }

    public function deleteMyInstall(?array $who, string $assetId, ?string $deviceId): void
    {
        $user = $this->mustUser($who);
        $a    = $this->store->findAsset($assetId);
        $this->store->deleteInstalls($user, $a['id'] ?? $assetId, $deviceId);
    }
}
