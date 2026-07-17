/// The HTTP data layer: config, the error mapper, the dio-based executor and the repository
/// implementations. Every failure mode collapses into a typed [AppError] in one place.
library;

import 'package:dio/dio.dart';

import '../core/core.dart';
import '../domain/models.dart';
import '../domain/repositories.dart';
import 'auth.dart';
import 'mappers.dart';

/// Everything the app knows about the backend: a base URL and timeouts. Nothing else.
class ApiConfig {
  final String baseUrl;
  final Duration requestTimeout;
  final Duration connectTimeout;
  const ApiConfig({
    required this.baseUrl,
    this.requestTimeout = const Duration(seconds: 15),
    this.connectTimeout = const Duration(seconds: 10),
  });
}

/// Maps an HTTP status (and optional error envelope) to a typed [AppError]. The one place
/// status codes become taxonomy values.
AppError mapHttpError(int status, Map? envelope, String? requestId, {int? retryAfter}) {
  final code = envelope?['code'] as String?;
  final rid = requestId ?? envelope?['request_id'] as String?;
  final cause = code == null ? null : 'backend code=$code';
  switch (status) {
    case 401:
      return Unauthorized(requestId: rid, cause: cause);
    case 403:
      return Forbidden(requestId: rid, cause: cause);
    case 404:
    case 409:
    case 410:
      return Conflict(backendCode: code, requestId: rid, cause: cause);
    case 400:
    case 422:
      return Validation(requestId: rid, cause: cause);
    case 429:
      return RateLimited(retryAfterSeconds: retryAfter, requestId: rid, cause: cause);
    default:
      if (status >= 500 && status < 600) {
        return ServerError(httpStatus: status, requestId: rid, cause: cause);
      }
      return UnknownError(requestId: rid, cause: cause ?? 'unexpected status $status');
  }
}

/// Builds the configured dio client. The [baseUrl] is the only backend knowledge injected.
Dio buildDio(ApiConfig config) {
  final base = config.baseUrl.endsWith('/') ? config.baseUrl : '${config.baseUrl}/';
  return Dio(BaseOptions(
    baseUrl: base,
    connectTimeout: config.connectTimeout,
    receiveTimeout: config.requestTimeout,
    validateStatus: (_) => true, // the executor inspects status itself
  ));
}

/// Runs one request and collapses every outcome into an [Outcome]: a 2xx body is parsed
/// (parse failure → [MalformedResponse]); a non-2xx status goes to [mapHttpError]; a
/// timeout becomes [TimeoutError]; any other transport failure becomes [NetworkUnavailable].
class ApiExecutor {
  final Dio _dio;
  final Logger _logger;
  final SessionManager? session;
  ApiExecutor(this._dio, {this._logger = const NoopLogger(), this.session});

  Future<Outcome<T>> execute<T>({
    required String method,
    required String path,
    required String event,
    Map<String, dynamic>? query,
    Object? body,
    String? idempotencyKey,
    required T Function(dynamic json) parse,
  }) async {
    Future<Response<dynamic>> send() {
      final headers = <String, dynamic>{};
      if (idempotencyKey != null) headers['Idempotency-Key'] = idempotencyKey;
      final token = session?.accessToken();
      if (token != null) headers['Authorization'] = 'Bearer $token';
      return _dio.request(path, data: body, queryParameters: query,
          options: Options(method: method, headers: headers.isEmpty ? null : headers));
    }

    try {
      var response = await send();
      // Access token expired: refresh (with rotation) and retry once. A failed refresh signs
      // the session out and the 401 flows on as Unauthorized.
      if (response.statusCode == 401 && session != null && await session!.refresh()) {
        response = await send();
      }
      final requestId = response.headers.value('X-Request-Id');
      final status = response.statusCode ?? 0;
      if (status >= 200 && status < 300) {
        try {
          final value = parse(response.data);
          _logger.log(LogLevel.info, event, requestId: requestId);
          return Success(value);
        } on MappingException catch (e) {
          return _fail(event, MalformedResponse(requestId: requestId, cause: e.message));
        } catch (e) {
          return _fail(event, MalformedResponse(requestId: requestId, cause: 'parse: $e'));
        }
      }
      final data = response.data;
      final envelope = (data is Map && data['error'] is Map) ? data['error'] as Map : null;
      final retryAfter = int.tryParse(response.headers.value('Retry-After') ?? '');
      return _fail(event, mapHttpError(status, envelope, requestId, retryAfter: retryAfter));
    } on DioException catch (e) {
      final isTimeout = e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout;
      return _fail(event, isTimeout ? TimeoutError(cause: 'request timeout') : NetworkUnavailable(cause: '${e.type}'));
    }
  }

