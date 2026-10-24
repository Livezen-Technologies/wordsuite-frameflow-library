<?php

namespace App\Controllers;

use App\Exceptions\HttpError;

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
        return $this->lib->searchAssets(['appVersion' => $this->auth->client($this->request, false)['appVersion']] + $this->query());
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

        return $this->lib->downloadGrant($id, array_merge($body, $c, ['device_id' => $c['device_id'] ?? $body['device_id'] ?? null]));
    }

    protected function complete(string $id)
    {
        return $this->lib->completeDownload($id, $this->json());
    }

    protected function usage()
    {
        return $this->lib->recordUsage($this->json()['events'] ?? []);
    }

    protected function sync()
    {
        $limit = $this->q('limit');

        return $this->lib->sync($this->q('since'), is_numeric($limit) && (int) $limit !== 0 ? (int) $limit : 500);
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
