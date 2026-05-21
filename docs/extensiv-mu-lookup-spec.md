# Extensiv MU Lookup — Cortex Integration Specification

**Document version:** 1.0  
**Date:** 2026-05-21  
**Status:** Confirmed working (live probe 2026-05-21)

---

## Overview

This document defines the correct API pattern for resolving a Movable Unit (MU) barcode to its Extensiv `receiveItemId` and current inventory record. It is intended for any GD Cortex component (OpFi, ClearSight, or external apps) that needs to look up or move a pallet by its MU label.

The key finding is that **integer-style MU labels** (e.g. `182252`) are the normal format for this customer — 3,203 of 3,269 MUs use this format. These labels are stored in Extensiv as the **pallet name** (`palletIdentifier.nameKey.name`), not as a `muLabel` field. The correct lookup endpoint is `GET /inventory` with an RQL filter on `palletIdentifier.nameKey.name`.

---

## Authentication

All Extensiv API calls use OAuth 2.0 client credentials.

```
POST https://secure-wms.com/AuthServer/api/Token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(clientId:clientSecret)>

grant_type=client_credentials&tpl={<tplGuid>}&user_login_id=<userLoginId>
```

Tokens expire after 1 hour. Cache and refresh proactively (every 50 minutes is safe). All subsequent calls carry `Authorization: Bearer <token>`.

---

## Primary MU Lookup Endpoint

### Request

```
GET https://secure-wms.com/inventory?rql=palletIdentifier.nameKey.name=={muLabel}
Authorization: Bearer <token>
Accept: application/hal+json
```

**RQL field:** `palletIdentifier.nameKey.name`  
**Encoding:** URL-encode the MU label value (e.g. `182252` → `182252`, `MU-WH1-0042` → `MU-WH1-0042`).

### Live Probe Result (2026-05-21)

| MU Label | HTTP Status | Rows Returned | receiveItemId | SKU |
|---|---|---|---|---|
| `182252` | 200 | 1 | **866372** | 110029 |

### Response Structure

The response is a HAL+JSON envelope. The inventory records are in `_embedded` or `ResourceList`:

```json
{
  "_embedded": {
    "inventoryList": [
      {
        "receiveItemId": 866372,
        "itemIdentifier": { "id": 12345, "sku": "110029" },
        "facilityIdentifier": { "id": 2, "name": "Columbus" },
        "locationIdentifier": { "id": 99, "name": "REC" },
        "palletIdentifier": { "id": 7001, "nameKey": { "name": "182252" } },
        "onHandAmount": 1056,
        "availableAmount": 1056
      }
    ]
  }
}
```

Key fields to extract:

| Field | Path | Notes |
|---|---|---|
| `receiveItemId` | `receiveItemId` | Required for `/inventory/mover` calls |
| SKU | `itemIdentifier.sku` | |
| On-hand qty | `onHandAmount` | Use for QC/display |
| Available qty | `availableAmount` | Use for allocation eligibility |
| Location name | `locationIdentifier.name` | Current physical location |
| Facility ID | `facilityIdentifier.id` | |

---

## Moving a Pallet (POST /inventory/mover)

Once `receiveItemId` is resolved via the lookup above, use it to move the pallet:

```
POST https://secure-wms.com/inventory/mover
Authorization: Bearer <token>
Content-Type: application/json

{
  "destination": {
    "id": <locationId>,
    "nameKey": {
      "name": "<locationName>",
      "facilityIdentifier": { "id": <facilityId> }
    }
  },
  "moveItems": [
    { "receiveItemId": 866372, "quantity": 1056 }
  ]
}
```

**Critical constraint:** `destination.nameKey.name` is **required**. Sending only `destination.id` causes Extensiv to return `400 ModelValidationException`. Always include both.

---

## Fallback Chain

If the primary endpoint returns 0 results (e.g. for `MU-WH1-...` format labels or legacy data), use the following fallback order:

| Priority | Endpoint | RQL Filter | Notes |
|---|---|---|---|
| **1 (Primary)** | `GET /inventory` | `palletIdentifier.nameKey.name=={muLabel}` | Confirmed working for integer labels |
| 2 | `GET /inventory` | `PalletIdentifier.namekey.name=={muLabel}` | Alternate casing (old GD Scanner format) |
| 3 | DB cache | `mu_labels` table: `config_id + mu_label` | Warm-up cache from nightly sync — non-authoritative |
| 4 | `GET /inventory/stockdetails` | `muLabel=={muLabel}` | Unreliable for integer-style labels |
| 5 | `GET /inventory/receivers` | Paginated scan by `muLabel` on receiver items | Last resort — expensive, up to 1,000 receivers |

> **Do not use `/inventory/stockdetails` as the primary path.** It returns HTTP 404 for RQL filters in this Extensiv tenant and does not reliably index integer-style MU labels.

---

## Known Issues and Constraints

| Issue | Detail |
|---|---|
| `/inventory/stockdetails` RQL unreliable | Returns 0 results or 404 for `muLabel==` and `palletIdentifier.nameKey.name==` filters in this tenant |
| `receiveItemId` RQL not supported on stockdetails | Cannot filter `/inventory/stockdetails` by `receiveItemId==` directly |
| Facility ID mismatch on orders | `facilityIdentifier.id` on order records sometimes differs from the customer's `facilities` array — always validate against the customer's facility list |
| Destination name required on mover | `400 ModelValidationException` if `destination.nameKey.name` is omitted |
| Excel-seeded MUs (legacy) | Some older MU labels were imported from spreadsheets and have no `receiveItemId` in Extensiv. These cannot be moved via `/inventory/mover` and must be manually received in Extensiv first. After proper receiving, the nightly warm-up sync will populate the DB cache. |

---

## Nightly Warm-Up Cache (Genius `mu_labels` Table)

Genius runs a nightly sync at 02:30 AM Eastern that populates the `mu_labels` table with `receiveItemId` values from Extensiv receivers. This is a **warm-up cache only** — it is not the authoritative source. The live `GET /inventory` query above is always preferred.

The cache is useful for:
- Instant first-lookup for freshly received pallets (avoids a live API call)
- Offline diagnostics and audit

**Do not treat the `mu_labels` table as the source of truth for `receiveItemId`.** Always verify with the live endpoint before calling `/inventory/mover`.

---

## Quick Reference

```
# Resolve MU label to receiveItemId
GET /inventory?rql=palletIdentifier.nameKey.name=={muLabel}

# Move pallet to new location
POST /inventory/mover
Body: { destination: { id, nameKey: { name } }, moveItems: [{ receiveItemId, quantity }] }

# Auth token
POST /AuthServer/api/Token
Body: grant_type=client_credentials&tpl={guid}&user_login_id={id}
```