  Outcome<T> _fail<T>(String event, AppError error) {
    _logger.log(LogLevel.error, event, requestId: error.requestId, errorCode: error.code);
    return Failure(error);
  }
}

class HttpEventRepository implements EventRepository {
  final ApiExecutor _api;
  HttpEventRepository(this._api);

  @override
  Future<Outcome<EventPage>> listEvents({String? cursor, int? limit}) {
    final query = <String, dynamic>{};
    if (cursor != null) query['cursor'] = cursor;
    if (limit != null) query['limit'] = limit;
    return _api.execute(
      method: 'GET',
      path: 'events',
      event: 'events.list',
      query: query,
      parse: eventPageFromJson,
    );
  }

  @override
  Future<Outcome<EventDetail>> getEvent(String id) =>
      _api.execute(method: 'GET', path: 'events/$id', event: 'events.detail', parse: eventDetailFromJson);
}

class HttpQueueRepository implements QueueRepository {
  final ApiExecutor _api;
  HttpQueueRepository(this._api);

  @override
  Future<Outcome<QueueToken>> join(String eventId) =>
      _api.execute(method: 'POST', path: 'events/$eventId/queue', event: 'queue.join', parse: queueTokenFromJson);

  @override
  Future<Outcome<QueueToken>> status(String eventId) => _api.execute(
      method: 'GET', path: 'events/$eventId/queue/status', event: 'queue.status', parse: queueTokenFromJson);
}

class HttpReservationRepository implements ReservationRepository {
  final ApiExecutor _api;
  HttpReservationRepository(this._api);

  @override
  Future<Outcome<Reservation>> create(String sectorId, int quantity, String idempotencyKey) => _api.execute(
        method: 'POST',
        path: 'reservations',
        event: 'reservation.create',
        idempotencyKey: idempotencyKey,
        body: {'sector_id': sectorId, 'quantity': quantity},
        parse: reservationFromJson,
      );

  @override
  Future<Outcome<void>> release(String id) =>
      _api.execute(method: 'DELETE', path: 'reservations/$id', event: 'reservation.release', parse: (_) {});
}

class HttpOrderRepository implements OrderRepository {
  final ApiExecutor _api;
  HttpOrderRepository(this._api);

  @override
  Future<Outcome<Order>> create(String reservationId, String idempotencyKey) => _api.execute(
        method: 'POST',
        path: 'orders',
        event: 'order.create',
        idempotencyKey: idempotencyKey,
        body: {'reservation_id': reservationId},
        parse: orderFromJson,
      );

  @override
  Future<Outcome<Order>> get(String id) =>
      _api.execute(method: 'GET', path: 'orders/$id', event: 'order.get', parse: orderFromJson);
}

/// Talks to `/auth/login` and `/auth/refresh`. Uses a plain executor with no session: login
/// has no token yet, and refresh must not carry the expired access token or it would recurse.
class HttpAuthRepository implements AuthRepository {
  final ApiExecutor _api;
  HttpAuthRepository(this._api);

  @override
  Future<Outcome<TokenPair>> login(String email, String password) => _api.execute(
        method: 'POST',
        path: 'auth/login',
        event: 'auth.login',
        body: {'email': email, 'password': password},
        parse: tokenPairFromJson,
      );

  @override
  Future<Outcome<TokenPair>> refresh(String refreshToken) => _api.execute(
        method: 'POST',
        path: 'auth/refresh',
        event: 'auth.refresh',
        body: {'refresh_token': refreshToken},
        parse: tokenPairFromJson,
      );
}
