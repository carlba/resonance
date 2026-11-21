import { z } from 'zod';

// These mirror the backend's response types in apps/backend/src/tracks/track-mapping.ts and
// apps/backend/src/albums/album-grouping.ts. JSON drops `undefined`, so the backend's optional
// fields arrive as missing keys.

export const userAvailabilitySchema = z.object({
  hasFreeUploadSlot: z.boolean(),
  queueLength: z.number(),
  /** Average upload speed in bytes per second. */
  uploadSpeed: z.number(),
});

export const trackResultSchema = z.object({
  filename: z.string(),
  path: z.string(),
  username: z.string(),
  /** Lowercase, without the dot, e.g. `flac`. */
  extension: z.string(),
  /** Size in bytes. */
  size: z.number(),
  /** Bitrate in kbps. */
  bitRate: z.number().optional(),
  bitDepth: z.number().optional(),
  /** Sample rate in Hz. */
  sampleRate: z.number().optional(),
  durationSeconds: z.number().optional(),
  isVariableBitRate: z.boolean().optional(),
  availability: userAvailabilitySchema,
});

export const albumResultSchema = z.object({
  username: z.string(),
  directory: z.string(),
  artist: z.string().optional(),
  album: z.string(),
  year: z.number().optional(),
  /** The number of audio files. */
  trackCount: z.number(),
  /** Size of every file in bytes, audio or not. */
  totalSize: z.number(),
  /** Only set when every audio file's duration is known. */
  totalDurationSeconds: z.number().optional(),
  /** The most common audio extension, e.g. `flac`. */
  dominantExtension: z.string(),
  /** The most common known bitrate in kbps. */
  dominantBitRate: z.number().optional(),
  availability: userAvailabilitySchema,
  /** Every file of the album, including cover art, cue sheets and logs. */
  tracks: z.array(trackResultSchema),
});

export const trackResultsSchema = z.array(trackResultSchema);
export const albumResultsSchema = z.array(albumResultSchema);

// The body the backend's global exception filter sends. Validation failures from Nest's
// ValidationPipe carry one message per failed constraint.
export const errorResponseSchema = z.object({
  statusCode: z.number(),
  message: z.union([z.string(), z.array(z.string())]),
});

export type UserAvailability = z.infer<typeof userAvailabilitySchema>;
export type TrackResult = z.infer<typeof trackResultSchema>;
export type AlbumResult = z.infer<typeof albumResultSchema>;
