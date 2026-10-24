<?php

namespace App\Libraries\Http;

use App\Exceptions\HttpError;
use App\Libraries\Json;
use CodeIgniter\HTTP\ResponseInterface;

/** Builds the API's JSON, text and error responses. */
final class ApiResponse
{
    public static function requestId(): string
    {
        $box = service('requestId');
        if ($box['id'] === null) {
            $hdr       = service('request')->getHeaderLine('X-Request-Id');
            $box['id'] = $hdr !== '' ? $hdr : 'req_' . bin2hex(random_bytes(8));
        }

        return $box['id'];
    }

    /** Sets headers, replacing any value already there (CI4 appends to list-valued headers). */
    public static function headers(ResponseInterface $res, array $headers): ResponseInterface
    {
        foreach ($headers as $k => $v) {
            $res->removeHeader($k);
            $res->setHeader($k, $v);
        }

        return $res;
    }

    public static function json(mixed $body, int $status = 200, array $headers = []): ResponseInterface
    {
        $res = service('response')->setStatusCode($status)->setHeader('Content-Type', 'application/json; charset=utf-8')->setBody(Json::encode($body));
        self::headers($res, $headers);

        return $res;
    }

    public static function text(string $body, int $status = 200, array $headers = []): ResponseInterface
    {
        $res = service('response')->setStatusCode($status)->setHeader('Content-Type', 'text/plain; charset=utf-8')->setBody($body);
        self::headers($res, $headers);

        return $res;
    }

    public static function error(int $status, string $code, string $message, array $details = []): ResponseInterface
    {
        return self::json(['error' => ['code' => $code, 'message' => $message, 'details' => array_map([Json::class, 'obj'], $details), 'request_id' => self::requestId()]], $status);
    }

    public static function fromException(\Throwable $e): ResponseInterface
    {
        if ($e instanceof HttpError) {
            return self::error($e->status, $e->errorCode, $e->getMessage(), $e->details);
        }
        log_message('error', '[library] {class}: {msg} @ {file}:{line}', ['class' => $e::class, 'msg' => $e->getMessage(), 'file' => $e->getFile(), 'line' => $e->getLine()]);

        return self::error(500, 'INTERNAL', 'Something went wrong.');
    }
}
