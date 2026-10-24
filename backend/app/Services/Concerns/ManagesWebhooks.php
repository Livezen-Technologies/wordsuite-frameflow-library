<?php

namespace App\Services\Concerns;

use App\Exceptions\HttpError;
use App\Exceptions\ValidationError;
use App\Libraries\Clock;
use App\Libraries\Json;
use App\Libraries\Uuid7;
use App\Libraries\Webhooks\UrlGuard;
use App\Libraries\Webhooks\WebhookSender;

/**
 * LibraryService: webhooks (docs/api-v1-additions.md). Library events are
 * queued as one delivery per subscribed webhook inside the request's
 * transaction; `php spark library:webhooks` sends them (signed with
 * HMAC-SHA256 of the raw body, 3 attempts with backoff, SSRF-guarded).
 */
trait ManagesWebhooks
{
    public const WEBHOOK_EVENTS       = ['asset.published', 'asset.updated', 'asset.unpublished', 'asset.deprecated', 'version.published'];
    public const WEBHOOK_MAX_ATTEMPTS = 3;

    /** Seconds before attempt 2 and 3 (LIBRARY_WEBHOOKS_BACKOFF="10,60"). */
    public array $webhookBackoff = [10, 60];

    /** LIBRARY_WEBHOOKS_ALLOW_PRIVATE=1: allow private/loopback targets (development, tests). */
    public bool $webhooksAllowPrivate = false;

    /** fn(string $url, string $body, array $headers): ['status_code', 'error', 'permanent'?]; default WebhookSender. */
    public $webhookSender = null;

    public static function webhookOut(array $w, bool $withSecret = false): array
    {
        return ['id' => $w['id'], 'url' => $w['url'], 'events' => array_values($w['events']), 'active' => $w['active'], 'created_at' => $w['created_at'], 'updated_at' => $w['updated_at']] + ($withSecret ? ['secret' => $w['secret']] : []);
    }

    public static function deliveryOut(array $d): array
    {
        return ['id' => $d['id'], 'event' => $d['event'], 'status' => $d['status'], 'status_code' => $d['status_code'], 'ok' => $d['ok'], 'attempt' => $d['attempt'], 'error' => $d['error'], 'created_at' => $d['created_at'], 'finished_at' => $d['finished_at']];
    }

    private function mustWebhook(string $id): array
    {
        return $this->store->webhook($id) ?? throw HttpError::notFound('Webhook');
    }

    private function applyWebhook(array $w, array $body, bool $create): array
    {
        $problems = [];
        if ($create || array_key_exists('url', $body)) {
            if (! UrlGuard::wellFormed($body['url'] ?? null)) {
                $problems[] = ['field' => 'url', 'rule' => 'webhook.url', 'value' => $body['url'] ?? null];
            }
            $w['url'] = $body['url'] ?? '';
        }
        if ($create || array_key_exists('events', $body)) {
            $ev = $body['events'] ?? null;
            if (! is_array($ev) || ! array_is_list($ev) || $ev === [] || array_diff($ev, self::WEBHOOK_EVENTS) !== []) {
                $problems[] = ['field' => 'events', 'rule' => 'webhook.events', 'value' => $ev];
            } else {
                $w['events'] = array_values(array_unique($ev));
            }
        }
        if (array_key_exists('active', $body)) {
            if (! is_bool($body['active'])) {
                $problems[] = ['field' => 'active', 'rule' => 'webhook.active', 'value' => $body['active']];
            }
            $w['active'] = ! empty($body['active']);
        }
        if (array_key_exists('secret', $body)) {
            $s = $body['secret'];
            if (! is_string($s) || strlen($s) < 16 || strlen($s) > 255) {
                $problems[] = ['field' => 'secret', 'rule' => 'webhook.secret', 'value' => null];
            } else {
                $w['secret'] = $s;
            }
        }
        if ($problems !== []) {
            throw new ValidationError("Invalid {$problems[0]['field']}.", $problems);
        }

        return $w;
    }

    public function webhooksList(?array $actor): array
    {
        $this->requirePerm($actor, 'settings.manage');

        return array_map(static fn ($w) => self::webhookOut($w), $this->store->webhooks());
    }

    /** The secret is returned here only (generated unless given). */
    public function createWebhook(?array $actor, array $body): array
    {
        $this->requirePerm($actor, 'settings.manage');
        $now = $this->iso();
        $w   = $this->applyWebhook(['id' => Uuid7::generate(), 'url' => '', 'events' => [], 'active' => true, 'secret' => 'whsec_' . bin2hex(random_bytes(24)), 'created_by' => $actor['id'], 'created_at' => $now, 'updated_at' => $now], $body, true);
        $this->store->saveWebhook($w);
        $this->audit($actor, 'webhook.create', 'webhook', $w['id'], null, self::webhookOut($w));

        return self::webhookOut($w, true);
    }

