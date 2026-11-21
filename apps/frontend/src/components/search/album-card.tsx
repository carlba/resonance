import { ChevronDown } from 'lucide-react';
import type { AlbumResult, TrackResult } from '@/api/search-schemas.ts';
import { Button } from '@/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible.tsx';
import { formatAudioQuality, formatBytes, formatDuration } from '@/lib/format.ts';
import { getResultFacts } from '@/search/result-filters.ts';
import { Availability } from './availability.tsx';
import { FormatBadge } from './format-badge.tsx';

export interface AlbumCardProps {
  album: AlbumResult;
}

function AlbumTrackList({ tracks }: { tracks: readonly TrackResult[] }) {
  return (
    <ol className="divide-y text-sm">
      {tracks.map(track => (
        <li
          key={track.path}
          className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:gap-3">
          <span className="min-w-0 flex-1 break-all">{track.filename}</span>
          <span className="flex shrink-0 gap-3 text-muted-foreground">
            <span>{formatAudioQuality(track)}</span>
            <span>{formatDuration(track.durationSeconds)}</span>
            <span>{formatBytes(track.size)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** One album with its quality and availability, and its tracks folded away underneath. */
export function AlbumCard({ album }: AlbumCardProps) {
  const title = album.year === undefined ? album.album : `${album.album} (${album.year})`;
  const trackLabel = album.trackCount === 1 ? '1 track' : `${album.trackCount} tracks`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="break-words">{title}</span>
          <FormatBadge extension={album.dominantExtension} />
        </CardTitle>
        <CardDescription>{album.artist ?? 'Unknown artist'}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="break-all text-muted-foreground" title={album.directory}>
          {album.directory}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">User</dt>
            <dd className="break-all">{album.username}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tracks</dt>
            <dd>{trackLabel}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Size · Duration</dt>
            <dd>
              {formatBytes(album.totalSize)} · {formatDuration(album.totalDurationSeconds)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Quality</dt>
            <dd>{formatAudioQuality(getResultFacts(album))}</dd>
          </div>
        </dl>
        <Availability availability={album.availability} />
      </CardContent>
      <CardFooter className="flex-col items-stretch">
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group w-full justify-between">
              Show files
              <ChevronDown
                aria-hidden
                className="transition-transform group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <AlbumTrackList tracks={album.tracks} />
          </CollapsibleContent>
        </Collapsible>
      </CardFooter>
    </Card>
  );
}
