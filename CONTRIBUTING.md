# Contributing

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

- **type** — one of the types below.

- **scope** — optional; the affected package or area, e.g. `core`, `nest-modules`, `backend`,
  `frontend`.

- **description** — imperative, lowercase, no trailing period, e.g. `add album search endpoint`.

### Types

| Type       | Use for                                                 |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new feature                                           |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only                                      |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                                 |
| `test`     | Adding or updating tests                                |
| `build`    | Build system or dependencies (pnpm, tsconfig)           |
| `chore`    | Maintenance that doesn't touch source or tests          |

### Breaking changes

Add `!` after the type/scope and describe the change in a `BREAKING CHANGE:` footer:

```text
feat(core)!: rename ApiError status to statusCode

BREAKING CHANGE: `ApiError.status` is now `ApiError.statusCode`.
```

### Examples

```text
feat(backend): add slskd track search
fix(nest-modules): log error cause in exception filter
docs: add contributing guide
chore: update dependencies
```
