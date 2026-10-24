<?php

namespace Tests\Support;

/** Test files: .cube LUTs, PNGs, Lottie JSON (same fixtures as tests/library.test.js). */
final class Fixtures
{
    public static function cube(int $size = 17): string
    {
        $rows = [];
        for ($b = 0; $b < $size; $b++) {
            for ($g = 0; $g < $size; $g++) {
                for ($r = 0; $r < $size; $r++) {
                    $rows[] = sprintf('%.4f %.4f %.4f', $r / ($size - 1), $g / ($size - 1), $b / ($size - 1));
                }
            }
        }

        return "TITLE \"Test\"\nLUT_3D_SIZE {$size}\n" . implode("\n", $rows) . "\n";
    }

    public static function png(int $w, int $h): string
    {
        $chunk = static fn (string $type, string $data) => pack('N', strlen($data)) . $type . $data . pack('N', crc32($type . $data));
        $ihdr  = pack('NNCCCCC', $w, $h, 8, 6, 0, 0, 0);

        return "\x89PNG\r\n\x1a\n" . $chunk('IHDR', $ihdr) . $chunk('IDAT', gzcompress(str_repeat("\0", ($w * 4 + 1) * $h))) . $chunk('IEND', '');
    }

    public static function lottie(array $over = []): array
    {
        return $over + ['v' => '5.7.4', 'fr' => 30, 'ip' => 0, 'op' => 60, 'w' => 512, 'h' => 512, 'layers' => [['ty' => 4, 'nm' => 'shape'], ['ty' => 5, 'nm' => 'Title']], 'assets' => []];
    }
}
