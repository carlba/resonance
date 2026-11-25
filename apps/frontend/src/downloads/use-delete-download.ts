import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { deleteDownload } from '@/api/download-api.ts';
import type { DownloadGroup } from '@/api/download-schemas.ts';

/** Identifies a group, which is one folder of one user. */
export function getGroupKey({
  username,
  directory,
}: Pick<DownloadGroup, 'username' | 'directory'>) {
  return `${username}\n${directory}`;
}

function formatFileCount(count: number): string {
  return count === 1 ? '1 file' : `${count} files`;
}

export interface UseDeleteDownloadResult {
  /** Keys, see {@link getGroupKey}, of the groups being deleted right now. */
  deletingKeys: ReadonlySet<string>;
  /** Deletes the group and tells the user how it went with a toast. Never rejects. */
  deleteGroup: (group: DownloadGroup) => Promise<void>;
}

/**
 * Deletes download groups and keeps track of which ones are being deleted, so their cards can
 * show it. `onDeleted` runs after a successful delete, e.g. to read the downloads again.
 */
export function useDeleteDownload(onDeleted: () => Promise<void>): UseDeleteDownloadResult {
  const [deletingKeys, setDeletingKeys] = useState<ReadonlySet<string>>(new Set());

  const setDeleting = useCallback((key: string, isDeleting: boolean) => {
    setDeletingKeys(previous => {
      const next = new Set(previous);
      if (isDeleting) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const deleteGroup = useCallback(
    async (group: DownloadGroup) => {
      const key = getGroupKey(group);
      setDeleting(key, true);
      try {
        const result = await deleteDownload(group.username, group.directory);
        toast.success(`Deleted ${group.name}`, {
          description: `${formatFileCount(result.deletedFiles)} deleted · ${result.missingFiles} already gone`,
        });
        // Waiting for the read keeps the card in its deleting state until the list drops it.
        await onDeleted();
      } catch (error) {
        toast.error(`Could not delete ${group.name}`, {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setDeleting(key, false);
      }
    },
    [onDeleted, setDeleting]
  );

  return { deletingKeys, deleteGroup };
}
