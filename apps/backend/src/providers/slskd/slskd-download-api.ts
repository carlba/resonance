import { z } from 'zod';
import type { DownloadState, ProviderDownloadFile } from '../download-provider.js';

// Schemas for the parts of the slskd API (`/api/v0/transfers/downloads`) the download provider
// uses. Unknown fields are stripped, so slskd adding fields doesn't break parsing; missing or
// mistyped fields do.

const slskdTransferSchema = z.object({
  // The full remote path, the same one the search returned.
  filename: z.string(),
  size: z.number(),
  // A flags enum rendered as text, e.g. `Queued, Remotely` or `Completed, Succeeded`.
  state: z.string(),
  bytesTransferred: z.number().nullish(),
  averageSpeed: z.number().nullish(),
  requestedAt: z.string().nullish(),
  enqueuedAt: z.string().nullish(),
  startedAt: z.string().nullish(),
  endedAt: z.string().nullish(),
});

type SlskdTransfer = z.infer<typeof slskdTransferSchema>;

const slskdUserTransfersSchema = z.object({
  username: z.string(),
  directories: z.array(
    z.object({
      files: z.array(slskdTransferSchema),
    })
  ),
});

/** `GET /api/v0/transfers/downloads`: the downloads of every user, grouped by directory. */
export const slskdDownloadsSchema = z.array(slskdUserTransfersSchema);

export type SlskdUserTransfers = z.infer<typeof slskdUserTransfersSchema>;

/**
 * `POST /api/v0/transfers/downloads/{username}`. slskd answers with the transfers it created and,
 * when it couldn't create all of them, a description of each file it refused.
 */
export const slskdEnqueueResponseSchema = z.object({
  enqueued: z.array(z.unknown()).default([]),
  failed: z.array(z.unknown()).default([]),
});

export type SlskdEnqueueResponse = z.infer<typeof slskdEnqueueResponseSchema>;

const COMPLETED_STATE = 'completed';
const SUCCEEDED_STATE = 'succeeded';
const IN_PROGRESS_STATE = 'inprogress';

/**
 * Maps slskd's transfer state to the four states the rest of the app knows. Everything that
 * ended other than with `Succeeded` (`Errored`, `Rejected`, `TimedOut`, `Cancelled`, ...) failed,
 * and every state before the bytes flow (`Requested`, `Queued, Locally`, `Queued, Remotely`,
 * `Initializing`) is queued. Matching is case-insensitive and ignores whitespace.
 */
export function toDownloadState(slskdState: string): DownloadState {
  const flags = slskdState
    .toLowerCase()
    .split(',')
    .map(flag => flag.trim());

  if (flags.includes(COMPLETED_STATE)) {
    return flags.includes(SUCCEEDED_STATE) ? 'succeeded' : 'failed';
  }
  return flags.includes(IN_PROGRESS_STATE) ? 'downloading' : 'queued';
}

/** The most recent timestamp of a transfer, or `undefined` when slskd sent none that parse. */
function getLastActivityAt(transfer: SlskdTransfer): string | undefined {
  const times = [transfer.requestedAt, transfer.enqueuedAt, transfer.startedAt, transfer.endedAt]
    .map(timestamp => (timestamp == null ? Number.NaN : Date.parse(timestamp)))
    .filter(time => !Number.isNaN(time));
  return times.length === 0 ? undefined : new Date(Math.max(...times)).toISOString();
}

function toProviderDownloadFile(username: string, transfer: SlskdTransfer): ProviderDownloadFile {
  const state = toDownloadState(transfer.state);
  return {
    username,
    path: transfer.filename,
    size: transfer.size,
    state,
    // slskd may leave the counters at their last value once a transfer ends.
    bytesTransferred: state === 'succeeded' ? transfer.size : (transfer.bytesTransferred ?? 0),
    averageSpeed: state === 'downloading' ? (transfer.averageSpeed ?? 0) : 0,
    lastActivityAt: getLastActivityAt(transfer),
  };
}

/** Flattens slskd's users → directories → files into one list of files. */
export function toProviderDownloadFiles(
  usersTransfers: readonly SlskdUserTransfers[]
): ProviderDownloadFile[] {
  return usersTransfers.flatMap(({ username, directories }) =>
    directories.flatMap(({ files }) => files.map(file => toProviderDownloadFile(username, file)))
  );
}
