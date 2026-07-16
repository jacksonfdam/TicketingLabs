<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Domain\Errors;
use App\UseCase\TokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Validates the bearer access token and puts the user id on the request. Absent or
// invalid token throws the invalid_token domain error (mapped to 401 by the handler).
final class BearerAuth
{
    public function __construct(private TokenService $tokens) {}

    public function handle(Request $request, Closure $next): Response
    {
        $header = (string) $request->headers->get('Authorization', '');
        if (! str_starts_with($header, 'Bearer ')) {
            throw Errors::invalidToken();
        }
        $claims = $this->tokens->parseAccess(substr($header, 7));
        $request->attributes->set('user_id', $claims['userId']);
        return $next($request);
    }
}
