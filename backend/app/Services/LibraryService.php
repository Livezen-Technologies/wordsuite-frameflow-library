<?php

namespace App\Services;

use App\Exceptions\HttpError;
use App\Exceptions\ValidationError;
use App\Libraries\AssetSchema as S;
use App\Libraries\Clock;
use App\Libraries\Json;
use App\Libraries\Pack\PackBuilder;
use App\Libraries\Pack\Zip;
use App\Libraries\Pack\ZipProblem;
use App\Libraries\Rbac;
use App\Libraries\Search\MeiliSearch;
use App\Libraries\Signing\Ed25519Key;
use App\Libraries\Storage\BlobStoreInterface;
use App\Libraries\Uuid7;
use App\Services\Concerns\ManagesCuration;
use App\Services\Concerns\ManagesSettings;
use App\Services\Concerns\ManagesWebhooks;
use App\Services\Concerns\ReportsAnalytics;
use App\Services\Concerns\ServesClientLibrary;

/**
 * The Library: assets, versions, workflow, publishing, the sync feed, the
 * audit log and the FrameFlow feed (blueprint §3, §4, §5, §8). Port of
 * apps/api/src/service.js over database tables instead of one JSON document.
 *
 * Actors are `['id' => …, 'role' => …]`; clients are
 * `['plan', 'device_id', 'user_id', 'appVersion']`.
 *
 * The docs/api-v1-additions.md features live in traits (Concerns/): the
 * user's devices and library, curation, settings, analytics and webhooks.
 */
class LibraryService
{
    use ManagesCuration;
    use ManagesSettings;
    use ManagesWebhooks;
    use ReportsAnalytics;
    use ServesClientLibrary;

    public const DEFAULT_CATEGORIES = [
        'graphic'        => ['Overlays', 'Shapes', 'Frames'],
        'sfx'            => ['Transitions', 'UI', 'Ambience', 'Music beds'],
        'text_template'  => ['Lower thirds', 'Titles', 'Captions'],
        'video_template' => ['Wedding', 'Corporate', 'Social'],
        'motion'         => ['Social', 'Callouts', 'Backgrounds'],
        'transition'     => ['Glitch', 'Wipes', 'Zooms'],
        'lut'            => ['Cinematic', 'Film', 'Log conversion'],
        'font'           => ['Sans serif', 'Serif', 'Sinhala', 'Tamil'],
        'filter'         => ['Film', 'Stylize', 'Blur'],
        'brand_kit'      => ['Org private'],
        'gif_sticker'    => ['Reactions', 'Seasonal', 'Emoji'],
        'lottie'         => ['Social', 'Icons', 'Loaders'],
    ];

    private const EDITABLE = ['title', 'description', 'category_id', 'subcategory_id', 'tags', 'keywords', 'aspect_ratios', 'platforms', 'min_app_version', 'licence_tier', 'licence_terms', 'licence_text', 'attribution_required', 'attribution_text', 'author', 'visibility', 'audience_rules', 'featured', 'featured_rank', 'publish_at', 'unpublish_at', 'dependencies', 'meta', 'slug'];

    private ?Ed25519Key $key = null;

    /** Client IP recorded in the audit log. */
    public ?string $ip = null;

    /** Optional Meilisearch index (MEILI_URL); null: SQL search. */
    public ?MeiliSearch $search = null;

    public function __construct(
        public readonly LibraryStore $store,
        private readonly BlobStoreInterface $blobs,
        private readonly string $signingKeyPem = '',
    ) {
    }

    // ---------- setup ----------

    /**
     * The signing key: LIBRARY_SIGNING_KEY, else a development key kept with
     * the library state (library_meta.dev_signing_key, PKCS#8 PEM like Node's).
     */
    public function key(): Ed25519Key
    {
        if ($this->key !== null) {
            return $this->key;
        }
        if (trim($this->signingKeyPem) !== '') {
            return $this->key = Ed25519Key::fromPem($this->signingKeyPem);
        }
        $pem = $this->store->getMeta('dev_signing_key');
        if ($pem === null) {
            $pem = Ed25519Key::generate()->privatePem();
            $this->store->setMeta('dev_signing_key', $pem);
        }

        return $this->key = Ed25519Key::fromPem($pem);
    }

    public function publicKeyPem(): string
    {
        return $this->key()->publicPem();
    }

    // ---------- helpers ----------

    private function iso(): string
    {
        return Clock::iso();
    }

    private function readOriginal(string $sha): string
    {
        $buf = $this->blobs->get("originals/{$sha}");
        if ($buf === null) {
            throw new \RuntimeException("Original {$sha} is missing from storage");
        }

        return $buf;
    }

    /** The asset without fields that never show in diffs. */
    private function audit(?array $actor, string $action, string $entity, ?string $id, ?array $before, ?array $after): void
    {
        $this->store->addAudit(['id' => Uuid7::generate(), 'actor_id' => $actor['id'] ?? null, 'actor_role' => $actor['role'] ?? null, 'action' => $action, 'entity' => $entity, 'entity_id' => $id, 'diff' => self::diffOf($before, $after), 'ip' => $this->ip, 'at' => $this->iso()]);
    }

    public static function diffOf(?array $before, ?array $after): array
    {
        if ($before === null || $after === null) {
            return ['before' => $before, 'after' => $after];
        }
        $out  = ['before' => [], 'after' => []];
        $keys = array_unique(array_merge(array_keys($before), array_keys($after)));
        foreach ($keys as $k) {
            if ($k === 'versions' || $k === 'updated_at') {
                continue;
            }
            $b = array_key_exists($k, $before) ? Json::encode($before[$k]) : null;
            $a = array_key_exists($k, $after) ? Json::encode($after[$k]) : null;
            if ($b !== $a) {
                if (array_key_exists($k, $before)) {
                    $out['before'][$k] = $before[$k];
                }
                if (array_key_exists($k, $after)) {
                    $out['after'][$k] = $after[$k];
                }
            }
        }

        return ['before' => Json::obj($out['before']), 'after' => Json::obj($out['after'])];
    }

    private function syncEvent(string $op, array $asset, array $extra = []): void
    {
        $this->store->addSyncEvent($op, $asset, $extra, $this->iso());
    }

    /**
     * After a change to a live (or just unpublished) asset: queue webhook
     * events and update the search index. Indexing failures never fail the
     * change; SQL search covers until the next update.
     */
    private function notify(array $events, array $asset, ?string $version = null): void
    {
        foreach ($events as $e) {
            $this->enqueueWebhook($e, $asset, $version);
        }
        if ($this->search === null) {
            return;
        }
        try {
            if (self::isLive($asset)) {
                $this->search->upsert($asset, $this->categoryOf($asset));
            } else {
                $this->search->delete($asset['id']);
            }
        } catch (\Throwable $e) {
            log_message('warning', '[library] search index update failed: {msg}', ['msg' => $e->getMessage()]);
        }
    }

    public function getAssetOrNull(string $id): ?array
    {
        return $this->store->findAsset($id);
    }

    private function mustAsset(string $id): array
    {
        return $this->store->findAsset($id) ?? throw HttpError::notFound('Asset');
    }

    private function categoryOf(array $asset): ?array
    {
        return $this->store->category($asset['category_id'] ?? null);
    }

    private function requirePerm(?array $actor, string $perm, ?array $asset = null): void
    {
        if ($actor === null) {
            throw HttpError::unauthenticated();
        }
        if ($perm === 'asset.edit') {
            if (Rbac::can($actor['role'], 'asset.edit.all')) {
                return;
            }
            if (Rbac::can($actor['role'], 'asset.edit.own') && $asset !== null && ($asset['created_by'] ?? null) === $actor['id']) {
                return;
            }

            throw HttpError::forbidden('asset.edit');
        }
        if (! Rbac::can($actor['role'], $perm)) {
            throw HttpError::forbidden($perm);
        }
    }

    private function setStatus(array &$asset, string $to): void
    {
        if (! in_array($to, S::TRANSITIONS[$asset['status']] ?? [], true)) {
            throw new HttpError(409, 'INVALID_TRANSITION', "Can't move from {$asset['status']} to {$to}.");
        }
        $asset['status'] = $to;
    }

    // ---------- uploads (§4.1) ----------

