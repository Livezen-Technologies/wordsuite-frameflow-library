<?php

namespace Tests\Database;

use App\Exceptions\HttpError;
use App\Exceptions\ValidationError;
use App\Libraries\Clock;
use App\Libraries\Storage\FileBlobStore;
use App\Libraries\Webhooks\UrlGuard;
use App\Libraries\Webhooks\WebhookSender;
use App\Services\LibraryService;
use App\Services\LibraryStore;
use CodeIgniter\Test\CIUnitTestCase;
use CodeIgniter\Test\DatabaseTestTrait;
use Tests\Support\Fixtures;

/** docs/api-v1-additions.md service logic over real tables (in-memory SQLite). */
final class ClientAndAdminTest extends CIUnitTestCase
{
    use DatabaseTestTrait;

    protected $migrate     = true;
    protected $migrateOnce = false;
    protected $refresh     = true;
    protected $namespace   = null;

    private LibraryService $lib;

    private const SU    = ['id' => 'u1', 'role' => 'super_admin'];
    private const ED    = ['id' => 'u2', 'role' => 'content_editor'];
    private const ALICE = ['id' => 'alice', 'role' => null, 'plan' => 'free'];

    protected function setUp(): void
    {
        parent::setUp();
        Clock::$fixedMs = null;
        $this->lib      = new LibraryService(new LibraryStore($this->db), new FileBlobStore(sys_get_temp_dir() . '/fflib-phpunit-' . bin2hex(random_bytes(4))));
    }

    protected function tearDown(): void
    {
        Clock::$fixedMs = null;
        parent::tearDown();
    }

    private function published(string $title, array $body = []): array
    {
        $up    = $this->lib->upload(self::SU, strtolower(str_replace(' ', '_', $title)) . '.cube', Fixtures::cube());
        $thumb = $this->lib->upload(self::SU, 't.png', Fixtures::png(640, 360));
        $a     = $this->lib->createAsset(self::SU, ['upload_id' => $up['id'], 'thumbnail_upload_id' => $thumb['id'], 'title' => $title] + $body);

        return $this->lib->publish(self::SU, $a['id']);
    }

    private function device(array $who, string $fp, string $plan = 'free'): array
    {
        return $this->lib->registerDevice($who, $plan, ['fingerprint_hash' => $fp, 'os' => 'windows', 'app_version' => '2.0.0']);
    }

    public function testDeviceLimitsFollowThePlanAndRevokedDevicesFreeASlot(): void
    {
        $a = $this->device(self::ALICE, 'fingerprint-1');
        $this->assertTrue($a['created']);
        $this->assertSame('Windows device', $a['device']['name']);
        $again = $this->device(self::ALICE, 'fingerprint-1');
        $this->assertFalse($again['created']);
        $this->assertSame($a['device']['id'], $again['device']['id']);
        $this->device(self::ALICE, 'fingerprint-2');
        try {
            $this->device(self::ALICE, 'fingerprint-3');
            $this->fail('third device on free');
        } catch (HttpError $e) {
            $this->assertSame(409, $e->status);
            $this->assertSame('DEVICE_LIMIT', $e->errorCode);
            $this->assertSame([['field' => 'device', 'rule' => 'device.limit', 'value' => 2]], $e->details);
        }
        // Pro allows 3; other users have their own count.
        $this->assertTrue($this->device(self::ALICE, 'fingerprint-3', 'pro')['created']);
        $this->assertTrue($this->device(['id' => 'bob'], 'fingerprint-1')['created']);

        $this->lib->revokeDevice(self::ALICE, $a['device']['id']);
        $this->assertCount(2, $this->lib->myDevices(self::ALICE));
        try {
            $this->lib->mustOwnDevice('alice', $a['device']['id']);
            $this->fail('revoked device used');
        } catch (HttpError $e) {
            $this->assertSame('DEVICE_REQUIRED', $e->errorCode);
        }
        // A user can't use or revoke someone else's device.
        $this->expectException(HttpError::class);
        $this->lib->revokeDevice(['id' => 'bob'], $again['device']['id']);
    }

