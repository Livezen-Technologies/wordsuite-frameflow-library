<?php

namespace App\Libraries;

/** ISO-8601 times as JavaScript's Date#toISOString() writes them (UTC, milliseconds). */
final class Clock
{
    /** Fixed "now" for tests (ms since epoch), or null for the real clock. */
    public static ?int $fixedMs = null;

    public static function ms(): int
    {
        return self::$fixedMs ?? (int) floor(microtime(true) * 1000);
    }

    public static function iso(?int $ms = null): string
    {
        $ms ??= self::ms();
        $s = intdiv($ms, 1000);

        return gmdate('Y-m-d\TH:i:s', $s) . sprintf('.%03dZ', $ms % 1000) ;
    }

    /** Parses a date like `new Date(text)`; null when invalid. Returns ms. */
    public static function parse(mixed $text): ?int
    {
        if (! is_string($text) || trim($text) === '') {
            return null;
        }
        try {
            $d = new \DateTimeImmutable($text, new \DateTimeZone('UTC'));
        } catch (\Exception) {
            return null;
        }

        return (int) $d->format('U') * 1000 + (int) $d->format('v');
    }
}
