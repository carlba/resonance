import { CircleAlert, DownloadCloud } from 'lucide-react';
import { Link } from 'react-router';
import { AppHeader } from '@/components/app-header.tsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import { useDownloads } from '@/downloads/use-downloads.ts';
import { DownloadGroupCard } from './download-group-card.tsx';

const SKELETON_ROWS = 3;

function LoadingState() {
  return (
    <output aria-label="Loading downloads" className="flex flex-col gap-3">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-32 w-full" />
      ))}
      <span className="sr-only">Loading downloads…</span>
    </output>
  );
}

function EmptyState() {
  return (
    <output className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
      <DownloadCloud aria-hidden className="size-8" />
      <p>No downloads yet</p>
      <Link to="/" className="text-foreground underline underline-offset-4">
        Search for something to download
      </Link>
    </output>
  );
}

function ErrorState({ error }: { error: Error }) {
  return (
    <Alert variant="destructive" role="alert">
      <CircleAlert aria-hidden />
      <AlertTitle>Could not read the downloads</AlertTitle>
      <AlertDescription>{error.message} Trying again automatically.</AlertDescription>
    </Alert>
  );
}

/** Every slskd download, refreshed by polling for as long as the page is open. */
export function DownloadsPage() {
  const { groups, error, isLoading } = useDownloads();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-10">
      <AppHeader description="Follow what slskd is downloading." />
      {error !== undefined && <ErrorState error={error} />}
      {isLoading && <LoadingState />}
      {groups?.length === 0 && error === undefined && <EmptyState />}
      {groups !== undefined && groups.length > 0 && (
        <ul className="flex flex-col gap-3">
          {groups.map(group => (
            <li key={`${group.username}\n${group.directory}`}>
              <DownloadGroupCard group={group} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