    public function testDeviceLimitsComeFromSettings(): void
    {
        $this->lib->updateSettings(self::SU, ['device_limits' => ['free' => 1]]);
        $this->assertSame(['free' => 1, 'pro' => 3, 'business' => 10, 'enterprise' => 50], $this->lib->settings()['device_limits']);
        $this->device(self::ALICE, 'fingerprint-1');
        $this->expectExceptionCode(409);
        $this->device(self::ALICE, 'fingerprint-2');
    }

    public function testSettingsAreValidatedPermissionedAndAudited(): void
    {
        try {
            $this->lib->updateSettings(['id' => 'm', 'role' => 'library_manager'], ['require_processing' => true]);
            $this->fail('manager changed settings');
        } catch (HttpError $e) {
            $this->assertSame(403, $e->status);
        }
        try {
            $this->lib->updateSettings(self::SU, ['feed' => ['stable' => ['draft']], 'cors_origins' => ['javascript:x']]);
            $this->fail('bad settings saved');
        } catch (ValidationError $e) {
            $this->assertSame(['settings.feed', 'settings.origin'], array_column($e->details, 'rule'));
        }
        $s = $this->lib->updateSettings(self::SU, ['require_processing' => true, 'feed' => ['stable' => ['public', 'unlisted']]]);
        $this->assertTrue($this->lib->processingRequired());
        $this->assertSame(['public', 'unlisted'], $s['feed']['stable']);
        $this->assertSame('settings.update', $this->lib->auditLog('library')[0]['action']);
    }

    public function testFavoritesAreIdempotentAndCounted(): void
    {
        $a = $this->published('Warm Film');
        $this->lib->setFavorite(self::ALICE, $a['id'], true);
        $this->lib->setFavorite(self::ALICE, $a['slug'], true);
        $this->lib->setFavorite(['id' => 'bob'], $a['id'], true);
        $this->assertSame(2, $this->lib->getAsset($a['id'])['stats']['favorites']);
        $this->assertSame(['warm-film'], array_column($this->lib->favorites(self::ALICE), 'slug'));
        $this->lib->setFavorite(self::ALICE, $a['id'], false);
        $this->lib->setFavorite(self::ALICE, $a['id'], false);
        $this->assertSame(1, $this->lib->getAsset($a['id'])['stats']['favorites']);
        $this->assertSame([], $this->lib->favorites(self::ALICE));
        $this->expectException(HttpError::class);
        $this->lib->setFavorite(null, $a['id'], true);
    }

    public function testTagMergeRewritesEveryAssetAndIsAudited(): void
    {
        $a = $this->published('Warm Film', ['tags' => ['sunset', 'warm', 'golden']]);
        $b = $this->published('Cool Film', ['tags' => ['Sun-set', 'cool']]);
        $c = $this->published('Other', ['tags' => ['other']]);
        $r = $this->lib->mergeTags(self::SU, ['from' => ['sunset', 'sun-set', 'golden'], 'into' => 'Golden Hour']);
        $this->assertSame(2, $r['updated']);
        $this->assertSame(['golden hour', 'warm'], $this->lib->getAsset($a['id'])['tags']);
        $this->assertSame(['golden hour', 'cool'], $this->lib->getAsset($b['id'])['tags']);
        $this->assertSame(['other'], $this->lib->getAsset($c['id'])['tags']);
        $this->assertSame('tag.merge', $this->lib->auditLog('golden hour')[0]['action']);
        $this->assertSame(['tags'], $this->lib->sync(0)['events'][3]['changed']);
        try {
            $this->lib->mergeTags(self::ED, ['from' => ['a'], 'into' => 'b']);
            $this->fail('editor merged tags');
        } catch (HttpError $e) {
            $this->assertSame(403, $e->status);
        }
        $this->expectException(ValidationError::class);
        $this->lib->mergeTags(self::SU, ['from' => ['x'], 'into' => '']);
    }

