# Compliance Features

This document describes the compliance Express router (`complianceRoutes.js`) and explains the behaviour of each endpoint and helper used for MRL (Maximum Residue Limit) checks and notifications. The routes use Mongoose models exported from `models_compliance` and `models_data_entry` (for `Farmer` lookups).

---

## Table of contents

1. Overview  
2. Models used  
3. Helper utilities & business logic  
4. MRL check endpoints (`/mrlchecks`)  
5. Notification endpoints (`/notifications`)  
6. Query parameters, pagination and filtering  
7. Error handling and HTTP statuses  
8. Security and validation notes  
9. Examples (requests & responses)  
10. Extending the module

---

## 1. Overview

`complianceRoutes.js` provides endpoints to create and list MRL checks and to create/list notifications for farmers. It contains helper logic to resolve a `farm_id` from a `farmer_id`, determine compliance status from measurements and MRL limits, and auto-create notifications when non-compliance is detected.

---

## 2. Models used

- **MrlLimit** — stores regulatory limits mapping `{ drug, tissue, mrl_mg_per_kg }`.  
- **MrlCheck** — records of measured residues; fields include `farmer_id`, `farm_id`, `drug`, `tissue`, `measured_mg_per_kg`, `mrl_mg_per_kg`, `compliant`, `checked_at`, etc.  
- **Notification** — messages to be sent to farmers; typical fields: `farmer_id`, `farm_id`, `channel`, `type`, `payload`, `status`, `created_at`.  
- **Farmer** — used to resolve `farm_id` from `farmer_id` when that is not provided.

> The router expects these to be Mongoose models with standard `save()`, `find()`, `findOne()`, `lean()` semantics.

---

## 3. Helper utilities & business logic

### `resolveFarmIdFromFarmer(farmerId)`
- Input: a `farmerId` (Mongo `_id`).
- Behavior: fetches `Farmer.findById(farmerId).lean()` and returns `farmer.farm_id` or `null`.
- Returns `null` on error or if farmer not found.

### `determineCompliance(body)`
- Purpose: attempt to determine whether a measurement is compliant.
- Priority rules:
  1. If `body.compliant` is explicitly `true`/`false`, return it.
  2. If `measured_mg_per_kg` is missing or cannot be parsed to a number → return `null` (unknown).
  3. If `body.mrl_mg_per_kg` is present and numeric → compare `measured <= mrl`.
  4. Else, look up `MrlLimit.findOne({ drug, tissue })` and compare `measured <= limit.mrl_mg_per_kg` if found.
  5. If none of the above yields a decision → return `null` (unknown).
- Normalizes `drug` and `tissue` to lowercase strings where applicable.
- Returns `true`, `false`, or `null`.

Notes:
- This helper favors any explicit `compliant` flag passed in the request.
- A non-decisive result is represented by `null`, which the route persists unless overridden.

---

## 4. MRL check endpoints

### `POST /mrlchecks`
- **Purpose:** Create an `MrlCheck` document and optionally auto-create a `Notification` when non-compliant.
- **Behavior:**
  1. Normalize `drug` and `tissue` to lowercase (if strings).
  2. If `farmer_id` provided but `farm_id` missing, call `resolveFarmIdFromFarmer` to fill it.
  3. Call `determineCompliance(body)` to compute `compliant` if possible. If computed to `true`/`false`, set `body.compliant`. Otherwise explicitly set `body.compliant = null` (if not boolean).
  4. Save `MrlCheck(body)`.
  5. If `check.compliant === false`, create a `Notification` with:
     - `farmer_id`, `farm_id` (or `null`), `channel: 'sms'` (default), `type: 'MRL_ALERT'`,
     - `payload` containing a message with `drug`, `tissue`, `measured` and `limit` and `mrlCheckId`,
     - `status: 'pending'`.
     - Save notification, but do not fail the main request if notification creation errors out.
  6. Return `201 Created` with saved check.
- **Errors:** `400` for validation/save errors. `500` is not used here unless uncaught.

### `GET /mrlchecks`
- **Purpose:** List MRL checks.
- **Query params:**
  - `farm_id` — filter by farm_id  
  - `farmer_id` — filter by farmer_id  
  - `drug` — filter by drug (will be lowercased)  
  - `page` — 0-based page index (default `0`)  
  - `limit` — page size (default `50`, max `100`)  
- **Behavior:** returns list sorted by `{ checked_at: -1 }`, paginated with `.skip(page * limit).limit(limit)`.
- **Response:** `200 OK` with an array of MrlCheck objects.

---

## 5. Notification endpoints

### `POST /notifications`
- **Purpose:** Create a `Notification`.
- **Behavior:**
  - If `farmer_id` provided but `farm_id` is missing, resolves `farm_id` via `resolveFarmIdFromFarmer`.
  - Saves `Notification(body)` and returns it.
- **Response:** `201 Created` with notification object.
- **Errors:** `400` with `err.message` and `err.errors` where present.

### `GET /notifications`
- **Purpose:** List notifications.
- **Query params:**
  - `farm_id`  
  - `farmer_id`  
  - `status` — e.g., `pending`, `sent`, `failed`  
  - `page` (0-based), `limit` (default `50`, max `100`)
- **Behavior:** returns notifications sorted by `{ created_at: -1 }` and paginated.
- **Response:** `200 OK` with an array of Notification objects.

---

## 6. Query parameters, pagination & filtering

- Pagination pattern is consistent: `page` (0-based) and `limit` (clamped to 100).  
- Filtering fields are included in the GET endpoints as described above.  
- `drug` query parameter will be lowercased before being used in `q`.

---

## 7. Error handling & HTTP statuses

- `201 Created` — resource created (POST).  
- `200 OK` — successful GET.  
- `400 Bad Request` — validation or save errors for POSTs.  
- `500 Internal Server Error` — used on unexpected list errors (routes call `res.status(500)` on list failures).  
- For non-fatal notification creation errors, the MRL-check request still succeeds; the notification error is logged server-side.

All error responses usually return JSON:  
```json
{ "error": "<message>", "details": <err.errors || null> }

