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

- React frontend in [apps/frontend](apps/frontend): search albums or tracks,
  see quality and availability, filter by format and sort by quality, speed or
  size. The search, filter and sort live in the URL, so a search can be shared
  and reloaded. Works on mobile, tablet and desktop.

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
