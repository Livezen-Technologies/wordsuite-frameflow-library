<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseApiController;

/** Taxonomy (§3.4). */
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
}
