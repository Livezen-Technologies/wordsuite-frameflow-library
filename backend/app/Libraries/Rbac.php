<?php

namespace App\Libraries;

/**
 * Library admin roles → permissions (blueprint §6). "own" permissions only
 * cover assets the actor created. Single source of truth for the API.
 */
final class Rbac
{
    /** Highest first: an OIDC user with several roles gets the first listed. */
    public const ROLES = [
        'super_admin'     => ['asset.create', 'asset.edit.all', 'asset.review', 'asset.publish', 'asset.publish.direct', 'asset.delete', 'asset.archive', 'version.rollback', 'taxonomy.manage', 'access.manage', 'analytics.view', 'settings.manage'],
        'library_manager' => ['asset.create', 'asset.edit.all', 'asset.review', 'asset.publish', 'asset.archive', 'version.rollback', 'taxonomy.manage', 'access.manage', 'analytics.view'],
        'content_editor'  => ['asset.create', 'asset.edit.own', 'analytics.view.own'],
        'reviewer'        => ['asset.review', 'analytics.view'],
        'analyst'         => ['analytics.view'],
        // Processing workers (apps/workers): claim jobs, read originals, store previews.
        'worker'          => ['jobs.process'],
    ];

    public static function can(?string $role, string $permission): bool
    {
        return in_array($permission, self::ROLES[$role ?? ''] ?? [], true);
    }

    public static function isRole(mixed $role): bool
    {
        return is_string($role) && array_key_exists($role, self::ROLES);
    }
}
