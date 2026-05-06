# SeoulMate_BE Structure

## Overview

`SeoulMate_BE` is organized as a layered Node.js backend skeleton.
The directory layout already separates API flow by responsibility, but as of now most source files are empty placeholders, so this document describes the intended structure based on file names and placement.

## Top-Level Layout

```text
SeoulMate_BE/
|-- docs/
|   `-- STRUCTURE.md
|-- package.json
|-- scripts/
|   |-- seed.js
|   `-- syncPublicData.js
|-- src/
|   |-- app.js
|   |-- server.js
|   |-- clients/
|   |   |-- map.client.js
|   |   |-- openai.client.js
|   |   `-- seoulOpenData.client.js
|   |-- config/
|   |   |-- db.js
|   |   |-- env.js
|   |   `-- openai.js
|   |-- constants/
|   |   |-- datasetType.js
|   |   `-- scoreWeight.js
|   |-- controllers/
|   |   |-- ai.controller.js
|   |   |-- publicData.controller.js
|   |   |-- recommendation.controller.js
|   |   `-- user.controller.js
|   |-- middlewares/
|   |   |-- asyncHandler.js
|   |   |-- auth.js
|   |   |-- errorHandler.js
|   |   `-- validateRequest.js
|   |-- models/
|   |   |-- publicDataset.model.js
|   |   |-- recommendation.model.js
|   |   |-- score.model.js
|   |   `-- user.model.js
|   |-- repositories/
|   |   |-- publicData.repository.js
|   |   |-- recommendation.repository.js
|   |   `-- user.repository.js
|   |-- routes/
|   |   |-- ai.routes.js
|   |   |-- index.js
|   |   |-- publicData.routes.js
|   |   |-- recommendation.routes.js
|   |   `-- user.routes.js
|   |-- services/
|   |   |-- ai.service.js
|   |   |-- publicData.service.js
|   |   |-- recommendation.service.js
|   |   |-- scoring.service.js
|   |   `-- user.service.js
|   |-- utils/
|   |   |-- ApiError.js
|   |   |-- date.js
|   |   |-- normalize.js
|   |   `-- response.js
|   `-- validators/
|       |-- recommendation.validator.js
|       `-- user.validator.js
`-- tests/
    |-- publicData.test.js
    `-- recommendation.test.js
```

## Layer Responsibilities

### `src/app.js`, `src/server.js`

- `app.js`: Express app composition point.
- `server.js`: actual server bootstrap and runtime entrypoint.

At the moment both files are empty, but this split usually means app wiring and process startup are intentionally separated.

### `src/routes/`

- Defines HTTP endpoints by domain.
- `index.js` is likely intended to aggregate sub-routes.
- Domain route files are separated into `ai`, `publicData`, `recommendation`, and `user`.

### `src/controllers/`

- Receives requests from routes.
- Extracts request data and sends HTTP responses.
- Delegates business logic to services.

### `src/services/`

- Core business logic layer.
- `scoring.service.js` suggests recommendation scoring is isolated as a reusable domain service.
- Other services appear aligned with API domains: AI, public data, recommendation, and user.

### `src/repositories/`

- Data access abstraction layer.
- Intended to isolate persistence queries from service logic.
- Currently repository coverage exists for `user`, `recommendation`, and `publicData`.

### `src/models/`

- Persistence schema or entity definition layer.
- Domain models suggest the backend handles users, recommendations, score data, and public datasets.

### `src/clients/`

- External API integration layer.
- File names indicate three external dependencies:
  - map service
  - OpenAI service
  - Seoul open data service

This separation is useful because transport logic, authentication, and response mapping stay outside controllers/services.

### `src/config/`

- Centralized runtime configuration.
- `env.js`: environment variable loading and validation.
- `db.js`: database connection setup.
- `openai.js`: OpenAI-specific configuration.

### `src/middlewares/`

- Shared Express middleware components.
- Covers authentication, async error wrapping, global error handling, and request validation.

### `src/validators/`

- Request schema validation layer.
- Currently scoped to `user` and `recommendation` domains.

### `src/constants/`

- Shared fixed values and domain constants.
- `datasetType.js` and `scoreWeight.js` indicate scoring and dataset categorization rules are meant to be standardized here.

### `src/utils/`

- Cross-cutting helpers that should remain domain-neutral.
- Includes custom error, date helpers, normalization, and response formatting.

## Non-Source Directories

### `scripts/`

- Intended for operational or maintenance tasks.
- `seed.js`: likely database seed/bootstrap data script.
- `syncPublicData.js`: likely sync/import job for Seoul public datasets.

Both files are currently empty placeholders.

### `tests/`

- Intended automated test directory.
- Present files suggest focus on public data and recommendation flows first.

Both test files are currently empty placeholders.

### `docs/`

- Documentation directory for backend-only reference material.
- `STRUCTURE.md` belongs here because it explains repository organization rather than runtime behavior.

## Current State Notes

- `package.json` is currently empty.
- All inspected files under `src/`, `scripts/`, and `tests/` are currently empty.
- The project already has a reasonable backend layering strategy even though implementation has not started yet.

## Recommended Conventions Going Forward

1. Keep request flow consistent as `routes -> controllers -> services -> repositories/models`.
2. Keep external API calls inside `clients/` rather than directly inside controllers or services.
3. Add new validators and tests per domain whenever a new route is introduced.
4. If domain complexity grows, consider creating per-domain folders such as `src/modules/recommendation/` to keep related files closer together.
