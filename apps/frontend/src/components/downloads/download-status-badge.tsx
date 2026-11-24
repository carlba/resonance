import { CircleCheck, CircleX, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge.tsx';
import type { DownloadStatus } from '@/downloads/download-status.ts';

const STATUS_BADGES = {
  downloading: { label: 'Downloading', variant: 'secondary', Icon: Download },
  succeeded: { label: 'Downloaded', variant: 'default', Icon: CircleCheck },
  failed: { label: 'Failed', variant: 'destructive', Icon: CircleX },
} as const satisfies Record<DownloadStatus, unknown>;

export interface DownloadStatusBadgeProps {
  /** `undefined` shows nothing, since slskd has no transfer for the files. */
  status: DownloadStatus | undefined;
}

export function DownloadStatusBadge({ status }: DownloadStatusBadgeProps) {
  if (status === undefined) {
    return null;
  }
  const { label, variant, Icon } = STATUS_BADGES[status];
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
