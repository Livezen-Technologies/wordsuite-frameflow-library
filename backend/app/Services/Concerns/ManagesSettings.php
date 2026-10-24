<?php

namespace App\Services\Concerns;

use App\Exceptions\ValidationError;
use App\Libraries\Json;

/**
 * LibraryService: library settings (`GET/PUT /admin/settings`), kept as
 * JSON in library_meta.settings over defaults from the environment.
 */
trait ManagesSettings
{
    public const DEFAULT_DEVICE_LIMITS = ['free' => 2, 'pro' => 3, 'business' => 10, 'enterprise' => 50];

    /** Visibilities a feed channel may list. */
    public const FEED_VISIBILITIES = ['public', 'internal', 'unlisted'];

    /** LIBRARY_CORS_ORIGINS (the default for cors_origins). */
    public array $envCorsOrigins = [];

    private ?array $settingsCache = null;

    public function defaultSettings(): array
    {
        return [
            'device_limits'      => self::DEFAULT_DEVICE_LIMITS,
            'require_processing' => $this->requireProcessing,
            'cors_origins'       => array_values($this->envCorsOrigins),
            'feed'               => ['stable' => ['public'], 'beta' => ['public', 'internal']],
        ];
    }

    public function settings(): array
    {
        if ($this->settingsCache === null) {
            $stored = Json::decode($this->store->getMeta('settings'), []);
            $s      = $this->defaultSettings();
            foreach (is_array($stored) ? $stored : [] as $k => $v) {
                if (! array_key_exists($k, $s)) {
                    continue;
                }
                $s[$k] = is_array($s[$k]) && ! array_is_list($s[$k]) && is_array($v) ? array_merge($s[$k], $v) : $v;
            }
            $this->settingsCache = $s;
        }

        return $this->settingsCache;
    }

    /** Whether publishing waits for processing (settings, default LIBRARY_REQUIRE_PROCESSING). */
    public function processingRequired(): bool
    {
        return (bool) $this->settings()['require_processing'];
    }

    /** Merges the given keys into the settings (each validated), audited. */
    public function updateSettings(?array $actor, array $body): array
    {
        $this->requirePerm($actor, 'settings.manage');
        $before   = $this->settings();
        $next     = $before;
        $problems = [];
        foreach ($body as $k => $v) {
            switch ($k) {
                case 'device_limits':
                    if (! is_array($v) || array_is_list($v) && $v !== []) {
                        $problems[] = ['field' => 'device_limits', 'rule' => 'settings.device_limits', 'value' => $v];
                        break;
                    }
                    foreach ($v as $plan => $n) {
                        if (! array_key_exists($plan, self::DEFAULT_DEVICE_LIMITS) || ! is_int($n) || $n < 0 || $n > 10000) {
                            $problems[] = ['field' => "device_limits.{$plan}", 'rule' => 'settings.device_limits', 'value' => $n];
                        } else {
                            $next['device_limits'][$plan] = $n;
                        }
                    }
                    break;

                case 'require_processing':
                    if (! is_bool($v)) {
                        $problems[] = ['field' => 'require_processing', 'rule' => 'settings.boolean', 'value' => $v];
                    } else {
                        $next['require_processing'] = $v;
                    }
                    break;

                case 'cors_origins':
                    $ok = is_array($v) && array_is_list($v) && count($v) <= 50;
                    foreach ($ok ? $v : [] as $o) {
                        if (! is_string($o) || ! preg_match('#^https?://[A-Za-z0-9.-]+(:\d{1,5})?$#', $o)) {
                            $problems[] = ['field' => 'cors_origins', 'rule' => 'settings.origin', 'value' => $o];
                        }
                    }
                    if (! $ok) {
                        $problems[] = ['field' => 'cors_origins', 'rule' => 'settings.origin', 'value' => null];
                    } else {
                        $next['cors_origins'] = array_values(array_unique($v));
                    }
                    break;

                case 'feed':
                    if (! is_array($v) || array_is_list($v) && $v !== []) {
                        $problems[] = ['field' => 'feed', 'rule' => 'settings.feed', 'value' => $v];
                        break;
                    }
                    foreach ($v as $channel => $vis) {
                        $ok = in_array($channel, ['stable', 'beta'], true) && is_array($vis) && array_is_list($vis) && array_diff($vis, self::FEED_VISIBILITIES) === [];
                        if (! $ok) {
                            $problems[] = ['field' => "feed.{$channel}", 'rule' => 'settings.feed', 'value' => $vis];
                        } else {
                            $next['feed'][$channel] = array_values(array_unique($vis));
                        }
                    }
                    break;

                default:
                    $problems[] = ['field' => (string) $k, 'rule' => 'settings.unknown', 'value' => null];
            }
        }
        if ($problems !== []) {
            throw new ValidationError("Invalid {$problems[0]['field']}.", $problems);
        }
        $this->store->setMeta('settings', Json::encode($next));
        $this->settingsCache = null;
        $this->audit($actor, 'settings.update', 'settings', 'library', $before, $next);

        return $this->settings();
    }
}
