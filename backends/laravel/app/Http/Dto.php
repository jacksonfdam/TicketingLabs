<?php

// Response mappers producing the exact wire shape from contract/openapi.yaml: snake_case
// fields, RFC3339 timestamps, integers as integers. DB rows are already snake_case, so
// this mostly selects and coerces types.

declare(strict_types=1);

namespace App\Http;

use Illuminate\Support\Carbon;

final class Dto
{
    private static function iso(mixed $v): ?string
    {
        if ($v === null) {
            return null;
        }
        return Carbon::parse($v)->utc()->toIso8601String();
    }

    public static function tokenPair(array $p): array
    {
        return [
            'access_token' => $p['access_token'],
            'refresh_token' => $p['refresh_token'],
            'token_type' => 'Bearer',
            'expires_in' => $p['expires_in'],
        ];
    }

    public static function event(array $e): array
    {
        return [
            'id' => $e['id'],
            'name' => $e['name'],
            'venue' => $e['venue'],
            'starts_at' => self::iso($e['starts_at']),
            'sales_open_at' => self::iso($e['sales_open_at']),
            'status' => $e['status'],
        ];
    }

    public static function sector(array $s): array
    {
        return [
            'id' => $s['id'],
            'event_id' => $s['event_id'],
            'name' => $s['name'],
            'price_cents' => (int) $s['price_cents'],
            'currency' => $s['currency'],
            'total_inventory' => (int) $s['total_inventory'],
            'available_inventory' => (int) $s['available_inventory'],
        ];
    }

    public static function eventDetail(array $event, array $sectors): array
    {
        return self::event($event) + ['sectors' => array_map([self::class, 'sector'], $sectors)];
    }

    public static function eventPage(array $events, string $nextCursor): array
    {
        return [
            'data' => array_map([self::class, 'event'], $events),
            'next_cursor' => $nextCursor !== '' ? $nextCursor : null,
        ];
    }

    public static function queueToken(array $t): array
    {
        return [
            'id' => $t['id'],
            'user_id' => $t['user_id'],
            'event_id' => $t['event_id'],
            'position' => (int) $t['position'],
            'status' => $t['status'],
            'admitted_at' => self::iso($t['admitted_at'] ?? null),
        ];
    }

    public static function reservation(array $r): array
    {
        return [
            'id' => $r['id'],
            'user_id' => $r['user_id'],
            'sector_id' => $r['sector_id'],
            'quantity' => (int) $r['quantity'],
            'status' => $r['status'],
            'expires_at' => self::iso($r['expires_at']),
        ];
    }

    public static function order(array $o): array
    {
        return [
            'id' => $o['id'],
            'reservation_id' => $o['reservation_id'],
            'user_id' => $o['user_id'],
            'amount_cents' => (int) $o['amount_cents'],
            'status' => $o['status'],
            'created_at' => self::iso($o['created_at'] ?? null),
        ];
    }
}
