<?php

namespace App\Libraries;

/**
 * JSON the way the Node service wrote it (JSON.stringify): no escaped
 * slashes or Unicode, and `pretty()` for JSON.stringify(v, null, "\t").
 */
final class Json
{
    public const FLAGS = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_LINE_TERMINATORS | JSON_INVALID_UTF8_SUBSTITUTE;

    public static function encode(mixed $value): string
    {
        return json_encode($value, self::FLAGS | JSON_THROW_ON_ERROR);
    }

    /** JSON.stringify(value, null, "\t"): tab-indented, `"key": value`. */
    public static function pretty(mixed $value): string
    {
        $text = json_encode($value, self::FLAGS | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);

        // PHP indents with four spaces; strings never span lines, so leading
        // runs of spaces are always indentation.
        return preg_replace_callback('/^((?:    )+)/m', static fn (array $m) => str_repeat("\t", intdiv(strlen($m[1]), 4)), $text);
    }

    /** Decodes to arrays; null for invalid JSON or an empty string. */
    public static function decode(?string $text, mixed $default = null): mixed
    {
        if ($text === null || $text === '') {
            return $default;
        }
        try {
            return json_decode($text, true, 512, JSON_THROW_ON_ERROR | JSON_BIGINT_AS_STRING);
        } catch (\JsonException) {
            return $default;
        }
    }

    /** `{}` for an empty array (PHP can't tell an empty object from an empty list). */
    public static function obj(mixed $value): mixed
    {
        return is_array($value) && $value === [] ? new \stdClass() : $value;
    }
}
