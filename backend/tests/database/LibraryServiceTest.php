<?php

namespace Tests\Database;

use App\Exceptions\HttpError;
use App\Exceptions\ValidationError;
use App\Libraries\Pack\Zip;
use App\Libraries\Signing\Ed25519Key;
use App\Libraries\Storage\FileBlobStore;
use App\Services\LibraryService;
use App\Services\LibraryStore;
use CodeIgniter\Test\CIUnitTestCase;
use CodeIgniter\Test\DatabaseTestTrait;
use Tests\Support\Fixtures;

/** The service over real tables (in-memory SQLite, the CI4 migrations). */
final class LibraryServiceTest extends CIUnitTestCase
{
    use DatabaseTestTrait;

    protected $migrate     = true;
    protected $migrateOnce = false;
    protected $refresh     = true;
    protected $namespace   = null;

    private LibraryService $lib;
    private string $dir;

    private const SU = ['id' => 'u1', 'role' => 'super_admin'];
    private const ED = ['id' => 'u2', 'role' => 'content_editor'];
    private const WK = ['id' => 'w1', 'role' => 'worker'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir() . '/fflib-phpunit-' . bin2hex(random_bytes(4));
        $this->lib = new LibraryService(new LibraryStore($this->db), new FileBlobStore($this->dir));
    }

    private function lut(array $body = [], array $actor = self::SU): array
    {
        $up    = $this->lib->upload($actor, 'warm.cube', Fixtures::cube());
        $thumb = $this->lib->upload($actor, 't.png', Fixtures::png(640, 360));

        return $this->lib->createAsset($actor, ['upload_id' => $up['id'], 'thumbnail_upload_id' => $thumb['id'], 'title' => 'Warm Film'] + $body);
    }

    public function testDefaultCategoriesAreSeeded(): void
    {
        $this->assertCount(3, $this->lib->categories('lut'));
    }

    public function testPublishBuildsASignedFeedAndAnInstallablePack(): void
    {
        $a = $this->lut();
        $this->assertSame('draft', $a['status']);
        $this->assertSame('queued', $a['versions'][0]['processing']['status']);
        $pub = $this->lib->publish(self::SU, $a['id']);
        $this->assertSame('published', $pub['status']);

        $feed = $this->lib->feed('stable');
        $pem  = $this->lib->publicKeyPem();
        $this->assertTrue(Ed25519Key::verifyWith(Ed25519Key::publicKeyFromPem($pem), $feed['text'], trim($feed['sig'])));
        $cat = json_decode($feed['text'], true);
        $this->assertSame('warm-film', $cat['packs'][0]['id']);
        $this->assertSame('luts', $cat['packs'][0]['type']);

        $zip = file_get_contents($this->dir . '/packages/warm-film-1.0.0.zip');
        $this->assertSame($cat['packs'][0]['sha256'], hash('sha256', $zip));
        $this->assertSame(['pack.json', 'index.json', 'manifest.json', 'licence.txt', 'warm-film/warm-film.cube', 'warm-film/thumbnail.png'], Zip::inspect($zip));
        $this->assertSame('free', $this->lib->packageTier('warm-film-1.0.0.zip'));

        $this->assertSame('upsert', $this->lib->sync(0)['events'][0]['op']);
        $log = $this->lib->auditLog($a['id']);
        $this->assertSame(['asset.publish', 'asset.create'], array_column($log, 'action'));
    }

    public function testRbacAndWorkflow(): void
    {
        $a = $this->lut([], self::ED);
        try {
            $this->lib->publish(self::ED, $a['id']);
            $this->fail('editor published');
        } catch (HttpError $e) {
            $this->assertSame(403, $e->status);
        }
        try {
            $this->lib->publish(['id' => 'm', 'role' => 'library_manager'], $a['id']);
            $this->fail('unapproved publish');
        } catch (ValidationError $e) {
            $this->assertSame('PUBLISH_BLOCKED', $e->errorCode);
            $this->assertSame('status.approved', $e->details[0]['rule']);
        }
        $this->lib->submitReview(self::ED, $a['id']);
        $approved = $this->lib->review(['id' => 'r', 'role' => 'reviewer'], $a['id'], true);
        $this->assertSame('approved', $approved['status']);
        $diff = $this->lib->auditLog($a['id'])[0]['diff'];
        $this->assertSame(['status' => 'ready_for_review'], (array) $diff['before']);
        $this->expectException(HttpError::class);
        $this->lib->submitReview(self::ED, $a['id']); // approved → ready_for_review isn't a transition
    }

    public function testJobLeaseAndRetries(): void
    {
        $this->lut();
        $this->assertNull((function () {
            try {
                return $this->lib->claimJob(self::ED);
            } catch (HttpError $e) {
                return $e->status === 403 ? null : $e;
            }
        })());
        $claim = $this->lib->claimJob(self::WK);
        $this->assertSame('lut', $claim['asset']['type']);
        $this->assertNull($this->lib->claimJob(['id' => 'w2', 'role' => 'worker']));
        $id = $claim['job']['id'];
        $this->lib->putPreview(self::WK, $id, 'thumbnail', 'webp', 'RIFFxxxxWEBP');
        $done = $this->lib->completeJob(self::WK, $id, ['ok' => true, 'checks' => [['check' => 'deep', 'passed' => true]]]);
        $this->assertSame('done', $done['status']);
        $a = $this->lib->getAsset('warm-film');
        $this->assertSame('done', $a['versions'][0]['processing']['status']);
        $this->assertSame('worker', end($a['versions'][0]['checks'])['source']);
    }
}
