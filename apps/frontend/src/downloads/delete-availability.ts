import type { DownloadCapabilities } from '@/api/download-schemas.ts';

const CHECKING_MESSAGE = 'Checking whether deleting is possible…';

export interface DeleteAvailabilityInput {
  /** `undefined` until the backend has answered. */
  capabilities?: DownloadCapabilities;
  /** Set when the backend could not tell. */
  error?: Error;
}

/**
 * Why the "Delete" buttons are disabled, written for a tooltip; `undefined` when deleting is
 * possible. Deleting stays off while the answer is unknown, since it can't be undone.
 */
export function getDeleteBlockedReason({
  capabilities,
  error,
}: DeleteAvailabilityInput): string | undefined {
  if (capabilities === undefined) {
    return error === undefined
      ? CHECKING_MESSAGE
      : `Could not check whether deleting is possible: ${error.message} Deleting needs slskd's API key to have the administrator role.`;
  }
  if (capabilities.canDelete) {
    return undefined;
  }
  if (capabilities.unavailableReason === 'file-management-disabled') {
    return 'Remote file management is off in slskd. Set SLSKD_REMOTE_FILE_MANAGEMENT=true (or remote_file_management: true) to delete downloads.';
  }
  return `Deleting is not supported with slskd's destination pattern "${capabilities.destinationPattern}": it depends on how a download was started. Use a pattern with only \${SOURCE_USERNAME}, \${SOURCE_PATH} and \${SOURCE_DIRECTORY}.`;
}
