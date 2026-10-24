<?php

namespace App\Libraries;

/** UUID v7 (time-ordered), blueprint §3.1. */
final class Uuid7
{
    public static function generate(): string
    {
        $b  = random_bytes(16);
        $ms = (int) floor(microtime(true) * 1000);
        for ($i = 0; $i < 6; $i++) {
            $b[$i] = chr(($ms >> (8 * (5 - $i))) & 0xFF);
        }
        $b[6] = chr((ord($b[6]) & 0x0F) | 0x70);
        $b[8] = chr((ord($b[8]) & 0x3F) | 0x80);
        $h    = bin2hex($b);

        return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
    }
}
