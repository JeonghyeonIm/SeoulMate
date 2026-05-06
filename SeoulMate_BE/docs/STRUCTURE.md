# SeoulMate_BE Structure

## Overview

`SeoulMate_BE` is a layered Express backend scaffold written in TypeScript.
The project already has runtime bootstrap, TypeScript build settings, PostgreSQL connection scaffolding, formatting/linting rules, and pre-commit automation, while most domain-specific modules are still placeholders.

## Top-Level Layout

```text
SeoulMate_BE/
|-- .env.example
|-- .gitignore
|-- .husky/
|   |-- pre-commit
|   `-- _/
|-- .prettierignore
|-- .prettierrc.json
|-- .vscode/
|   `-- settings.json
|-- AGENTS.md
|-- docs/
|   |-- API.md
|   `-- STRUCTURE.md
|-- eslint.config.mjs
|-- package.json
|-- scripts/
|   |-- seed.ts
|   |-- setupHusky.mjs
|   `-- syncPublicData.ts
|-- src/
|   |-- app.ts
|   |-- server.ts
|   |-- clients/
|   |   |-- map.client.ts
|   |   |-- openai.client.ts
|   |   `-- seoulOpenData.client.ts
|   |-- config/
|   |   |-- db.ts
|   |   |-- env.ts
|   |   `-- openai.ts
|   |-- constants/
|   |   |-- datasetType.ts
|   |   `-- scoreWeight.ts
|   |-- controllers/
|   |   |-- ai.controller.ts
|   |   |-- publicData.controller.ts
|   |   |-- recommendation.controller.ts
|   |   `-- user.controller.ts
|   |-- middlewares/
|   |   |-- asyncHandler.ts
|   |   |-- auth.ts
|   |   |-- errorHandler.ts
|   |   `-- validateRequest.ts
|   |-- models/
|   |   |-- publicDataset.model.ts
|   |   |-- recommendation.model.ts
|   |   |-- score.model.ts
|   |   `-- user.model.ts
|   |-- repositories/
|   |   |-- publicData.repository.ts
|   |   |-- recommendation.repository.ts
|   |   `-- user.repository.ts
|   |-- routes/
|   |   |-- ai.routes.ts
|   |   |-- index.ts
|   |   |-- publicData.routes.ts
|   |   |-- recommendation.routes.ts
|   |   `-- user.routes.ts
|   |-- services/
|   |   |-- ai.service.ts
|   |   |-- publicData.service.ts
|   |   |-- recommendation.service.ts
|   |   |-- scoring.service.ts
|   |   `-- user.service.ts
|   |-- utils/
|   |   |-- ApiError.ts
|   |   |-- date.ts
|   |   |-- normalize.ts
|   |   `-- response.ts
|   `-- validators/
|       |-- recommendation.validator.ts
|       `-- user.validator.ts
|-- tests/
|   |-- publicData.test.ts
|   `-- recommendation.test.ts
`-- tsconfig.json
```

## Runtime and Tooling Files

### `package.json`

- Defines project scripts:
  - `npm run dev`
  - `npm run build`
  - `npm start`
  - `npm run lint`
  - `npm run lint:fix`
  - `npm run format`
  - `npm run format:check`
  - `npm run prepare`
- Holds `lint-staged` rules for staged file formatting and lint fixing.

### `tsconfig.json`

- Compiles `src/**/*.ts` into `dist/`.
- Current output directory is `dist/`.
- Strict TypeScript mode is enabled.

### `.env.example`

- Template for local runtime variables.
- Real `.env` values must stay out of version control.

### `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`

- `eslint.config.mjs`: ESLint flat config for TypeScript and import ordering
- `.prettierrc.json`: project formatting rules
- `.prettierignore`: files excluded from Prettier

### `.husky/`, `scripts/setupHusky.mjs`

- `.husky/pre-commit`: entry hook that triggers `lint-staged`
- `.husky/_/`: wrapper scripts used by Git hooks
- `scripts/setupHusky.mjs`: sets up the hook path for the parent Git repository layout

## Application Layers

### `src/app.ts`, `src/server.ts`

- `app.ts` composes the Express app.
  - enables `cors`
  - enables JSON and URL-encoded body parsing
  - exposes `GET /health`
  - mounts the API router under `/api`
- `server.ts` starts the HTTP server using the configured port.

### `src/routes/`

- Entry point for HTTP path declarations.
- `index.ts` currently provides the minimal `/api` root endpoint.
- Additional route files are reserved for domain-specific endpoints.

### `src/controllers/`

- HTTP controller layer.
- Intended to translate validated request data into service calls and responses.

### `src/services/`

- Business logic layer.
- `scoring.service.ts` is the intended center for recommendation weighting and ranking logic.

### `src/repositories/`

- PostgreSQL access boundary.
- Keeps query and persistence code out of controllers and services.

### `src/models/`

- Persistence-facing entities or schema definitions.
- Current model names imply `User`, `Recommendation`, `Score`, and `PublicDataset` as primary data concepts.

### `src/clients/`

- External integration boundary.
- Intended for map APIs, OpenAI/LLM calls, and Seoul public/open data APIs.

### `src/config/`

- Centralized runtime configuration.
- `env.ts`: loads and normalizes environment variables
- `db.ts`: creates a `pg.Pool`
- `openai.ts`: placeholder for OpenAI-specific setup

### `src/middlewares/`

- Shared Express pipeline logic.
- Intended for auth, validation, async wrapping, and global error handling.

### `src/validators/`

- Request validation layer prepared for `user` and `recommendation` domains.

### `src/constants/`

- Shared domain constants.
- Expected to hold scoring weights and dataset classifications.

### `src/utils/`

- Cross-cutting helpers that should stay domain-neutral.

## Supporting Directories

### `docs/`

- Human-facing backend reference material.
- `API.md`: API draft and endpoint plan
- `STRUCTURE.md`: repository structure and runtime layout

### `scripts/`

- Project-local setup or operational jobs.
- `seed.ts` and `syncPublicData.ts` are placeholders.

### `tests/`

- Placeholder test directory.
- Test targets are present, but no runner is wired yet.

## Current State Notes

- TypeScript build and Express bootstrap are working.
- Formatting and linting are configured and runnable.
- Pre-commit formatting/lint automation is configured through Husky and lint-staged.
- PostgreSQL connection scaffolding exists, but no domain repository logic is implemented yet.
- Most files outside the runtime/config/bootstrap path are still placeholders.

## Current Live Endpoints

- `GET /health`
- `GET /api`

## Recommended Conventions Going Forward

1. Keep the request flow as `routes -> controllers -> services -> repositories/models`.
2. Keep external API calls inside `clients/`.
3. Add new features as full vertical slices, not one isolated file at a time.
4. Keep scoring logic centralized in `services/scoring.service.ts`.
5. Run `npm run format` and `npm run lint` after meaningful changes.
