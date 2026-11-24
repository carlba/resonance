import { createContext, use } from 'react';
import type { DownloadRequest } from '@/api/download-schemas.ts';
import type { DownloadStatus } from './download-status.ts';

export interface DownloadsContextValue {
  /** The status of a result's files in slskd; `undefined` when slskd has none of them. */
  getStatus: (username: string, paths: readonly string[]) => DownloadStatus | undefined;
  /**
   * Starts a download and tells the user how it went with a toast. Never rejects: the caller only
   * needs to know when the request has finished.
   */
  start: (request: DownloadRequest) => Promise<void>;
}

export const DownloadsContext = createContext<DownloadsContextValue | undefined>(undefined);

export function useDownloadActions(): DownloadsContextValue {
  const value = use(DownloadsContext);
  if (value === undefined) {
    throw new Error('useDownloadActions must be used inside a DownloadsProvider');
  }
  return value;
}
