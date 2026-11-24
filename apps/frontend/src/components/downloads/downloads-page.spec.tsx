import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '@/app.tsx';
import { DOWNLOADS_POLL_INTERVAL_MS } from '@/downloads/poll-interval.ts';
import { buildDownloadFile, buildDownloadGroup, getCardOf, jsonResponse } from '@/test/fixtures.ts';

function renderDownloadsPage() {
  return render(
    <MemoryRouter initialEntries={['/downloads']}>
      <App />
    </MemoryRouter>
  );
}

describe('DownloadsPage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows each group with its user, state, progress and speed', async () => {
    const group = buildDownloadGroup({
      name: 'Discovery',
      username: 'alice',
      state: 'downloading',
      size: 2_000_000,
      bytesTransferred: 1_000_000,
      percentComplete: 50,
      speed: 500_000,
      files: [buildDownloadFile({ filename: '01 - One More Time.flac' })],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([group]))
    );

    renderDownloadsPage();

    const scope = within(getCardOf(await screen.findByText('Discovery')));
    expect(scope.getByText(/alice/)).toBeInTheDocument();
    expect(scope.getByText('Downloading')).toBeInTheDocument();
    expect(scope.getByText(/50%/)).toBeInTheDocument();
    expect(scope.getByRole('progressbar', { name: 'Progress of Discovery' })).toBeInTheDocument();
  });

  it('lists the groups in the order the backend sent them', async () => {
    const groups = [
      buildDownloadGroup({ name: 'Active album', directory: 'a' }),
      buildDownloadGroup({ name: 'Finished album', directory: 'b', state: 'succeeded' }),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(groups))
    );

    renderDownloadsPage();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Active album');
    expect(items[1]).toHaveTextContent('Finished album');
  });

  it('shows the file list with per-file state and progress when expanded', async () => {
    const group = buildDownloadGroup({
      files: [
        buildDownloadFile({ filename: 'one.flac', state: 'succeeded', percentComplete: 100 }),
        buildDownloadFile({ filename: 'two.flac', state: 'failed' }),
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([group]))
    );
    renderDownloadsPage();

    expect(await screen.findByText('Album')).toBeInTheDocument();
    expect(screen.queryByText('one.flac')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Files/ }));

    expect(screen.getByText('one.flac')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('two.flac')).toBeInTheDocument();
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
  });

  it('shows an empty state that links to the search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([]))
    );

    renderDownloadsPage();

    expect(await screen.findByText('No downloads yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Search for something/ })).toHaveAttribute('href', '/');
  });

  it('links the header to the search and the downloads page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([]))
    );

    renderDownloadsPage();

    const nav = await screen.findByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Search' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Downloads' })).toHaveAttribute(
      'href',
      '/downloads'
    );
  });

  it('shows an error and keeps polling until a read succeeds', async () => {
    vi.useFakeTimers();
    const fetchStub = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ statusCode: 502, message: 'Internal server error' }, 502)
      )
      .mockImplementation(async () => jsonResponse([buildDownloadGroup({ name: 'Recovered' })]));
    vi.stubGlobal('fetch', fetchStub);

    renderDownloadsPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not read the downloads');
    expect(fetchStub).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOADS_POLL_INTERVAL_MS);
    });

    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('polls every interval and stops when the page is left', async () => {
    vi.useFakeTimers();
    const fetchStub = vi.fn<typeof fetch>(async () => jsonResponse([]));
    vi.stubGlobal('fetch', fetchStub);

    const { unmount } = renderDownloadsPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOADS_POLL_INTERVAL_MS * 2);
    });
    expect(fetchStub).toHaveBeenCalledTimes(3);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOADS_POLL_INTERVAL_MS * 5);
    });

    expect(fetchStub).toHaveBeenCalledTimes(3);
  });
});
