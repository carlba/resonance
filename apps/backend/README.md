# @carlba/backend

NestJS backend for resonance. It forwards album and track searches to
providers (slskd first) and groups the results.

## Usage

Run these from the repo root. The app reads the root `.env`
(see [.env.example](../../.env.example)).

```bash
pnpm --filter @carlba/backend start:dev
pnpm --filter @carlba/backend test
pnpm --filter @carlba/backend test:e2e
```

[requests.http](requests.http) has example requests for every endpoint.
Conventions for this app live in
[.claude/rules/backend-nest.md](../../.claude/rules/backend-nest.md).
