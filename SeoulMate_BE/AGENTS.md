## Project Overview

- SeoulMate backend is intended to provide user-facing APIs for user management, public data ingestion, AI-assisted course generation, and recommendation scoring.
- The current repository is a backend skeleton: directory boundaries are established, but the implementation files are still empty placeholders.
- Tech stack:
  - Runtime: Node.js
  - Framework: Express
  - Language: TypeScript as target standard, but current files are JavaScript placeholders
  - Database: PostgreSQL
  - Infra: EC2 + RDS (PostgreSQL)
- Architecture pattern:
  - Current repository structure follows a layered MVC-style backend: `routes -> controllers -> services -> repositories/models`
  - External systems are isolated under `clients/`

## Directory Structure

```text
SeoulMate_BE/
|-- AGENTS.md                    # Repository-level instructions for contributors and agents
|-- docs/
|   `-- STRUCTURE.md             # Backend structure reference
|-- package.json                 # Node package manifest; currently empty
|-- scripts/
|   |-- seed.js                  # Seed/bootstrap script placeholder
|   `-- syncPublicData.js        # Public data sync/import script placeholder
|-- src/
|   |-- app.js                   # Express app composition entrypoint placeholder
|   |-- server.js                # Process bootstrap/server startup placeholder
|   |-- clients/
|   |   |-- map.client.js        # Map or routing API client placeholder
|   |   |-- openai.client.js     # LLM integration client placeholder
|   |   `-- seoulOpenData.client.js
|   |                             # Seoul public/open data API client placeholder
|   |-- config/
|   |   |-- db.js                # Database connection config placeholder
|   |   |-- env.js               # Environment variable loading/validation placeholder
|   |   `-- openai.js            # OpenAI-specific config placeholder
|   |-- constants/
|   |   |-- datasetType.js       # Public dataset category constants placeholder
|   |   `-- scoreWeight.js       # Recommendation scoring weight constants placeholder
|   |-- controllers/
|   |   |-- ai.controller.js     # HTTP controller for AI endpoints placeholder
|   |   |-- publicData.controller.js
|   |   |                         # HTTP controller for public data endpoints placeholder
|   |   |-- recommendation.controller.js
|   |   |                         # HTTP controller for recommendation endpoints placeholder
|   |   `-- user.controller.js   # HTTP controller for user endpoints placeholder
|   |-- middlewares/
|   |   |-- asyncHandler.js      # Async error wrapper placeholder
|   |   |-- auth.js              # Authentication middleware placeholder
|   |   |-- errorHandler.js      # Global error handler placeholder
|   |   `-- validateRequest.js   # Request validation middleware placeholder
|   |-- models/
|   |   |-- publicDataset.model.js
|   |   |                         # Public dataset persistence model placeholder
|   |   |-- recommendation.model.js
|   |   |                         # Recommendation persistence model placeholder
|   |   |-- score.model.js       # Score persistence model placeholder
|   |   `-- user.model.js        # User persistence model placeholder
|   |-- repositories/
|   |   |-- publicData.repository.js
|   |   |                         # Public data query layer placeholder
|   |   |-- recommendation.repository.js
|   |   |                         # Recommendation query layer placeholder
|   |   `-- user.repository.js   # User query layer placeholder
|   |-- routes/
|   |   |-- ai.routes.js         # AI route declarations placeholder
|   |   |-- index.js             # Route aggregator placeholder
|   |   |-- publicData.routes.js # Public data route declarations placeholder
|   |   |-- recommendation.routes.js
|   |   |                         # Recommendation route declarations placeholder
|   |   `-- user.routes.js       # User route declarations placeholder
|   |-- services/
|   |   |-- ai.service.js        # AI orchestration/business logic placeholder
|   |   |-- publicData.service.js
|   |   |                         # Public data normalization/import logic placeholder
|   |   |-- recommendation.service.js
|   |   |                         # Recommendation orchestration logic placeholder
|   |   |-- scoring.service.js   # Score calculation logic placeholder
|   |   `-- user.service.js      # User domain logic placeholder
|   |-- utils/
|   |   |-- ApiError.js          # Shared application error type placeholder
|   |   |-- date.js              # Date utility placeholder
|   |   |-- normalize.js         # Data normalization utility placeholder
|   |   `-- response.js          # API response formatter placeholder
|   `-- validators/
|       |-- recommendation.validator.js
|       |                         # Recommendation request validator placeholder
|       `-- user.validator.js    # User request validator placeholder
`-- tests/
    |-- publicData.test.js       # Public data test placeholder
    `-- recommendation.test.js   # Recommendation test placeholder
```

