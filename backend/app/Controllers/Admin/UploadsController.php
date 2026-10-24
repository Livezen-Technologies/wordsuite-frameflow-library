<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseApiController;
use App\Libraries\Json;
use Config\Library;

/** Raw-body uploads (X-Filename header or ?filename=, optional ?type=), §4.1. */
class UploadsController extends BaseApiController
{
    protected function create()
    {
        $filename = rawurldecode($this->request->getHeaderLine('X-Filename') ?: ($this->q('filename') ?? ''));
        $up       = $this->lib->upload($this->actor(), $filename, $this->rawBody(config(Library::class)->maxUploadBytes), $this->q('type') ?: null);

        $up['meta'] = Json::obj($up['meta']);

        return $up;
    }

    protected function show(string $id)
    {
        $up         = $this->lib->mustUpload($id);
        $up['meta'] = Json::obj($up['meta']);

        return $up;
    }
}
