<?php

namespace App\Commands;

use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/** Rebuilds the Meilisearch index from the library (MEILI_URL). */
class LibraryReindex extends BaseCommand
{
    protected $group       = 'Library';
    protected $name        = 'library:reindex';
    protected $description = 'Index every live asset in Meilisearch (MEILI_URL).';

    public function run(array $params)
    {
        $lib = service('library');
        if ($lib->search === null) {
            CLI::error('MEILI_URL is not set.');

            return EXIT_ERROR;
        }
        CLI::write($lib->reindexSearch() . ' live asset(s) indexed.');

        return EXIT_SUCCESS;
    }
}
