<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `user_downloads` (see the CreateLibraryTables migration). Mapped to API shapes by App\Services\LibraryStore. */
class DownloadModel extends Model
{
    protected $table          = 'user_downloads';
    protected $primaryKey     = 'row_id';
    protected $returnType     = 'array';
    protected $useTimestamps  = false;
    protected $protectFields  = true;
    protected $allowedFields  = ['id', 'user_id', 'device_id', 'asset_id', 'version', 'status', 'bytes', 'duration_ms', 'started_at', 'finished_at'];
}
