<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `categories` (see the CreateLibraryTables migration). Mapped to API shapes by App\Services\LibraryStore. */
class CategoryModel extends Model
{
    protected $table          = 'categories';
    protected $primaryKey     = 'row_id';
    protected $returnType     = 'array';
    protected $useTimestamps  = false;
    protected $protectFields  = true;
    protected $allowedFields  = ['id', 'type', 'name', 'slug', 'parent_id', 'sort', 'icon', 'visible'];
}
