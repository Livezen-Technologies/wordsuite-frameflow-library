<?php

namespace App\Controllers\Admin;

use App\Controllers\BaseApiController;

/** Webhooks and their deliveries; route filter perm:settings.manage. */
class WebhooksController extends BaseApiController
{
    protected function index()
    {
        return ['data' => $this->lib->webhooksList($this->actor())];
    }

    protected function create()
    {
        return $this->lib->createWebhook($this->actor(), $this->json());
    }

    protected function update(string $id)
    {
        return $this->lib->updateWebhook($this->actor(), $id, $this->json());
    }

    protected function delete(string $id)
    {
        $this->lib->deleteWebhook($this->actor(), $id);
    }

    protected function deliveries(string $id)
    {
        return ['data' => $this->lib->webhookDeliveries($this->actor(), $id)];
    }

    protected function test(string $id)
    {
        return $this->lib->testWebhook($this->actor(), $id);
    }
}
