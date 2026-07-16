/// Framework-free core: the result type, the typed error taxonomy, the UI state model and
/// the logging facade. No Flutter imports here — this layer is pure Dart and unit-testable.
library;

/// The recovery affordance a UI offers for an error. Mirrors `/shared/copy/errors.json`.
enum Recovery { retry, back, refresh, signIn, wait, none }

/// The result of an operation that can fail in a modelled way. Use cases return this and
/// never throw across a layer boundary.
sealed class Outcome<T> {
  const Outcome();
}

/// The operation succeeded with [value].
class Success<T> extends Outcome<T> {
  final T value;
  const Success(this.value);
}

/// The operation failed with a typed [error].
class Failure<T> extends Outcome<T> {
  final AppError error;
  const Failure(this.error);
}

/// The typed error taxonomy. Every failure is one of these; [code] matches a `taxonomy`
/// key in `/shared/copy/errors.json`. [requestId] is the response `X-Request-Id` when there
/// was a response. [cause] is a short, non-sensitive detail for logs — never PII.
sealed class AppError {
  String get code;
  String? get requestId;
  String? get cause;
  Recovery get recovery;
  const AppError();
}

class NetworkUnavailable extends AppError {
  @override final String? requestId;
  @override final String? cause;
  const NetworkUnavailable({this.requestId, this.cause});
  @override String get code => 'NetworkUnavailable';
  @override Recovery get recovery => Recovery.retry;
}

class TimeoutError extends AppError {
  @override final String? requestId;
  @override final String? cause;
  const TimeoutError({this.requestId, this.cause});
  @override String get code => 'Timeout';
  @override Recovery get recovery => Recovery.retry;
}

class Unauthorized extends AppError {
  @override final String? requestId;
  @override final String? cause;
  const Unauthorized({this.requestId, this.cause});
  @override String get code => 'Unauthorized';
  @override Recovery get recovery => Recovery.signIn;
}

class Forbidden extends AppError {
  @override final String? requestId;
  @override final String? cause;
  const Forbidden({this.requestId, this.cause});
  @override String get code => 'Forbidden';
  @override Recovery get recovery => Recovery.back;
}

class RateLimited extends AppError {
  final int? retryAfterSeconds;
  @override final String? requestId;
  @override final String? cause;
  const RateLimited({this.retryAfterSeconds, this.requestId, this.cause});
  @override String get code => 'RateLimited';
  @override Recovery get recovery => Recovery.wait;
}

class Conflict extends AppError {
  final String? backendCode;
  @override final String? requestId;
  @override final String? cause;
  const Conflict({this.backendCode, this.requestId, this.cause});
  @override String get code => 'Conflict';
  @override Recovery get recovery => Recovery.refresh;
}

class Validation extends AppError {
  @override final String? requestId;
  @override final String? cause;
  const Validation({this.requestId, this.cause});
  @override String get code => 'Validation';
  @override Recovery get recovery => Recovery.back;
}

class ServerError extends AppError {
  final int? httpStatus;
  @override final String? requestId;
  @override final String? cause;
  const ServerError({this.httpStatus, this.requestId, this.cause});
  @override String get code => 'ServerError';
  @override Recovery get recovery => Recovery.retry;
}

/// The zero-trust case: a response that could not be validated against the contract.
class MalformedResponse extends AppError {
  @override final String? requestId;
  @override final String? cause;
  const MalformedResponse({this.requestId, this.cause});
  @override String get code => 'MalformedResponse';
  @override Recovery get recovery => Recovery.retry;
}

class PaymentDeclined extends AppError {
  @override final String? requestId;
  @override final String? cause;
  const PaymentDeclined({this.requestId, this.cause});
  @override String get code => 'PaymentDeclined';
  @override Recovery get recovery => Recovery.back;
}

/// The most important error: the payment outcome is genuinely unknown. The app must not
/// assume failure and must not charge again; it reconciles by polling.
class PaymentUnknown extends AppError {
  @override final String? requestId;
  @override final String? cause;
  const PaymentUnknown({this.requestId, this.cause});
  @override String get code => 'PaymentUnknown';
  @override Recovery get recovery => Recovery.wait;
}

class UnknownError extends AppError {
  @override final String? requestId;
  @override final String? cause;
  const UnknownError({this.requestId, this.cause});
  @override String get code => 'Unknown';
  @override Recovery get recovery => Recovery.retry;
}

/// The explicit state of one async operation. The UI is a pure function of this.
sealed class UiState<T> {
  const UiState();
}

class UiIdle<T> extends UiState<T> { const UiIdle(); }
class UiLoading<T> extends UiState<T> { const UiLoading(); }
class UiRetrying<T> extends UiState<T> { const UiRetrying(); }
class UiEmpty<T> extends UiState<T> { const UiEmpty(); }

class UiSuccess<T> extends UiState<T> {
  final T data;
  const UiSuccess(this.data);
}

class UiError<T> extends UiState<T> {
  final AppError error;
  const UiError(this.error);
}

class UiTimedOut<T> extends UiState<T> {
  final TimeoutError error;
  const UiTimedOut(this.error);
}

/// Maps a typed error to the UI state that represents it: a timeout is distinct from a
/// generic error, mirroring the KMP `toUiState`.
UiState<T> errorToUiState<T>(AppError error) =>
    error is TimeoutError ? UiTimedOut<T>(error) : UiError<T>(error);

/// Severity for [Logger].
enum LogLevel { debug, info, warn, error }

/// Structured, PII-safe logging facade. Never log tokens, card data or auth headers.
abstract class Logger {
  void log(
    LogLevel level,
    String event, {
    String? screen,
    String? requestId,
    String? errorCode,
    int? latencyMs,
    Map<String, String> extra,
  });
}

/// A logger that drops everything. The default until a real one is installed.
class NoopLogger implements Logger {
  const NoopLogger();
  @override
  void log(LogLevel level, String event,
      {String? screen,
      String? requestId,
      String? errorCode,
      int? latencyMs,
      Map<String, String> extra = const {}}) {}
}
