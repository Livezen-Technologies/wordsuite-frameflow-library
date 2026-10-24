<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseApiController;

/** Overview, audit log and processing jobs. */
class AnalyticsController extends BaseApiController
{
    protected function overview()
    {
        return $this->lib->overview();
    }

    protected function auditLog()
    {
        return ['data' => $this->lib->auditLog($this->q('entity_id'))];
    }

    protected function jobs()
    {
        return ['data' => $this->lib->jobs($this->q('status'))];
    }
}
