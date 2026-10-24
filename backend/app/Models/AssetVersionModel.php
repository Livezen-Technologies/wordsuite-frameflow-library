<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `asset_versions` (see the CreateLibraryTables migration). Mapped to API shapes by App\Services\LibraryStore. */
class AssetVersionModel extends Model
{
    protected $table          = 'asset_versions';
    protected $primaryKey     = 'row_id';
    protected $returnType     = 'array';
    protected $useTimestamps  = false;
    protected $protectFields  = true;
    protected $allowedFields  = ['id', 'asset_id', 'version', 'changelog', 'is_breaking', 'min_app_version', 'files', 'checks', 'meta', 'status', 'package_key', 'size_bytes', 'sha256', 'signature', 'thumbnail_ext', 'built_at', 'retired_at', 'processing', 'previews', 'created_by', 'created_at'];
}
