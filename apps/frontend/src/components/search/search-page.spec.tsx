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

function getAlbumTitles(): (string | null)[] {
  return within(screen.getByRole('list', { name: 'Albums' }))
    .getAllByText(/\(2001\)$/)
    .map(title => title.textContent);
}

async function openAdvancedFilters(name = 'Advanced filters'): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name }));
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

  describe('advanced filters', () => {
    const cdAlbum = buildAlbum({ album: 'CD', directory: 'cd', totalSize: 1 });
    const mp3Album = buildAlbum({
      album: 'MP3',
      directory: 'mp3',
      dominantExtension: 'mp3',
      dominantBitRate: 320,
      totalSize: 2,
      tracks: [buildTrack({ extension: 'mp3', bitRate: 320, bitDepth: undefined })],
    });

    it('opens and closes the panel, which starts collapsed', async () => {
      stubFetchWithJson([cdAlbum]);
      renderAt('/?q=air');

      const trigger = await screen.findByRole('button', { name: 'Advanced filters' });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('combobox', { name: 'Quality' })).not.toBeInTheDocument();

      await userEvent.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('combobox', { name: 'Quality' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Has rip log' })).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Track count' })).toBeInTheDocument();

      await userEvent.click(trigger);
      expect(screen.queryByRole('combobox', { name: 'Quality' })).not.toBeInTheDocument();
    });

    it('filters by the chosen quality preset without searching again', async () => {
      const hiResAlbum = buildAlbum({
        album: 'Hi-Res',
        directory: 'hires',
        tracks: [buildTrack({ bitDepth: 24, sampleRate: 96_000 })],
      });
      const fetchStub = stubFetchWithJson([mp3Album, cdAlbum, hiResAlbum]);
      renderAt('/?q=air');

      await openAdvancedFilters();
      await userEvent.click(screen.getByRole('combobox', { name: 'Quality' }));
      await userEvent.click(screen.getByRole('option', { name: 'CD' }));

      expect(getAlbumTitles()).toEqual(['CD (2001)']);
      expect(screen.getByText('Showing 1 of 3 albums')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Advanced filters (1)' })).toBeInTheDocument();
      expect(fetchStub).toHaveBeenCalledTimes(1);
    });

    it('applies the quality preset from the URL to tracks', async () => {
      stubFetchWithJson([
        buildTrack({ filename: 'low.mp3', extension: 'mp3', bitRate: 128 }),
        buildTrack({ filename: 'high.mp3', extension: 'mp3', bitRate: 320, path: 'high.mp3' }),
      ]);
      renderAt('/?q=air&type=tracks&quality=320');

      const table = await screen.findByRole('table', { name: 'Tracks' });
      expect(within(table).getByText('high.mp3')).toBeInTheDocument();
      expect(within(table).queryByText('low.mp3')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Advanced filters (1)' })).toBeInTheDocument();
    });

    it('keeps only the albums with a rip log when the filter is on', async () => {
      const withLog = buildAlbum({
        album: 'With log',
        directory: 'with-log',
        tracks: [buildTrack(), buildTrack({ filename: 'CD1\\RIP.LOG', path: 'CD1\\RIP.LOG' })],
      });
      const fetchStub = stubFetchWithJson([cdAlbum, withLog]);
      renderAt('/?q=air');

      await openAdvancedFilters();
      await userEvent.click(screen.getByRole('checkbox', { name: 'Has rip log' }));

      expect(getAlbumTitles()).toEqual(['With log (2001)']);
      expect(screen.getByRole('button', { name: 'Advanced filters (1)' })).toBeInTheDocument();
      expect(fetchStub).toHaveBeenCalledTimes(1);
    });

    it('filters by track count and asks to fix a minimum above the maximum', async () => {
      const albums = [8, 10, 12].map(trackCount =>
        buildAlbum({ album: `${trackCount} tracks`, directory: `${trackCount}`, trackCount })
      );
      stubFetchWithJson(albums);
      renderAt('/?q=air');

      await openAdvancedFilters();
      const minInput = screen.getByRole('spinbutton', { name: 'Min' });
      const maxInput = screen.getByRole('spinbutton', { name: 'Max' });
      await userEvent.type(minInput, '10');
      expect(getAlbumTitles()).toEqual(['10 tracks (2001)', '12 tracks (2001)']);

      await userEvent.type(maxInput, '8');
      expect(screen.getByRole('alert')).toHaveTextContent(
        "The minimum can't be more than the maximum"
      );
      expect(minInput).toHaveAttribute('aria-invalid', 'true');
      expect(getAlbumTitles()).toHaveLength(3);
      expect(screen.getByRole('button', { name: 'Advanced filters' })).toBeInTheDocument();

      await userEvent.clear(maxInput);
      await userEvent.type(maxInput, '10');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(getAlbumTitles()).toEqual(['10 tracks (2001)']);
    });

    it('shows only the quality filter for tracks and restores the album filters on Albums', async () => {
      const fetchStub = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse([buildTrack()]))
        .mockResolvedValueOnce(jsonResponse([cdAlbum]));
      vi.stubGlobal('fetch', fetchStub);
      renderAt('/?q=air&type=tracks&log=1&minTracks=2');

      await openAdvancedFilters();
      expect(screen.getByRole('combobox', { name: 'Quality' })).toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: 'Has rip log' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Track count' })).not.toBeInTheDocument();
      expect(await screen.findByRole('table', { name: 'Tracks' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('radio', { name: 'Albums' }));

      await openAdvancedFilters('Advanced filters (2)');
      expect(screen.getByRole('checkbox', { name: 'Has rip log' })).toBeChecked();
      expect(screen.getByRole('spinbutton', { name: 'Min' })).toHaveValue(2);
    });

    it('shows log and cue badges on albums whether or not a filter is on', async () => {
      const ripFiles = ['CD1\\rip.log', 'CD2\\rip.log', 'album.cue'].map(filename =>
        buildTrack({ filename, path: filename })
      );
      stubFetchWithJson([buildAlbum({ album: 'Ripped', tracks: [buildTrack(), ...ripFiles] })]);
      renderAt('/?q=air');

      expect(await screen.findByText('log ×2')).toHaveAttribute('title', '2 rip logs');
      expect(screen.getByText('cue')).toHaveAttribute('title', '1 cue sheet');
    });

    it('says when the filters hide every result and clears them, keeping format and sort', async () => {
      stubFetchWithJson([mp3Album, cdAlbum, buildAlbum({ album: 'Other', directory: 'other' })]);
      renderAt('/?q=air&format=flac&sort=size&quality=hires&log=1&minTracks=5');

      expect(
        await screen.findByText('All 3 albums are hidden by your filters')
      ).toBeInTheDocument();
      expect(screen.queryByText(/^No albums found/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Advanced filters (3)' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

      expect(screen.queryByText(/hidden by your filters/)).not.toBeInTheDocument();
      expect(getAlbumTitles()).toEqual(['Other (2001)', 'CD (2001)']);
      expect(screen.getByText('Showing 2 of 3 albums')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Advanced filters' })).toBeInTheDocument();
    });

    it('names the only result when it is hidden', async () => {
      stubFetchWithJson([buildTrack({ extension: 'mp3', bitRate: 128 })]);
      renderAt('/?q=air&type=tracks&quality=lossless');

      expect(
        await screen.findByText('The only track is hidden by your filters')
      ).toBeInTheDocument();
    });
  });
});