    public function testCollectionWindowsAndOrder(): void
    {
        $a   = $this->published('Warm Film');
        $b   = $this->published('Cool Film');
        $now = Clock::ms();
        $this->lib->createCollection(self::SU, ['title' => 'Vesak', 'asset_ids' => [$b['id'], $a['slug'], $b['id']], 'publish_at' => Clock::iso($now - 1000), 'unpublish_at' => Clock::iso($now + 86_400_000)]);
        $this->lib->createCollection(self::SU, ['title' => 'Later', 'asset_ids' => [$a['id']], 'publish_at' => Clock::iso($now + 3_600_000)]);
        $this->lib->createCollection(self::SU, ['title' => 'Hidden', 'asset_ids' => [$a['id']], 'visible' => false]);
        $rails = $this->lib->collections();
        $this->assertSame(['vesak', 'featured', 'new', 'trending'], array_column($rails, 'slug'));
        $this->assertSame(['cool-film', 'warm-film'], array_column($rails[0]['assets'], 'slug'));

        $this->assertTrue(LibraryService::collectionLive(['visible' => true, 'publish_at' => null, 'unpublish_at' => null], $now));
        $this->assertFalse(LibraryService::collectionLive(['visible' => true, 'publish_at' => Clock::iso($now - 10), 'unpublish_at' => Clock::iso($now)], $now));
        $this->assertTrue(LibraryService::collectionLive(['visible' => true, 'publish_at' => Clock::iso($now), 'unpublish_at' => null], $now));

        // An hour later "Later" is live; after unpublish_at "Vesak" is gone. Unpublished assets drop out.
        Clock::$fixedMs = $now + 2 * 86_400_000;
        $this->lib->unpublish(self::SU, $a['id']);
        $rails = $this->lib->collections();
        $this->assertSame(['later', 'featured', 'new', 'trending'], array_column($rails, 'slug'));
        $this->assertSame([], $rails[0]['assets']);

        foreach ([['slug' => 'featured', 'title' => 'Featured too'], ['title' => 'Bad', 'publish_at' => '2026-01-02', 'unpublish_at' => '2026-01-01'], ['title' => 'Bad', 'asset_ids' => ['nope']]] as $body) {
            try {
                $this->lib->createCollection(self::SU, $body);
                $this->fail('invalid collection ' . json_encode($body));
            } catch (ValidationError $e) {
                $this->assertContains($e->details[0]['rule'], ['slug.reserved', 'collection.window', 'collection.asset']);
            }
        }
        $this->lib->deleteCollection(self::SU, 'later');
        $actions = array_column($this->lib->auditLog(null), 'action');
        $this->assertSame('collection.delete', $actions[0]);
        $this->assertSame(3, count(array_keys($actions, 'collection.create', true)));
    }

    public function testCategoryDeleteRefusesWhenInUse(): void
    {
        $a   = $this->published('Warm Film');
        $cat = $this->lib->getAsset($a['id'])['category'];
        try {
            $this->lib->deleteCategory(self::SU, $cat['id']);
            $this->fail('deleted a used category');
        } catch (HttpError $e) {
            $this->assertSame('CATEGORY_IN_USE', $e->errorCode);
            $this->assertSame(1, $e->details[0]['value']);
        }
        $empty = $this->lib->categories('lut')[1];
        $moved = $this->lib->updateCategory(self::SU, $empty['id'], ['name' => 'Film stocks', 'parent_id' => $cat['id'], 'visible' => false]);
        $this->assertSame('film-stocks', $moved['slug']);
        // A parent can't move under its own child.
        try {
            $this->lib->updateCategory(self::SU, $cat['id'], ['parent_id' => $empty['id']]);
            $this->fail('cycle');
        } catch (ValidationError $e) {
            $this->assertSame('category.parent', $e->details[0]['rule']);
        }
        $ids = array_column($this->lib->categories('lut'), 'id');
        $this->lib->reorderCategories(self::SU, ['ids' => array_reverse($ids)]);
        $this->assertSame(array_reverse($ids), array_column($this->lib->categories('lut'), 'id'));
        $this->lib->updateCategory(self::SU, $empty['id'], ['parent_id' => null]);
        $this->lib->deleteCategory(self::SU, $empty['id']);
        $this->assertCount(2, $this->lib->categories('lut'));
    }

