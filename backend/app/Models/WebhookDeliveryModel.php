<?php

namespace App\Models;

use CodeIgniter\Model;

/** Rows of `webhook_deliveries` (CreateClientAndAdminTables). Mapped by App\Services\LibraryStore. */
class WebhookDeliveryModel extends Model
{
    protected $table         = 'webhook_deliveries';
    protected $primaryKey    = 'row_id';
    protected $returnType    = 'array';
    protected $useTimestamps = false;
    protected $protectFields = true;
    protected $allowedFields = ['id', 'webhook_id', 'event', 'payload', 'status', 'attempt', 'next_attempt_at', 'status_code', 'ok', 'error', 'created_at', 'finished_at'];
}
