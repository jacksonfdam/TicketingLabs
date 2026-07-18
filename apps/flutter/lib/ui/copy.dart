/// User-facing copy, mirrored from `/shared/copy/errors.json`, keyed by the taxonomy code.
library;

import '../core/core.dart';

class ErrorCopy {
  final String title;
  final String message;
  final String? actionLabel;
  const ErrorCopy(this.title, this.message, this.actionLabel);
}

const _byCode = <String, (String, String)>{
  'NetworkUnavailable': ('No connection', 'You appear to be offline. Check your connection and try again.'),
  'Timeout': ('Taking too long', 'The server did not answer in time. It may still be working.'),
  'Unauthorized': ('Signed out', 'Your session has ended. Sign in again to continue.'),
  'Forbidden': ('Not allowed', 'You do not have access to this.'),
  'RateLimited': ('Slow down', 'Too many requests. Wait a moment before trying again.'),
  'Conflict': ('No longer available', 'That is gone or has changed. Refresh and pick again.'),
  'Validation': ('Check your details', 'Some of what you entered was not accepted.'),
  'ServerError': ('Something broke', 'The server had a problem. This is not your fault.'),
  'MalformedResponse': ('Unexpected response', 'We received something we could not read and stopped to be safe.'),
  'PaymentDeclined': ('Payment declined', 'Your payment was declined. Try a different method.'),
  'PaymentUnknown': ('Confirming payment', 'We are checking with the payment provider. Do not pay again.'),
  'Unknown': ('Something went wrong', 'An unexpected error occurred.'),
};

ErrorCopy copyFor(AppError error) {
  final entry = _byCode[error.code] ?? _byCode['Unknown']!;
  return ErrorCopy(entry.$1, entry.$2, _actionLabel(error.recovery));
}

String? _actionLabel(Recovery recovery) => switch (recovery) {
      Recovery.retry => 'Try again',
      Recovery.back => 'Go back',
      Recovery.refresh => 'Refresh',
      Recovery.signIn => 'Sign in',
      Recovery.wait => 'Keep waiting',
      Recovery.none => null,
    };
