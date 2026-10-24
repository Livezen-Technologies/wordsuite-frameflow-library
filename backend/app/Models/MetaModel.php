<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `library_meta` (see the CreateLibraryTables migration). Mapped to API shapes by App\Services\LibraryStore. */
class MetaModel extends Model
{
    protected $table          = 'library_meta';
    protected $primaryKey     = 'key';
    protected $returnType     = 'array';
    protected $useTimestamps  = false;
    protected $useAutoIncrement = false;
    protected $protectFields  = true;
    protected $allowedFields  = ['key', 'value'];
}
