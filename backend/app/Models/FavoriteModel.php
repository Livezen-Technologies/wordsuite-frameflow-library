<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `user_favorites` (CreateClientAndAdminTables). Mapped by App\Services\LibraryStore. */
class FavoriteModel extends Model
{
    protected $table         = 'user_favorites';
    protected $primaryKey    = 'row_id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;
    protected $protectFields = true;
    protected $allowedFields = ['user_id', 'asset_id', 'created_at'];
}
