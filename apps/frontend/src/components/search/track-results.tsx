import type { TrackResult } from '@/api/search-schemas.ts';
import { Card, CardContent } from '@/components/ui/card.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table.tsx';
import { formatAudioQuality, formatBytes, formatDuration } from '@/lib/format.ts';
import { Availability } from './availability.tsx';
import { FormatBadge } from './format-badge.tsx';

export interface TrackResultsProps {
  tracks: readonly TrackResult[];
}

// A user shares a path once, so the pair identifies the track.
function getTrackKey(track: TrackResult): string {
  return `${track.username}\n${track.path}`;
}

function getFolder(track: TrackResult): string {
  return track.path.slice(0, track.path.length - track.filename.length).replace(/[\\/]$/, '');
}

function TrackTable({ tracks }: TrackResultsProps) {
  return (
    <Table aria-label="Tracks">
      <TableHeader>
        <TableRow>
          <TableHead>Track</TableHead>
          <TableHead>User</TableHead>
          <TableHead>Format</TableHead>
          <TableHead>Quality</TableHead>
          <TableHead className="text-right">Duration</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead>Availability</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tracks.map(track => (
          <TableRow key={getTrackKey(track)}>
            <TableCell className="max-w-md whitespace-normal">
              <div className="break-all font-medium">{track.filename}</div>
              <div className="break-all text-xs text-muted-foreground">{getFolder(track)}</div>
            </TableCell>
            <TableCell className="max-w-40 truncate" title={track.username}>
              {track.username}
            </TableCell>
            <TableCell>
              <FormatBadge extension={track.extension} />
            </TableCell>
            <TableCell>{formatAudioQuality(track)}</TableCell>
            <TableCell className="text-right">{formatDuration(track.durationSeconds)}</TableCell>
            <TableCell className="text-right">{formatBytes(track.size)}</TableCell>
            <TableCell>
              <Availability availability={track.availability} className="flex-nowrap" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TrackCards({ tracks }: TrackResultsProps) {
  return (
    <ul aria-label="Tracks" className="flex flex-col gap-3">
      {tracks.map(track => (
        <li key={getTrackKey(track)}>
          <Card size="sm">
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span className="break-all font-medium">{track.filename}</span>
                <FormatBadge extension={track.extension} />
              </div>
              <span className="break-all text-xs text-muted-foreground">{getFolder(track)}</span>
              <span className="break-all">{track.username}</span>
              <span className="text-muted-foreground">
                {formatAudioQuality(track)} · {formatDuration(track.durationSeconds)} ·{' '}
                {formatBytes(track.size)}
              </span>
              <Availability availability={track.availability} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** A table from the `md` breakpoint up, and stacked cards on smaller screens. */
export function TrackResults({ tracks }: TrackResultsProps) {
  return (
    <>
      <div className="hidden md:block">
        <TrackTable tracks={tracks} />
      </div>
      <div className="md:hidden">
        <TrackCards tracks={tracks} />
      </div>
    </>
  );
}
