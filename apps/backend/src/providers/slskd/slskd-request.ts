import { ApiError } from '@carlba/core';
import { HttpStatus } from '@nestjs/common';
import {
  HttpClientError,
  HttpParseError,
  HttpResponseError,
  HttpTimeoutError,
  type HttpResponse,
} from '@nestjs/http-client';
import type { z } from 'zod';

// Error handling shared by every provider that talks to slskd. `description` identifies the call in
// the messages, e.g. `operation=poll searchId=...`, since the global exception filter only sees
// the error and not the code path that led to it.

const UNAUTHORIZED_STATUS_CODES = new Set<number>([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]);

/**
 * slskd answered 2xx, but with a body that doesn't match the schema. The `ZodError` is the cause,
 * so the log shows which fields were wrong.
 */
export class UnexpectedResponseError extends ApiError {
  constructor(description: string, zodError: z.ZodError) {
    super(`slskd returned an unexpected response: ${description}`, {
      statusCode: HttpStatus.BAD_GATEWAY,
      cause: zodError,
    });
    this.name = 'UnexpectedResponseError';
  }
}

export function parseResponse<T extends z.ZodType>(
  schema: T,
  data: unknown,
  description: string
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new UnexpectedResponseError(description, result.error);
  }
  return result.data;
}

/** The `code` of a network error's cause, such as `ECONNREFUSED`, when there is one. */
function getErrorCode(error: HttpClientError): string {
  const { cause } = error;
  if (typeof cause === 'object' && cause !== null && 'code' in cause) {
    return String(cause.code);
  }
  return 'unknown';
}

/** The reason for a failed slskd call, as the start of the `ApiError` message. */
function describeFailure(error: HttpClientError): string {
  if (error instanceof HttpResponseError) {
    return UNAUTHORIZED_STATUS_CODES.has(error.status)
      ? `slskd rejected the API key, check SLSKD_API_KEY (status=${error.status})`
      : `slskd returned an error (status=${error.status})`;
  }
  if (error instanceof HttpParseError) {
    return 'slskd returned an unexpected response';
  }
  if (error instanceof HttpTimeoutError) {
    return `slskd did not answer in time (timeoutMs=${error.timeoutMs})`;
  }
  return `slskd is unreachable (code=${getErrorCode(error)})`;
}

/**
 * Wraps a failed slskd call in an `ApiError`. A single call failing is a bad gateway (502); only
 * the search as a whole running out of time is a gateway timeout (504). Errors that don't come
 * from the HTTP client pass through.
 */
export function toApiError(error: unknown, description: string): unknown {
  if (error instanceof HttpClientError) {
    return new ApiError(`${describeFailure(error)}: ${description}`, {
      statusCode: HttpStatus.BAD_GATEWAY,
      cause: error,
    });
  }
  return error;
}

/** Whether `error` is a failed slskd call that slskd answered with the given status. */
export function hasSlskdStatus(error: unknown, status: number): boolean {
  return (
    error instanceof ApiError &&
    error.cause instanceof HttpResponseError &&
    error.cause.status === status
  );
}

/**
 * Sends one call to slskd for its side effect, without reading a body. A failed request throws an
 * `ApiError` that names the call.
 */
export async function sendSlskd(
  description: string,
  send: () => Promise<HttpResponse>
): Promise<HttpResponse> {
  try {
    return await send();
  } catch (error) {
    throw toApiError(error, description);
  }
}

/**
 * Sends one call to slskd and checks its body against `schema`. A failed request and a body that
 * doesn't match both throw an `ApiError` that names the call.
 */
export async function requestSlskd<T extends z.ZodType>(
  description: string,
  schema: T,
  send: () => Promise<HttpResponse>
): Promise<z.infer<T>> {
  const response = await sendSlskd(description, send);
  return parseResponse(schema, response.data, description);
}
