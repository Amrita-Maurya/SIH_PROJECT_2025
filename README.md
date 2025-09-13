# Data Entry Features

This document describes the data entry Express router (`dataEntryRoutes.js`) and explains the purpose and behaviour of each endpoint. It also documents internal helper utilities, expected request/response shapes, validation rules, and extension points.

---

## Table of contents

1. Overview  
2. Models used  
3. Farmer endpoints  
4. Animal (embedded) endpoints  
5. Treatment endpoints (data-entry + withdrawal calculation)  
6. Helper utilities  
7. Query parameters, pagination and filtering  
8. Error handling and HTTP statuses  
9. Security and validation notes  
10. Examples (requests & responses)  
11. Extending the module  

---

## 1. Overview

`dataEntryRoutes.js` exposes RESTful endpoints for managing farmers, their embedded animals, and treatments given to animals. The routes are built with Express and rely on Mongoose models (`Farmer`, `Antimicrobial`, `Treatment`) provided by `models_data_entry`.

The treatment creation endpoint performs additional domain logic: it looks up antimicrobial metadata and computes withdrawal end dates for relevant food products (milk, meat, egg, etc.) based on species-specific mappings.

---

## 2. Models used

- **Farmer** — top-level document containing farmer metadata and an embedded `animals` array.  
- **Antimicrobial** — lookup collection for drugs. Contains at least `drug_id`, `canonical_name`/`drug_name`, and `withdrawal_days`.  
- **Treatment** — records of administered drugs including `farmer_id`, `farm_id`, `animal_id`, `drug_id`, `drug_raw`, `administered_at`, `withdrawal_end`, etc.

---

## 3. Farmer endpoints

### `POST /farmers`
- Create a new farmer.  
- **Body:** JSON matching Farmer schema.  
- **Response:** `201 Created` with farmer document.  
- **Errors:** `400` for validation failures.

### `GET /farmers`
- List farmers.  
- **Query params:** `farm_id`, `village`.  
- **Response:** `200 OK` array of farmers.

### `GET /farmers/:id`
- Get farmer by id.  
- **Response:** `200 OK` with farmer, `404` if not found, `400` if invalid id.

### `PUT /farmers/:id`
- Update farmer by id.  
- **Response:** `200 OK` with updated farmer, `404` if not found, `400` on validation errors.

### `DELETE /farmers/:id`
- Delete farmer by id.  
- **Response:** `{ ok: true }`.

---

## 4. Animal (embedded) endpoints

### `POST /farmers/:id/animals`
- Add an animal to farmer.  
- **Body:** Animal fields (e.g., `tagId`, `type`, `status`).  
- **Notes:** Enforces unique `tagId` per farmer (409 Conflict).  
- **Response:** `201 Created` with the animal.

### `GET /farmers/:id/animals`
- List farmer’s animals.  
- **Query params:** `type`, `status`.  
- **Response:** Array of animals.

### `PUT /farmers/:id/animals/:animalId`
- Update an animal by its subdoc `_id`.  
- **Response:** Updated animal, `404` if not found.

### `DELETE /farmers/:id/animals/:animalId`
- Delete an animal subdoc.  
- **Response:** `{ ok: true }`.

---

## 5. Treatment endpoints

### `POST /treatments`
- Create a treatment and compute withdrawal periods.  
- **Required body fields:** `farmer_id`, `animal_id`, `drug_id`.  
- **Steps performed:**
  1. Find farmer by `farmer_id`.  
  2. Resolve `farm_id` if missing.  
  3. Find animal by `_id` or `tagId`.  
  4. Determine species → relevant products (`productMap`).  
  5. Use `administered_at` or default to now.  
  6. Lookup drug metadata from `Antimicrobial`.  
  7. Compute `withdrawal_end` for relevant products.  
  8. Save treatment.  
- **Response:** `201 Created` with treatment.

`productMap` used:
```js
{
  cow: ['milk','meat'],
  buffalo: ['milk','meat'],
  goat: ['milk','meat'],
  sheep: ['milk','meat'],
  chicken: ['egg','meat'],
  pig: ['meat'],
  default: ['meat']
}

