<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseApiController;

/** Curated collections (docs/api-v1-additions.md); route filter perm:taxonomy.manage. */
class CollectionsController extends BaseApiController
{
    protected function index()
    {
        return ['data' => $this->lib->adminCollections()];
    }

    protected function create()
    {
        return $this->lib->createCollection($this->actor(), $this->json());
    }

    protected function show(string $slug)
    {
        return $this->lib->adminCollection($slug);
    }

    protected function update(string $slug)
    {
        return $this->lib->updateCollection($this->actor(), $slug, $this->json());
    }

    protected function delete(string $slug)
    {
        $this->lib->deleteCollection($this->actor(), $slug);
    }
}