    public function testWebhooksAreSignedQueuedAndRetried(): void
    {
        $hook = $this->lib->createWebhook(self::SU, ['url' => 'https://hooks.example.com/library', 'events' => ['asset.published', 'asset.unpublished']]);
        $this->assertStringStartsWith('whsec_', $hook['secret']);
        $this->assertArrayNotHasKey('secret', $this->lib->webhooksList(self::SU)[0]);

        $calls                    = [];
        $answers                  = [500, 0, 204];
        $this->lib->webhookBackoff = [0, 0];
        $this->lib->webhookSender = static function (string $url, string $body, array $headers) use (&$calls, &$answers) {
            $calls[] = compact('url', 'body', 'headers');
            $code    = array_shift($answers);

            return $code === 0 ? ['status_code' => null, 'error' => 'timed out'] : ['status_code' => $code, 'error' => null];
        };
        $a = $this->published('Warm Film');
        $first = $this->lib->deliverWebhooks();
        $this->assertCount(1, $first);
        $this->assertCount(1, $this->lib->deliverWebhooks());
        $last = $this->lib->deliverWebhooks();
        $this->assertSame([], $this->lib->deliverWebhooks());
        $this->assertTrue($last[0]['ok']);
        $this->assertSame(3, $last[0]['attempt']);
        $this->assertCount(3, $calls);

        $c = $calls[2];
        $this->assertSame('https://hooks.example.com/library', $c['url']);
        $this->assertSame('asset.published', $c['headers']['X-Library-Event']);
        $this->assertSame('sha256=' . hash_hmac('sha256', $c['body'], $hook['secret']), $c['headers']['X-Library-Signature']);
        $this->assertSame(WebhookSender::signature($hook['secret'], $c['body']), $c['headers']['X-Library-Signature']);
        $payload = json_decode($c['body'], true);
        $this->assertSame($c['headers']['X-Library-Delivery'], $payload['id']);
        $this->assertSame('warm-film', $payload['data']['asset']['slug']);
        $this->assertSame('1.0.0', $payload['data']['version']);
        $this->assertSame($calls[0]['body'], $c['body']);

        // Three failures and it stops; unsubscribed events aren't queued.
        $answers = [500, 500, 500, 500];
        $this->lib->unpublish(self::SU, $a['id']);
        $this->lib->deliverWebhooks();
        $this->lib->deliverWebhooks();
        $this->lib->deliverWebhooks();
        $this->assertSame([], $this->lib->deliverWebhooks());
        $d = $this->lib->webhookDeliveries(self::SU, $hook['id']);
        $this->assertSame(['asset.unpublished', 'asset.published'], array_column($d, 'event'));
        $this->assertSame(['failed', 'sent'], array_column($d, 'status'));
        $this->assertSame(500, $d[0]['status_code']);
    }

