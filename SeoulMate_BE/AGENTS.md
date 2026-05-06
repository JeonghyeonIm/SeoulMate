## Project Overview

- SeoulMate backend provides APIs for authentication, user data, AI-assisted course recommendation, public data ingestion, and scoring-based ranking.
- The repository is now a TypeScript Express scaffold with build, formatting, linting, and pre-commit automation in place; most domain modules are still placeholders.
- The authentication domain now includes a working in-memory sign-up flow at `POST /api/auth/signup`.
- Tech stack:
  - Runtime: Node.js
  - Framework: Express
  - Language: TypeScript
  - Database: PostgreSQL via `pg`
  - Infra target: EC2 + RDS (PostgreSQL)
- Architecture pattern:
  - Layered MVC-style backend: `routes -> controllers -> services -> repositories/models`
  - External providers are isolated under `clients`

## Directory Structure

```text
SeoulMate_BE/
|-- .env.example                # Local environment variable template
|-- .gitignore                  # Ignore rules for env, build, caches, editor files
|-- .husky/
|   |-- pre-commit              # Runs lint-staged before commit
|   `-- _/                      # Git hooks wrapper files used by Husky
|-- .prettierignore             # Files excluded from Prettier
|-- .prettierrc.json            # Prettier formatting rules
|-- .vscode/
|   `-- settings.json           # Shared VS Code format/lint-on-save settings
|-- AGENTS.md                   # Repository-level instructions for contributors and agents
|-- docs/
|   |-- API.md                  # API reference including implemented signup endpoint
|   `-- STRUCTURE.md            # Backend structure reference
|-- eslint.config.mjs           # ESLint flat config for TypeScript
|-- package.json                # Scripts, dependencies, lint-staged config
|-- scripts/
|   |-- seed.ts                 # Seed/bootstrap placeholder
|   |-- setupHusky.mjs          # Git hook setup script
|   `-- syncPublicData.ts       # Public data sync/import placeholder
|-- src/
|   |-- app.ts                  # Express app setup
|   |-- server.ts               # Server bootstrap
|   |-- clients/
|   |   |-- map.client.ts       # Map/routing API client placeholder
|   |   |-- openai.client.ts    # LLM client placeholder
|   |   `-- seoulOpenData.client.ts
|   |                             # Seoul public data client placeholder
|   |-- config/
|   |   |-- db.ts               # PostgreSQL pool setup
|   |   |-- env.ts              # Environment loading/normalization
|   |   `-- openai.ts           # OpenAI config placeholder
|   |-- constants/
|   |   |-- datasetType.ts      # Public dataset category constants placeholder
|   |   `-- scoreWeight.ts      # Recommendation weight constants placeholder
|   |-- controllers/
|   |   |-- auth.controller.ts  # Signup request/response controller
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
|   |   |-- inMemoryDatabase.ts # Temporary in-memory user/preference storage
|   |   |-- preference.repository.ts
|   |   |-- publicData.repository.ts
|   |   |-- recommendation.repository.ts
|   |   `-- user.repository.ts
|   |-- routes/
|   |   |-- ai.routes.ts
|   |   |-- auth.routes.ts
|   |   |-- index.ts            # Minimal `/api` root endpoint
|   |   |-- publicData.routes.ts
|   |   |-- recommendation.routes.ts
|   |   `-- user.routes.ts
|   |-- services/
|   |   |-- auth.service.ts
|   |   |-- ai.service.ts
|   |   |-- publicData.service.ts
|   |   |-- recommendation.service.ts
|   |   |-- scoring.service.ts
|   |   `-- user.service.ts
|   |-- types/
|   |   `-- auth.types.ts       # Signup request/response and persistence types
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
`-- tsconfig.json               # TypeScript compiler settings
```

- Major roles:
  - `src/routes`: declare endpoint paths and attach controllers/middleware
  - `src/controllers`: handle HTTP request/response mapping
  - `src/services`: business logic and orchestration
  - `src/repositories`: persistence boundary; currently mixed PostgreSQL scaffolding and temporary in-memory auth storage
  - `src/models`: persistence-facing entities or schema definitions
  - `src/clients`: external API integration boundary
  - `src/config`: environment/config/database setup
  - `scripts`: setup or operational jobs
  - `docs`: human-facing backend reference docs

## Key Domain Concepts

- Core entities inferred from the repository:
  - `User`: account, profile, and user preference holder
  - `PublicDataset`: imported Seoul public/open dataset records
  - `Recommendation`: generated or curated course recommendation
  - `Score`: weighted evaluation data used for ranking
- External inputs:
  - Seoul open/public datasets
  - Map/routing API
  - STT provider
  - LLM provider for course generation and explanation
- Likely relationships:
  - A `User` can own many `Recommendation` records
  - A `Recommendation` can be derived from multiple `PublicDataset` inputs
  - A `Recommendation` can contain or reference score dimensions from `Score`
