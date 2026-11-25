# resonance

[![CI](https://github.com/carlba/resonance/actions/workflows/ci.yml/badge.svg)](https://github.com/carlba/resonance/actions/workflows/ci.yml)

Search for albums and single tracks across providers, starting with
[slskd](https://github.com/slskd/slskd).

## Features

- NestJS backend in [apps/backend](apps/backend) with zod-validated config,
  `nestjs-pino` logging, a global exception filter and request validation.

- Shared libraries in [packages/core](packages/core) (`ApiError`) and
  [packages/nest-modules](packages/nest-modules) (the exception filter).

- Track search through slskd: `GET /tracks?q=<term>` returns every file
  found, audio or not (cover art, cue sheets and logs are kept), with quality
  (format, bitrate, bit depth, sample rate, duration) and
  the sharing user's availability (free upload slot, queue length, upload
  speed).

- Album search through slskd: `GET /albums?q=<term>` groups the files found
  into albums by user and folder (disc sub-folders such as `CD1` are folded
  into their album; folders without audio files are left out), each with a
  guessed artist, album and year, the track count, total size and duration,
  the dominant format and bitrate, the sharing user's availability and all of
  its files. Non-audio files count towards the size only.

- Downloads through slskd: `POST /downloads` enqueues the files of an album or
  a single track (`{ "username": "...", "files": [{ "path": "...", "size": 1 }] }`),
  and `GET /downloads` lists every slskd download live, grouped by user and
  folder with an overall state (`downloading`, `succeeded` or `failed`),
  progress and speed. Nothing is stored locally.

- Deleting downloads: `DELETE /downloads/:username/:directory` (the folder is
  the group's `directory`, base64url-encoded) cancels what is still running,
  deletes the group's files from slskd's downloads and incomplete folders,
  removes the folders that leaves empty and then removes the transfers from
  slskd. It answers `{ "deletedFiles": 1, "missingFiles": 0, "removedTransfers": 1 }`;
  a file that was already gone counts as missing. If anything fails before the
  last step the transfers stay listed, so the delete can be retried.
  `GET /downloads/capabilities` tells whether deleting is possible. See
  [Deleting downloads](#deleting-downloads) for what slskd needs.

- React frontend in [apps/frontend](apps/frontend): search albums or tracks,
  see quality and availability, filter by format and sort by quality, speed or
  size. An "Advanced filters" panel narrows the results by quality preset
  (≥ 256 kbps, ≥ 320 kbps, CD, Lossless or Hi-Res; albums are judged by their
  dominant quality) and, for albums, to rips with a `.log` file and to a range
  of track counts. Album cards show "log" and "cue" badges. The search, filters
  and sort live in the URL, so a search can be shared and reloaded. Works on
  mobile, tablet and desktop.

  Every album and track result has a "Download" button that enqueues its files
  in slskd (for an album: every file in the folder, logs, cue sheets and cover
  art included) and confirms with a toast. Result cards show a Downloading,
  Downloaded or Failed badge while slskd has transfers for their files; the
  button is disabled until a failed download can be retried. The `/downloads`
  page lists all downloads with progress and an expandable file list. Statuses
  refresh every `VITE_DOWNLOADS_POLL_INTERVAL_MS` (default 2000 ms). Each
  download on that page has a "Delete" button that, after a confirmation,
  deletes its files from disk for good and reports how many files were deleted
  and how many were already gone.

## Installation

Requires Node.js 24 and pnpm.

```bash
pnpm install
cp .env.example .env  # then set SLSKD_URL and SLSKD_API_KEY
pnpm run build
```

The backend needs a running [slskd](https://github.com/slskd/slskd) instance
with an API key (`web.authentication.api_keys` in its config).
`SEARCH_TIMEOUT_MS` caps how long a search request waits for slskd.

### Deleting downloads

Deleting removes files from slskd's disk, so slskd must allow it and resonance
must be able to work out where slskd saved each file:

- Turn on remote file management in slskd, with `SLSKD_REMOTE_FILE_MANAGEMENT=true`
  or `remote_file_management: true` in its config. It is off by default; while
  it is off, the "Delete" buttons are disabled with a tooltip saying so. The
  backend reads the setting from slskd's options, the frontend never calls
  slskd.

- The API key resonance uses needs the `administrator` role
  (`web.authentication.api_keys.<name>.role` in slskd's config): slskd up to
  0.26 only lets administrators read its options, where the backend finds out
  whether file management is on and which destination pattern is set. Without
  it, the buttons stay disabled with a tooltip saying so.

- slskd's `transfers.download.destination.subdirectory` pattern decides the
  local folder. `${SOURCE_USERNAME}`, `${SOURCE_PATH}`, `${SOURCE_DIRECTORY}`
  (the default) and `{}` are supported. A pattern with `${BATCH_ID}`,
  `${BATCH_EXTERNAL_ID}`, `${SEARCH_ID}` or `${SEARCH_TEXT}` disables deleting,
  since slskd doesn't report those with a transfer. The tooltip names the
  pattern.

- The backend and slskd must agree on the names: resonance mirrors slskd's file
  name sanitizing using the Windows set of invalid characters. On Linux slskd
  only replaces `/` and `\0`, so a file with `:`, `?` or `*` in its name is
  saved under its own name, isn't found and is reported as missing. It stays on
  disk.

- slskd's "rename if the file exists" strategy is not followed: a file saved
  as `01.flac` while another existed is not found.

## Usage

- Start the backend, which listens on `PORT` from `.env` (default 3000):

  ```bash
  pnpm run start      # built app
  pnpm run start:dev  # watch mode
  ```

- Start the frontend next to the backend, then open <http://localhost:5173>.
  Its dev server forwards `/api/*` to the backend on port 3000:

  ```bash
  pnpm run start:frontend
  ```

- Try the endpoints with [apps/backend/requests.http](apps/backend/requests.http)
  in an [httpYac](https://httpyac.github.io) client.

- Run the checks:

  ```bash
  pnpm run lint
  pnpm run test
  pnpm --filter @carlba/backend run test:e2e
  ```

## Contributing

See [CLAUDE.md](CLAUDE.md) for the repo structure and code conventions.

## License

UNLICENSED, see [package.json](package.json).
