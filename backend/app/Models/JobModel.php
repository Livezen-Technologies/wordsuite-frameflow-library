<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `jobs` (processing jobs for apps/workers). Mapped by App\Services\LibraryStore. */
class JobModel extends Model
{
    protected $table         = 'jobs';
    protected $primaryKey    = 'row_id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;
    protected $protectFields = true;
    protected $allowedFields = ['id', 'asset_id', 'version', 'type', 'status', 'attempts', 'lease_until', 'worker_id', 'error', 'previews', 'created_at', 'started_at', 'finished_at'];
}