    public function updateWebhook(?array $actor, string $id, array $body): array
    {
        $this->requirePerm($actor, 'settings.manage');
        $before          = $this->mustWebhook($id);
        $w               = $this->applyWebhook($before, $body, false);
        $w['updated_at'] = $this->iso();
        $this->store->saveWebhook($w);
        $this->audit($actor, 'webhook.update', 'webhook', $id, self::webhookOut($before) + ['secret_rotated' => false], self::webhookOut($w) + ['secret_rotated' => $w['secret'] !== $before['secret']]);

        return self::webhookOut($w);
    }

    public function deleteWebhook(?array $actor, string $id): void
    {
        $this->requirePerm($actor, 'settings.manage');
        $w = $this->mustWebhook($id);
        $this->store->deleteWebhook($id);
        $this->audit($actor, 'webhook.delete', 'webhook', $id, self::webhookOut($w), null);
    }

    public function webhookDeliveries(?array $actor, string $id): array
    {
        $this->requirePerm($actor, 'settings.manage');
        $this->mustWebhook($id);

        return array_map(self::deliveryOut(...), $this->store->deliveries($id, 50));
    }

    /** Sends a `ping` now (one attempt) and returns the delivery. */
    public function testWebhook(?array $actor, string $id): array
    {
        $this->requirePerm($actor, 'settings.manage');
        $w = $this->mustWebhook($id);
        $d = $this->newDelivery($w, 'ping', ['webhook_id' => $w['id']]);
        $this->attemptDelivery($d, $w, true);
        $this->audit($actor, 'webhook.test', 'webhook', $id, null, ['delivery_id' => $d['id'], 'ok' => $d['ok'], 'status_code' => $d['status_code']]);

        return self::deliveryOut($d);
    }

    private function newDelivery(array $w, string $event, array $data): array
    {
        $id  = Uuid7::generate();
        $now = $this->iso();
        $d   = ['id' => $id, 'webhook_id' => $w['id'], 'event' => $event, 'payload' => Json::encode(['id' => $id, 'event' => $event, 'created_at' => $now, 'data' => Json::obj($data)]), 'status' => 'queued', 'attempt' => 0, 'next_attempt_at' => $now, 'status_code' => null, 'ok' => false, 'error' => null, 'created_at' => $now, 'finished_at' => null];
        $this->store->saveDelivery($d);

        return $d;
    }

    /** Queues `$event` for every active webhook subscribed to it. */
    public function enqueueWebhook(string $event, array $asset, ?string $version = null): int
    {
        $n = 0;
        foreach ($this->store->webhooks() as $w) {
            if ($w['active'] && in_array($event, $w['events'], true)) {
                $this->newDelivery($w, $event, ['asset' => $this->publicAsset($asset), 'version' => $version ?? $asset['published_version'] ?? $asset['current_version']]);
                $n++;
            }
        }

        return $n;
    }

    /** One attempt; updates and saves the delivery. `$final`: no retry afterwards. */
    private function attemptDelivery(array &$d, ?array $w, bool $final = false): void
    {
        $d['attempt']++;
        if ($w === null || ! $w['active']) {
            $r = ['status_code' => null, 'error' => $w === null ? 'Webhook deleted.' : 'Webhook is inactive.', 'permanent' => true];
        } else {
            $send = $this->webhookSender ?? new WebhookSender($this->webhooksAllowPrivate);
            try {
                $r = $send($w['url'], $d['payload'], ['X-Library-Event' => $d['event'], 'X-Library-Delivery' => $d['id'], 'X-Library-Signature' => WebhookSender::signature($w['secret'], $d['payload'])]);
            } catch (\Throwable $e) {
                $r = ['status_code' => null, 'error' => $e->getMessage()];
            }
        }
        $code             = $r['status_code'] ?? null;
        $d['status_code'] = $code;
        $d['ok']          = $code !== null && $code >= 200 && $code < 300;
        $d['error']       = $d['ok'] ? null : mb_substr((string) ($r['error'] ?? "HTTP {$code}"), 0, 1000);
        if ($d['ok'] || $final || ! empty($r['permanent']) || $d['attempt'] >= self::WEBHOOK_MAX_ATTEMPTS) {
            $d['status']          = $d['ok'] ? 'sent' : 'failed';
            $d['finished_at']     = $this->iso();
            $d['next_attempt_at'] = null;
        } else {
            $steps                = array_values($this->webhookBackoff) ?: [60];
            $wait                 = (int) ($steps[$d['attempt'] - 1] ?? $steps[count($steps) - 1]);
            $d['next_attempt_at'] = Clock::iso(Clock::ms() + $wait * 1000);
        }
        $this->store->saveDelivery($d);
    }

    /** Sends due deliveries (oldest first). Returns what happened, one entry per attempt. */
    public function deliverWebhooks(int $limit = 50): array
    {
        $out = [];
        foreach ($this->store->dueDeliveries($this->iso(), $limit) as $d) {
            $this->attemptDelivery($d, $this->store->webhook($d['webhook_id']));
            $out[] = self::deliveryOut($d);
        }

        return $out;
    }
}
