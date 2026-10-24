<?php

namespace App\Filters;

use App\Libraries\Http\ApiResponse;
use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;

/** Every response carries X-Request-Id and X-Content-Type-Options: nosniff. */
class ResponseHeadersFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        ApiResponse::requestId();

        return null;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        $response->setHeader('X-Request-Id', ApiResponse::requestId());
        $response->setHeader('X-Content-Type-Options', 'nosniff');

        return $response;
    }
}
