# Plan: Apply the "Forking this template" steps for Resonance

## Context

The repo is still the generic `typescript-template`. Before starting the backend work (#2, sub-task of story #1), the five fork steps from the `CLAUDE.md` callout must be done so the repo describes Resonance — a NestJS backend + React frontend for searching albums/tracks via providers (slskd first).

Decisions from the user:

- Remove `apps/cli`, `packages/config` and `packages/logger` (the CLI demo and its Fastify/CLI-only bootstrap packages).

- Point root start scripts and the Dockerfile at `@carlba/backend` now, even though it only exists after #2.

- Commit directly to `main` and push.

## Changes

### Step 3 — Rename `typescript-template` → `resonance`

- `package.json`: `name`, `description` ("Search albums and tracks across providers, starting with slskd"), `homepage`, `bugs.url`, `repository.url` → `carlba/resonance`.

- `README.md`: title `# resonance` + one-line description (follow `.github/instructions/readme-format.instructions.md` lightly — keep it short; fuller README comes with #2).

- The remaining hits (`apps/cli/src/cli.ts`, CLAUDE.md example) disappear with the CLI removal / CLAUDE.md rewrite.

### Remove CLI + config + logger

- Delete `apps/cli/`, `packages/config/`, `packages/logger/` (`git rm -r`).

- `packages/core/package.json`: drop the unused `@carlba/logger` dependency (no imports of it in `packages/core/src`).

- `.env.example`: replace the CLI demo `NAME="Carl"` with the backend vars from the Nest rule (`NODE_ENV`, `PORT=3000`, `LOG_LEVEL=debug`).

- `.claude/settings.json`: remove the four `@carlba/cli` / `apps/cli` permission entries.

- `pnpm install` to regenerate `pnpm-lock.yaml`.

### Step 4 — Start scripts / entrypoint

- Root `package.json`: `"start": "pnpm --filter @carlba/backend start:prod"`, `"start:dev": "pnpm --filter @carlba/backend start:dev"` (Nest CLI's generated script names; `.env` is loaded by `@nestjs/config`, so no `--env-file` flag).

- `Dockerfile`: `ENTRYPOINT ["node", "apps/backend/dist/main.js"]`, `EXPOSE 3000`, drop the CLI-specific comments and `VOLUME`. Note: the image build will fail until #2 lands — acceptable per decision.

### Step 5 — Backend rule

- `git rm .claude/rules/backend-fastify.md`; keep `.claude/rules/backend-nest.md` unchanged.

### Steps 1, 2 — `CLAUDE.md`

- Delete the "Forking this template?" callout.

- **Overview:** describe Resonance directly (pnpm ESM monorepo, NestJS backend in `apps/backend`, React frontend in `apps/frontend`, Vitest, oxlint + Prettier); keep the Part A / Part B explanation but reword "capabilities this template doesn't have yet" → "this project doesn't have yet".

- **Structure & dependency graph:** list the actual packages — `packages/core` (`ApiError`, no internal deps) and `packages/nest-modules` (`ExceptionFilterModule`/`AllExceptionsFilter`, depends on `core`) — and note `apps/backend` (#2) and `apps/frontend` as planned.

- **Commands:** update `start`/`start:dev` descriptions to the backend; fix `--filter` examples to `@carlba/core` / `@carlba/backend`.

- **Adding a new package:** `vitest.config.ts` — "copy the shape used by the existing packages" (not "all four").

- **Shared packages:** remove the `@carlba/config`/`@carlba/logger` bootstrap examples and `getConfig`/`initConfig` text; keep the `ApiError` guidance and "Formatting `ApiError` messages" unchanged. Point to the Nest rule for config/logging.

- **Loading `.env` files:** replace with: the backend loads the root `.env` through `@nestjs/config` (`envFilePath: '../../.env'`), see the Nest rule.

- **Part B — CLI apps:** remove the section (no CLI anymore; it is built entirely on the deleted packages).

- **Part B — Backend / API apps:** NestJS only — drop the Fastify + InferDI bullet, the "pick exactly one stack" Fastify wording, and the Fastify half of the config/logging bullet. Keep everything else (DB URI, `.http` file, etc.).

- Frontend and HTTP client sections stay as is.

### Commit

- One commit on `main`: `chore: specialize template into resonance` (with the `Co-Authored-By: Claude Opus 5.5` trailer), then `git push`.

## Verification

- `grep -rn "typescript-template\|@carlba/cli\|@carlba/config\|@carlba/logger" --exclude-dir=node_modules --exclude-dir=.git .` returns nothing (except possible mentions inside `.claude/rules/backend-nest.md`, which stays unchanged).

- `pnpm install`, `pnpm run lint`, `pnpm run test`, `pnpm run build` pass at the root (only `core` and `nest-modules` remain).

- `pnpm run format:check` passes.

- `pnpm run start` is expected to fail until #2 adds `@carlba/backend` — not a regression to fix here.
