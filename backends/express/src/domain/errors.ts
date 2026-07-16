// Domain errors: a stable machine code and a safe, public message. Codes match every
// other backend so the contract's error codes are identical across languages.

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly publicMessage: string,
  ) {
    super(`${code}: ${publicMessage}`);
    this.name = 'DomainError';
  }
}

const mk = (code: string, msg: string) => new DomainError(code, msg);

export const Errors = {
  BadRequest: mk('bad_request', 'The request was malformed'),
  InvalidCredentials: mk('invalid_credentials', 'Email or password is incorrect'),
  InvalidToken: mk('invalid_token', 'Token is missing, expired, or invalid'),
  Forbidden: mk('forbidden', 'You are not allowed to do that'),
  NotFound: mk('not_found', 'Resource not found'),
  Validation: mk('validation_error', 'The request failed validation'),
  NotAdmitted: mk('not_admitted', 'You need an admitted queue token for this event'),
  InventoryExhausted: mk('inventory_exhausted', 'Not enough inventory available'),
  ReservationState: mk('reservation_state', 'Reservation is not in a state that allows this'),
  Conflict: mk('conflict', 'The request conflicts with the current state'),
  RateLimited: mk('rate_limited', 'Too many requests'),
  LockUnavailable: mk('lock_unavailable', 'The resource is busy, please retry'),
  Internal: mk('internal_error', 'Something went wrong on our end'),
} as const;
