/// Framework-free use cases: the business logic, unit-testable without Flutter.
library;

import '../core/core.dart';
import 'models.dart';
import 'repositories.dart';

/// Allowed reservation quantity, per the contract.
const reservationQuantityRange = (min: 1, max: 8);

/// Creates a hold with input hardening and idempotency.
///
/// The quantity is validated before anything is sent, so a bad value becomes a typed
/// [Validation] rather than a wasted round trip. The [idempotencyKey] is caller-owned and
/// must be stable across retries of the same intent, so a double tap makes one reservation.
class CreateReservationUseCase {
  final ReservationRepository _reservations;
  const CreateReservationUseCase(this._reservations);

  Future<Outcome<Reservation>> call(String sectorId, int quantity, String idempotencyKey) {
    if (quantity < reservationQuantityRange.min || quantity > reservationQuantityRange.max) {
      return Future.value(Failure(Validation(cause: 'quantity $quantity out of range')));
    }
    return _reservations.create(sectorId, quantity, idempotencyKey);
  }
}

/// Creates an order, mapping an unresolved create (timeout or network drop) to
/// [PaymentUnknown] rather than a false failure. Reporting failure here is how you
/// double-charge someone.
class CreateOrderUseCase {
  final OrderRepository _orders;
  const CreateOrderUseCase(this._orders);

  Future<Outcome<Order>> call(String reservationId, String idempotencyKey) async {
    final result = await _orders.create(reservationId, idempotencyKey);
    if (result is Failure<Order>) {
      final e = result.error;
      if (e is TimeoutError || e is NetworkUnavailable) {
        return Failure(PaymentUnknown(
          requestId: e.requestId,
          cause: 'order create unresolved (${e.code}); reconcile by retrying with the same key or polling',
        ));
      }
    }
    return result;
  }
}

/// The decision for one order-status poll.
sealed class Reconciliation {
  const Reconciliation();
}

class Resolved extends Reconciliation {
  final Order order;
  const Resolved(this.order);
}

class Continue extends Reconciliation {
  const Continue();
}

class Abort extends Reconciliation {
  final AppError error;
  const Abort(this.error);
}

/// Turns one order-status poll into a decision, with no timers. A settled order resolves; a
/// still-pending order or a transient failure continues; a non-transient error aborts. Kept
/// pure so the "when do we stop polling" logic is exhaustively testable.
Reconciliation reconcileOrderPoll(Outcome<Order> pollResult) {
  switch (pollResult) {
    case Success<Order>(value: final order):
      return order.isSettled ? Resolved(order) : const Continue();
    case Failure<Order>(error: final error):
      if (error is PaymentUnknown || error is TimeoutError || error is NetworkUnavailable || error is RateLimited) {
        return const Continue();
      }
      return Abort(error);
  }
}
