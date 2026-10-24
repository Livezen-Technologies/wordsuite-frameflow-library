<?php

namespace App\Controllers;

use App\Exceptions\HttpError;
use App\Libraries\Http\SseResponse;

/** Client (FrameFlow) endpoints, blueprint §7.2. */
class ClientController extends BaseApiController
{
    protected function types()
    {
        return ['data' => $this->lib->catalogTypes()];
    }

    protected function categories()
    {
        return ['data' => $this->lib->categories($this->q('type'))];
    }

    protected function search()
    {
        $out = $this->lib->searchAssets(['appVersion' => $this->auth->client($this->request, false)['appVersion']] + $this->query());
        if (! is_numeric($this->q('cursor')) || (int) $this->q('cursor') === 0) {
            // First pages only, so paging through results counts a search once.
            $this->transaction(fn () => $this->lib->recordSearch($this->q('q'), $out['total']));
        }

        return $out;
    }

    protected function show(string $id)
    {
        return $this->lib->assetDetail($id, $this->auth->client($this->request));
    }

    protected function preview(string $id)
    {
        return ['thumbnail_url' => $this->lib->assetDetail($id)['thumbnail_url']];
    }

    protected function suggest()
    {
        $hits = $this->lib->searchAssets(['q' => $this->q('q') ?? '', 'limit' => 8])['data'];

        return ['data' => array_map(static fn ($a) => ['id' => $a['id'], 'title' => $a['title'], 'type' => $a['type']], $hits)];
    }

    protected function collections()
    {
        return ['data' => $this->lib->collections()];
    }

    protected function collection(string $slug)
    {
        foreach ($this->lib->collections() as $c) {
            if ($c['slug'] === $slug) {
                return $c;
            }
        }

        throw HttpError::notFound('Collection');
    }

    protected function download(string $id)
    {
        $body = $this->json();
        $c    = $this->auth->client($this->request);

        // With sign-in configured, downloads need a registered device of the caller (X-Device-Id).
        $device = $this->request->getHeaderLine('X-Device-Id') ?: ($c['device_id'] ?? $body['device_id'] ?? null);

        return $this->lib->downloadGrant($id, array_merge($body, $c, ['device_id' => $device, 'require_device' => $this->auth->oidcEnabled()]));
    }

    protected function complete(string $id)
    {
        return $this->lib->completeDownload($id, $this->json());
    }

    protected function usage()
    {
        return $this->lib->recordUsage($this->json()['events'] ?? [], $this->auth->who['id'] ?? null);
    }

    protected function sync()
    {
        $limit = $this->q('limit');

        return $this->lib->sync($this->q('since'), is_numeric($limit) && (int) $limit !== 0 ? (int) $limit : 500);
    }

    /** SSE push of sync events (§8.2); public, like the feed. */
    protected function stream()
    {
        $since = $this->q('since') ?? $this->request->getHeaderLine('Last-Event-ID');
        $store = $this->lib->store;
        $env   = static fn (string $k, int $d) => is_numeric(getenv($k)) ? (int) getenv($k) : $d;

        return SseResponse::stream(
            static fn (int $after) => $store->syncEventsAfter($after, 500),
            is_numeric($since) ? max(0, (int) $since) : 0,
            $env('LIBRARY_SSE_MAX_SECONDS', 300),
            $env('LIBRARY_SSE_POLL_MS', 2000),
            $env('LIBRARY_SSE_PING_SECONDS', 25),
        );
    }

    // ---------- devices and my library ----------

    protected function registerDevice()
    {
        $r            = $this->lib->registerDevice($this->auth->who, $this->auth->client($this->request)['plan'], $this->json());
        $this->status = $r['created'] ? 201 : 200;

        return $r['device'];
    }

    protected function devices()
    {
        return ['data' => $this->lib->myDevices($this->auth->who), 'limit' => $this->lib->deviceLimit($this->auth->client($this->request)['plan'])];
    }

    protected function deleteDevice(string $id)
    {
        $this->lib->revokeDevice($this->auth->who, $id);
    }

    protected function favorites()
    {
        return ['data' => $this->lib->favorites($this->auth->who)];
    }

    protected function addFavorite(string $assetId)
    {
        $this->lib->setFavorite($this->auth->who, $assetId, true);
    }

    protected function removeFavorite(string $assetId)
    {
        $this->lib->setFavorite($this->auth->who, $assetId, false);
    }

    protected function myDownloads()
    {
        return $this->lib->myDownloads($this->auth->who, $this->q('cursor'), $this->q('limit'));
    }

    protected function installs()
    {
        return ['data' => $this->lib->myInstalls($this->auth->who, $this->q('device_id'))];
    }

    protected function addInstall()
    {
        $this->status = 201;

        return $this->lib->saveMyInstall($this->auth->who, $this->json(), $this->auth->oidcEnabled());
    }

    protected function removeInstall(string $assetId)
    {
        $this->lib->deleteMyInstall($this->auth->who, $assetId, $this->q('device_id'));
    }

    protected function entitlements()
    {
        return ['plan' => $this->auth->client($this->request)['plan'], 'signed_in' => $this->auth->who !== null];
    }

    /** Fallback for unknown /api paths (404 in the API's error format). */
    public function missing()
    {
        return $this->notFound();
    }
}
