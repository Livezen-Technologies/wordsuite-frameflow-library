<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * An error with an HTTP status and a stable machine code, rendered as
 * { "error": { "code", "message", "details", "request_id" } } (blueprint §4.4).
 */
class HttpError extends RuntimeException
{
    /** @param list<array<string, mixed>> $details */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $details = [],
    ) {
        parent::__construct($message, $status);
    }

    public static function forbidden(string $permission): self
    {
        return new self(403, 'FORBIDDEN', "You need the {$permission} permission.");
    }

    public static function notFound(string $what): self
    {
        return new self(404, 'NOT_FOUND', "{$what} not found.");
    }

    public static function unauthenticated(): self
    {
        return new self(401, 'UNAUTHENTICATED', 'Sign in first.');
    }
}
