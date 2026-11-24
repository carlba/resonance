import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { DownloadGroup } from '@/api/download-schemas.ts';
import { App } from '@/app.tsx';
import {
  buildAlbum,
  buildDownloadFile,
  buildDownloadGroup,
  buildTrack,
  getCardOf,
  jsonResponse,
} from '@/test/fixtures.ts';

const ALBUM_FILES = [
  buildTrack({ filename: '01.flac' }),
  buildTrack({ filename: '02.flac' }),
  buildTrack({ filename: 'rip.log', extension: 'log' }),
];
const ALBUM = buildAlbum({ album: 'Discovery', tracks: ALBUM_FILES });

interface Backend {
  /** What `GET /downloads` answers; change it to simulate slskd moving on. */
  downloads: DownloadGroup[];
  /** The bodies `POST /downloads` received. */
  posted: unknown[];
  postResponse: () => Response;
}

/** A fetch stub that tells the three backend endpoints apart. */
function stubBackend(search: unknown, overrides: Partial<Backend> = {}): Backend {
  const backend: Backend = {
    downloads: [],
    posted: [],
    postResponse: () =>
      jsonResponse({ username: 'alice', fileCount: 3, totalSize: 90_000_000 }, 201),
    ...overrides,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async input => {
      const request = new Request(input);
      const { pathname } = new URL(request.url);
      if (pathname === '/api/downloads' && request.method === 'POST') {
        backend.posted.push(await request.json());
        return backend.postResponse();
      }
      if (pathname === '/api/downloads') {
        return jsonResponse(backend.downloads);
      }
      return jsonResponse(search);
    })
  );
  return backend;
}

function renderSearch(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <App />
    </MemoryRouter>
  );
}

function groupWithStates(states: ('queued' | 'downloading' | 'succeeded' | 'failed')[]) {
  return buildDownloadGroup({
    files: states.map((state, index) =>
      buildDownloadFile({
        path: ALBUM_FILES[index].path,
        filename: ALBUM_FILES[index].filename,
        state,
      })
    ),
  });
}

describe('album download', () => {
  it('enqueues every file of the album, including rip logs, and confirms with a toast', async () => {
    const backend = stubBackend([ALBUM]);
    renderSearch('/?q=discovery');

    await userEvent.click(await screen.findByRole('button', { name: 'Download' }));

    expect(backend.posted).toEqual([
      {
        username: 'alice',
        files: ALBUM_FILES.map(({ path, size }) => ({ path, size })),
      },
    ]);
    expect(await screen.findByText('Download started')).toBeInTheDocument();
    expect(screen.getByText(/3 files/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View downloads' })).toHaveAttribute(
      'href',
      '/downloads'
    );
    // The results stay as they are and nothing asked for confirmation.
    expect(screen.getByText('Discovery (2001)')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no download button for the individual files of the album', async () => {
    stubBackend([ALBUM]);
    renderSearch('/?q=discovery');

    await screen.findByText('Discovery (2001)');

    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(1);
  });

  it('shows an error toast and keeps the button enabled when the request fails', async () => {
    const backend = stubBackend([ALBUM], {
      postResponse: () => jsonResponse({ statusCode: 502, message: 'Internal server error' }, 502),
    });
    renderSearch('/?q=discovery');
    const button = await screen.findByRole('button', { name: 'Download' });

    await userEvent.click(button);

    expect(await screen.findByText('Could not start the download')).toBeInTheDocument();
    expect(screen.getByText(/slskd could not be reached/)).toBeInTheDocument();
    expect(screen.queryByText('Download started')).not.toBeInTheDocument();
    expect(backend.posted).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
  });

  it('shows the status right after starting and disables the button', async () => {
    const backend = stubBackend([ALBUM]);
    renderSearch('/?q=discovery');
    const button = await screen.findByRole('button', { name: 'Download' });

    backend.downloads = [groupWithStates(['queued', 'queued', 'queued'])];
    await userEvent.click(button);

    expect(await screen.findByText('Downloading')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
  });
});

describe('download status on an album card', () => {
  it('shows no badge and an enabled button when slskd has none of the files', async () => {
    stubBackend([ALBUM], { downloads: [buildDownloadGroup({ username: 'bob' })] });
    renderSearch('/?q=discovery');

    expect(await screen.findByRole('button', { name: 'Download' })).toBeEnabled();
    expect(screen.queryByText('Downloading')).not.toBeInTheDocument();
    expect(screen.queryByText('Downloaded')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();
  });

  it.each([
    ['queued, queued, succeeded', ['queued', 'queued', 'succeeded'], 'Downloading', true],
    ['downloading with one failed', ['downloading', 'failed', 'succeeded'], 'Downloading', true],
    ['all succeeded', ['succeeded', 'succeeded', 'succeeded'], 'Downloaded', true],
    ['succeeded with one failed', ['succeeded', 'failed', 'succeeded'], 'Failed', false],
    ['all failed', ['failed', 'failed', 'failed'], 'Failed', false],
  ] as const)('for %s shows %s', async (_description, states, badge, isDisabled) => {
    stubBackend([ALBUM], { downloads: [groupWithStates([...states])] });
    renderSearch('/?q=discovery');

    const card = getCardOf(await screen.findByText('Discovery (2001)'));
    expect(await within(card).findByText(badge)).toBeInTheDocument();
    const button = within(card).getByRole('button', { name: 'Download' });
    if (isDisabled) {
      expect(button).toBeDisabled();
    } else {
      expect(button).toBeEnabled();
    }
  });

  it('enqueues the album again when clicking Download on a failed one', async () => {
    const backend = stubBackend([ALBUM], {
      downloads: [groupWithStates(['failed', 'failed', 'failed'])],
    });
    renderSearch('/?q=discovery');
    await screen.findByText('Failed');

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(backend.posted).toHaveLength(1);
  });

  it('matches only the files of the same user', async () => {
    stubBackend([ALBUM], {
      downloads: [{ ...groupWithStates(['succeeded', 'succeeded', 'succeeded']), username: 'bob' }],
    });
    renderSearch('/?q=discovery');

    expect(await screen.findByRole('button', { name: 'Download' })).toBeEnabled();
    expect(screen.queryByText('Downloaded')).not.toBeInTheDocument();
  });
});

async function findTableDownloadButton(): Promise<HTMLElement> {
  const table = await screen.findByRole('table', { name: 'Tracks' });
  return within(table).getByRole('button', { name: 'Download' });
}

describe('track download', () => {
  const TRACK = buildTrack({ filename: 'Da Funk.flac' });

  it('enqueues just that file', async () => {
    const backend = stubBackend([TRACK], {
      postResponse: () =>
        jsonResponse({ username: 'alice', fileCount: 1, totalSize: 30_000_000 }, 201),
    });
    renderSearch('/?q=funk&type=tracks');

    await userEvent.click(await findTableDownloadButton());

    expect(backend.posted).toEqual([
      { username: 'alice', files: [{ path: TRACK.path, size: TRACK.size }] },
    ]);
    expect(await screen.findByText(/1 file ·/)).toBeInTheDocument();
  });

  it('shows the status of the file and disables the button once downloaded', async () => {
    stubBackend([TRACK], {
      downloads: [
        buildDownloadGroup({
          files: [
            buildDownloadFile({ path: TRACK.path, filename: TRACK.filename, state: 'succeeded' }),
          ],
        }),
      ],
    });
    renderSearch('/?q=funk&type=tracks');

    const table = await screen.findByRole('table', { name: 'Tracks' });
    expect(await within(table).findByText('Downloaded')).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Download' })).toBeDisabled();
  });
});
