<?php

declare(strict_types=1);

namespace App\Support;

use App\Domain\Errors;
use App\UseCase\TokenService;
use Symfony\Component\HttpFoundation\Request;

// Resolves the bearer access token to a user id, or throws invalid_token (mapped to 401
// by the exception subscriber). Injected into the controllers for the protected routes.
final class Authenticator
{
    public function __construct(private TokenService $tokens) {}

    public function userId(Request $request): string
    {
        $header = (string) $request->headers->get('Authorization', '');
        if (! str_starts_with($header, 'Bearer ')) {
            throw Errors::invalidToken();
        }
        return $this->tokens->parseAccess(substr($header, 7))['userId'];
    }
}
