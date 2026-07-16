<?php

// Domain layer: status enums and the domain error. Imports nothing from Laravel; the
// same model every other backend implements, expressed in idiomatic PHP. See ADR 0003.

declare(strict_types=1);

namespace App\Domain;

enum Role: string
{
    case Customer = 'customer';
    case Admin = 'admin';
}

enum EventStatus: string
{
    case Draft = 'draft';
    case OnSale = 'on_sale';
    case SoldOut = 'sold_out';
    case Closed = 'closed';
}

enum QueueStatus: string
{
    case Waiting = 'waiting';
    case Admitted = 'admitted';
    case Expired = 'expired';
}

enum ReservationStatus: string
{
    case Held = 'held';
    case Confirmed = 'confirmed';
    case Released = 'released';
    case Expired = 'expired';
}

enum OrderStatus: string
{
    case Pending = 'pending';
    case Paid = 'paid';
    case Failed = 'failed';
    case Refunded = 'refunded';
}

enum PaymentStatus: string
{
    case Pending = 'pending';
    case Succeeded = 'succeeded';
    case Failed = 'failed';
}

// A domain error carries a stable machine code and a safe, public message. Never a
// stack trace or SQL. The transport layer maps the code to an HTTP status and wraps the
// message in the standard envelope. Codes match every other backend.
final class DomainException extends \RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        public readonly string $publicMessage,
    ) {
        parent::__construct("{$errorCode}: {$publicMessage}");
    }
}

// The catalogue, phrased for a stranger's eyes.
final class Errors
{
    public static function badRequest(): DomainException { return new DomainException('bad_request', 'The request was malformed'); }
    public static function invalidCredentials(): DomainException { return new DomainException('invalid_credentials', 'Email or password is incorrect'); }
    public static function invalidToken(): DomainException { return new DomainException('invalid_token', 'Token is missing, expired, or invalid'); }
    public static function forbidden(): DomainException { return new DomainException('forbidden', 'You are not allowed to do that'); }
    public static function notFound(): DomainException { return new DomainException('not_found', 'Resource not found'); }
    public static function validation(): DomainException { return new DomainException('validation_error', 'The request failed validation'); }
    public static function notAdmitted(): DomainException { return new DomainException('not_admitted', 'You need an admitted queue token for this event'); }
    public static function inventoryExhausted(): DomainException { return new DomainException('inventory_exhausted', 'Not enough inventory available'); }
    public static function reservationState(): DomainException { return new DomainException('reservation_state', 'Reservation is not in a state that allows this'); }
    public static function conflict(): DomainException { return new DomainException('conflict', 'The request conflicts with the current state'); }
    public static function rateLimited(): DomainException { return new DomainException('rate_limited', 'Too many requests'); }
    public static function lockUnavailable(): DomainException { return new DomainException('lock_unavailable', 'The resource is busy, please retry'); }
    public static function internal(): DomainException { return new DomainException('internal_error', 'Something went wrong on our end'); }

    /** code => HTTP status, in one place, mirroring the other backends. */
    public const STATUS = [
        'bad_request' => 400,
        'invalid_credentials' => 401,
        'invalid_token' => 401,
        'forbidden' => 403,
        'not_admitted' => 403,
        'not_found' => 404,
        'validation_error' => 422,
        'inventory_exhausted' => 409,
        'conflict' => 409,
        'reservation_state' => 409,
        'rate_limited' => 429,
        'lock_unavailable' => 429,
        'internal_error' => 500,
    ];
}
