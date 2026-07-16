<?php

declare(strict_types=1);

namespace App\Command;

use App\Adapter\Broker;
use App\UseCase\PaymentService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

use const App\UseCase\TOPIC_PAYMENT_REQUESTED;

// The async payment worker: a long-running process (its own container) that consumes
// payment.requested and settles each via the gateway, with retry + backoff.
#[AsCommand(name: 'app:payments:work', description: 'Consume payment.requested and charge the gateway')]
final class ConsumePaymentsCommand extends Command
{
    public function __construct(private Broker $broker, private PaymentService $payments)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $output->writeln('payment worker started');
        $this->broker->consume(TOPIC_PAYMENT_REQUESTED, function (string $body) {
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
                    $this->payments->processPaymentRequest($orderId);
                    return;
                } catch (\Throwable $e) {
                    $lastErr = $e;
                }
            }
            if ($lastErr) {
                throw $lastErr; // nack without requeue so a poison message does not hot-loop
            }
        });

        return Command::SUCCESS;
    }
}
