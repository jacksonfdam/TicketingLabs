<?php

declare(strict_types=1);

namespace App\EventSubscriber;

use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\Uid\Uuid;

// Ensures every request has an X-Request-Id, honouring one injected by the gateway and
// generating one otherwise. Stashed on the request and echoed on the response.
final class RequestIdSubscriber implements EventSubscriberInterface
{
    public static function getSubscribedEvents(): array
    {
        return [
            KernelEvents::REQUEST => ['onRequest', 256],
            KernelEvents::RESPONSE => 'onResponse',
        ];
    }

    public function onRequest(RequestEvent $event): void
    {
        $req = $event->getRequest();
        $id = $req->headers->get('X-Request-Id') ?: Uuid::v4()->toRfc4122();
        $req->attributes->set('request_id', $id);
    }

    public function onResponse(ResponseEvent $event): void
    {
        $id = (string) $event->getRequest()->attributes->get('request_id', '');
        if ($id !== '') {
            $event->getResponse()->headers->set('X-Request-Id', $id);
        }
    }
}