    /** Upload gate (§4.1) then type validation (§4.2) for `type`. */
    private function runChecks(string $filename, string $buf, ?string $type): array
    {
        $checks = $type ? S::uploadChecks($filename, $type, $buf) : [['check' => 'type', 'passed' => false, 'detail' => ['rule' => 'type.detect', 'value' => S::extOf($filename), 'message' => 'Pick a type for this file.']]];
        foreach ($checks as $c) {
            if ($c['check'] === 'magic_bytes' && ($c['detail']['value'] ?? null) === 'zip') {
                try {
                    $checks[] = ['check' => 'archive', 'passed' => true, 'detail' => ['entries' => count(Zip::inspect($buf))]];
                } catch (ZipProblem $e) {
                    $checks[] = ['check' => 'archive', 'passed' => false, 'detail' => ['rule' => $e->rule, 'value' => $e->value, 'message' => $e->getMessage()]];
                }
            }
        }
        $meta = [];
        $all  = array_reduce($checks, static fn ($ok, $c) => $ok && $c['passed'], true);
        if ($type && $all) {
            try {
                $result = S::validateFile($type, $filename, $buf);
                array_push($checks, ...$result['checks']);
                $meta = $result['meta'];
            } catch (ValidationError $e) {
                $first    = $e->details[0] ?? [];
                $checks[] = ['check' => $first['rule'] ?? 'type', 'passed' => false, 'detail' => $first + ['message' => $e->getMessage()]];
            }
        }
        // Malware scanning (ClamAV) runs in a worker when CLAMAV_HOST is set.
        $checks[] = ['check' => 'malware_scan', 'passed' => true, 'detail' => ['engine' => getenv('CLAMAV_HOST') ? 'clamav' : 'not-configured']];

        return ['checks' => $checks, 'meta' => $meta];
    }

    /** Stores raw bytes and runs the checks for the given or detected type. */
    public function upload(?array $actor, string $filename, string $buf, ?string $type = null): array
    {
        $this->requirePerm($actor, 'asset.create');
        if ($filename === '' || $buf === '') {
            throw new ValidationError('A file is required.', [['field' => 'file', 'rule' => 'file.required', 'value' => null]]);
        }
        $sha      = hash('sha256', $buf);
        $detected = $type ?: S::detectType($filename, $buf);
        $r        = $this->runChecks($filename, $buf, $detected);
        $up       = ['id' => Uuid7::generate(), 'filename' => $filename, 'sha256' => $sha, 'size' => strlen($buf), 'type' => $detected, 'checks' => $r['checks'], 'meta' => $r['meta'], 'duplicate_of' => $this->store->assetWithFile($sha), 'created_by' => $actor['id'], 'created_at' => $this->iso()];
        if (! $this->blobs->has("originals/{$sha}")) {
            $this->blobs->put("originals/{$sha}", $buf);
        }
        $this->store->saveUpload($up);

        return $up;
    }

    public function mustUpload(mixed $id): array
    {
        $up = is_string($id) || is_int($id) ? $this->store->upload((string) $id) : null;

        return $up ?? throw HttpError::notFound('Upload ' . S::jsString($id ?? 'undefined'));
    }

    /** An upload checked as `type`: re-validated when that isn't the type it was checked as. */
    private function uploadAs(mixed $id, ?string $type): array
    {
        $up = $this->mustUpload($id);
        if (! $type || $up['type'] === $type) {
            return $up;
        }
        $r            = $this->runChecks($up['filename'], $this->readOriginal($up['sha256']), $type);
        $up['type']   = $type;
        $up['checks'] = $r['checks'];
        $up['meta']   = $r['meta'];
        $this->store->saveUpload($up);

        return $up;
    }

    // ---------- assets ----------

    private function newVersion(array &$asset, string $version, mixed $uploadId, mixed $thumbnailUploadId, mixed $changelog, mixed $isBreaking, array $actor): array
    {
        $up    = $this->uploadAs($uploadId, $asset['type']);
        $files = [['role' => 'main', 'filename' => $up['filename'], 'sha256' => $up['sha256'], 'size' => $up['size']]];
        if (! empty($thumbnailUploadId)) {
            $t                       = $this->mustUpload($thumbnailUploadId);
            $files[]                 = ['role' => 'thumbnail', 'filename' => $t['filename'], 'sha256' => $t['sha256'], 'size' => $t['size']];
            $asset['thumbnail_file'] = ['filename' => $t['filename'], 'sha256' => $t['sha256']];
        } elseif (empty($asset['thumbnail_file']) && in_array(S::extOf($up['filename']), ['png', 'webp', 'gif'], true)) {
            // Image assets are their own thumbnail (§5 stage 4 for v1).
            $asset['thumbnail_file'] = ['filename' => $up['filename'], 'sha256' => $up['sha256']];
        }
        $failed = false;
        foreach ($up['checks'] as $c) {
            $failed = $failed || ! $c['passed'];
        }
        $v = [
            'id'              => Uuid7::generate(),
            'version'         => $version,
            'changelog'       => $changelog ?? '',
            'is_breaking'     => ! empty($isBreaking),
            'min_app_version' => $asset['min_app_version'],
            'files'           => $files,
            'checks'          => $up['checks'],
            'meta'            => $up['meta'],
            'status'          => $failed ? 'failed' : 'ready',
            'package'         => null,
            'created_by'      => $actor['id'],
            'created_at'      => $this->iso(),
        ];
        if ($v['status'] !== 'failed') {
            $this->enqueueJob($asset, $v);
        }
        $asset['versions'][] = $v;

        return $v;
    }

    // ---------- processing jobs (§5 stages 2–4, apps/workers) ----------

