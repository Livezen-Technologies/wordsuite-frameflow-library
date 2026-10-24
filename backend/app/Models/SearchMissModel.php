<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `search_misses` (CreateClientAndAdminTables). Mapped by App\Services\LibraryStore. */
class SearchMissModel extends Model
{
    protected $table         = 'search_misses';
    protected $primaryKey    = 'row_id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;
    protected $protectFields = true;
    protected $allowedFields = ['term', 'count', 'last_at'];
}
