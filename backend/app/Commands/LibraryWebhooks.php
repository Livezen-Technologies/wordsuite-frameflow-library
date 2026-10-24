<?php

namespace App\Commands;

use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/**
 * Sends queued webhook deliveries (3 attempts with backoff, 10 s timeout,
 * signed, SSRF-guarded). Run with --loop next to the API (the production
 * image does), or from cron once a minute.
 */
class LibraryWebhooks extends BaseCommand
{
    protected $group       = 'Library';
    protected $name        = 'library:webhooks';
    protected $description = 'Send queued webhook deliveries.';
    protected $usage       = 'library:webhooks [--loop] [--interval=5]';
    protected $options     = ['--loop' => 'Keep running', '--interval' => 'Seconds between queue checks with --loop (default 5)'];

    public function run(array $params)
    {
        $loop     = array_key_exists('loop', $params) || CLI::getOption('loop') !== null;
        $interval = max(1, (int) (CLI::getOption('interval') ?? 5));
        do {
            $lib = service('library', false);
            try {
                // Each delivery's result is stored as it happens (no transaction around network calls).
                $sent = $lib->deliverWebhooks(100);
                foreach ($sent as $d) {
                    CLI::write(sprintf('%s %s attempt %d: %s%s', $d['event'], $d['id'], $d['attempt'], $d['ok'] ? 'ok' : $d['status'], $d['error'] ? " ({$d['error']})" : ''));
                }
                if (! $loop) {
                    CLI::write(count($sent) . ' delivery attempt(s).');
                }
            } catch (\Throwable $e) {
                CLI::error('Webhook run failed: ' . $e->getMessage());
                if (! $loop) {
                    return EXIT_ERROR;
                }
            }
            if ($loop) {
                sleep($interval);
            }
        } while ($loop);

        return EXIT_SUCCESS;
    }
}
