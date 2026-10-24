<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseApiController;
use App\Exceptions\HttpError;
use App\Libraries\Http\ApiResponse;
use App\Libraries\Http\BlobResponse;

/** Admin asset endpoints, blueprint §7.3. Permissions are checked per asset in LibraryService. */
class AssetsController extends BaseApiController
{
    protected function me()
    {
        return $this->actor() ?? throw HttpError::unauthenticated();
    }

    protected function index()
    {
        return $this->lib->adminList($this->query());
    }

    protected function create()
    {
        $body = $this->json();
        if (isset($body['items']) && is_array($body['items']) && array_is_list($body['items'])) {
            // One at a time (each in its own savepoint), so slug uniqueness holds within a batch.
            $data     = [];
            $defaults = is_array($body['defaults'] ?? null) ? $body['defaults'] : [];
            foreach (array_slice($body['items'], 0, 200) as $item) {
                $item = is_array($item) ? $item : [];
                try {
                    $data[] = ['ok' => true, 'asset' => $this->transaction(fn () => $this->lib->createAsset($this->actor(), array_merge($defaults, $item)))];
                } catch (\Throwable $e) {
                    $data[] = ['ok' => false, 'upload_id' => $item['upload_id'] ?? null, 'error' => ['code' => $e instanceof HttpError ? $e->errorCode : null, 'message' => $e->getMessage(), 'details' => $e instanceof HttpError ? $e->details : null]];
                }
            }

            return ['data' => $data];
        }

        return $this->lib->createAsset($this->actor(), $body);
    }

    protected function show(string $id)
    {
        return $this->lib->getAsset($id);
    }

    protected function update(string $id)
    {
        return $this->lib->updateAsset($this->actor(), $id, $this->json());
    }

    protected function bulk()
    {
        return $this->lib->bulk($this->actor(), $this->json(), fn (callable $fn) => $this->transaction($fn));
    }

    protected function addVersion(string $id)
    {
        return $this->lib->addVersion($this->actor(), $id, $this->json());
    }

    protected function publishVersion(string $id, string $v)
    {
        return $this->lib->publish($this->actor(), $id, ['version' => $v]);
    }

    protected function rollback(string $id, string $v)
    {
        return $this->lib->rollback($this->actor(), $id, $v);
    }

    protected function submitReview(string $id)
    {
        return $this->lib->submitReview($this->actor(), $id);
    }

    protected function approve(string $id)
    {
        return $this->lib->review($this->actor(), $id, true);
    }

    protected function reject(string $id)
    {
        return $this->lib->review($this->actor(), $id, false, $this->json()['reason'] ?? '');
    }

    protected function publish(string $id)
    {
        return $this->lib->publish($this->actor(), $id, $this->json());
    }

    protected function unpublish(string $id)
    {
        $body = $this->json();

        return $this->lib->unpublish($this->actor(), $id, array_merge($body, ['op' => $body['op'] ?? 'unpublish']));
    }

    protected function deprecate(string $id)
    {
        return $this->lib->unpublish($this->actor(), $id, array_merge($this->json(), ['op' => 'deprecate']));
    }

    protected function archive(string $id)
    {
        return $this->lib->unpublish($this->actor(), $id, ['op' => 'archive']);
    }

    /** A version's generated preview for signed-in admins (drafts too), with Range and ETag. */
    protected function preview(string $id, string $version, string $file)
    {
        $blob = $this->lib->previewFile($id, $version, $file, true);
        if ($blob === null) {
            return ApiResponse::error(404, 'NOT_FOUND', 'Preview not found.');
        }

        return BlobResponse::serve(service('blobs'), $blob, $this->request->getMethod(), $this->request->getHeaderLine('Range'), $this->request->getHeaderLine('If-None-Match'), ['Cache-Control' => 'private, no-store']);
    }

    protected function reprocess(string $id)
    {
        return $this->lib->reprocess($this->actor(), $id, $this->json()['version'] ?? null);
    }
}
