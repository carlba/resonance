import { CircleAlert, RotateCw, SearchX } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Skeleton } from '@/components/ui/skeleton.tsx';
import type { SearchMode } from '@/search/search-state.ts';
import { getErrorTitle } from './error-title.ts';

const SKELETON_ROWS = 4;
export function LoadingState() {
  return (
    <output aria-label="Searching" className="flex flex-col gap-3">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
      <span className="sr-only">Searching…</span>
    </output>
  );
}

export interface EmptyStateProps {
  mode: SearchMode;
  searchText: string;
}

export function EmptyState({ mode, searchText }: EmptyStateProps) {
  return (
    <output className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
      <SearchX aria-hidden className="size-8" />
      <p>
        No {mode} found for “{searchText}”
      </p>
    </output>
  );
}

export interface ErrorStateProps {
  error: Error;
  onRetry: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>{getErrorTitle(error)}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <p className="break-words">{error.message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden data-icon="inline-start" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
