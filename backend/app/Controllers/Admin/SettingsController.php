<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseApiController;

/** Library settings; route filter perm:settings.manage. */
class SettingsController extends BaseApiController
{
    protected function show()
    {
        return $this->lib->settings();
    }

    protected function update()
    {
        return $this->lib->updateSettings($this->actor(), $this->json());
    }
}
