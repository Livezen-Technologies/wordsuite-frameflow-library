<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `audit_log` (see the CreateLibraryTables migration). Mapped to API shapes by App\Services\LibraryStore. */
class AuditLogModel extends Model
{
    protected $table          = 'audit_log';
    protected $primaryKey     = 'row_id';
    protected $returnType     = 'array';
    protected $useTimestamps  = false;
    protected $protectFields  = true;
    protected $allowedFields  = ['id', 'actor_id', 'actor_role', 'action', 'entity', 'entity_id', 'diff', 'ip', 'at'];
}
