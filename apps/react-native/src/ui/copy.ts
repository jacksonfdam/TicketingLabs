// User-facing copy, mirrored from `/shared/copy/errors.json`, keyed by the taxonomy code.

import { AppError, ErrorCode, Recovery } from '../core/core';

export interface ErrorCopy {
  title: string;
  message: string;
  actionLabel: string | null;
}

const BY_CODE: Record<ErrorCode, { title: string; message: string }> = {
  NetworkUnavailable: { title: 'No connection', message: 'You appear to be offline. Check your connection and try again.' },
  Timeout: { title: 'Taking too long', message: 'The server did not answer in time. It may still be working.' },
  Unauthorized: { title: 'Signed out', message: 'Your session has ended. Sign in again to continue.' },
  Forbidden: { title: 'Not allowed', message: 'You do not have access to this.' },
  RateLimited: { title: 'Slow down', message: 'Too many requests. Wait a moment before trying again.' },
  Conflict: { title: 'No longer available', message: 'That is gone or has changed. Refresh and pick again.' },
  Validation: { title: 'Check your details', message: 'Some of what you entered was not accepted.' },
  ServerError: { title: 'Something broke', message: 'The server had a problem. This is not your fault.' },
  MalformedResponse: { title: 'Unexpected response', message: 'We received something we could not read and stopped to be safe.' },
  PaymentDeclined: { title: 'Payment declined', message: 'Your payment was declined. Try a different method.' },
  PaymentUnknown: { title: 'Confirming payment', message: 'We are checking with the payment provider. Do not pay again.' },
  Unknown: { title: 'Something went wrong', message: 'An unexpected error occurred.' },
};

const ACTION_LABEL: Record<Recovery, string | null> = {
  retry: 'Try again',
  back: 'Go back',
  refresh: 'Refresh',
  signIn: 'Sign in',
  wait: 'Keep waiting',
  none: null,
};

export function copyFor(error: AppError): ErrorCopy {
  const { title, message } = BY_CODE[error.code] ?? BY_CODE.Unknown;
  return { title, message, actionLabel: ACTION_LABEL[error.recovery] };
}
