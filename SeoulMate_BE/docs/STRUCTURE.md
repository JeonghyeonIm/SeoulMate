# SeoulMate_BE Structure

## Overview

`SeoulMate_BE` is organized as a layered Express backend written in TypeScript.
The project now includes the initial runtime bootstrap, TypeScript compiler configuration, and PostgreSQL connection scaffolding, while most domain modules remain placeholders for later implementation.

## Top-Level Layout

```text
SeoulMate_BE/
|-- .env.example
|-- AGENTS.md
|-- docs/
|   |-- API.md
|   `-- STRUCTURE.md
|-- package.json
|-- scripts/
|   |-- seed.ts
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

## Layer Responsibilities

### `package.json`, `tsconfig.json`, `.env.example`

- `package.json`: project manifest and runtime scripts
  - `npm run dev`: development server with `ts-node-dev`
  - `npm run build`: TypeScript compile to `dist/`
  - `npm start`: run compiled server
- `tsconfig.json`: TypeScript compiler options with `src/` as input and `dist/` as output
- `.env.example`: baseline environment variable template for local development

### `src/app.ts`, `src/server.ts`

- `app.ts`: Express app composition
  - enables `cors`
  - enables JSON and URL-encoded body parsing
  - exposes `GET /health`
  - mounts the API router under `/api`
- `server.ts`: process entrypoint that starts the HTTP server using `env.PORT`

### `src/routes/`

- Defines HTTP endpoints by domain.
- `index.ts` currently provides a minimal API root endpoint.
- Additional route files are prepared for `ai`, `publicData`, `recommendation`, and `user`.

### `src/controllers/`

- HTTP controller layer.
- Intended to read request data, call services, and build responses.

### `src/services/`

- Business logic layer.
- `scoring.service.ts` is the natural home for recommendation weighting and ranking logic.
- Other services align with `ai`, `publicData`, `recommendation`, and `user` domains.

### `src/repositories/`

- Data access abstraction for PostgreSQL queries and persistence logic.
- Keeps SQL concerns out of controllers and services.

### `src/models/`

- Persistence-facing entity or schema definitions.
- Current model names suggest users, public datasets, recommendations, and scores are core data types.

### `src/clients/`

- External integration layer.
- Intended for map APIs, OpenAI/LLM access, and Seoul public data APIs.
- Provider-specific request/response mapping should stay here.

### `src/config/`

- Centralized configuration and connection setup.
- `env.ts`: loads and normalizes environment variables
- `db.ts`: creates a PostgreSQL `pg.Pool`
- `openai.ts`: reserved for OpenAI-specific configuration

### `src/middlewares/`

- Shared Express middleware components such as auth, validation, async error wrapping, and global error handling.

### `src/validators/`

- Request validation layer, currently prepared for `user` and `recommendation` domains.

### `src/constants/`

- Shared domain constants such as dataset categories and score weights.

### `src/utils/`

- Cross-cutting helpers that should remain domain-neutral, such as error objects, date helpers, normalization utilities, and response formatting.

## Non-Source Directories

### `docs/`

- Backend reference documents.
- `API.md`: endpoint-level API draft
- `STRUCTURE.md`: directory and architecture overview

### `scripts/`

- Reserved for operational jobs such as seeding and public data synchronization.
- Files exist but are still empty placeholders.

### `tests/`

- Reserved for automated tests.
- Current files indicate public data and recommendation flows are intended early test targets.
- Files exist but are still empty placeholders.

## Current State Notes

- TypeScript and Express bootstrap is complete enough to start the dev server and compile the project.
- PostgreSQL connection scaffolding exists in `src/config/db.ts`.
- Most domain files are still placeholders and need implementation.
- The current live endpoints are:
  - `GET /health`
  - `GET /api`

## Recommended Conventions Going Forward

1. Keep request flow consistent as `routes -> controllers -> services -> repositories/models`.
2. Keep all external API calls inside `clients/`.
3. Add new endpoints by implementing the full vertical slice: route, controller, service, validator, repository, and test.
4. Keep scoring rules centralized in `scoring.service.ts` and shared weight values in `constants/scoreWeight.ts`.
