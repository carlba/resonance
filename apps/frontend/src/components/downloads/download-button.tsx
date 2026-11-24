import { Download, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import type { DownloadRequest } from '@/api/download-schemas.ts';
import { Button } from '@/components/ui/button.tsx';
import { canStartDownload } from '@/downloads/download-status.ts';
import { useDownloadActions } from '@/downloads/download-actions.ts';
import { cn } from '@/lib/utils.ts';
import { DownloadStatusBadge } from './download-status-badge.tsx';

export interface DownloadControlProps {
  /** The files of the result to download, as the search returned them. */
  request: DownloadRequest;
}

/** The download status of a result's files, as a badge; nothing when slskd has no transfer. */
export function ResultDownloadBadge({ request }: DownloadControlProps) {
  const { getStatus } = useDownloadActions();
  const status = getStatus(
    request.username,
    request.files.map(file => file.path)
  );
  return <DownloadStatusBadge status={status} />;
}

export interface DownloadButtonProps extends DownloadControlProps {
  className?: string;
}

/**
 * Starts the download of a result's files. It is disabled while the request is on its way and
 * while slskd is downloading the files or has downloaded them; a failed download or a failed
 * request leaves it enabled, and clicking it again enqueues the files again.
 */
export function DownloadButton({ request, className }: DownloadButtonProps) {
  const { getStatus, start } = useDownloadActions();
  const [isStarting, setIsStarting] = useState(false);
  const status = getStatus(
    request.username,
    request.files.map(file => file.path)
  );

  const handleClick = async (): Promise<void> => {
    setIsStarting(true);
    try {
      await start(request);
    } finally {
      setIsStarting(false);
    }
  };

  const Icon = isStarting ? LoaderCircle : Download;
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      disabled={isStarting || !canStartDownload(status)}
      onClick={() => void handleClick()}>
      <Icon aria-hidden data-icon="inline-start" className={cn(isStarting && 'animate-spin')} />
      Download
    </Button>
  );
}
