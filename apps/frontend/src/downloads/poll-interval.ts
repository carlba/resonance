const DEFAULT_DOWNLOADS_POLL_INTERVAL_MS = 2000;
const MIN_POLL_INTERVAL_MS = 250;

/**
 * How often the download statuses are read, from `VITE_DOWNLOADS_POLL_INTERVAL_MS`. A missing,
 * non-numeric or too small value falls back to the default, since polling in a tight loop would
 * hammer slskd.
 */
export function parsePollInterval(value: string | undefined): number {
  const interval = Number(value);
  return Number.isInteger(interval) && interval >= MIN_POLL_INTERVAL_MS
    ? interval
    : DEFAULT_DOWNLOADS_POLL_INTERVAL_MS;
}

export const DOWNLOADS_POLL_INTERVAL_MS = parsePollInterval(
  import.meta.env.VITE_DOWNLOADS_POLL_INTERVAL_MS
);