    public function testWebhookSsrfGuard(): void
    {
        foreach (['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'] as $ip) {
            $this->assertFalse(UrlGuard::isPublic($ip), $ip);
        }
        foreach (['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111'] as $ip) {
            $this->assertTrue(UrlGuard::isPublic($ip), $ip);
        }
        $this->assertSame('93.184.216.34', UrlGuard::check('https://ok.example/x', false, static fn () => ['93.184.216.34'])['ip']);
        foreach (['http://127.0.0.1:8080/x', 'http://[::1]/x', 'https://rebind.example/x', 'ftp://example.com/x', 'http://user:pw@example.com/'] as $url) {
            try {
                UrlGuard::check($url, false, static fn () => ['93.184.216.34', '10.0.0.5']);
                $this->fail("allowed {$url}");
            } catch (\RuntimeException) {
                $this->addToAssertionCount(1);
            }
        }
        $this->assertSame('127.0.0.1', UrlGuard::check('http://127.0.0.1:9/x', true)['ip']);

        // The real sender refuses without connecting, and the delivery fails without retries.
        $r = (new WebhookSender(false))('http://127.0.0.1:9/hook', '{}', []);
        $this->assertNull($r['status_code']);
        $this->assertStringStartsWith('Refused', $r['error']);
        $hook = $this->lib->createWebhook(self::SU, ['url' => 'http://127.0.0.1:9/hook', 'events' => ['asset.published']]);
        $ping = $this->lib->testWebhook(self::SU, $hook['id']);
        $this->assertFalse($ping['ok']);
        $this->assertSame('failed', $ping['status']);
        $this->assertStringContainsString('private', $ping['error']);
        $this->expectException(ValidationError::class);
        $this->lib->createWebhook(self::SU, ['url' => 'file:///etc/passwd', 'events' => ['asset.published']]);
    }

    public function testInstallsMirrorAndDownloadHistory(): void
    {
        $a = $this->published('Warm Film');
        $d = $this->device(self::ALICE, 'fingerprint-1')['device'];
        $g = $this->lib->downloadGrant($a['id'], ['plan' => 'free', 'user_id' => 'alice', 'device_id' => $d['id'], 'require_device' => true]);
        $this->lib->completeDownload($g['download_id'], ['status' => 'installed', 'bytes' => 10]);
        try {
            $this->lib->downloadGrant($a['id'], ['plan' => 'free', 'user_id' => 'alice', 'device_id' => 'other', 'require_device' => true]);
            $this->fail('download without a device');
        } catch (HttpError $e) {
            $this->assertSame('DEVICE_REQUIRED', $e->errorCode);
        }
        $h = $this->lib->myDownloads(self::ALICE, null, 10);
        $this->assertSame('installed', $h['data'][0]['status']);
        $this->assertSame('warm-film', $h['data'][0]['asset']['slug']);
        $this->assertNull($h['next_cursor']);

        $i = $this->lib->saveMyInstall(self::ALICE, ['device_id' => $d['id'], 'asset_id' => $a['id'], 'version' => '1.0.0'], true);
        $this->lib->saveMyInstall(self::ALICE, ['device_id' => $d['id'], 'asset_id' => $a['id'], 'version' => '1.0.0'], true);
        $this->assertSame([$i], $this->lib->myInstalls(self::ALICE, $d['id']));
        $this->lib->recordUsage([['asset_id' => $a['id'], 'event' => 'apply', 'device_id' => $d['id']]], 'alice');
        $this->assertNotNull($this->lib->myInstalls(self::ALICE, null)[0]['last_used_at']);
        $stats = $this->lib->assetAnalytics(self::SU, $a['id'], []);
        $this->assertSame([1, 1, 1], [$stats['downloads'], $stats['installs'], $stats['applies']]);
        $this->assertSame([['version' => '1.0.0', 'downloads' => 1]], $stats['versions']);
        $this->lib->deleteMyInstall(self::ALICE, $a['id'], null);
        $this->assertSame([], $this->lib->myInstalls(self::ALICE, null));
    }

    public function testSearchMissesAreCounted(): void
    {
        $this->lib->recordSearch('  Glitch ', 0);
        $this->lib->recordSearch('glitch', 0);
        $this->lib->recordSearch('warm', 3);
        $this->lib->recordSearch('', 0);
        $s = $this->lib->searchAnalytics();
        $this->assertSame([['term' => 'glitch', 'count' => 2], ['term' => 'warm', 'count' => 1]], $s['top']);
        $this->assertSame(['glitch'], array_column($s['misses'], 'term'));
        $this->assertSame(2, $s['misses'][0]['count']);
    }
}
