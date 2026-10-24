<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `usage_events` (see the CreateLibraryTables migration). Mapped to API shapes by App\Services\LibraryStore. */
class UsageEventModel extends Model
{
    protected $table          = 'usage_events';
    protected $primaryKey     = 'row_id';
    protected $returnType     = 'array';
    protected $useTimestamps  = false;
    protected $protectFields  = true;
    protected $allowedFields  = ['id', 'user_id', 'device_id', 'asset_id', 'event', 'at'];
}
