import { z } from 'zod';
import type { ProviderFile, ProviderSearchResult } from '../search-provider.js';

// Schemas for the parts of the slskd API (`/api/v0/searches`) this provider reads. Unknown fields
// are stripped, so slskd adding fields doesn't break parsing; missing or mistyped fields do.

export const slskdSearchSchema = z.object({
  id: z.string().min(1),
  isComplete: z.boolean(),
});

export type SlskdSearch = z.infer<typeof slskdSearchSchema>;

const slskdFileSchema = z.object({
  filename: z.string(),
  size: z.number(),
  bitRate: z.number().nullish(),
  bitDepth: z.number().nullish(),
  sampleRate: z.number().nullish(),
  // Duration in seconds.
  length: z.number().nullish(),
  isVariableBitRate: z.boolean().nullish(),
});

type SlskdFile = z.infer<typeof slskdFileSchema>;

const slskdSearchResponseSchema = z.object({
  username: z.string(),
  hasFreeUploadSlot: z.boolean(),
  queueLength: z.number(),
  uploadSpeed: z.number(),
  // Locked files (`lockedFiles`) can't be downloaded by us, so only the open ones are read.
  files: z.array(slskdFileSchema),
});

export const slskdSearchResponsesSchema = z.array(slskdSearchResponseSchema);

export type SlskdSearchResponse = z.infer<typeof slskdSearchResponseSchema>;

export function toProviderSearchResult(response: SlskdSearchResponse): ProviderSearchResult {
  return {
    username: response.username,
    availability: {
      hasFreeUploadSlot: response.hasFreeUploadSlot,
      queueLength: response.queueLength,
      uploadSpeed: response.uploadSpeed,
    },
    files: response.files.map(toProviderFile),
  };
}

function toProviderFile(file: SlskdFile): ProviderFile {
  return {
    path: file.filename,
    size: file.size,
    bitRate: file.bitRate ?? undefined,
    bitDepth: file.bitDepth ?? undefined,
    sampleRate: file.sampleRate ?? undefined,
    durationSeconds: file.length ?? undefined,
    isVariableBitRate: file.isVariableBitRate ?? undefined,
  };
}
