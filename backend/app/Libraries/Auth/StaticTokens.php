<?php

namespace App\Libraries\Auth;

/**
 * Static bearer tokens from LIBRARY_ADMIN_TOKENS: "token:role:userId,…"
 * (dev and server-to-server; production admins sign in with OIDC, §7.1).
 */
final class StaticTokens
{
    /** @return array<string, array{id: string, role: string}> */
    public static function parse(string $spec): array
    {
        $map = [];
        foreach (array_filter(array_map('trim', explode(',', $spec))) as $part) {
            $bits  = explode(':', $part);
            $token = $bits[0] ?? '';
            $role  = $bits[1] ?? '';
            $id    = $bits[2] ?? '';
            if ($token !== '' && $role !== '') {
                $map[$token] = ['id' => $id !== '' ? $id : $role . '-' . substr(hash('sha256', $token), 0, 8), 'role' => $role];
            }
        }

        return $map;
    }
}