    public const JOB_LEASE_MS     = 10 * 60 * 1000;
    public const JOB_MAX_ATTEMPTS = 3;
    public const PREVIEW_TYPES    = ['webp' => 'image/webp', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mp3' => 'audio/mpeg', 'json' => 'application/json', 'woff2' => 'font/woff2'];

    /** Whether publishing waits for the version's job (LIBRARY_REQUIRE_PROCESSING=1). */
    public bool $requireProcessing = false;

    private function enqueueJob(array $asset, array &$v): array
    {
        $job = ['id' => Uuid7::generate(), 'asset_id' => $asset['id'], 'version' => $v['version'], 'type' => $asset['type'], 'status' => 'queued', 'attempts' => 0, 'lease_until' => null, 'worker_id' => null, 'error' => null, 'previews' => [], 'created_at' => $this->iso(), 'started_at' => null, 'finished_at' => null];
        $this->store->saveJob($job);
        $v['processing'] = ['status' => 'queued', 'job_id' => $job['id']];

        return $job;
    }

    private static function versionIndex(array $asset, ?string $version): ?int
    {
        foreach ($asset['versions'] as $i => $x) {
            if ($x['version'] === $version) {
                return $i;
            }
        }

        return null;
    }

    private function mustJob(?array $actor, string $id): array
    {
        $job = $this->store->job($id) ?? throw HttpError::notFound('Job');
        if ($job['status'] !== 'running' || $job['worker_id'] !== ($actor['id'] ?? null)) {
            throw new HttpError(409, 'JOB_NOT_LEASED', "This job isn't leased to you.");
        }

        return $job;
    }

    public static function jobOut(array $job): array
    {
        $job['previews'] = Json::obj($job['previews']);

        return $job;
    }

    /** The oldest job a worker may take: queued, or running with an expired lease. Null when none. */
    public function claimJob(?array $actor): ?array
    {
        $this->requirePerm($actor, 'jobs.process');
        $t = Clock::ms();
        foreach ($this->store->jobsList(['queued', 'running']) as $job) {
            if (! ($job['status'] === 'queued' || ((Clock::parse($job['lease_until']) ?? 0) < $t && $job['attempts'] < self::JOB_MAX_ATTEMPTS))) {
                continue;
            }
            $asset = $this->store->findAsset($job['asset_id']);
            $i     = $asset === null ? null : self::versionIndex($asset, $job['version']);
            if ($i === null) {
                $job['status']      = 'cancelled';
                $job['finished_at'] = $this->iso();
                $this->store->saveJob($job);

                continue;
            }
            $job['status']      = 'running';
            $job['attempts']++;
            $job['worker_id']   = $actor['id'];
            $job['lease_until'] = Clock::iso($t + self::JOB_LEASE_MS);
            $job['started_at']  = $this->iso();
            $this->store->saveJob($job);
            $asset['versions'][$i]['processing'] = ['status' => 'running', 'job_id' => $job['id']];
            $this->store->saveAsset($asset);
            $v = $asset['versions'][$i];

            return [
                'job'     => ['id' => $job['id'], 'attempt' => $job['attempts'], 'lease_until' => $job['lease_until']],
                'asset'   => ['id' => $asset['id'], 'type' => $asset['type'], 'slug' => $asset['slug'], 'title' => $asset['title'], 'meta' => Json::obj(array_merge($asset['meta'], $v['meta'] ?? []))],
                'version' => $v['version'],
                'files'   => array_map(static fn ($f) => ['role' => $f['role'], 'filename' => $f['filename'], 'sha256' => $f['sha256'], 'size' => $f['size']], $v['files']),
            ];
        }

        return null;
    }

    /** An original a leased job needs (raw bytes). */
    public function jobFile(?array $actor, string $id, string $sha): string
    {
        $job   = $this->mustJob($actor, $id);
        $asset = $this->store->findAsset($job['asset_id']);
        $v     = $asset === null ? null : ($asset['versions'][self::versionIndex($asset, $job['version'])] ?? null);
        if ($v === null || ! in_array($sha, array_column($v['files'], 'sha256'), true)) {
            throw HttpError::notFound('File');
        }

        return $this->readOriginal($sha);
    }

    public function putPreview(?array $actor, string $id, mixed $kind, mixed $ext, string $buf): array
    {
        $job = $this->mustJob($actor, $id);
        if (! is_string($kind) || ! preg_match('/^[a-z0-9][a-z0-9_-]{0,31}$/', $kind)) {
            throw new ValidationError('Bad preview kind.', [['field' => 'kind', 'rule' => 'preview.kind', 'value' => $kind]]);
        }
        if (! is_string($ext) || ! isset(self::PREVIEW_TYPES[$ext])) {
            throw new ValidationError('Unsupported preview format.', [['field' => 'ext', 'rule' => 'preview.ext', 'value' => $ext]]);
        }
        if ($buf === '' || strlen($buf) > 50 * 1024 * 1024) {
            throw new ValidationError('Previews must be 1 byte to 50 MB.', [['field' => 'file', 'rule' => 'preview.size', 'value' => strlen($buf)]]);
        }
        $key = "previews/{$job['asset_id']}/{$job['version']}/{$kind}.{$ext}";
        $this->blobs->put($key, $buf, self::PREVIEW_TYPES[$ext]);
        $job['previews'][$kind] = ['key' => $key, 'ext' => $ext, 'size' => strlen($buf), 'content_type' => self::PREVIEW_TYPES[$ext]];
        // The generated thumbnail can go into packs, which read originals by sha.
        if ($kind === 'thumbnail') {
            $sha = hash('sha256', $buf);
            if (! $this->blobs->has("originals/{$sha}")) {
                $this->blobs->put("originals/{$sha}", $buf);
            }
            $job['previews'][$kind]['sha256'] = $sha;
        }
        $job['lease_until'] = Clock::iso(Clock::ms() + self::JOB_LEASE_MS);
        $this->store->saveJob($job);

        return $job['previews'][$kind];
    }

    /**
     * Worker result. `checks` join the version's checks (a failed one fails
     * the version); `meta` is detected metadata; `ok: false` retries up to 3 attempts.
     */
    public function completeJob(?array $actor, string $id, array $body): array
    {
        $job   = $this->mustJob($actor, $id);
        $asset = $this->store->findAsset($job['asset_id']);
        $i     = self::versionIndex($asset, $job['version']);
        $ok    = ! array_key_exists('ok', $body) || $body['ok'] === null ? true : ! empty($body['ok']);
        if (! $ok) {
            $retry              = $job['attempts'] < self::JOB_MAX_ATTEMPTS;
            $job['status']      = $retry ? 'queued' : 'failed';
            $job['error']       = mb_substr(($body['error'] ?? null) === null ? 'Processing failed' : S::jsString($body['error']), 0, 2000);
            $job['lease_until'] = null;
            $job['worker_id']   = null;
            $job['finished_at'] = $retry ? null : $this->iso();
            $this->store->saveJob($job);
            $asset['versions'][$i]['processing'] = ['status' => $job['status'], 'job_id' => $job['id'], 'error' => $job['error']];
            $this->store->saveAsset($asset);

            return self::jobOut($job);
        }
        $checks = is_array($body['checks'] ?? null) && array_is_list($body['checks']) ? array_slice($body['checks'], 0, 100) : [];
        $clean  = [];
        foreach ($checks as $c) {
            if (is_array($c) && is_string($c['check'] ?? null)) {
                $clean[] = ['check' => mb_substr($c['check'], 0, 80), 'passed' => ! empty($c['passed']), 'detail' => is_array($c['detail'] ?? null) ? Json::obj($c['detail']) : null, 'source' => 'worker'];
            }
        }
        $v           = $asset['versions'][$i];
        $v['checks'] = array_merge(array_values(array_filter($v['checks'], static fn ($c) => ($c['source'] ?? null) !== 'worker')), $clean);
        $meta        = $body['meta'] ?? [];
        $v['meta']   = array_merge($v['meta'] ?? [], is_array($meta) && ! array_is_list($meta) ? $meta : []);
        $v['previews'] = [];
        foreach ($job['previews'] as $k => $p) {
            $v['previews'][$k] = ['key' => $p['key'], 'ext' => $p['ext'], 'size' => $p['size']];
        }
        if (empty($asset['thumbnail_file']) && ! empty($job['previews']['thumbnail']['sha256'])) {
            $asset['thumbnail_file'] = ['filename' => 'thumbnail.webp', 'sha256' => $job['previews']['thumbnail']['sha256'], 'generated' => true];
        }
        $failed = false;
        foreach ($clean as $c) {
            $failed = $failed || ! $c['passed'];
        }
        if ($failed) {
            $v['status'] = 'failed';
            if (in_array($asset['status'], ['draft', 'ready_for_review', 'processing'], true)) {
                $asset['status'] = 'failed';
            }
        }
        $job['status']      = 'done';
        $job['lease_until'] = null;
        $job['finished_at'] = $this->iso();
        $this->store->saveJob($job);
        $v['processing']        = ['status' => 'done', 'job_id' => $job['id'], 'finished_at' => $job['finished_at']];
        $asset['versions'][$i] = $v;
        $this->store->saveAsset($asset);
        $this->audit($actor, 'job.complete', 'asset', $asset['id'], null, ['version' => $v['version'], 'checks' => count($clean), 'previews' => array_keys($v['previews'])]);

        return self::jobOut($job);
    }

    public function reprocess(?array $actor, string $assetId, mixed $version = null): array
    {
        $asset = $this->mustAsset($assetId);
        $this->requirePerm($actor, 'asset.edit', $asset);
        $i = self::versionIndex($asset, is_string($version) ? $version : ($asset['pending_version'] ?? $asset['current_version']));
        if ($i === null) {
            throw HttpError::notFound('Version');
        }
        foreach ($this->store->jobsList(['queued', 'running'], $asset['id'], $asset['versions'][$i]['version']) as $j) {
            $j['status']      = 'cancelled';
            $j['finished_at'] = $this->iso();
            $this->store->saveJob($j);
        }
        $job = $this->enqueueJob($asset, $asset['versions'][$i]);
        $this->store->saveAsset($asset);
        $this->audit($actor, 'job.reprocess', 'asset', $asset['id'], null, ['version' => $asset['versions'][$i]['version'], 'job_id' => $job['id']]);

        return self::jobOut($job);
    }

    /** Public bytes of a preview: ['key', 'size', 'etag'] or null. */
    public function previewFile(string $assetId, string $version, string $file, bool $drafts = false): ?array
    {
        $a = $this->store->findAsset($assetId);
        if ($a === null || (! $drafts && ! self::isLive($a))) {
            return null;
        }
        $v = self::versionOf($a, $version);
        foreach ($v['previews'] ?? [] as $p) {
            if (str_ends_with($p['key'], "/{$file}")) {
                $head = $this->blobs->head($p['key']);

                return $head === null ? null : ['key' => $p['key']] + $head;
            }
        }

        return null;
    }

    public function jobs(?string $status): array
    {
        return array_map(self::jobOut(...), $this->store->recentJobs($status, 200));
    }

    public function createAsset(?array $actor, array $body): array
    {
        $this->requirePerm($actor, 'asset.create');
        $type     = $body['type'] ?? $this->mustUpload($body['upload_id'] ?? null)['type'];
        $up       = $this->uploadAs($body['upload_id'] ?? null, $type);
        $title    = $body['title'] ?? preg_replace('/[_-]+/', ' ', preg_replace('/\.[^.]+$/', '', $up['filename']));
        $slug     = $body['slug'] ?? S::slugify($title);
        $category = null;
        foreach ($this->store->categories() as $c) {
            if (! empty($body['category_id']) ? $c['id'] === $body['category_id'] : $c['type'] === $type) {
                $category = $c;
                break;
            }
        }
        $meta = [
            'type'            => $type,
            'slug'            => $slug,
            'title'           => $title,
            'description'     => $body['description'] ?? '',
            'tags'            => S::normalizeTags($body['tags'] ?? null),
            'keywords'        => S::normalizeTags($body['keywords'] ?? null),
            'min_app_version' => $body['min_app_version'] ?? '1.0.0',
            'licence_tier'    => $body['licence_tier'] ?? 'free',
            'licence_terms'   => $body['licence_terms'] ?? 'royalty_free',
            'visibility'      => $body['visibility'] ?? 'public',
        ];
        $problems = S::metadataProblems($meta);
        if ($category !== null && $category['type'] !== $type) {
            $problems[] = ['field' => 'category_id', 'rule' => 'category.type', 'value' => $category['type']];
        }
        if (is_string($slug) && $this->store->slugTaken($slug)) {
            $problems[] = ['field' => 'slug', 'rule' => 'slug.unique', 'value' => $slug];
        }
        if ($problems !== []) {
            throw new ValidationError("Invalid {$problems[0]['field']}.", $problems);
        }
        $now   = $this->iso();
        $asset = ['id' => Uuid7::generate()] + $meta + [
            'category_id'          => $category['id'] ?? null,
            'subcategory_id'       => null,
            'licence_text'         => $body['licence_text'] ?? '',
            'attribution_required' => ! empty($body['attribution_required']),
            'attribution_text'     => $body['attribution_text'] ?? '',
            'author'               => $body['author'] ?? '',
            'aspect_ratios'        => $body['aspect_ratios'] ?? ['any'],
            'platforms'            => $body['platforms'] ?? ['windows', 'macos', 'linux'],
            'audience_rules'       => $body['audience_rules'] ?? [],
            'dependencies'         => $body['dependencies'] ?? [],
            'featured'             => ! empty($body['featured']),
            'featured_rank'        => null,
            'publish_at'           => null,
            'unpublish_at'         => null,
            'meta'                 => array_merge($up['meta'], is_array($body['meta'] ?? null) ? $body['meta'] : []),
            'thumbnail_file'       => null,
            'status'               => 'processing',
            'current_version'      => null,
            'published_version'    => null,
            'versions'             => [],
            'stats'                => ['downloads' => 0, 'installs' => 0, 'favorites' => 0, 'applies' => 0],
            'created_by'           => $actor['id'],
            'created_at'           => $now,
            'updated_by'           => $actor['id'],
            'updated_at'           => $now,
            'published_by'         => null,
            'published_at'         => null,
        ];
        $v                        = $this->newVersion($asset, (string) ($body['version'] ?? '1.0.0'), $up['id'], $body['thumbnail_upload_id'] ?? null, null, false, $actor);
        $asset['current_version'] = $v['version'];
        $asset['status']          = $v['status'] === 'failed' ? 'failed' : (! empty($body['submit_for_review']) ? 'ready_for_review' : 'draft');
        $this->store->saveAsset($asset);
        $this->audit($actor, 'asset.create', 'asset', $asset['id'], null, ['slug' => $asset['slug'], 'type' => $type, 'status' => $asset['status']]);

        return $asset;
    }

    public function updateAsset(?array $actor, string $id, array $patch): array
    {
        $asset = $this->mustAsset($id);
        $this->requirePerm($actor, 'asset.edit', $asset);
        $before = $asset;
        $next   = [];
        foreach (self::EDITABLE as $k) {
            if (array_key_exists($k, $patch)) {
                $next[$k] = $k === 'tags' || $k === 'keywords' ? S::normalizeTags($patch[$k]) : $patch[$k];
            }
        }
        if (array_key_exists('slug', $next) && $next['slug'] !== $asset['slug']) {
            if (! empty($asset['published_at'])) {
                throw new ValidationError("Slug can't change after first publish.", [['field' => 'slug', 'rule' => 'slug.immutable', 'value' => $next['slug']]]);
            }
            if (is_string($next['slug']) && $this->store->slugTaken($next['slug'])) {
                throw new ValidationError('Slug is taken.', [['field' => 'slug', 'rule' => 'slug.unique', 'value' => $next['slug']]]);
            }
        }
        if ((array_key_exists('licence_tier', $next) || array_key_exists('audience_rules', $next)) && ! Rbac::can($actor['role'], 'access.manage') && $actor['role'] !== 'content_editor') {
            throw HttpError::forbidden('access.manage');
        }
        $problems = S::metadataProblems($next, true);
        if (! empty($next['category_id'])) {
            $c = $this->store->category(is_string($next['category_id']) ? $next['category_id'] : null);
            if ($c === null || $c['type'] !== $asset['type']) {
                $problems[] = ['field' => 'category_id', 'rule' => 'category.type', 'value' => $next['category_id']];
            }
        }
        if ($problems !== []) {
            throw new ValidationError("Invalid {$problems[0]['field']}.", $problems);
        }
        if (! empty($next['meta'])) {
            $next['meta'] = array_merge($asset['meta'], is_array($next['meta']) ? $next['meta'] : []);
        }
        if (! empty($patch['thumbnail_upload_id'])) {
            $t      = $this->mustUpload($patch['thumbnail_upload_id']);
            $badPng = false;
            foreach ($t['checks'] as $c) {
                $badPng = $badPng || ($c['check'] === 'magic_bytes' && ! $c['passed']);
            }
            if (! in_array(S::extOf($t['filename']), ['png', 'webp'], true) || $badPng) {
                throw new ValidationError('Thumbnails must be a valid PNG or WebP.', [['field' => 'thumbnail', 'rule' => 'thumbnail.format', 'value' => $t['filename']]]);
            }
            $next['thumbnail_file'] = ['filename' => $t['filename'], 'sha256' => $t['sha256']];
        }
        foreach (['attribution_required', 'featured'] as $b) {
            if (array_key_exists($b, $next)) {
                $next[$b] = ! empty($next[$b]);
            }
        }
        foreach ($next as $k => $v) {
            $asset[$k] = $v;
        }
        $asset['updated_by'] = $actor['id'];
        $asset['updated_at'] = $this->iso();
        $this->store->saveAsset($asset);
        $this->audit($actor, 'asset.update', 'asset', $asset['id'], $before, $asset);
        if ($asset['status'] === 'published') {
            $this->syncEvent('upsert', $asset, ['changed' => array_keys($next), 'update_available' => false, 'breaking' => false]);
            $this->notify(['asset.updated'], $asset);
        } elseif ($before['status'] === 'published' || $before['status'] === 'deprecated') {
            $this->notify([], $asset);
        }

        return $asset;
    }

    private function latestVersion(array $asset): ?string
    {
        $vs = array_column($asset['versions'], 'version');
        usort($vs, [S::class, 'compareSemver']);

        return $vs === [] ? null : end($vs);
    }

    public function addVersion(?array $actor, string $id, array $body): array
    {
        $asset = $this->mustAsset($id);
        $this->requirePerm($actor, 'asset.edit', $asset);
        $latest  = $this->latestVersion($asset) ?? '0.0.0';
        $version = $body['version'] ?? S::bumpSemver($latest, ! empty($body['is_breaking']) ? 'major' : 'minor');
        if (! S::isSemver($version)) {
            throw new ValidationError('Version must be semver.', [['field' => 'version', 'rule' => 'semver', 'value' => $version]]);
        }
        if (in_array($version, array_column($asset['versions'], 'version'), true)) {
            throw new ValidationError("That version already exists; versions never overwrite.", [['field' => 'version', 'rule' => 'version.unique', 'value' => $version]]);
        }
        if (S::compareSemver($version, $latest) <= 0) {
            throw new ValidationError("New versions must be above {$latest}.", [['field' => 'version', 'rule' => 'version.increase', 'value' => $version]]);
        }
        $v                        = $this->newVersion($asset, $version, $body['upload_id'] ?? null, $body['thumbnail_upload_id'] ?? null, $body['changelog'] ?? null, $body['is_breaking'] ?? false, $actor);
        $asset['current_version'] = $v['version'];
        // A new version of a live asset waits as pending; otherwise it goes back through review.
        if ($asset['status'] === 'published' || $asset['status'] === 'deprecated') {
            $asset['pending_version'] = $v['version'];
        } else {
            $asset['status'] = $v['status'] === 'failed' ? 'failed' : 'draft';
        }
        $this->store->saveAsset($asset);
        $this->audit($actor, 'version.create', 'asset', $asset['id'], null, ['version' => $version, 'is_breaking' => $v['is_breaking']]);

        return $asset;
    }

    // ---------- workflow (§4.3, §6) ----------

    public function submitReview(?array $actor, string $id): array
    {
        $asset = $this->mustAsset($id);
        $this->requirePerm($actor, 'asset.edit', $asset);
        foreach ($asset['versions'] as $v) {
            if ($v['version'] === $asset['current_version'] && $v['status'] === 'failed') {
                throw new ValidationError('Fix the failed checks first.', [['field' => 'checks', 'rule' => 'checks.passed', 'value' => false]]);
            }
        }
        $before = $asset;
        $this->setStatus($asset, 'ready_for_review');
        $this->store->saveAsset($asset);
        $this->audit($actor, 'asset.submit_review', 'asset', $asset['id'], $before, $asset);

        return $asset;
    }

    public function review(?array $actor, string $id, bool $approve, mixed $reason = ''): array
    {
        $asset = $this->mustAsset($id);
        $this->requirePerm($actor, 'asset.review');
        $reason ??= '';
        if (! $approve && trim(S::jsString($reason)) === '') {
            throw new ValidationError('A reason is required to reject.', [['field' => 'reason', 'rule' => 'reason.required', 'value' => '']]);
        }
        $before = $asset;
        $this->setStatus($asset, $approve ? 'approved' : 'draft');
        $asset['review'] = ['by' => $actor['id'], 'at' => $this->iso(), 'approved' => $approve, 'reason' => $reason];
        $this->store->saveAsset($asset);
        $this->audit($actor, $approve ? 'asset.approve' : 'asset.reject', 'asset', $asset['id'], $before, $asset);

        return $asset;
    }

    public static function packageBase(array $asset, string $version): string
    {
        return PackBuilder::packIdOf($asset) . '-' . $version;
    }

    private function packageVersion(array $asset, array &$v): void
    {
        $files = [];
        $shas  = array_column($v['files'], 'sha256');
        if (! empty($asset['thumbnail_file'])) {
            $shas[] = $asset['thumbnail_file']['sha256'];
        }
        foreach (array_unique($shas) as $sha) {
            $files[$sha] = $this->readOriginal($sha);
        }
        $built = PackBuilder::buildPackage($asset, $v, $this->categoryOf($asset), static fn (string $sha) => $files[$sha]);
        $base  = self::packageBase($asset, $v['version']);
        $this->blobs->put("packages/{$base}.zip", $built['zip'], 'application/zip');
        $thumbnail = null;
        if ($built['thumbnail'] !== null) {
            preg_match('/\.[a-z0-9]+$/', $built['thumbnail']['path'], $m);
            $ext = $m[0];
            $this->blobs->put("packages/{$base}{$ext}", $built['thumbnail']['data'], $ext === '.png' ? 'image/png' : ($ext === '.webp' ? 'image/webp' : 'application/octet-stream'));
            $thumbnail = ['ext' => $ext];
        }
        $v['package']     = ['sha256' => $built['sha256'], 'size' => $built['size'], 'signature' => $this->key()->sign($built['sha256']), 'thumbnail' => $thumbnail, 'built_at' => $this->iso()];
        $v['package_key'] = "packages/{$base}.zip";
        $v['status']      = 'published';
    }

    public function publish(?array $actor, string $id, array $opts = []): array
    {
        $asset = $this->mustAsset($id);
        $this->requirePerm($actor, 'asset.publish');
        $direct  = Rbac::can($actor['role'], 'asset.publish.direct');
        $pending = $asset['pending_version'] ?? null;
        $target  = $opts['version'] ?? $pending ?? $asset['current_version'];
        $index   = null;
        foreach ($asset['versions'] as $i => $x) {
            if ($x['version'] === $target) {
                $index = $i;
                break;
            }
        }
        if ($index === null) {
            throw HttpError::notFound('Version ' . S::jsString($target));
        }
        $deps = [];
        foreach ((array) ($asset['dependencies'] ?? []) as $d) {
            $did    = is_array($d) ? ($d['asset_id'] ?? null) : null;
            $deps[] = (is_string($did) ? $this->store->findAsset($did) : null) ?? ['id' => $did, 'status' => 'missing'];
        }
        $processing = $asset['versions'][$index]['processing']['status'] ?? null;
        if ($this->processingRequired() && $processing !== 'done') {
            throw new ValidationError('This version is still being processed.', [['field' => 'processing', 'rule' => 'processing.done', 'message' => 'Processing is ' . ($processing ?? 'not started') . '.']], 'PUBLISH_BLOCKED');
        }
        // A new version of a live asset is released by whoever may publish; first releases go through review.
        $probe                    = $asset;
        $probe['current_version'] = $asset['versions'][$index]['version'];
        $probe['status']          = $pending === $target && in_array($asset['status'], ['published', 'deprecated'], true) ? 'approved' : $asset['status'];
        $problems                 = S::publishProblems($probe, $direct, $deps);
        if ($problems !== []) {
            throw new ValidationError($problems[0]['message'], $problems, 'PUBLISH_BLOCKED');
        }
        $before    = $asset;
        $publishAt = $opts['publish_at'] ?? null;
        if (! empty($publishAt)) {
            $at = Clock::parse(S::jsString($publishAt));
            if ($at !== null && $at > Clock::ms()) {
                $asset['publish_at'] = $publishAt;
                $this->store->saveAsset($asset);
                $this->audit($actor, 'asset.schedule', 'asset', $asset['id'], $before, $asset);

                return $asset;
            }
        }
        $previous = $asset['published_version'];
        $this->packageVersion($asset, $asset['versions'][$index]);
        foreach ($asset['versions'] as $i => $old) {
            if ($i !== $index && $old['status'] === 'published') {
                $asset['versions'][$i]['status']     = 'retired';
                $asset['versions'][$i]['retired_at'] = $this->iso();
            }
        }
        $v                          = $asset['versions'][$index];
        $asset['status']            = 'published';
        $asset['current_version']   = $v['version'];
        $asset['published_version'] = $v['version'];
        if (array_key_exists('pending_version', $asset)) {
            unset($asset['pending_version']);
        }
        $asset['published_by'] = $actor['id'];
        $asset['published_at'] ??= $this->iso();
        $asset['publish_at']   = null;
        $this->store->saveAsset($asset);
        $this->syncEvent('upsert', $asset, ['changed' => $previous ? ['version'] : ['created'], 'update_available' => (bool) $previous, 'breaking' => $v['is_breaking']]);
        $this->audit($actor, 'asset.publish', 'asset', $asset['id'], $before, $asset);
        $this->notify($previous ? ['version.published'] : ['asset.published', 'version.published'], $asset, $v['version']);

        return $asset;
    }

    public function unpublish(?array $actor, string $id, array $opts = []): array
    {
        $op     = $opts['op'] ?? 'unpublish';
        $reason = $opts['reason'] ?? 'unpublished';
        $asset  = $this->mustAsset($id);
        $this->requirePerm($actor, $op === 'archive' ? 'asset.archive' : 'asset.publish');
        $before = $asset;
        $this->setStatus($asset, $op === 'deprecate' ? 'deprecated' : ($op === 'archive' ? 'archived' : 'draft'));
        $this->store->saveAsset($asset);
        $this->syncEvent($op === 'deprecate' ? 'deprecate' : 'unpublish', $asset, ['reason' => $reason]);
        $this->audit($actor, "asset.{$op}", 'asset', $asset['id'], $before, $asset);
        $wasLive = in_array($before['status'], ['published', 'deprecated'], true);
        $this->notify($op === 'deprecate' ? ['asset.deprecated'] : ($wasLive ? ['asset.unpublished'] : []), $asset);

        return $asset;
    }

    public function rollback(?array $actor, string $id, string $version): array
    {
        $asset = $this->mustAsset($id);
        $this->requirePerm($actor, 'version.rollback');
        $index = null;
        foreach ($asset['versions'] as $i => $x) {
            if ($x['version'] === $version) {
                $index = $i;
            }
        }
        if ($index === null || empty($asset['versions'][$index]['package'])) {
            throw new ValidationError('Only previously published versions can be rolled back to.', [['field' => 'version', 'rule' => 'version.published', 'value' => $version]]);
        }
        $before = $asset;
        foreach ($asset['versions'] as $i => $o) {
            if ($o['status'] === 'published') {
                $asset['versions'][$i]['status'] = 'retired';
            }
        }
        $asset['versions'][$index]['status'] = 'published';
        $asset['current_version']            = $version;
        $asset['published_version']          = $version;
        $asset['status']                     = 'published';
        $this->store->saveAsset($asset);
        $this->syncEvent('upsert', $asset, ['changed' => ['version'], 'update_available' => true, 'breaking' => false, 'rollback' => true]);
        $this->audit($actor, 'version.rollback', 'asset', $asset['id'], $before, $asset);
        $this->notify(['version.published'], $asset, $version);

        return $asset;
    }

    /** Runs one bulk action per id; `$each` lets the caller wrap each in a transaction. */
    public function bulk(?array $actor, array $body, ?callable $each = null): array
    {
        $ids     = is_array($body['ids'] ?? null) ? $body['ids'] : [];
        $action  = $body['action'] ?? null;
        $payload = is_array($body['payload'] ?? null) ? $body['payload'] : [];
        $each ??= static fn (callable $fn) => $fn();
        $results = [];
        foreach ($ids as $id) {
            $id = S::jsString($id);
            try {
                $each(function () use ($actor, $id, $action, $payload) {
                    match ($action) {
                        'publish'        => $this->publish($actor, $id),
                        'unpublish'      => $this->unpublish($actor, $id),
                        'archive'        => $this->unpublish($actor, $id, ['op' => 'archive']),
                        'tag_add'        => $this->updateAsset($actor, $id, ['tags' => array_merge($this->mustAsset($id)['tags'], S::normalizeTags($payload['tags'] ?? null))]),
                        'tag_remove'     => $this->updateAsset($actor, $id, ['tags' => array_values(array_filter($this->mustAsset($id)['tags'], static fn ($t) => ! in_array($t, S::normalizeTags($payload['tags'] ?? null), true)))]),
                        'move_category'  => $this->updateAsset($actor, $id, ['category_id' => $payload['category_id'] ?? null]),
                        'set_tier'       => $this->updateAsset($actor, $id, ['licence_tier' => $payload['licence_tier'] ?? null]),
                        'set_visibility' => $this->updateAsset($actor, $id, ['visibility' => $payload['visibility'] ?? null]),
                        default          => throw new HttpError(400, 'BAD_ACTION', 'Unknown bulk action ' . S::jsString($action ?? 'undefined') . '.'),
                    };
                });
                $results[] = ['id' => $id, 'ok' => true];
            } catch (\Throwable $e) {
                $this->store->forget();
                $results[] = ['id' => $id, 'ok' => false, 'error' => ['code' => $e instanceof HttpError ? $e->errorCode : 'ERROR', 'message' => $e->getMessage()]];
            }
        }

        return ['job_id' => Uuid7::generate(), 'status' => 'completed', 'results' => $results];
    }

    /** Runs scheduled publish/unpublish (§3.1 publish_at / unpublish_at). Returns what ran. */
    public function runSchedule(): array
    {
        $system = ['id' => 'system', 'role' => 'super_admin'];
        $now    = Clock::ms();
        $ran    = [];
        foreach ($this->store->allAssets() as $a) {
            $pub = $a['publish_at'] !== null ? Clock::parse(S::jsString($a['publish_at'])) : null;
            if (! empty($a['publish_at']) && $pub !== null && $pub <= $now && $a['status'] !== 'published') {
                $a['publish_at'] = null;
                $this->store->saveAsset($a);
                try {
                    $this->publish($system, $a['id']);
                    $ran[] = ['id' => $a['id'], 'op' => 'publish', 'ok' => true];
                } catch (\Throwable $e) {
                    // Stays unpublished; the failure shows in the asset's checks.
                    $ran[] = ['id' => $a['id'], 'op' => 'publish', 'ok' => false, 'error' => $e->getMessage()];
                }
            }
            $a     = $this->store->findAsset($a['id']);
            $unpub = $a['unpublish_at'] !== null ? Clock::parse(S::jsString($a['unpublish_at'])) : null;
            if (! empty($a['unpublish_at']) && $unpub !== null && $unpub <= $now && $a['status'] === 'published') {
                $a['unpublish_at'] = null;
                $this->store->saveAsset($a);
                $this->unpublish($system, $a['id'], ['reason' => 'scheduled']);
                $ran[] = ['id' => $a['id'], 'op' => 'unpublish', 'ok' => true];
            }
        }

        return $ran;
    }

    /** Whether any asset has a schedule that is due (cheap check before runSchedule). */
    public function scheduleDue(): bool
    {
        $now = Clock::ms();
        $rows = $this->store->db->table('assets')->select('publish_at, unpublish_at, status')->groupStart()->where('publish_at IS NOT NULL')->orWhere('unpublish_at IS NOT NULL')->groupEnd()->get()->getResultArray();
        foreach ($rows as $r) {
            foreach (['publish_at', 'unpublish_at'] as $k) {
                $v = Json::decode($r[$k]);
                if (! empty($v) && ($t = Clock::parse(S::jsString($v))) !== null && $t <= $now) {
                    return true;
                }
            }
        }

        return false;
    }

    // ---------- taxonomy ----------

    public function createCategory(?array $actor, array $body): array
    {
        $this->requirePerm($actor, 'taxonomy.manage');
        if (! array_key_exists((string) S::jsString($body['type'] ?? ''), S::ASSET_TYPES) || ! is_string($body['type'] ?? null)) {
            throw new ValidationError('Unknown type.', [['field' => 'type', 'rule' => 'type.enum', 'value' => $body['type'] ?? null]]);
        }
        $name = S::trim(S::jsString($body['name'] ?? ''));
        $c    = ['id' => Uuid7::generate(), 'type' => $body['type'], 'name' => $name, 'slug' => S::slugify($body['name'] ?? null), 'parent_id' => $body['parent_id'] ?? null, 'sort' => $body['sort'] ?? 0, 'icon' => $body['icon'] ?? null, 'visible' => ($body['visible'] ?? null) !== false];
        if (mb_strlen($c['name']) < 2) {
            throw new ValidationError('Name is required.', [['field' => 'name', 'rule' => 'name.required', 'value' => $c['name']]]);
        }
        $this->store->insertCategory($c);
        $this->audit($actor, 'category.create', 'category', $c['id'], null, $c);

        return $c;
    }

    /** @return list<array> */
    public function categories(?string $type): array
    {
        $list = array_values(array_filter($this->store->categories(), static fn ($c) => ! $type || $c['type'] === $type));
        usort($list, static fn ($a, $b) => $a['sort'] <=> $b['sort']);

        return $list;
    }

    // ---------- client side (§7.2, §8) ----------

    private static function isLive(array $a): bool
    {
        return $a['status'] === 'published' && in_array($a['visibility'], ['public', 'unlisted'], true);
    }

    private static function versionOf(array $a, ?string $version): ?array
    {
        foreach ($a['versions'] as $v) {
            if ($v['version'] === $version) {
                return $v;
            }
        }

        return null;
    }

    public function publicAsset(array $a): array
    {
        $v   = self::versionOf($a, $a['published_version']);
        $cat = $this->categoryOf($a);
        $id  = PackBuilder::packIdOf($a);
        $preview = [];
        foreach ($v['previews'] ?? [] as $k => $p) {
            $preview[$k] = "/previews/{$a['id']}/{$v['version']}/{$k}.{$p['ext']}";
        }

        return [
            'id'                   => $a['id'],
            'slug'                 => $a['slug'],
            'type'                 => $a['type'],
            'title'                => $a['title'],
            'description'          => $a['description'],
            'category'             => $cat ? ['id' => $cat['id'], 'name' => $cat['name'], 'slug' => $cat['slug']] : null,
            'tags'                 => $a['tags'],
            'keywords'             => $a['keywords'],
            'aspect_ratios'        => $a['aspect_ratios'],
            'licence_tier'         => $a['licence_tier'],
            'licence_terms'        => $a['licence_terms'],
            'attribution_required' => $a['attribution_required'],
            'attribution_text'     => $a['attribution_text'],
            'author'               => $a['author'],
            'min_app_version'      => $v['min_app_version'] ?? $a['min_app_version'],
            'current_version'      => $a['published_version'],
            'file_size_bytes'      => $v['package']['size'] ?? null,
            'checksum_sha256'      => $v['package']['sha256'] ?? null,
            'featured'             => $a['featured'],
            'meta'                 => Json::obj(array_merge($a['meta'], $v['meta'] ?? [])),
            'pack_id'              => $id,
            'pack_type'            => S::ASSET_TYPES[$a['type']]['pack'],
            'thumbnail_url'        => ! empty($v['previews']['thumbnail']) ? "/previews/{$a['id']}/{$v['version']}/thumbnail.{$v['previews']['thumbnail']['ext']}" : (! empty($v['package']['thumbnail']) ? "/feed/stable/packs/{$id}-{$v['version']}{$v['package']['thumbnail']['ext']}" : null),
            'preview'              => Json::obj($preview),
            'published_at'         => $a['published_at'],
            'stats'                => $a['stats'],
        ];
    }

    private function searchHay(array $a): string
    {
        return mb_strtolower(implode(' ', array_merge([$a['title'], $a['slug']], $a['tags'], $a['keywords'], [$this->categoryOf($a)['name'] ?? '', $a['author']])));
    }

    public function searchAssets(array $q = []): array
    {
        $needle = mb_strtolower(S::trim(S::jsString($q['q'] ?? '')));
        $list   = array_filter($this->store->allAssets(), static fn ($a) => self::isLive($a) && ($a['visibility'] !== 'unlisted' || $needle === $a['slug']));
        if (! empty($q['type'])) {
            $list = array_filter($list, static fn ($a) => $a['type'] === $q['type']);
        }
        if (! empty($q['category'])) {
            $list = array_filter($list, fn ($a) => $a['category_id'] === $q['category'] || ($this->categoryOf($a)['slug'] ?? null) === $q['category']);
        }
        if (! empty($q['tags'])) {
            foreach (S::normalizeTags($q['tags']) as $t) {
                $list = array_filter($list, static fn ($a) => in_array($t, $a['tags'], true));
            }
        }
        if (! empty($q['tier'])) {
            $list = array_filter($list, static fn ($a) => $a['licence_tier'] === $q['tier']);
        }
        if (array_key_exists('has_alpha', $q) && $q['has_alpha'] !== null) {
            $want = $q['has_alpha'] === true || $q['has_alpha'] === 'true';
            $list = array_filter($list, static fn ($a) => ! empty($a['meta']['has_alpha']) === $want);
        }
        if (! empty($q['appVersion'])) {
            $list = array_filter($list, static fn ($a) => S::compareSemver($q['appVersion'], $a['min_app_version']) >= 0);
        }
        $scored = [];
        $rank   = $needle !== '' ? $this->searchIndexRank($needle) : null;
        foreach ($list as $a) {
            $s = 0;
            if ($rank !== null) {
                // Meilisearch relevance (typos, synonyms) replaces the SQL scoring.
                $s = isset($rank[$a['id']]) ? count($rank) - $rank[$a['id']] : -1;
            } elseif ($needle !== '') {
                $title = mb_strtolower($a['title']);
                if (str_starts_with($title, $needle)) {
                    $s = 3;
                } elseif (str_contains($title, $needle)) {
                    $s = 2;
                } else {
                    $hay = $this->searchHay($a);
                    $s   = -1;
                    $all = true;
                    foreach (preg_split('/\s+/u', $needle) as $w) {
                        $all = $all && str_contains($hay, $w);
                    }
                    if ($all) {
                        $s = 1;
                    }
                }
            }
            if ($s >= 0) {
                $scored[] = [$a, $s];
            }
        }
        $coll    = class_exists(\Collator::class) ? new \Collator('root') : null;
        $cmp     = static fn (string $x, string $y) => $coll ? $coll->compare($x, $y) : strcmp($x, $y);
        $sorters = [
            'popular'  => static fn ($x, $y) => ($y[1] - $x[1]) ?: ($y[0]['stats']['downloads'] - $x[0]['stats']['downloads']),
            'new'      => static fn ($x, $y) => $cmp(S::jsString($y[0]['published_at']), S::jsString($x[0]['published_at'])),
            'trending' => static fn ($x, $y) => $y[0]['stats']['downloads'] - $x[0]['stats']['downloads'],
            'az'       => static fn ($x, $y) => $cmp($x[0]['title'], $y[0]['title']),
        ];
        usort($scored, $sorters[$q['sort'] ?? 'popular'] ?? $sorters['popular']);
        $start = is_numeric($q['cursor'] ?? null) ? max(0, (int) $q['cursor']) : 0;
        $limit = is_numeric($q['limit'] ?? null) && (int) $q['limit'] !== 0 ? (int) $q['limit'] : 50;
        $n     = min($limit, 100);
        $page  = array_map(fn ($x) => $this->publicAsset($x[0]), array_slice($scored, $start, max(0, $n)));

        return ['data' => $page, 'next_cursor' => $start + $n < count($scored) ? (string) ($start + $n) : null, 'total' => count($scored)];
    }

    /** Meilisearch rank (id => position) for a query, or null to use SQL search. */
    private function searchIndexRank(string $q): ?array
    {
        if ($this->search === null) {
            return null;
        }
        try {
            return array_flip($this->search->search($q));
        } catch (\Throwable $e) {
            log_message('warning', '[library] search index query failed, using SQL search: {msg}', ['msg' => $e->getMessage()]);

            return null;
        }
    }

    /** Re-indexes every live asset (and drops the others) in Meilisearch. */
    public function reindexSearch(): int
    {
        $n = 0;
        foreach ($this->store->allAssets() as $a) {
            if ($this->search === null) {
                break;
            }
            if (self::isLive($a)) {
                $this->search->upsert($a, $this->categoryOf($a));
                $n++;
            } else {
                $this->search->delete($a['id']);
            }
        }

        return $n;
    }

    public function assetDetail(string $id, array $client = []): array
    {
        $a = $this->store->findAsset($id);
        if ($a === null || ! self::isLive($a)) {
            throw HttpError::notFound('Asset');
        }
        $rank        = ['free' => 0, 'pro' => 1, 'business' => 2, 'enterprise' => 3];
        $canDownload = ($rank[$client['plan'] ?? 'free'] ?? 0) >= ($rank[$a['licence_tier']] ?? 0);
        $versions    = [];
        foreach ($a['versions'] as $v) {
            if (! empty($v['package'])) {
                $versions[] = ['version' => $v['version'], 'changelog' => $v['changelog'], 'is_breaking' => $v['is_breaking'], 'status' => $v['status'], 'size' => $v['package']['size'], 'sha256' => $v['package']['sha256']];
            }
        }
        $deps = [];
        foreach ((array) ($a['dependencies'] ?? []) as $d) {
            $dep    = is_array($d) && is_string($d['asset_id'] ?? null) ? $this->store->findAsset($d['asset_id']) : null;
            $deps[] = (is_array($d) ? $d : []) + ['asset' => $dep !== null && self::isLive($dep) ? $this->publicAsset($dep) : null];
        }

        return $this->publicAsset($a) + [
            'versions'     => $versions,
            'dependencies' => $deps,
            'entitlement'  => ['can_download' => $canDownload, 'reason' => $canDownload ? null : "needs_{$a['licence_tier']}"],
        ];
    }

    public function downloadGrant(string $id, array $opts): array
    {
        $d = $this->assetDetail($id, $opts);
        if (! $d['entitlement']['can_download']) {
            throw new HttpError(403, 'NOT_ENTITLED', "This asset needs a {$d['licence_tier']} plan.");
        }
        if (! empty($opts['require_device'])) {
            $opts['device_id'] = $this->mustOwnDevice($opts['user_id'] ?? null, $opts['device_id'] ?? null)['id'];
        }
        $a       = $this->mustAsset($id);
        $version = $opts['version'] ?? $a['published_version'];
        $v       = null;
        foreach ($a['versions'] as $x) {
            if ($x['version'] === $version && ! empty($x['package'])) {
                $v = $x;
                break;
            }
        }
        if ($v === null) {
            throw HttpError::notFound('Version');
        }
        $downloadId = Uuid7::generate();
        $expiresAt  = Clock::iso(Clock::ms() + 5 * 60 * 1000);
        $file       = self::packageBase($a, $v['version']) . '.zip';
        $token      = $this->key()->sign("{$file}|{$expiresAt}");
        $this->store->saveDownload(['id' => $downloadId, 'user_id' => $opts['user_id'] ?? null, 'device_id' => is_scalar($opts['device_id'] ?? null) ? (string) $opts['device_id'] : null, 'asset_id' => $a['id'], 'version' => $v['version'], 'status' => 'granted', 'started_at' => $this->iso(), 'finished_at' => null]);
        $a['stats']['downloads']++;
        $this->store->saveAsset($a);

        return [
            'download_id' => $downloadId,
            'url'         => "/feed/stable/packs/{$file}?expires=" . rawurlencode($expiresAt) . '&sig=' . rawurlencode($token),
            'expires_at'  => $expiresAt,
            'sha256'      => $v['package']['sha256'],
            'size'        => $v['package']['size'],
            'signature'   => $v['package']['signature'],
            'manifest'    => ['id' => $a['id'], 'slug' => $a['slug'], 'type' => $a['type'], 'version' => $v['version']],
        ];
    }

    public function completeDownload(string $id, array $body): array
    {
        $d = $this->store->download($id) ?? throw HttpError::notFound('Download');
        $d['status']      = ($body['status'] ?? null) === 'installed' ? 'installed' : 'failed';
        $d['bytes']       = $body['bytes'] ?? null;
        $d['duration_ms'] = $body['duration_ms'] ?? null;
        $d['finished_at'] = $this->iso();
        $this->store->saveDownload($d);
        if ($d['status'] === 'installed' && ($a = $this->store->findAsset($d['asset_id'])) !== null) {
            $a['stats']['installs']++;
            $this->store->saveAsset($a);
        }

        return $this->store->download($id);
    }

    public function recordUsage(mixed $events, ?string $userId = null): array
    {
        foreach (array_slice(is_array($events) ? array_values($events) : [], 0, 500) as $e) {
            if (! is_array($e) || ! is_string($e['asset_id'] ?? null)) {
                continue;
            }
            $a = $this->store->findAsset($e['asset_id']);
            if ($a === null || ! in_array($e['event'] ?? null, ['apply', 'insert', 'preview'], true)) {
                continue;
            }
            if ($e['event'] !== 'preview') {
                $a['stats']['applies']++;
                $this->store->saveAsset($a);
            }
            $device = is_scalar($e['device_id'] ?? null) ? (string) $e['device_id'] : null;
            $this->store->addUsage(['id' => Uuid7::generate(), 'user_id' => $userId, 'device_id' => $device, 'asset_id' => $a['id'], 'event' => $e['event'], 'at' => $this->iso()]);
            if ($userId !== null && $device !== null && $e['event'] !== 'preview') {
                $this->store->touchInstall($userId, $device, $a['id'], $this->iso());
            }
        }

        return ['accepted' => true];
    }

    /** Delta feed (§8.1). Cursors older than 30 days ask for a full resync. */
    public function sync(mixed $since = 0, int $limit = 500): array
    {
        $s      = is_numeric($since) ? (int) $since : 0;
        $oldest = $this->store->firstSyncEvent();
        $tooOld = $s > 0 && $oldest !== null && $s < $oldest['seq'] - 1 && Clock::ms() - (Clock::parse($oldest['created_at']) ?? 0) > 30 * 864e5;
        $events = $limit > 0 ? $this->store->syncEventsAfter($s, $limit) : [];
        $last   = $events === [] ? $s : $events[array_key_last($events)]['seq'];

        return ['events' => array_map(static fn ($e) => $e, $events), 'next_cursor' => (string) $last, 'has_more' => $this->store->hasSyncAfter($last), 'full_resync_required' => $tooOld];
    }

    public function catalogTypes(): array
    {
        $out = [];
        foreach (S::ASSET_TYPES as $key => $t) {
            $count = 0;
            foreach ($this->store->allAssets() as $a) {
                $count += self::isLive($a) && $a['type'] === $key ? 1 : 0;
            }
            $out[] = ['key' => $key, 'name' => $t['name'], 'pack_type' => $t['pack'], 'editor_target' => $t['target'], 'count' => $count];
        }

        return $out;
    }

    /** Featured, New this week and Trending. */
    private function builtinCollections(): array
    {
        $featured = [];
        foreach ($this->store->allAssets() as $a) {
            if (self::isLive($a) && $a['featured']) {
                $featured[] = $this->publicAsset($a);
            }
        }

        return [
            ['slug' => 'featured', 'title' => 'Featured', 'assets' => $featured],
            ['slug' => 'new', 'title' => 'New this week', 'assets' => $this->searchAssets(['sort' => 'new', 'limit' => 12])['data']],
            ['slug' => 'trending', 'title' => 'Trending', 'assets' => $this->searchAssets(['sort' => 'trending', 'limit' => 12])['data']],
        ];
    }

    // ---------- FrameFlow feed ----------

    /** catalog.json + signature for FrameFlow (stable: public; beta: public + internal). */
    public function feed(string $channel): array
    {
        if (! in_array($channel, ['stable', 'beta'], true)) {
            throw HttpError::notFound('Channel');
        }
        $vis     = $this->settings()['feed'][$channel];
        $entries = [];
        foreach ($this->store->allAssets() as $asset) {
            if ($asset['status'] === 'published' && in_array($asset['visibility'], $vis, true)) {
                $entries[] = ['asset' => $asset, 'version' => self::versionOf($asset, $asset['published_version']), 'category' => $this->categoryOf($asset)];
            }
        }
        $last = $this->store->lastSyncEvent()['created_at'] ?? $this->iso();
        $text = Json::pretty(PackBuilder::buildCatalog($channel, $entries, $last)) . "\n";

        return ['text' => $text, 'sig' => $this->key()->sign($text) . "\n", 'etag' => '"' . substr(hash('sha256', $text), 0, 32) . '"'];
    }

    /** Blob key, size and ETag of a package file, or null. Names come from the catalog. */
    public function packageFile(string $name): ?array
    {
        if (! preg_match('/^[a-z0-9][a-z0-9-]{0,63}-\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\.(zip|png|webp|gif|jpg)$/', $name)) {
            return null;
        }
        $key  = "packages/{$name}";
        $head = $this->blobs->head($key);

        return $head === null ? null : ['key' => $key] + $head;
    }

    /** Licence tier of the asset a package zip belongs to (thumbnails are always public). */
    public function packageTier(string $name): string
    {
        if (! str_ends_with($name, '.zip')) {
            return 'free';
        }

        return $this->store->tierOfPackage(static fn ($a, $v) => self::packageBase($a, $v['version']) . '.zip' === $name) ?? 'free';
    }

    public function verifyDownloadToken(string $file, mixed $expires, mixed $sig): bool
    {
        if (! is_string($expires) || ! is_string($sig)) {
            return false;
        }
        $at = Clock::parse($expires);

        return $at !== null && $at > Clock::ms() && $this->key()->verify("{$file}|{$expires}", $sig);
    }

    public function streamBlob(string $key, int $start, int $end, callable $out): void
    {
        $this->blobs->stream($key, $start, $end, $out);
    }

    // ---------- admin read side ----------

    public function getAsset(string $id): array
    {
        $a = $this->mustAsset($id);

        return $a + ['category' => $this->categoryOf($a)];
    }

    public function adminList(array $q = []): array
    {
        $list = $this->store->allAssets();
        foreach (['status' => 'status', 'type' => 'type', 'owner' => 'created_by'] as $param => $field) {
            if (! empty($q[$param])) {
                $list = array_filter($list, static fn ($a) => $a[$field] === $q[$param]);
            }
        }
        if (! empty($q['q'])) {
            $n    = mb_strtolower(S::jsString($q['q']));
            $list = array_filter($list, static fn ($a) => str_contains(mb_strtolower(implode(' ', array_merge([$a['title'], $a['slug']], $a['tags']))), $n));
        }
        $list = array_values($list);
        usort($list, static fn ($a, $b) => strcmp((string) $b['updated_at'], (string) $a['updated_at']));
        $start = is_numeric($q['cursor'] ?? null) ? max(0, (int) $q['cursor']) : 0;
        $n     = min(is_numeric($q['limit'] ?? null) && (int) $q['limit'] !== 0 ? (int) $q['limit'] : 50, 200);

        return ['data' => array_map(fn ($a) => $a + ['category' => $this->categoryOf($a)], array_slice($list, $start, max(0, $n))), 'next_cursor' => $start + $n < count($list) ? (string) ($start + $n) : null, 'total' => count($list)];
    }

    public function overview(array $q = []): array
    {
        [$from, $to] = self::window($q);
        $assets = $this->store->allAssets();
        $by     = static fn (string $s) => count(array_filter($assets, static fn ($a) => $a['status'] === $s));
        $dl     = $this->store->downloadsBetween($from, $to);
        $byDay  = [];
        foreach ($dl as $d) {
            $day         = substr($d['started_at'], 0, 10);
            $byDay[$day] = ($byDay[$day] ?? 0) + 1;
        }
        $top = $assets;
        usort($top, static fn ($a, $b) => $b['stats']['downloads'] - $a['stats']['downloads']);

        return [
            'published'          => $by('published'),
            'drafts'             => $by('draft'),
            'in_review'          => $by('ready_for_review'),
            'approved'           => $by('approved'),
            'failed'             => $by('failed'),
            'processing'         => $by('processing'),
            'downloads_30d'      => count($dl),
            'active_devices_30d' => count(array_unique(array_filter(array_column($dl, 'device_id')))),
            'downloads_by_day'   => Json::obj($byDay),
            'top_assets'         => array_map(static fn ($a) => ['id' => $a['id'], 'title' => $a['title'], 'type' => $a['type'], 'downloads' => $a['stats']['downloads'], 'applies' => $a['stats']['applies'], 'version' => $a['published_version'] ?? $a['current_version']], array_slice($top, 0, 5)),
            'review_queue'       => array_values(array_map(static fn ($a) => ['id' => $a['id'], 'title' => $a['title'], 'type' => $a['type']], array_filter($assets, static fn ($a) => $a['status'] === 'ready_for_review'))),
        ] + $this->overviewAdditions($dl, $from, $to);
    }

    public function auditLog(?string $entityId, int $limit = 200): array
    {
        return $this->store->auditLog($entityId, $limit);
    }
}
