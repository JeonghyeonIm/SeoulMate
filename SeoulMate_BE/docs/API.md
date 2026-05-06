# SeoulMate_BE API

## Overview

This document describes the planned API surface for `SeoulMate_BE`.
At the repository level, only bootstrap endpoints are currently implemented; the domain endpoints below are design-level targets derived from the current product specification.

## Current Implementation Status

- Currently implemented:
  - `GET /health`
  - `GET /api`
- Planned but not implemented yet:
  - authentication APIs
  - user APIs
  - course recommendation APIs
  - place APIs

## Base URL

```text
<!-- TODO: fill in -->
```

## Authentication Model

- Authentication scheme:
  - JWT Bearer Token
- Standard header format:

```http
Authorization: Bearer <JWT>
```

- Notes:
  - User auth endpoints are planned.
  - Admin authorization policy is not defined in the repository yet.
  - Refresh token transport and storage policy still need to be fixed.

## Endpoint Summary

| Category  | Feature                | Actor  | Method   | URL                         | Status      |
| --------- | ---------------------- | ------ | -------- | --------------------------- | ----------- |
| Bootstrap | Health check           | Public | `GET`    | `/health`                   | Implemented |
| Bootstrap | API root               | Public | `GET`    | `/api`                      | Implemented |
| Auth      | Login                  | User   | `POST`   | `/auth/login`               | Planned     |
| Auth      | Refresh token          | User   | `POST`   | `/auth/refresh`             | Planned     |
| Auth      | Sign up                | User   | `POST`   | `/auth/signup`              | Planned     |
| Auth      | Logout                 | User   | `POST`   | `/auth/logout`              | Planned     |
| User      | Get current user       | User   | `GET`    | `/users/me`                 | Planned     |
| User      | Update preferences     | User   | `PATCH`  | `/users/me/preferences`     | Planned     |
| User      | List users             | Admin  | `GET`    | `/users`                    | Planned     |
| User      | Get user by ID         | Admin  | `GET`    | `/users/{user_id}`          | Planned     |
| Course    | Request recommendation | User   | `POST`   | `/courses/recommend`        | Planned     |
| Course    | Get course detail      | User   | `GET`    | `/courses/{course_id}`      | Planned     |
| Course    | Save course            | User   | `POST`   | `/courses/{course_id}/save` | Planned     |
| Course    | Unsave course          | User   | `DELETE` | `/courses/{course_id}/save` | Planned     |
| Course    | List saved courses     | User   | `GET`    | `/courses/saved`            | Planned     |
| Place     | Get place detail       | User   | `GET`    | `/places/{place_id}`        | Planned     |
| Search    | Search places          | User   | `GET`    | `/places/search`            | Planned     |

## Bootstrap APIs

### `GET /health`

- Purpose: runtime health check
- Actor: public
- Auth: not required
- Query Params: none
- Response:

```json
{
  "message": "SeoulMate_BE is running"
}
```

### `GET /api`

- Purpose: API root check
- Actor: public
- Auth: not required
- Query Params: none
- Response:

```json
{
  "message": "SeoulMate API root"
}
```

## Auth APIs

### `POST /auth/login`

- Purpose: email or social login
- Actor: user
- Auth: not required
- Query Params: none
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

- Notes:
  - Final login modes and provider list are not defined in the repository yet.

### `POST /auth/refresh`

- Purpose: reissue access token
- Actor: user
- Auth: refresh-token based
- Query Params: none
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

### `POST /auth/signup`

- Purpose: register a new user
- Actor: user
- Auth: not required
- Query Params: none
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

### `POST /auth/logout`

- Purpose: invalidate the current session or token
- Actor: user
- Auth: `<!-- TODO: fill in -->`
- Query Params: none
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

## User APIs

### `GET /users/me`

- Purpose: get the currently authenticated user
- Actor: user
- Auth: required
- Query Params: none
- Path Params: none
- Response:

```json
<!-- TODO: fill in -->
```

- Notes:
  - Requires `Authorization: Bearer <JWT>`

### `PATCH /users/me/preferences`

- Purpose: update mood, region, and budget preferences
- Actor: user
- Auth: required
- Query Params: none
- Path Params: none
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

- Notes:
  - Requires `Authorization: Bearer <JWT>`

### `GET /users`

- Purpose: list all users
- Actor: admin
- Auth: `<!-- TODO: fill in -->`
- Query Params:
  - `page`
  - `page_size`
- Response:

```json
<!-- TODO: fill in -->
```

### `GET /users/{user_id}`

- Purpose: get one user by ID
- Actor: admin
- Auth: `<!-- TODO: fill in -->`
- Path Params:
  - `user_id`
- Response:

```json
<!-- TODO: fill in -->
```

## Course APIs

### `POST /courses/recommend`

- Purpose: generate AI-assisted course recommendations
- Actor: user
- Auth: required
- Query Params: none
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

- Notes:
  - Requires `Authorization: Bearer <JWT>`
  - Recommendation ranking must account for congestion, travel burden, safety, and cost

### `GET /courses/{course_id}`

- Purpose: get course detail
- Actor: user
- Auth: required
- Path Params:
  - `course_id`
- Response:

```json
<!-- TODO: fill in -->
```

- Notes:
  - Requires `Authorization: Bearer <JWT>`

### `POST /courses/{course_id}/save`

- Purpose: save a course to user history
- Actor: user
- Auth: required
- Path Params:
  - `course_id`
- Request Body:

```json
<!-- TODO: fill in -->
```

- Response:

```json
<!-- TODO: fill in -->
```

- Notes:
  - Requires `Authorization: Bearer <JWT>`

### `DELETE /courses/{course_id}/save`

- Purpose: remove a saved course
- Actor: user
- Auth: required
- Path Params:
  - `course_id`
- Response:

```json
<!-- TODO: fill in -->
```

- Notes:
  - Requires `Authorization: Bearer <JWT>`

### `GET /courses/saved`

- Purpose: list saved courses
- Actor: user
- Auth: required
- Query Params:
  - `page`
  - `page_size`
- Response:

```json
<!-- TODO: fill in -->
```

- Notes:
  - Requires `Authorization: Bearer <JWT>`

## Place APIs

### `GET /places/{place_id}`

- Purpose: get place detail
- Actor: user
- Auth: required
- Path Params:
  - `place_id`
- Response:

```json
<!-- TODO: fill in -->
```

- Notes:
  - Requires `Authorization: Bearer <JWT>`

### `GET /places/search`

- Purpose: search places by keyword and region
- Actor: user
- Auth: required
- Query Params:
  - `q`
  - `region`
  - `category` (optional)
  - `page` (optional)
  - `page_size` (optional)
- Response:

```json
<!-- TODO: fill in -->
```

- Notes:
  - Requires `Authorization: Bearer <JWT>`

## Open Items

- Request DTOs are not defined in the codebase yet.
- Response DTOs are not defined in the codebase yet.
- Error code policy is not defined in the codebase yet.
- Pagination response shape is not defined in the codebase yet.
- Admin authorization strategy is not defined in the codebase yet.
- STT, map, and some data provider integration details are still undecided.
