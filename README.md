# resonance

[![CI](https://github.com/carlba/resonance/actions/workflows/ci.yml/badge.svg)](https://github.com/carlba/resonance/actions/workflows/ci.yml)

Search for albums and single tracks across providers, starting with
[slskd](https://github.com/slskd/slskd).

## Features

- NestJS backend in [apps/backend](apps/backend) with zod-validated config,
  `nestjs-pino` logging, a global exception filter and request validation.

- Shared libraries in [packages/core](packages/core) (`ApiError`) and
  [packages/nest-modules](packages/nest-modules) (the exception filter).

- Album and track search through slskd is planned, together with a React
  frontend.

## Installation

Requires Node.js 24 and pnpm.

```bash
pnpm install
cp .env.example .env
pnpm run build
```

## Usage

- Start the backend, which listens on `PORT` from `.env` (default 3000):

  ```bash
  pnpm run start      # built app
  pnpm run start:dev  # watch mode
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
