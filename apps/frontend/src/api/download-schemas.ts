import { z } from 'zod';

// These mirror the backend's response types in apps/backend/src/downloads/. JSON drops
// `undefined`, so the backend's optional fields arrive as missing keys.

export const downloadFileStateSchema = z.enum(['queued', 'downloading', 'succeeded', 'failed']);

export const downloadFileSchema = z.object({
  path: z.string(),
  filename: z.string(),
  /** Size in bytes. */
  size: z.number(),
  state: downloadFileStateSchema,
  bytesTransferred: z.number(),
  /** 0 to 100. */
  percentComplete: z.number(),
  /** Speed in bytes per second. */
  speed: z.number(),
});

export const downloadGroupSchema = z.object({
  username: z.string(),
  /** The folder's full path on the user's share. */
  directory: z.string(),
  /** The folder's own name, for a title. */
  name: z.string(),
  state: z.enum(['downloading', 'succeeded', 'failed']),
  size: z.number(),
  bytesTransferred: z.number(),
  /** 0 to 100. */
  percentComplete: z.number(),
  /** Combined speed of the files being transferred, in bytes per second. */
  speed: z.number(),
  lastActivityAt: z.string().optional(),
  files: z.array(downloadFileSchema),
});

export const downloadGroupsSchema = z.array(downloadGroupSchema);

/** What the backend answers when slskd accepted a download. */
export const startedDownloadSchema = z.object({
  username: z.string(),
  fileCount: z.number(),
  /** Combined size in bytes. */
  totalSize: z.number(),
});

export const deleteUnavailableReasonSchema = z.enum([
  'file-management-disabled',
  'unsupported-destination-pattern',
]);

/** What the backend answers to `GET /downloads/capabilities`. */
export const downloadCapabilitiesSchema = z.object({
  canDelete: z.boolean(),
  /** Set when `canDelete` is false. */
  unavailableReason: deleteUnavailableReasonSchema.optional(),
  /** slskd's destination pattern, which the UI names when it is not supported. */
  destinationPattern: z.string(),
});

/** What the backend answers to `DELETE /downloads/:username/:directory`. */
export const deletedDownloadSchema = z.object({
  /** Files that were on disk and are gone now. */
  deletedFiles: z.number(),
  /** Files that were not on disk any more. */
  missingFiles: z.number(),
  /** Transfers removed from slskd's list. */
  removedTransfers: z.number(),
});

export type DownloadFileState = z.infer<typeof downloadFileStateSchema>;
export type DownloadFile = z.infer<typeof downloadFileSchema>;
export type DownloadGroup = z.infer<typeof downloadGroupSchema>;
export type StartedDownload = z.infer<typeof startedDownloadSchema>;
export type DeleteUnavailableReason = z.infer<typeof deleteUnavailableReasonSchema>;
export type DownloadCapabilities = z.infer<typeof downloadCapabilitiesSchema>;
export type DeletedDownload = z.infer<typeof deletedDownloadSchema>;

/** The body of `POST /downloads`: the files of one result, as the search returned them. */
export interface DownloadRequest {
  username: string;
  files: { path: string; size: number }[];
}
