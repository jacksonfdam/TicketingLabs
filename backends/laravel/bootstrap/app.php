<?php

use App\Domain\DomainException;
use App\Domain\Errors;
use App\Http\Middleware\RequestId;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        // Mounted at the root: the gateway strips /api before forwarding, so the
        // backend serves /events, /reservations, etc. directly. apiPrefix '' is what
        // makes "swap the backend, change nothing else" hold for this backend too.
        api: __DIR__.'/../routes/api.php',
        apiPrefix: '',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Every request gets an X-Request-Id, echoed on every response.
        $middleware->append(RequestId::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // One render path for the whole app: the standard error envelope, every time,
        // with the request id in both the body and the header. Internal detail (stack
        // traces, SQL) never reaches the client.
        $exceptions->render(function (\Throwable $e, Request $request) {
            $requestId = (string) $request->attributes->get('request_id', '');
            if ($e instanceof DomainException) {
                $code = $e->errorCode;
                $message = $e->publicMessage;
            } elseif ($e instanceof HttpExceptionInterface) {
                $status = $e->getStatusCode();
                if ($status === 404) {
                    [$code, $message] = ['not_found', 'Resource not found'];
                } elseif ($status < 500) {
                    [$code, $message] = ['bad_request', 'The request was malformed'];
                } else {
                    [$code, $message] = ['internal_error', 'Something went wrong on our end'];
                }
            } else {
                [$code, $message] = ['internal_error', 'Something went wrong on our end'];
            }
            $status = Errors::STATUS[$code] ?? 500;

            return response()
                ->json(['error' => ['code' => $code, 'message' => $message, 'request_id' => $requestId]], $status)
                ->header('X-Request-Id', $requestId);
        });
    })->create();