- Major roles:
  - `src/routes`: declare endpoint paths and attach middleware/controller handlers
  - `src/controllers`: translate HTTP requests into service calls and HTTP responses
  - `src/services`: hold business logic and orchestration across repositories and clients
  - `src/repositories`: isolate PostgreSQL access and query logic
  - `src/models`: define database-facing entities or schemas
  - `src/clients`: isolate all external API calls, authentication headers, retries, and response mapping
  - `src/config`: centralize env parsing, DB setup, and provider configuration
  - `src/constants`: store domain constants that must stay synchronized across features
  - `src/middlewares`: cross-cutting request pipeline logic
  - `src/validators`: request shape validation before controller execution
  - `scripts`: operational jobs such as seeding and public dataset synchronization
  - `tests`: automated tests for domain behavior and integration points

## Key Domain Concepts

- Core entities inferred from the repository:
  - `User`: stores user identity, profile, preferences, and possibly travel constraints
  - `PublicDataset`: stores imported Seoul public/open data records used as recommendation inputs
  - `Recommendation`: stores generated or selected courses/places for a user
  - `Score`: stores weighted evaluation results used to rank recommendations
- External domain inputs:
  - Seoul open/public datasets for congestion, safety, facilities, geography, and other city signals
  - Map/routing provider for travel time, distance, and route feasibility
  - STT provider for voice input processing
  - LLM provider for course generation, explanation generation, and conversation topic generation
- Likely relationships:
  - A `User` can have many `Recommendation` records
  - A `Recommendation` can be derived from multiple `PublicDataset` inputs
  - A `Recommendation` can have one or more `Score` records or score dimensions
- Business rules the AI must not violate:
  - Do not generate recommendations that ignore the configured scoring dimensions: congestion, travel burden, safety, and cost
  - Do not bypass weighted scoring constants in `src/constants/scoreWeight.js` when ranking recommendations
  - Do not call external providers directly from controllers; go through `services` and `clients`
  - Do not persist raw provider payloads without normalization when a dataset-specific normalization path exists
  - Do not hardcode map, STT, or LLM vendor assumptions; these providers are still undecided
  - Do not expose secrets, tokens, or provider credentials in source, logs, tests, or generated fixtures
  - Do not couple public data ingestion logic to user-request latency if the operation is batch-oriented

## Development Conventions

- Naming conventions:
  - File names: lowercase camelCase with role suffixes, for example `user.service.ts`, `publicData.repository.ts`
  - Route files: `<domain>.routes.ts`
  - Controller files: `<domain>.controller.ts`
  - Service files: `<domain>.service.ts`
  - Repository files: `<domain>.repository.ts`
  - Validator files: `<domain>.validator.ts`
  - Model files: `<domain>.model.ts`
  - Constants: descriptive singular or grouped nouns, for example `scoreWeight.ts`
  - Variables and functions: `camelCase`
  - Types, interfaces, and classes: `PascalCase`
  - Enum members and true constants: `UPPER_SNAKE_CASE` if exported as fixed values
- Code style rules:
  - Prefer TypeScript for all new backend code
  - Keep route handlers thin; validation and HTTP translation belong in controllers, not business rules
  - Keep business rules in services
  - Keep SQL and persistence logic in repositories
  - Keep provider-specific request/response handling inside `clients`
  - Validate request payloads before service execution
  - Centralize environment access through `src/config/env.ts` once implemented
  - Reuse shared response and error utilities instead of ad hoc response shapes
  - Prefer one primary export per file matching the file role and domain
  - Avoid mixing ingestion jobs and request-serving code in the same module
