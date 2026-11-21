# Project Guidelines

## Overview

**Resonance** is a service for searching albums and single tracks across different providers,
starting with [slskd](https://github.com/slskd/slskd). It consists of a NestJS backend that forwards
searches to the providers and groups the results, and a React frontend for searching and browsing
the results.

It's a pnpm workspace monorepo using ESM modules, Vitest for testing, and oxlint + Prettier for code
quality. `apps/*` holds executables/services and `packages/*` holds shared libraries, each with its
own `package.json`, `tsconfig.json`, and `src/`.

This file has two parts:

- **Part A** describes the repo exactly as it stands today — always applicable.

- **Part B** is conditional guidance for capabilities this project doesn't have yet or only has in
  part (the web frontend, outbound HTTP calls), plus the backend conventions for `apps/backend`.
  Follow it once that capability is actually added — it is not a description of current code, and
  its absence today doesn't mean it's discouraged.

# Part A — Current state

## Structure & dependency graph

Three workspace packages exist today, wired together via pnpm's `workspace:*` protocol:

- `apps/backend` (`@carlba/backend`) — NestJS backend. Today it has config (`@nestjs/config` + zod),
  logging (`nestjs-pino`), the global exception filter, a global `ValidationPipe`, the
  `SearchProvider` abstraction with its slskd implementation (`src/providers/`) and track search
  (`GET /tracks`, `src/tracks/`); album search comes next.
  Depends on `core` and `nest-modules`. See `.claude/rules/backend-nest.md`.

- `packages/core` (`@carlba/core`) — shared library holding `ApiError`. No internal deps (leaf).
  Only holds code that's actually shared by more than one app — code used by a single app belongs in
  that app's own `src/`, not here.

- `packages/nest-modules` (`@carlba/nest-modules`) — shared NestJS modules, currently
  `ExceptionFilterModule` / `AllExceptionsFilter` (the global exception filter). Depends on `core`.

Dependency graph: `backend → nest-modules → core`, `backend → core`.

Planned apps:

- `apps/frontend` — React web UI for searching albums and tracks.

## Commands

Run from the repo root; they fan out across all workspace packages via pnpm:

- `pnpm run build` — compile TypeScript in every package (`pnpm -r run build`)

- `pnpm run start` / `pnpm run start:dev` — run the backend (`@carlba/backend`) / run it in watch
  mode

- `pnpm test` — run tests once across every package (`pnpm -r run test`)

- `pnpm run test:coverage` — test with coverage

- `pnpm run lint` — lint the codebase (`oxlint --type-aware`, config in `.oxlintrc.json`)

- `pnpm run format` / `pnpm run format:check` — format code with Prettier

- `pnpm run dependency:update` — `pnpm up -r --latest`, excluding `typescript`, `vitest`,
  `@types/node`

Use `pnpm --filter <package-name> <script>` to target a single workspace package, e.g.
`pnpm --filter @carlba/core test` or `pnpm --filter @carlba/backend build`.

## Adding a new package

- Executable or service → `apps/<name>`. Shared library consumed by other packages →
  `packages/<name>`. No registration step beyond creating the directory — `pnpm-workspace.yaml`
  already globs `apps/*` and `packages/*`.

- Only put code in `packages/*` once it's actually used by more than one app. Code used by a single
  app stays in that app's own `src/` until a second consumer appears — don't pre-extract "shared"
  packages speculatively.

- `package.json`: scope the name `@carlba/<name>`, `"type": "module"`, `"private": true`. Declare
  internal dependencies as `"@carlba/other": "workspace:*"`. Libraries need `main`/`types`/`exports`
  pointing at `dist/`; bin apps need a `bin` field instead.

- `tsconfig.json`:
  `{ "extends": "../../tsconfig.json", "compilerOptions": { "rootDir": "./src", "outDir": "./dist" }, "include": ["src"] }`.
  Libraries also set `declaration: true, declarationMap: true`.

- `vitest.config.ts`: copy the shape used by the existing packages — `environment: 'node'`, v8
  coverage with `text`/`json`/`html` reporters, `dir: 'src'`.

## Shared packages

Config and logging in the backend go through `@nestjs/config` (zod-validated env schema) and
`nestjs-pino` — never ad hoc `process.env` reads or hand-built `pino` instances. See
`.claude/rules/backend-nest.md` for the exact setup.

Services and domain logic should throw `ApiError` (`@carlba/core`, `packages/core/src/errors.ts`)
rather than plain `Error`s. Packages can inherit from `ApiError` and create more specific errors if
needed.

```ts
import { ApiError } from '@carlba/core';

throw new ApiError(`User not found: id=${userId}`, { statusCode: 404, cause: originalError });
```

- `statusCode` is loosely based on HTTP status codes since that's a well-known, well-understood
  scale — it doesn't imply the error is HTTP-specific.

- `ApiError` should be caught by global error handling (the backend's global exception filter from
  `@carlba/nest-modules`), not by the code that throws it.

- The consumer/global handler decides how to present the error to the end user — services and domain
  logic just throw with an accurate `statusCode` and message; they shouldn't format a response
  themselves.

- When throwing errors be descriptive in the error message, include a statusCode matching the
  situation. If the ApiError was caused by another error then include that error as the cause.

### Formatting `ApiError` messages

A global handler only sees the error, not the code path that led to it — the stack trace shows where
`ApiError` was constructed, but not _which_ input or entity was involved. The message is the only
situational context that survives, so it must carry the specifics:

- Include the identifying data in the message, not a generic phrase:
  `` `User not found: id=${userId}` `` rather than `'User not found'`. Prefer `key=value` pairs for
  the identifying data so messages stay greppable in logs.

- When wrapping a lower-level error (a DB error, a failed HTTP request, etc.), pass it as `cause`
  rather than discarding it, so both stacks are preserved:

  ```ts
  try {
    return await db.users.findById(userId);
  } catch (dbError) {
    throw new ApiError(`Failed to load user: id=${userId}`, { statusCode: 404, cause: dbError });
  }
  ```

  Pino's default serializer includes `cause` when logging the error (see the global exception
  filter in `.claude/rules/backend-nest.md`), so the log shows the full chain instead of just the
  outer `ApiError`.

