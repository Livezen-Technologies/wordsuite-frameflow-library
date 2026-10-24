<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `sync_events` (see the CreateLibraryTables migration). Mapped to API shapes by App\Services\LibraryStore. */
class SyncEventModel extends Model
{
    protected $table          = 'sync_events';
    protected $primaryKey     = 'seq';
    protected $returnType     = 'array';
    protected $useTimestamps  = false;
    protected $protectFields  = true;
    protected $allowedFields  = ['op', 'asset_id', 'type', 'version', 'payload', 'created_at'];
}