- Formatting and annotations:
  - `<!-- TODO: fill in -->`
  - The repository does not yet contain formatter, linter, or annotation standards
  - Until tooling is added, prefer consistent TypeScript strictness, explicit return types on exported functions, and concise comments only where the intent is non-obvious
- Branch convention:
  - `<!-- TODO: fill in -->`
- Commit message convention:
  - `<!-- TODO: fill in -->`

## Build & Run

- Current repository status:
  - `package.json` is empty, so exact scripts cannot be determined yet
  - All inspected source, script, and test files are empty placeholders
- Dependency install:

```bash
npm install
```

- Local run:

```bash
<!-- TODO: fill in -->
```

- Local build:

```bash
<!-- TODO: fill in -->
```

- Expected implementation direction:
  - Initialize a TypeScript Express app
  - Add PostgreSQL client or ORM
  - Add environment loading and validation
  - Add scripts for `dev`, `build`, `start`, `test`, and batch jobs
- Required environment variables:
  - `NODE_ENV`
  - `PORT`
  - `DATABASE_URL`
  - `POSTGRES_HOST`
  - `POSTGRES_PORT`
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
  - `OPENAI_API_KEY`
  - `STT_API_KEY`
  - `MAP_API_KEY`
  - `SEOUL_OPEN_DATA_API_KEY`
  - `SEOUL_DATAHUB_API_KEY`
  - `BIGDATA_CAMPUS_API_KEY`
  - `AWS_REGION`
  - `AWS_EC2_HOST`
  - `AWS_RDS_HOST`
  - `AWS_RDS_PORT`
  - `AWS_RDS_DB_NAME`
  - `AWS_RDS_USERNAME`
  - `AWS_RDS_PASSWORD`
- Notes on env keys:
  - The repository does not currently define `.env` parsing code
  - Some keys above are inferred from the declared target architecture and external dependencies
  - Final key names should be normalized in `src/config/env.ts`

## Test Strategy

- Test location:
  - `tests/publicData.test.js`
  - `tests/recommendation.test.js`
- Current status:
  - Test files exist but are empty placeholders
  - No test runner or script is defined because `package.json` is empty
- Intended test coverage:
  - Unit tests:
    - `services/` scoring calculations
    - data normalization helpers in `utils/`
    - validators for request schemas
  - Integration tests:
    - repository interactions with PostgreSQL
    - `clients/` integration adapters with mocked external responses
    - route-to-controller-to-service flows for recommendation and public data APIs
  - End-to-end tests:
    - `<!-- TODO: fill in -->`
- Run tests locally:

```bash
<!-- TODO: fill in -->
```

## AI Agent Instructions

- Allowed to modify:
  - `src/` application code
  - `tests/` test code
  - `scripts/` operational scripts
  - `docs/` documentation
  - `package.json`, TypeScript config, lint config, and other project-local build files once they exist
- Must not touch:
  - `.env`, `.env.local`, `.env.*.local`
  - secrets, credentials, or deployment-only values
  - generated production data dumps or live database contents
  - infrastructure outside this repository unless explicitly requested
- Preferred patterns for new features:
  - Add new domains by extending the existing layered flow: route, controller, service, repository, model, validator, test
  - Put provider integrations behind `src/clients`
  - Put scoring constants in `src/constants/scoreWeight.ts`
  - Keep recommendation ranking logic centralized in `src/services/scoring.service.ts`
  - Normalize external datasets before they are consumed by recommendation logic
  - Use batch scripts in `scripts/` for ingestion and synchronization jobs
  - Keep TypeScript types close to the domain they describe
- Known pitfalls and fragile areas:
  - The codebase is currently a skeleton, so file names imply intent but do not yet enforce behavior
  - The repository currently mixes a JavaScript file layout with a TypeScript target architecture; migration rules must be made explicit before large-scale implementation
  - Map API, STT API, and some public data sources are still undecided, so avoid vendor lock-in in type definitions and service contracts
  - Scoring logic is a domain-critical area; changes to weights, score dimensions, or ranking formulas require corresponding tests
  - Public data ingestion can become schema-fragile if provider payloads change; normalization boundaries must stay isolated and test-covered