- Business rules the AI must not violate:
  - Keep the signup provider list limited to `local`, `kakao`, `google` unless product requirements change
  - Keep allowed signup vibes limited to the values defined in `src/types/auth.types.ts` and `src/validators/user.validator.ts`
  - For `local` signup, password must be hashed with `bcrypt` before persistence
  - For `kakao` and `google` signup, ignore the incoming password field and persist `null`
  - Do not ignore congestion, travel burden, safety, and cost when implementing recommendation ranking
  - Do not bypass centralized weight definitions in `src/constants/scoreWeight.ts`
  - Do not call external providers directly from controllers
  - Do not persist raw third-party payloads without normalization when a normalization boundary exists
  - Do not hardcode a specific map, STT, or LLM vendor into high-level service contracts
  - Do not expose secrets or tokens in code, docs, tests, logs, or fixtures

## Development Conventions

- Naming conventions:
  - Files: lowercase camelCase with role suffix, for example `user.service.ts`
  - Routes: `<domain>.routes.ts`
  - Controllers: `<domain>.controller.ts`
  - Services: `<domain>.service.ts`
  - Repositories: `<domain>.repository.ts`
  - Validators: `<domain>.validator.ts`
  - Models: `<domain>.model.ts`
  - Variables/functions: `camelCase`
  - Types/interfaces/classes: `PascalCase`
  - Fixed exported constants: `UPPER_SNAKE_CASE` when appropriate
- Code style rules:
  - Prefer TypeScript for all backend code
  - Keep controllers thin and move business logic into services
  - Keep SQL and persistence concerns inside repositories
  - Temporary in-memory repositories should preserve ORM-like method shapes such as `findByEmail`, `findByNickname`, and `save`
  - Keep provider-specific request/response translation inside `clients`
  - Centralize environment access through `src/config/env.ts`
  - Prefer one primary export per file matching the file name
  - Avoid mixing batch ingestion and request-serving logic in one module
- Formatting and linting:
  - Prettier is configured in `.prettierrc.json`
  - ESLint is configured in `eslint.config.mjs`
  - Shared VS Code save behavior is configured in `.vscode/settings.json`
  - `npm run format`: run Prettier on the project
  - `npm run format:check`: verify formatting only
  - `npm run lint`: run ESLint
  - `npm run lint:fix`: run ESLint with auto-fix
  - Pre-commit hook runs `lint-staged` on staged files
  - Staged `*.{ts,js,mjs,cjs,json,md}` files are formatted with Prettier
  - Staged `*.ts` files are additionally auto-fixed with ESLint
- Branch convention:
  - `<!-- TODO: fill in -->`
- Commit message convention:
  - `<type>(<scope>): <summary>`
  - Examples:
    - `feat(auth): 회원가입 API 구현`
    - `fix(auth): 회원가입 전역 에러 처리 연결`
    - `chore(deps): 회원가입 의존성 추가`

## Build & Run

- Dependency install:

```bash
npm install
```

- Local development server:

```bash
npm run dev
```

- Build:

```bash
npm run build
```

- Run compiled output:

```bash
npm start
```

- Current implemented bootstrap:
  - `GET /health`
  - `GET /api`
  - `POST /api/auth/signup`
- Required environment variables currently scaffolded:
  - `NODE_ENV`
  - `PORT`
  - `DATABASE_URL`
  - `POSTGRES_HOST`
  - `POSTGRES_PORT`
  - `POSTGRES_DB`
  - `POSTGRES_USER`
  - `POSTGRES_PASSWORD`
- Additional expected environment variables for planned features:
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

## Test Strategy

- Test location:
  - `tests/publicData.test.ts`
  - `tests/recommendation.test.ts`
- Current status:
  - Test files exist but are placeholders
  - No `test` script is defined yet
- Intended coverage:
  - Unit tests for scoring, normalization, validators, and env parsing
  - Integration tests for repositories, clients, and route-to-service flows
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
  - `scripts/` project-local setup/operations code
  - `docs/` documentation
  - `package.json`, `tsconfig.json`, ESLint/Prettier/Husky/VS Code project settings
- Must not touch:
  - `.env`, `.env.local`, `.env.*.local`
  - real secrets or deployment-only values
  - live database contents or generated production data
  - infra outside this repository unless explicitly requested
- Preferred patterns for new features:
  - Implement the full vertical slice: route, controller, service, repository, validator, test
  - Put external provider integration behind `src/clients`
  - Keep scoring logic centralized in `src/services/scoring.service.ts`
  - Keep shared weights in `src/constants/scoreWeight.ts`
  - Normalize imported public data before domain use
  - Use `npm run format` and `npm run lint` after meaningful changes
- Known pitfalls and fragile areas:
  - Most domain files are still placeholders, so names imply intent more than behavior
  - Authentication persistence is currently in-memory only; restart clears users and preferences
  - `bcrypt` and `uuid` are required runtime dependencies for signup
  - Git hooks are configured from a monorepo-like parent Git root, not from `SeoulMate_BE` as a standalone Git repository
  - The current Husky setup depends on `core.hooksPath` pointing to `SeoulMate_BE/.husky/_`
  - Provider choices are still undecided, so avoid vendor lock-in in public interfaces
  - Scoring logic is domain-critical; weight or formula changes require tests and doc updates
