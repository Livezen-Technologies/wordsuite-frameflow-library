<?php

namespace App\Libraries\Http;

use App\Libraries\Json;
use CodeIgniter\HTTP\Response;
use Config\App;

/**
 * `text/event-stream` of sync events (§8.2): everything after `since`,
 * then new events as they are written (the table is polled), a `: ping`
 * comment every 25 s and `event: bye` after the time limit so a PHP worker
 * isn't held forever; clients reconnect with Last-Event-ID.
 */
final class SseResponse extends Response
{
    /** @var callable(int): list<array> */
    private $fetch;
    private int $since      = 0;
    private int $maxSeconds = 300;
    private int $pollMs     = 2000;
    private int $pingSeconds = 25;

    /** @param callable(int): list<array> $fetch events after a seq, oldest first */
    public static function stream(callable $fetch, int $since, int $maxSeconds, int $pollMs, int $pingSeconds = 25): self
    {
        $res              = new self(config(App::class));
        $res->fetch       = $fetch;
        $res->since       = $since;
        $res->maxSeconds  = max(1, $maxSeconds);
        $res->pollMs      = max(50, $pollMs);
        $res->pingSeconds = max(1, $pingSeconds);
        $res->setStatusCode(200);
        ApiResponse::headers($res, [
            'Content-Type'                => 'text/event-stream; charset=utf-8',
            'Cache-Control'               => 'no-cache, no-transform',
            'X-Accel-Buffering'           => 'no',
            'Access-Control-Allow-Origin' => '*',
        ]);

        return $res;
    }

    public function sendBody()
    {
        @set_time_limit($this->maxSeconds + 30);
        ignore_user_abort(false);
        while (ob_get_level() > 0) {
            ob_end_flush();
        }
        $emit = static function (string $text) {
            echo $text;
            flush();
        };
        $emit("retry: 3000\n\n");
        $start    = microtime(true);
        $lastPing = $start;
        $seq      = $this->since;
        while (true) {
            foreach (($this->fetch)($seq) as $e) {
                $seq = (int) $e['seq'];
                $emit("id: {$seq}\nevent: sync\ndata: " . Json::encode($e) . "\n\n");
            }
            $now = microtime(true);
            if ($now - $start >= $this->maxSeconds) {
                $emit("event: bye\ndata: " . Json::encode(['last_seq' => $seq]) . "\n\n");
                break;
            }
            if ($now - $lastPing >= $this->pingSeconds) {
                $emit(": ping\n\n");
                $lastPing = $now;
            }
            if (connection_aborted()) {
                break;
            }
            usleep($this->pollMs * 1000);
        }

        return $this;
    }
}
