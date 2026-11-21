import type { AlbumResult, TrackResult, UserAvailability } from '@/api/search-schemas.ts';

export function buildAvailability(overrides: Partial<UserAvailability> = {}): UserAvailability {
  return { hasFreeUploadSlot: true, queueLength: 0, uploadSpeed: 1_000_000, ...overrides };
}

export function buildTrack(overrides: Partial<TrackResult> = {}): TrackResult {
  const filename = overrides.filename ?? '01 - Song.flac';
  return {
    filename,
    path: `Music\\Artist\\Album\\${filename}`,
    username: 'alice',
    extension: 'flac',
    size: 30_000_000,
    bitRate: 1411,
    bitDepth: 16,
    sampleRate: 44_100,
    durationSeconds: 240,
    availability: buildAvailability(),
    ...overrides,
  };
}

export function buildAlbum(overrides: Partial<AlbumResult> = {}): AlbumResult {
  const tracks = overrides.tracks ?? [buildTrack()];
  return {
    username: 'alice',
    directory: 'Music\\Artist\\Album',
    artist: 'Artist',
    album: 'Album',
    year: 2001,
    trackCount: tracks.length,
    totalSize: 30_000_000,
    totalDurationSeconds: 240,
    dominantExtension: 'flac',
    dominantBitRate: 1411,
    availability: buildAvailability(),
    tracks,
    ...overrides,
  };
}

/** A fetch stub that answers every request with a fresh JSON response, since a body reads once. */
export function stubFetchWithJson(body: unknown, status = 200) {
  const fetchStub = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
  );
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

/** The URL of the n-th request the stub received. */
export function getRequestUrl(fetchStub: ReturnType<typeof vi.fn<typeof fetch>>, call = 0): URL {
  const [input] = fetchStub.mock.calls[call];
  return new URL(input instanceof Request ? input.url : String(input));
}
