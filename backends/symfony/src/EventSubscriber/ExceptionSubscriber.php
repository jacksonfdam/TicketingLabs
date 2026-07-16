<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use App\Domain\DomainException;
use App\Domain\Errors;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;

// One render path for the whole app: the standard error envelope, every time, with the
// request id in both body and header. Internal detail never reaches the client.
final class ExceptionSubscriber implements EventSubscriberInterface
{
    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::EXCEPTION => 'onException'];
    }

    public function onException(ExceptionEvent $event): void
    {
        $e = $event->getThrowable();
        $requestId = (string) $event->getRequest()->attributes->get('request_id', '');

        if ($e instanceof DomainException) {
            $code = $e->errorCode;
            $message = $e->publicMessage;
        } elseif ($e instanceof HttpExceptionInterface) {
            $status = $e->getStatusCode();
            [$code, $message] = match (true) {
                $status === 404 => ['not_found', 'Resource not found'],
                $status < 500 => ['bad_request', 'The request was malformed'],
                default => ['internal_error', 'Something went wrong on our end'],
            };
        } else {
            [$code, $message] = ['internal_error', 'Something went wrong on our end'];
        }

        $status = Errors::STATUS[$code] ?? 500;
        $event->setResponse(new JsonResponse(
            ['error' => ['code' => $code, 'message' => $message, 'request_id' => $requestId]],
            $status,
            ['X-Request-Id' => $requestId],
        ));
    }
}
