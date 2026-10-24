<?php

namespace App\Filters;

use App\Libraries\Http\ApiResponse;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * Resolves the caller (static token or OIDC bearer) into AuthContext.
 * Arguments: none (anonymous allowed: client API, feed) or "admin" (a
 * library role is required: 401 signed out, 403 signed in without a role).
 */
class AuthFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        $ctx = service('authContext');
        $who = $ctx->resolve($request);
        if (in_array('admin', (array) $arguments, true) && $ctx->actor() === null) {
            return $who !== null
                ? ApiResponse::error(403, 'FORBIDDEN', 'Your account has no Download Center role.')
                : ApiResponse::error(401, 'UNAUTHENTICATED', 'Sign in first.');
        }

        return null;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        return null;
    }
}