- Never put user-facing formatting in the message (no trailing punctuation styling, no HTML) — the
  consumer decides how to present it; the message is for logs and developers.

## Loading `.env` files

There is one `.env` at the repo root (see `.env.example`). The backend loads it through
`@nestjs/config` (`envFilePath: '../../.env'`, since pnpm runs package scripts from
`apps/backend`), so its scripts need no `--env-file` flag. A variable already set in the shell wins
over the file.

## TypeScript & code style

### Clean code principles

- Use meaningful names for variables, functions, parameters, and classes.

- Keep functions small and focused on a single responsibility.

- Extract magic numbers and strings into named constants.

- Prefer positive conditionals: `if (isValid)` instead of `if (!isInvalid)`.

- Use fewer than three parameters when possible. If more are needed, use an options object.

- Avoid duplicated logic by extracting shared helper functions.

- Comment why a decision was made, not what the code already shows.

### TypeScript rules

- Use strict TypeScript and follow the root `tsconfig.json` (extended by every package).

- Prefer `interface` for object shapes and `type` for unions, intersections, and aliases.

- Avoid `any`; use `unknown` when the type is uncertain and narrow it explicitly.

- Use `const` by default, and use `let` only when reassignment is necessary.

- Prefer explicit return types on exported functions.

- Use ESM imports and exports (`verbatimModuleSyntax` is on — include file extensions in relative
  imports, e.g. `./schema.js`).

- Prefer named exports over default exports.

### Naming conventions

| Construct              | Convention                      | Example                                 |
| ---------------------- | ------------------------------- | --------------------------------------- |
| Variables / parameters | camelCase, descriptive nouns    | `userResponse`, `retryCount`            |
| Functions              | camelCase, verb phrases         | `fetchUserProfile`, `parseErrorMessage` |
| Classes / interfaces   | PascalCase                      | `HttpClient`, `UserRepository`          |
| Constants              | UPPER_SNAKE_CASE (module-level) | `MAX_RETRY_ATTEMPTS`                    |
| Types                  | PascalCase                      | `ApiResponse`, `RequestOptions`         |
| Files                  | kebab-case                      | `user-service.ts`, `parse-response.ts`  |

## Testing

- Use Vitest and colocate test files with source files using `.spec.ts` (e.g. `greet.ts` +
  `greet.spec.ts`).

- Write behavior-focused tests, not implementation tests.

- Prefer `vi.mock` for external dependencies and avoid mocking internals.

- Cover edge cases and error paths, not just the happy path.

- Each package runs its own Vitest config — there is no aggregated root test runner beyond
  `pnpm -r run test`.

## Error handling

- Never swallow errors with empty `catch` blocks.

- Wrap third-party errors with context before rethrowing.

- Validate external inputs at system boundaries: API responses, environment variables, CLI args.

## Verification checklist

Before considering a change done:

1. `pnpm run lint`, `pnpm run test`, `pnpm run build` from root (or the `pnpm --filter <pkg> ...`
   equivalents when working in a single package).

2. Update `README.md` if the change affects documented usage or structure.

# Part B — Conditional conventions

These apply once the corresponding capability is added to the project. Follow them at that point;
their absence today isn't a signal to avoid them.

## HTTP client usage

_Applies whenever any package needs to make outbound HTTP calls._

