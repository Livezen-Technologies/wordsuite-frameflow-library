<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `webhooks` (CreateClientAndAdminTables). Mapped by App\Services\LibraryStore. */
class WebhookModel extends Model
{
    protected $table         = 'webhooks';
    protected $primaryKey    = 'row_id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;
    protected $protectFields = true;
    protected $allowedFields = ['id', 'url', 'events', 'active', 'secret', 'created_by', 'created_at', 'updated_at'];
}
