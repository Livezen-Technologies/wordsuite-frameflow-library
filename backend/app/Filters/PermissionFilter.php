<?php

namespace App\Filters;

use App\Libraries\Http\ApiResponse;
use App\Libraries\Rbac;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Route-level RBAC: `perm:taxonomy.manage` — any listed permission passes.
 * Used where the permission is the first thing the Node service checked;
 * object-level checks (asset.edit own vs all) stay in LibraryService.
 */
class PermissionFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $who = service('authContext')->resolve($request);
        if ($who === null) {
            return ApiResponse::error(401, 'UNAUTHENTICATED', 'Sign in first.');
        }
        foreach ((array) $arguments as $perm) {
            if (Rbac::can($who['role'] ?? null, $perm)) {
                return null;
            }
        }

        return ApiResponse::error(403, 'FORBIDDEN', 'You need the ' . implode(' or ', (array) $arguments) . ' permission.');
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        return null;
    }
}
