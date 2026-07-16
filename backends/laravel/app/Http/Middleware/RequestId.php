<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

// Ensures every request has an X-Request-Id, honouring one injected by the gateway and
// generating one otherwise. Stashed on the request and echoed on the response so a
// single id follows the request through logs, traces, and error bodies.
final class RequestId
{
    public function handle(Request $request, Closure $next): Response
    {
        $id = $request->headers->get('X-Request-Id') ?: (string) Str::uuid();
        $request->attributes->set('request_id', $id);
        /** @var Response $response */
        $response = $next($request);
        $response->headers->set('X-Request-Id', $id);
        return $response;
    }
}
