<?php

namespace App\Commands;

use App\Libraries\Signing\Ed25519Key;
use CodeIgniter\CLI\BaseCommand;
use CodeIgniter\CLI\CLI;

/** Prints a new Ed25519 catalog signing key (PKCS#8 PEM, for LIBRARY_SIGNING_KEY) and its public half. */
class LibraryKeygen extends BaseCommand
{
    protected $group       = 'Library';
    protected $name        = 'library:keygen';
    protected $description = 'Generate a catalog signing key (LIBRARY_SIGNING_KEY) or print the current public key.';
    protected $usage       = 'library:keygen [--public]';
    protected $options     = ['--public' => "Print the running library's public key (SPKI PEM) instead"];

    public function run(array $params)
    {
        if (array_key_exists('public', $params) || CLI::getOption('public') !== null) {
            CLI::print(service('library')->publicKeyPem());

            return EXIT_SUCCESS;
        }
        $key = Ed25519Key::generate();
        CLI::print($key->privatePem());
        CLI::print($key->publicPem());

        return EXIT_SUCCESS;
    }
}
