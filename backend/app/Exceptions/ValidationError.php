<?php

namespace App\Exceptions;

/** Validation problems (422), each `{ field, rule, value }` (blueprint §4.4). */
class ValidationError extends HttpError
{
    /** @param list<array<string, mixed>> $details */
    public function __construct(string $message, array $details = [], string $code = 'VALIDATION_FAILED')
    {
        parent::__construct(422, $code, $message, $details);
    }
}
