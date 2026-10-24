<?php

namespace App\Commands;

use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/**
 * Scheduled publish/unpublish (§3.1 publish_at / unpublish_at). The API also
 * runs due schedules before each request; run this every minute (cron, or
 * --loop in a scheduler container) so they happen without traffic.
 */
class LibrarySchedule extends BaseCommand
{
    protected $group       = 'Library';
    protected $name        = 'library:schedule';
    protected $description = 'Run due scheduled publishes and unpublishes.';
    protected $usage       = 'library:schedule [--loop] [--interval=60]';
    protected $options     = ['--loop' => 'Keep running', '--interval' => 'Seconds between runs with --loop (default 60)'];

    public function run(array $params)
    {
        $loop     = array_key_exists('loop', $params) || CLI::getOption('loop') !== null;
        $interval = max(1, (int) (CLI::getOption('interval') ?? 60));
        do {
            $lib = service('library', false);
            $db  = $lib->store->db;
            $db->transBegin();
            try {
                $ran = $lib->runSchedule();
                $db->transCommit();
                foreach ($ran as $r) {
                    CLI::write(sprintf('%s %s %s%s', $r['op'], $r['id'], $r['ok'] ? 'ok' : 'failed', isset($r['error']) ? ': ' . $r['error'] : ''));
                }
                if (! $loop) {
                    CLI::write(count($ran) . ' scheduled change(s) applied.');
                }
            } catch (\Throwable $e) {
                $db->transRollback();
                CLI::error('Schedule run failed: ' . $e->getMessage());
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