- In NestJS apps, use [`@nestjs/http-client`](https://www.npmjs.com/package/@nestjs/http-client).
  Outside Nest (plain libraries in `packages/*`), use [`got`](https://github.com/sindresorhus/got).

- Do not use `fetch` directly, `axios`, `node-fetch`, or `@nestjs/axios`.

- Register one named client per upstream service with `HttpClientModule.registerAsync()`, taking
  `baseUrl`, auth headers and `timeout` from `ConfigService`, and inject it with
  `@InjectHttpClient(name)`. The client retries idempotent requests on its own; don't add a second
  retry loop.

- The client doesn't validate response bodies. Parse `response.data` with a zod schema at the
  boundary instead of casting it.

- Catch `HttpClientError` (and its subclasses `HttpResponseError`, `HttpNetworkError`,
  `HttpTimeoutError`, `HttpParseError`) and rethrow it as an `ApiError` with context and the
  original error as `cause`. Don't use the package's `toHttpException()`; the global exception
  filter handles `ApiError`.

- In tests, pass a stub `fetch` to `HttpClientModule.forRoot({ fetch })` rather than mocking the
  client, and build a new `Response` per call, since a body can only be read once.

```ts
import { ApiError } from '@carlba/core';
import { HttpClient, HttpClientError, InjectHttpClient } from '@nestjs/http-client';

@Injectable()
export class UserClient {
  constructor(@InjectHttpClient('users') private readonly httpClient: HttpClient) {}

  async fetchUser(userId: string): Promise<User> {
    try {
      const { data } = await this.httpClient.get('users/:userId', { params: { userId } });
      return userSchema.parse(data);
    } catch (error) {
      if (error instanceof HttpClientError) {
        throw new ApiError(`Failed to fetch user: userId=${userId}`, {
          statusCode: 502,
          cause: error,
        });
      }
      throw error;
    }
  }
}
```

## Backend / API apps

_Applies to the HTTP backend in `apps/backend`._

The backend uses NestJS. Its conventions live in the path-scoped rule
`.claude/rules/backend-nest.md`, which loads automatically when a file under `apps/backend/**` is
read or edited; read it before scaffolding or extending the backend.

- Prefer TypeScript on Node.js for backend services.

- Use NestJS only. Do not introduce other frameworks (e.g. plain Express, Fastify + InferDI) unless
  explicitly requested.

- Services and domain logic throw `ApiError` (`@carlba/core`, see Shared packages above)

- Config and logging use `@nestjs/config` and `nestjs-pino` (see the rule file) — no ad hoc
  `process.env` usage or hand-built `pino` instances.

- Always configure database access via a single full connection URI (e.g. `DATABASE_URL`,
  `postgresql://user:password@host:5432/dbname`) rather than separate `DB_HOST`/`DB_PORT`/`DB_USER`/
  `DB_PASSWORD`/`DB_NAME` variables. Validate it as one `z.string().url()` (or driver-specific
  refinement) field in the zod env schema and pass it straight to the DB client/driver, which
  already accepts a URI — don't split it apart and reassemble it. A single var is easier to rotate,
  matches what most hosting providers (Render, Railway, Neon, RDS, Docker Compose, etc.) inject, and
  avoids the schema drifting out of sync with the driver's own URI parsing.

- Favor clear types, explicit interfaces, and predictable module boundaries.

- Optimize for maintainability, testability, and low operational complexity.

- Add a `.http` file for the project with examples on how to interact with the API. The format
  should be in [httpYac](https://httpyac.github.io) format

  ```http
  ### List all X Entities
  @app_token = {{$dotenv APP_TOKEN}}
  POST http://homeassistant:8123/api/services/homeassistant/reload_all
  Authorization: Bearer {{app_token}}
  Content-Type: application/json

  ### Description
  @app_token = {{$dotenv APP_TOKEN}}
  POST http://homeassistant`:8123/api/services/homeassistant/restart
  Authorization: Bearer {{hass_token}}
  Content-Type: application/json
  ```

## Frontend / Web UI apps

_Applies to the web UI — the planned
`apps/frontend` package._

- Use React with TypeScript as the standard for all web UI work.

- Use [shadcn/ui](https://ui.shadcn.com) as the primary component library; add components via
  `npx shadcn@latest add <component>` and own the generated source in `src/components/ui/`.

- Use Tailwind CSS utility classes for all styling; avoid plain CSS files unless Tailwind cannot
  express the style.

- Use shadcn/ui's built-in CSS variables and `tailwind.config` theme extension to define colors,
  typography, and spacing consistently; do not hardcode color values.

- Design responsive layouts using Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`, etc.); every
  UI must work on mobile, tablet, and desktop.

- Do not introduce MUI, Chakra UI, Ant Design, or other component libraries unless explicitly
  requested.

- Keep components small and focused on a single responsibility; move business logic into custom
  hooks or service modules.

- Use React Router for client-side routing when navigation is required. If query params are used,
  use the [`useSearchParams`](https://reactrouter.com/api/hooks/useSearchParams) hook.

- Prefer functional components and React hooks; do not use class components.

- Lift state only as far as needed; prefer local component state or context over global state
  libraries unless the app clearly requires it.

- Follow accessible HTML patterns; shadcn/ui is built on Radix UI primitives which provide ARIA
  support — supplement with explicit labels where needed.
