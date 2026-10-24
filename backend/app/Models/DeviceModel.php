<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `devices` (CreateClientAndAdminTables). Mapped by App\Services\LibraryStore. */
class DeviceModel extends Model
{
    protected $table         = 'devices';
    protected $primaryKey    = 'row_id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;
    protected $protectFields = true;
    protected $allowedFields = ['id', 'user_id', 'fingerprint_hash', 'os', 'app_version', 'name', 'revoked', 'revoked_at', 'created_at', 'last_seen_at'];
}
