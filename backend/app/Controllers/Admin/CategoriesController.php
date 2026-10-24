<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseApiController;

/** Taxonomy (§3.4): categories and tag merge. */
class CategoriesController extends BaseApiController
{
    protected function index()
    {
        return ['data' => $this->lib->categories($this->q('type'))];
    }

    protected function create()
    {
        return $this->lib->createCategory($this->actor(), $this->json());
    }

    protected function update(string $id)
    {
        return $this->lib->updateCategory($this->actor(), $id, $this->json());
    }

    protected function delete(string $id)
    {
        $this->lib->deleteCategory($this->actor(), $id);
    }

    protected function reorder()
    {
        return ['data' => $this->lib->reorderCategories($this->actor(), $this->json())];
    }

    protected function mergeTags()
    {
        return $this->lib->mergeTags($this->actor(), $this->json());
    }
}
