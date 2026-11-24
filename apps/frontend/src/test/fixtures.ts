import type { DownloadFile, DownloadGroup } from '@/api/download-schemas.ts';
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

const DOWNLOADS_PATH = '/api/downloads';

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getUrl(input: Parameters<typeof fetch>[0]): URL {
  return new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
}

/**
 * Installs `searchStub` as the backend for the search calls. Reads of the downloads, which the
 * result cards poll, are answered with "no downloads" and never reach `searchStub`, so its calls
 * are only the searches.
 */
export function stubFetchWithSearchStub(searchStub: ReturnType<typeof vi.fn<typeof fetch>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) =>
      getUrl(input).pathname === DOWNLOADS_PATH ? jsonResponse([]) : searchStub(input, init)
    )
  );
  return searchStub;
}

/** A fetch stub that answers every search with a fresh JSON response, since a body reads once. */
export function stubFetchWithJson(body: unknown, status = 200) {
  return stubFetchWithSearchStub(vi.fn<typeof fetch>(async () => jsonResponse(body, status)));
}

/** The URL of the n-th request the stub received. */
export function getRequestUrl(fetchStub: ReturnType<typeof vi.fn<typeof fetch>>, call = 0): URL {
  const [input] = fetchStub.mock.calls[call];
  return new URL(input instanceof Request ? input.url : String(input));
}

export function buildDownloadFile(overrides: Partial<DownloadFile> = {}): DownloadFile {
  const filename = overrides.filename ?? '01 - Song.flac';
  return {
    path: `Music\\Artist\\Album\\${filename}`,
    filename,
    size: 30_000_000,
    state: 'queued',
    bytesTransferred: 0,
    percentComplete: 0,
    speed: 0,
    ...overrides,
  };
}

export function buildDownloadGroup(overrides: Partial<DownloadGroup> = {}): DownloadGroup {
  const files = overrides.files ?? [buildDownloadFile()];
  return {
    username: 'alice',
    directory: 'Music\\Artist\\Album',
    name: 'Album',
    state: 'downloading',
    size: files.reduce((total, file) => total + file.size, 0),
    bytesTransferred: 0,
    percentComplete: 0,
    speed: 0,
    files,
    ...overrides,
  };
}

/** The card that holds the given text; fails the test when there is none. */
export function getCardOf(element: HTMLElement): HTMLElement {
  const card = element.closest<HTMLElement>('[data-slot="card"]');
  if (card === null) {
    throw new Error(`Expected the element to be inside a card: text=${element.textContent}`);
  }
  return card;
}
