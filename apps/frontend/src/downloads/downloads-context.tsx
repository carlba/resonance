import { useCallback, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { startDownload } from '@/api/download-api.ts';
import { formatBytes } from '@/lib/format.ts';
import { buildDownloadIndex, getResultDownloadStatus } from './download-status.ts';
import { DownloadsContext, type DownloadsContextValue } from './download-actions.ts';
import { useDownloads } from './use-downloads.ts';

function formatFileCount(count: number): string {
  return count === 1 ? '1 file' : `${count} files`;
}

/**
 * Polls the downloads while mounted and offers the card statuses and the download action to the
 * result cards below it. It is mounted together with the results, so nothing is polled before a
 * search has finished.
 */
export function DownloadsProvider({ children }: { children: ReactNode }) {
  const { groups, refresh } = useDownloads();
  const downloadIndex = useMemo(() => buildDownloadIndex(groups ?? []), [groups]);

  const getStatus = useCallback<DownloadsContextValue['getStatus']>(
    (username, paths) => getResultDownloadStatus(downloadIndex, username, paths),
    [downloadIndex]
  );

  const start = useCallback<DownloadsContextValue['start']>(
    async request => {
      try {
        const started = await startDownload(request);
        toast.success('Download started', {
          description: (
            <span>
              {formatFileCount(started.fileCount)} · {formatBytes(started.totalSize)} ·{' '}
              <Link to="/downloads" className="underline underline-offset-4">
                View downloads
              </Link>
            </span>
          ),
        });
        // Waiting for the read keeps the button disabled until its card shows the new status.
        await refresh();
      } catch (error) {
        toast.error('Could not start the download', {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [refresh]
  );

  const value = useMemo(() => ({ getStatus, start }), [getStatus, start]);

  return <DownloadsContext value={value}>{children}</DownloadsContext>;
}
