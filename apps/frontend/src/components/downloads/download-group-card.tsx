import { ChevronDown } from 'lucide-react';
import type { DownloadFile, DownloadGroup } from '@/api/download-schemas.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible.tsx';
import { Progress } from '@/components/ui/progress.tsx';
import { formatBytes, formatSpeed } from '@/lib/format.ts';
import { DownloadStatusBadge } from './download-status-badge.tsx';

const FILE_STATE_LABELS = {
  queued: 'Queued',
  downloading: 'Downloading',
  succeeded: 'Done',
  failed: 'Failed',
} as const satisfies Record<DownloadFile['state'], string>;

function formatPercent(percent: number): string {
  return `${Math.floor(percent)}%`;
}

function formatProgress(bytesTransferred: number, size: number, percent: number): string {
  return `${formatPercent(percent)} · ${formatBytes(bytesTransferred)} / ${formatBytes(size)}`;
}

function FileRow({ file }: { file: DownloadFile }) {
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm" title={file.filename}>
          {file.filename}
        </span>
        <Badge variant={file.state === 'failed' ? 'destructive' : 'outline'}>
          {FILE_STATE_LABELS[file.state]}
        </Badge>
      </div>
      <Progress value={file.percentComplete} aria-label={`Progress of ${file.filename}`} />
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatProgress(file.bytesTransferred, file.size, file.percentComplete)}
        {file.state === 'downloading' && file.speed > 0 && ` · ${formatSpeed(file.speed)}`}
      </span>
    </li>
  );
}

export interface DownloadGroupCardProps {
  group: DownloadGroup;
}

/** One folder from one user: its overall state and progress, and its files on demand. */
export function DownloadGroupCard({ group }: DownloadGroupCardProps) {
  const fileLabel = group.files.length === 1 ? '1 file' : `${group.files.length} files`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 break-all">
          {group.name}
          <DownloadStatusBadge status={group.state} />
        </CardTitle>
        <CardDescription>
          {group.username} · {fileLabel}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Progress value={group.percentComplete} aria-label={`Progress of ${group.name}`} />
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatProgress(group.bytesTransferred, group.size, group.percentComplete)}
          {group.speed > 0 && ` · ${formatSpeed(group.speed)}`}
        </p>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group w-full justify-between">
              Files
              <ChevronDown
                aria-hidden
                className="transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="divide-y">
              {group.files.map(file => (
                <FileRow key={file.path} file={file} />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
