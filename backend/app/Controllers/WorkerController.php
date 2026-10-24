<?php

namespace App\Controllers;

use App\Libraries\Http\ApiResponse;

/**
 * Processing workers (apps/workers), token role "worker" (jobs.process):
 * claim a job, read its originals, store previews, report the result.
 */
class WorkerController extends BaseApiController
{
    protected function claim()
    {
        return $this->lib->claimJob($this->auth->who);
    }

    protected function file(string $id, string $sha)
    {
        $bytes = $this->lib->jobFile($this->auth->who, $id, $sha);

        return ApiResponse::headers($this->response->setStatusCode(200)->setBody($bytes), ['Content-Type' => 'application/octet-stream', 'Cache-Control' => 'no-store']);
    }

    protected function preview(string $id, string $kind)
    {
        $buf = $this->rawBody(50 * 1024 * 1024);

        return $this->lib->putPreview($this->auth->who, $id, $kind, $this->q('ext'), $buf);
    }

    protected function complete(string $id)
    {
        return $this->lib->completeJob($this->auth->who, $id, $this->json());
    }
}
