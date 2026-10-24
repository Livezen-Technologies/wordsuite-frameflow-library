<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `uploads` (see the CreateLibraryTables migration). Mapped to API shapes by App\Services\LibraryStore. */
class UploadModel extends Model
{
    protected $table          = 'uploads';
    protected $primaryKey     = 'row_id';
    protected $returnType     = 'array';
    protected $useTimestamps  = false;
    protected $protectFields  = true;
    protected $allowedFields  = ['id', 'filename', 'sha256', 'size', 'type', 'checks', 'meta', 'duplicate_of', 'created_by', 'created_at'];
}
