<?php

namespace App\Libraries\Pack;

/** A rejected archive: `rule` is the upload-gate rule (zip.format, zip.path, …). */
final class ZipProblem extends \RuntimeException
{
    public function __construct(string $message, public readonly string $rule, public readonly mixed $value = null)
    {
        parent::__construct($message);
    }
}
