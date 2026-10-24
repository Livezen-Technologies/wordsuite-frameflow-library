<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `search_terms` (CreateClientAndAdminTables). Mapped by App\Services\LibraryStore. */
class SearchTermModel extends Model
{
    protected $table         = 'search_terms';
    protected $primaryKey    = 'row_id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;
    protected $protectFields = true;
    protected $allowedFields = ['term', 'count', 'last_at'];
}
