<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `collections` (CreateClientAndAdminTables). Mapped by App\Services\LibraryStore. */
class CollectionModel extends Model
{
    protected $table         = 'collections';
    protected $primaryKey    = 'row_id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;
    protected $protectFields = true;
    protected $allowedFields = ['id', 'slug', 'title', 'description', 'asset_ids', 'publish_at', 'unpublish_at', 'visible', 'created_by', 'created_at', 'updated_at'];
}
