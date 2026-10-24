<?php

namespace App\Commands;

use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/** Drops and recreates the library tables (tests, local resets). Refuses without --force. */
class LibraryReset extends BaseCommand
{
    protected $group       = 'Library';
    protected $name        = 'library:reset';
    protected $description = 'Roll back all library migrations and migrate again (DESTROYS DATA).';
    protected $usage       = 'library:reset --force';
    protected $options     = ['--force' => 'Required'];

    public function run(array $params)
    {
        if (! array_key_exists('force', $params) && CLI::getOption('force') === null) {
            CLI::error('This deletes every asset. Pass --force.');

            return EXIT_ERROR;
        }
        $runner = service('migrations');
        $runner->setSilent(true);
        $runner->regress(0);
        $runner->latest();
        CLI::write('Library tables recreated.');

        return EXIT_SUCCESS;
    }
}
