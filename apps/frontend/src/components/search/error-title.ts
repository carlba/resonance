import { SearchApiError } from '@/api/search-api-error.ts';

const HTTP_BAD_REQUEST = 400;
const HTTP_BAD_GATEWAY = 502;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_GATEWAY_TIMEOUT = 504;

/** A heading that says what failed, since the backend hides the details of server errors. */
export function getErrorTitle(error: Error): string {
  if (!(error instanceof SearchApiError)) {
    return 'Something went wrong';
  }
  switch (error.kind) {
    case 'network':
      return 'Could not reach the backend';
    case 'timeout':
      return 'The search timed out';
    case 'invalid-response':
      return 'The backend sent an unexpected response';
    case 'http':
      break;
  }
  switch (error.statusCode) {
    case HTTP_BAD_REQUEST:
      return 'The search was rejected';
    case HTTP_BAD_GATEWAY:
    case HTTP_SERVICE_UNAVAILABLE:
      return 'The search provider is unavailable';
    case HTTP_GATEWAY_TIMEOUT:
      return 'The search timed out';
    default:
      return 'The search failed';
  }
}
