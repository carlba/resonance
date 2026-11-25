import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '@/app.tsx';
import { DOWNLOADS_POLL_INTERVAL_MS } from '@/downloads/poll-interval.ts';
import { encodeDirectory } from '@/api/download-api.ts';
import {
  buildCapabilities,
  buildDownloadFile,
  buildDownloadGroup,
  getCardOf,
  jsonResponse,
  stubDownloadsBackend,
} from '@/test/fixtures.ts';

function renderDownloadsPage() {
  return render(
    <MemoryRouter initialEntries={['/downloads']}>
      <App />
    </MemoryRouter>
  );
}

/** The element a disabled button's tooltip hangs on, since the button gets no pointer events. */
function getTooltipTarget(button: HTMLElement): HTMLElement {
  if (button.parentElement === null) {
    throw new Error('Expected the button to have a wrapper for its tooltip');
  }
  return button.parentElement;
}

/** Opens the confirmation dialog of the "Discovery" card once deleting is known to be possible. */
async function openDeleteDialog() {
  const card = getCardOf(await screen.findByText('Discovery'));
  const button = await within(card).findByRole('button', { name: 'Delete Discovery' });
  await waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  return { card, dialog: await screen.findByRole('alertdialog') };
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
    let reads = 0;
    const { countListReads } = stubDownloadsBackend({
      groups: () => {
        reads += 1;
        if (reads === 1) {
          throw new TypeError('Failed to fetch');
        }
        return [buildDownloadGroup({ name: 'Recovered' })];
      },
    });

    renderDownloadsPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not read the downloads');
    expect(countListReads()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOADS_POLL_INTERVAL_MS);
    });

    expect(countListReads()).toBe(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('polls every interval and stops when the page is left', async () => {
    vi.useFakeTimers();
    const { countListReads } = stubDownloadsBackend();

    const { unmount } = renderDownloadsPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOADS_POLL_INTERVAL_MS * 2);
    });
    expect(countListReads()).toBe(3);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DOWNLOADS_POLL_INTERVAL_MS * 5);
    });

    expect(countListReads()).toBe(3);
  });

  describe('deleting a download', () => {
    const group = buildDownloadGroup({
      name: 'Discovery',
      username: 'alice',
      directory: 'Music\\Daft Punk\\Discovery',
      size: 60_000_000,
      files: [
        buildDownloadFile({ filename: '01.flac' }),
        buildDownloadFile({ filename: '02.flac' }),
      ],
    });

    it('asks for confirmation with the folder, user, file count, size and a warning', async () => {
      const { getDeleteRequests } = stubDownloadsBackend({ groups: [group] });
      renderDownloadsPage();

      const { dialog } = await openDeleteDialog();

      expect(within(dialog).getByText('Delete Discovery?')).toBeInTheDocument();
      expect(within(dialog).getByText('Discovery', { selector: 'dd' })).toBeInTheDocument();
      expect(within(dialog).getByText('alice')).toBeInTheDocument();
      expect(within(dialog).getByText('2 files')).toBeInTheDocument();
      expect(within(dialog).getByText('60 MB')).toBeInTheDocument();
      expect(dialog).toHaveTextContent(/deleted from disk\. This cannot be undone/);
      expect(getDeleteRequests()).toHaveLength(0);
    });

    it('deletes nothing when the dialog is cancelled', async () => {
      const { getDeleteRequests } = stubDownloadsBackend({ groups: [group] });
      renderDownloadsPage();
      const { dialog } = await openDeleteDialog();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(getDeleteRequests()).toHaveLength(0);
    });

    it('sends the folder base64url-encoded, shows Deleting… with disabled buttons, then reports the counts', async () => {
      const deletion = Promise.withResolvers<Response>();
      let remaining = [group];
      const { getDeleteRequests } = stubDownloadsBackend({
        groups: () => remaining,
        deleteResponse: () => deletion.promise,
      });
      renderDownloadsPage();
      const { card, dialog } = await openDeleteDialog();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));

      expect(await within(card).findByRole('button', { name: 'Deleting…' })).toBeDisabled();
      expect(within(card).getByRole('button', { name: /Files/ })).toBeDisabled();
      const [deleteRequest] = getDeleteRequests();
      expect(new URL(deleteRequest.url).pathname).toBe(
        `/api/downloads/alice/${encodeDirectory('Music\\Daft Punk\\Discovery')}`
      );

      remaining = [];
      deletion.resolve(jsonResponse({ deletedFiles: 2, missingFiles: 1, removedTransfers: 3 }));

      expect(await screen.findByText('Deleted Discovery')).toBeInTheDocument();
      expect(screen.getByText('2 files deleted · 1 already gone')).toBeInTheDocument();
      expect(await screen.findByText('No downloads yet')).toBeInTheDocument();
    });

    it('shows an error toast and keeps the group when the delete fails', async () => {
      stubDownloadsBackend({
        groups: [group],
        deleteResponse: () =>
          jsonResponse(
            {
              statusCode: 409,
              message: 'Deleting downloads is not available (file-management-disabled)',
            },
            409
          ),
      });
      renderDownloadsPage();
      const { card, dialog } = await openDeleteDialog();

      await userEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));

      expect(await screen.findByText('Could not delete Discovery')).toBeInTheDocument();
      expect(screen.getByText(/file-management-disabled/)).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Delete Discovery' })).toBeEnabled();
    });

    it('disables the button with a tooltip to turn on remote file management', async () => {
      stubDownloadsBackend({
        groups: [group],
        capabilities: () =>
          jsonResponse(
            buildCapabilities({ canDelete: false, unavailableReason: 'file-management-disabled' })
          ),
      });
      renderDownloadsPage();
      const card = getCardOf(await screen.findByText('Discovery'));

      const button = await within(card).findByRole('button', { name: 'Delete Discovery' });
      expect(button).toBeDisabled();
      await userEvent.hover(getTooltipTarget(button));

      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'SLSKD_REMOTE_FILE_MANAGEMENT=true'
      );
    });

    it('disables the button with a tooltip naming a destination pattern it cannot follow', async () => {
      stubDownloadsBackend({
        groups: [group],
        capabilities: () =>
          jsonResponse(
            buildCapabilities({
              canDelete: false,
              unavailableReason: 'unsupported-destination-pattern',
              destinationPattern: '${SEARCH_TEXT}/${SOURCE_DIRECTORY}',
            })
          ),
      });
      renderDownloadsPage();
      const card = getCardOf(await screen.findByText('Discovery'));

      const button = await within(card).findByRole('button', { name: 'Delete Discovery' });
      expect(button).toBeDisabled();
      await userEvent.hover(getTooltipTarget(button));

      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        '${SEARCH_TEXT}/${SOURCE_DIRECTORY}'
      );
    });

    it('keeps the button disabled when the backend cannot say whether deleting is possible', async () => {
      stubDownloadsBackend({
        groups: [group],
        capabilities: () =>
          jsonResponse({ statusCode: 502, message: 'Internal server error' }, 502),
      });
      renderDownloadsPage();
      const card = getCardOf(await screen.findByText('Discovery'));

      const button = await within(card).findByRole('button', { name: 'Delete Discovery' });
      await waitFor(() => expect(button.parentElement).toHaveAttribute('data-state'));
      expect(button).toBeDisabled();
      await userEvent.hover(getTooltipTarget(button));

      expect(await screen.findByRole('tooltip')).toHaveTextContent(/Could not check/);
    });
  });
});
