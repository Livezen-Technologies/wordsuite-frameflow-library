<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `user_installs` (CreateClientAndAdminTables). Mapped by App\Services\LibraryStore. */
class InstallModel extends Model
{
    protected $table         = 'user_installs';
    protected $primaryKey    = 'row_id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;
    protected $protectFields = true;
    protected $allowedFields = ['user_id', 'device_id', 'asset_id', 'version', 'installed_at', 'last_used_at'];
}
