// Framework-free core: the result type, the typed error taxonomy and the UI state model.
// Plain TypeScript, no React — unit-testable in isolation.

/** What the user can do about an error. Mirrors `/shared/copy/errors.json`. */
export type Recovery = 'retry' | 'back' | 'refresh' | 'signIn' | 'wait' | 'none';

/** The taxonomy codes, identical to the `taxonomy` keys in `/shared/copy/errors.json`. */
export type ErrorCode =
  | 'NetworkUnavailable'
  | 'Timeout'
  | 'Unauthorized'
  | 'Forbidden'
  | 'RateLimited'
  | 'Conflict'
  | 'Validation'
  | 'ServerError'
  | 'MalformedResponse'
  | 'PaymentDeclined'
  | 'PaymentUnknown'
  | 'Unknown';

/**
 * A typed error. `code` selects the taxonomy bucket; `requestId` is the response
 * `X-Request-Id` when present; `cause` is a short, non-sensitive detail for logs.
 */
export interface AppError {
  readonly code: ErrorCode;
  readonly recovery: Recovery;
  readonly requestId?: string;
  readonly cause?: string;
  readonly backendCode?: string;
  readonly retryAfterSeconds?: number;
  readonly httpStatus?: number;
}

const DEFAULT_RECOVERY: Record<ErrorCode, Recovery> = {
  NetworkUnavailable: 'retry',
  Timeout: 'retry',
  Unauthorized: 'signIn',
  Forbidden: 'back',
  RateLimited: 'wait',
  Conflict: 'refresh',
  Validation: 'back',
  ServerError: 'retry',
  MalformedResponse: 'retry',
  PaymentDeclined: 'back',
  PaymentUnknown: 'wait',
  Unknown: 'retry',
};

/** Builds a typed error with the taxonomy's default recovery affordance. */
export function appError(code: ErrorCode, extra: Partial<Omit<AppError, 'code' | 'recovery'>> = {}): AppError {
  return { code, recovery: DEFAULT_RECOVERY[code], ...extra };
}

/** The result of an operation that can fail in a modelled way. */
export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError };

export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
export const fail = <T = never>(error: AppError): Outcome<T> => ({ ok: false, error });

/** The explicit state of one async operation. The UI is a pure function of this. */
export type UiState<T> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'retrying' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'success'; readonly data: T }
  | { readonly kind: 'error'; readonly error: AppError }
  | { readonly kind: 'timedOut'; readonly error: AppError };

/** Maps a typed error to its UI state: a timeout is distinct from a generic error. */
export function errorToUiState<T>(error: AppError): UiState<T> {
  return error.code === 'Timeout' ? { kind: 'timedOut', error } : { kind: 'error', error };
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured, PII-safe logging facade. Never log tokens, card data or auth headers. */
export interface Logger {
  log(level: LogLevel, event: string, fields?: { requestId?: string; errorCode?: string; latencyMs?: number; screen?: string }): void;
}

export const noopLogger: Logger = { log: () => {} };
