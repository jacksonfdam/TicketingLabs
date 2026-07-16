<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Adapter\Broker;
use App\UseCase\PaymentService;
use Illuminate\Console\Command;

// The async payment worker. A long-running process (its own container) that consumes
// payment.requested messages and settles each via the gateway, with retry + backoff.
// The webhook then confirms the order asynchronously.
final class ConsumePayments extends Command
{
    protected $signature = 'payments:work';
    protected $description = 'Consume payment.requested messages and charge the gateway';

    public function handle(Broker $broker, PaymentService $payments): int
    {
        $this->info('payment worker started');
        $broker->consume(\App\UseCase\TOPIC_PAYMENT_REQUESTED, function (string $body) use ($payments) {
            $data = json_decode($body, true);
            $orderId = $data['order_id'] ?? null;
            if (! $orderId) {
                return;
            }
            $lastErr = null;
            for ($attempt = 0; $attempt < 3; $attempt++) {
                if ($attempt > 0) {
                    usleep((int) ((2 ** $attempt) * 100_000 + random_int(0, 100_000)));
                }
                try {
                    $payments->processPaymentRequest($orderId);
                    return;
                } catch (\Throwable $e) {
                    $lastErr = $e;
                }
            }
            if ($lastErr) {
                throw $lastErr; // nack (no requeue) so a poison message does not hot-loop
            }
        });

        return self::SUCCESS;
    }
}
