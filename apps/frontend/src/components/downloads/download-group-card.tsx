import { ChevronDown, Trash2 } from 'lucide-react';
import type { DownloadFile, DownloadGroup } from '@/api/download-schemas.ts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  Card,
  CardAction,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.tsx';
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

function formatFileCount(count: number): string {
  return count === 1 ? '1 file' : `${count} files`;
}

interface DeleteControlProps {
  group: DownloadGroup;
  /** Why deleting is not possible; `undefined` when it is. */
  blockedReason?: string;
  isDeleting: boolean;
  onDelete: () => void;
}

/** The "Delete" button, which asks for confirmation before anything is deleted. */
function DeleteControl({ group, blockedReason, isDeleting, onDelete }: DeleteControlProps) {
  if (isDeleting) {
    return (
      <Button variant="destructive" size="sm" disabled>
        <Trash2 aria-hidden data-icon="inline-start" />
        Deleting…
      </Button>
    );
  }
  if (blockedReason !== undefined) {
    // A disabled button gets no pointer or focus events, so the tooltip hangs on a wrapper, which
    // is focusable so that keyboard users can read the reason too.
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see the comment above */}
          <span tabIndex={0} className="inline-flex rounded-lg">
            <Button variant="destructive" size="sm" disabled aria-label={`Delete ${group.name}`}>
              <Trash2 aria-hidden data-icon="inline-start" />
              Delete
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{blockedReason}</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" aria-label={`Delete ${group.name}`}>
          <Trash2 aria-hidden data-icon="inline-start" />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-all">Delete {group.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Downloading will stop and its files will be deleted from disk. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Folder</dt>
          <dd className="break-all">{group.name}</dd>
          <dt className="text-muted-foreground">User</dt>
          <dd className="break-all">{group.username}</dd>
          <dt className="text-muted-foreground">Files</dt>
          <dd>{formatFileCount(group.files.length)}</dd>
          <dt className="text-muted-foreground">Size</dt>
          <dd>{formatBytes(group.size)}</dd>
        </dl>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete}>
            Delete permanently
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export interface DownloadGroupCardProps {
  group: DownloadGroup;
  /** Why deleting is not possible right now; `undefined` when it is. */
  deleteBlockedReason?: string;
  /** True while the group is being deleted; its buttons are disabled meanwhile. */
  isDeleting?: boolean;
  onDelete: (group: DownloadGroup) => void;
}

/** One folder from one user: its overall state and progress, and its files on demand. */
export function DownloadGroupCard({
  group,
  deleteBlockedReason,
  isDeleting = false,
  onDelete,
}: DownloadGroupCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 break-all">
          {group.name}
          <DownloadStatusBadge status={group.state} />
        </CardTitle>
        <CardDescription>
          {group.username} · {formatFileCount(group.files.length)}
        </CardDescription>
        <CardAction>
          <DeleteControl
            group={group}
            blockedReason={deleteBlockedReason}
            isDeleting={isDeleting}
            onDelete={() => onDelete(group)}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Progress value={group.percentComplete} aria-label={`Progress of ${group.name}`} />
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatProgress(group.bytesTransferred, group.size, group.percentComplete)}
          {group.speed > 0 && ` · ${formatSpeed(group.speed)}`}
        </p>
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="group w-full justify-between"
              disabled={isDeleting}>
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
