import { useEffect, useState } from 'react';
import { fetchDownloadCapabilities } from '@/api/download-api.ts';
import type { DownloadCapabilities } from '@/api/download-schemas.ts';
import type { DeleteAvailabilityInput } from './delete-availability.ts';

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Asks the backend once, when the component mounts, whether downloads can be deleted. slskd's
 * settings only change with a restart of slskd, so there is nothing to poll.
 */
export function useDownloadCapabilities(): DeleteAvailabilityInput {
  const [capabilities, setCapabilities] = useState<DownloadCapabilities>();
  const [error, setError] = useState<Error>();

  useEffect(() => {
    const controller = new AbortController();
    fetchDownloadCapabilities({ signal: controller.signal }).then(setCapabilities, failure => {
      if (!isAbort(failure)) {
        setError(failure instanceof Error ? failure : new Error(String(failure)));
      }
    });
    return () => controller.abort();
  }, []);

  return { capabilities, error };
}
