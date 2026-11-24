import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDownloads } from '@/api/download-api.ts';
import type { DownloadGroup } from '@/api/download-schemas.ts';
import { DOWNLOADS_POLL_INTERVAL_MS } from './poll-interval.ts';

export interface DownloadsState {
  /** `undefined` until the first read finishes. */
  groups?: DownloadGroup[];
  /** Set when the latest read failed; the next poll clears it by succeeding. */
  error?: Error;
}

export interface UseDownloadsOptions {
  pollIntervalMs?: number;
}

export interface UseDownloadsResult extends DownloadsState {
  /** True until the first read finishes, either way. */
  isLoading: boolean;
  /** Reads the downloads right away, e.g. after starting one; resolves when that read is done. */
  refresh: () => Promise<void>;
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error(`Reading downloads failed: error=${String(error)}`);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Reads the downloads from the backend and keeps reading them every `pollIntervalMs` for as long
 * as the component that uses it is mounted. The next read is only scheduled once the previous one
 * has finished, so slow answers never pile up, and a failed read is simply retried by the next
 * one. The last groups are kept while a read fails, so a hiccup doesn't empty the screen.
 */
export function useDownloads({
  pollIntervalMs = DOWNLOADS_POLL_INTERVAL_MS,
}: UseDownloadsOptions = {}): UseDownloadsResult {
  const [state, setState] = useState<DownloadsState>({});
  const [isLoading, setIsLoading] = useState(true);
  // Only the newest read may update the state, so a slow poll can't overwrite a fresher refresh.
  const latestRead = useRef(0);
  const controllerRef = useRef<AbortController>(undefined);

  const read = useCallback(async (): Promise<void> => {
    latestRead.current += 1;
    const readId = latestRead.current;
    const signal = controllerRef.current?.signal;
    try {
      const groups = await fetchDownloads({ signal });
      if (readId === latestRead.current) {
        setState({ groups });
      }
    } catch (error) {
      if (isAbort(error) || readId !== latestRead.current) {
        return;
      }
      setState(previous => ({ groups: previous.groups, error: toError(error) }));
    }
    if (readId === latestRead.current) {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      await read();
      if (!controller.signal.aborted) {
        timer = setTimeout(() => void poll(), pollIntervalMs);
      }
    };
    void poll();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [read, pollIntervalMs]);

  return { ...state, isLoading, refresh: read };
}
