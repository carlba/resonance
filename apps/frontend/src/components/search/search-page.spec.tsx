import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '@/app.tsx';
import { buildAlbum, buildTrack, getRequestUrl, stubFetchWithJson } from '@/test/fixtures.ts';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SearchPage', () => {
  it('shows only the form before anything is searched', () => {
    const fetchStub = stubFetchWithJson([]);
    renderAt('/');

    expect(screen.getByRole('searchbox', { name: 'Search text' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('searches albums by default when the form is submitted', async () => {
    const fetchStub = stubFetchWithJson([buildAlbum({ album: 'Discovery' })]);
    renderAt('/');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search text' }), ' daft punk ');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('Discovery (2001)')).toBeInTheDocument();
    const url = getRequestUrl(fetchStub);
    expect(url.pathname).toBe('/api/albums');
    expect(url.searchParams.get('q')).toBe('daft punk');
  });

  it('shows a loading state and disables the form while searching', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {}))
    );
    renderAt('/?q=air');

    expect(screen.getByRole('status', { name: 'Searching' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search text' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Tracks' })).toBeDisabled();
  });

  it('shows an empty state when nothing is found', async () => {
    stubFetchWithJson([]);
    renderAt('/?q=nothing&type=tracks');

    expect(await screen.findByText('No tracks found for “nothing”')).toBeInTheDocument();
  });

  it('shows an error with the backend message and searches again on retry', async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ statusCode: 502, message: 'Internal server error' }, 502)
      )
      .mockResolvedValueOnce(jsonResponse([buildAlbum({ album: 'Moon Safari' })]));
    vi.stubGlobal('fetch', fetchStub);
    renderAt('/?q=air');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The search provider is unavailable')).toBeInTheDocument();
    expect(within(alert).getByText('Internal server error')).toBeInTheDocument();

    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('Moon Safari (2001)')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('shows an error when the backend cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    renderAt('/?q=air');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not reach the backend')).toBeInTheDocument();
  });

  it('shows album details and lists its files under the card', async () => {
    const album = buildAlbum({
      album: 'Discovery',
      artist: 'Daft Punk',
      username: 'bob',
      tracks: [
        buildTrack({ filename: '01 - One More Time.flac' }),
        buildTrack({ filename: 'cover.jpg', extension: 'jpg', bitRate: undefined }),
      ],
    });
    stubFetchWithJson([album]);
    renderAt('/?q=discovery');

    expect(await screen.findByText('Discovery (2001)')).toBeInTheDocument();
    expect(screen.getByText('Daft Punk')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
    expect(screen.getByText('FLAC')).toBeInTheDocument();
    expect(screen.getByText('Free slot')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show files' }));
    expect(screen.getByText('01 - One More Time.flac')).toBeInTheDocument();
    expect(screen.getByText('cover.jpg')).toBeInTheDocument();
  });

  it('shows the bit depth and sample rate of a lossless album that reports no bitrate', async () => {
    const hiResTrack = buildTrack({ bitDepth: 24, sampleRate: 96_000, bitRate: undefined });
    stubFetchWithJson([buildAlbum({ dominantBitRate: undefined, tracks: [hiResTrack] })]);
    renderAt('/?q=discovery');

    expect(await screen.findByText('24 bit · 96 kHz')).toBeInTheDocument();
  });

  it('shows track results in a table', async () => {
    stubFetchWithJson([buildTrack({ filename: 'Around the World.mp3', extension: 'mp3' })]);
    renderAt('/?q=around&type=tracks');

    const table = await screen.findByRole('table', { name: 'Tracks' });
    expect(within(table).getByText('Around the World.mp3')).toBeInTheDocument();
    expect(within(table).getByText('MP3')).toBeInTheDocument();
  });

  it('searches tracks with the same text when switching from albums', async () => {
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse([buildAlbum({ album: 'Homework' })]))
      .mockResolvedValueOnce(jsonResponse([buildTrack({ filename: 'Da Funk.flac' })]));
    vi.stubGlobal('fetch', fetchStub);
    renderAt('/?q=daft punk');

    expect(await screen.findByText('Homework (2001)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Tracks' }));

    const table = await screen.findByRole('table', { name: 'Tracks' });
    expect(within(table).getByText('Da Funk.flac')).toBeInTheDocument();
    expect(screen.queryByText('Homework (2001)')).not.toBeInTheDocument();
    expect(getRequestUrl(fetchStub, 1).pathname).toBe('/api/tracks');
    expect(getRequestUrl(fetchStub, 1).searchParams.get('q')).toBe('daft punk');
  });

  it('applies the format filter and sort order from the URL', async () => {
    stubFetchWithJson([
      buildAlbum({ album: 'Lossless', dominantExtension: 'flac' }),
      buildAlbum({ album: 'Small', dominantExtension: 'mp3', totalSize: 1, directory: 'a' }),
      buildAlbum({ album: 'Large', dominantExtension: 'mp3', totalSize: 2, directory: 'b' }),
    ]);
    renderAt('/?q=air&format=mp3&sort=size');

    const albums = await screen.findByRole('list', { name: 'Albums' });
    const titles = within(albums)
      .getAllByText(/\(2001\)$/)
      .map(title => title.textContent);
    expect(titles).toEqual(['Large (2001)', 'Small (2001)']);
    expect(screen.getByText('Showing 2 of 3 albums')).toBeInTheDocument();
  });
});
