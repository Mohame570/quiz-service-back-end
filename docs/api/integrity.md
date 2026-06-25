# Integrity API Contract

**Owner:** L7  
**Module:** `src/modules/integrity/`  
**Sprint:** 3  
**Consumed by:** L4 (solving page — tab-switch hook), Admin dashboard

---

## Endpoints

### POST /api/integrity/events

Log a cheating event against the authenticated student's active attempt.

**Auth:** Student (JWT — `JwtAuthGuard`)  
**Request body:**
```json
{
  "attemptId": "cuid",
  "eventType": "TAB_HIDDEN",
  "description": "Tab hidden for 30s",
  "occurredAt": "2026-06-24T12:00:00.000Z",
  "metadata": { "durationMs": 30000 }
}
```
**Response 201:**
```json
{
  "id": "cuid",
  "attemptId": "cuid",
  "eventType": "TAB_HIDDEN",
  "description": "Tab hidden for 30s",
  "metadata": { "durationMs": 30000 },
  "occurredAt": "2026-06-24T12:00:00.000Z",
  "createdAt": "2026-06-24T12:00:01.000Z"
}
```
**Errors:** `400` invalid body, `403` not your attempt / not in-progress, `404` attempt not found

**Supported event types** (`CheatingEventType` enum):
`TAB_HIDDEN`, `WINDOW_BLUR`, `WINDOW_FOCUS`, `FULLSCREEN_EXIT`, `COPY_PASTE`, `OTHER`

---

### GET /api/admin/integrity/suspicious

List attempts flagged as suspicious based on a configurable cheating-event threshold.

**Auth:** Admin (JWT — role must be `ADMIN`)  
**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `threshold` | number | 3 | Minimum event count to flag an attempt |
| `quizId` | string | — | Optional filter by quiz |

**Flag rule:** An attempt is flagged when its cheating-event count ≥ `threshold`. Results are ordered by event count descending.

**Response 200:**
```json
[
  {
    "attemptId": "cuid",
    "studentId": "cuid",
    "studentName": "Student One",
    "quizId": "cuid",
    "quizTitle": "Sprint 1 Assessment",
    "eventCount": 7,
    "latestEventAt": "2026-06-24T12:05:00.000Z",
    "events": [
      {
        "id": "cuid",
        "eventType": "TAB_HIDDEN",
        "description": null,
        "occurredAt": "2026-06-24T12:05:00.000Z"
      }
    ]
  }
]
```
**Errors:** `403` not admin

---

### GET /api/admin/integrity/attempts/:attemptId/events

Get all cheating events for a specific attempt, most recent first.

**Auth:** Admin (JWT)  
**Response 200:** Array of `{ id, eventType, description, occurredAt }`  
**Errors:** `403` not admin

---

## Data Model

### CheatingEventLog

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK |
| `attemptId` | String | Raw FK (no Prisma relation — intentionally decoupled) |
| `eventType` | CheatingEventType | Enum |
| `description` | String? | Optional human-readable note |
| `metadata` | Json? | Arbitrary key-value payload |
| `occurredAt` | DateTime | Client-side timestamp recommended |
| `createdAt` | DateTime | Server timestamp |

## Dependencies

| Dependency | Owner | Notes |
|---|---|---|
| `JwtAuthGuard` | L1 Auth | Reused via `AuthModule` |
| `PrismaModule` | shared | Persistence |
| `Attempt` model | L5 | Read-only lookup for flagging |

## Consumed by

| Consumer | What they use |
|---|---|
| L4 solving page | `POST /integrity/events` (tab-switch hook) |
| Admin dashboard | `GET /admin/integrity/suspicious` + event detail |

## Open questions

- Should the threshold be configurable per quiz or globally?
- Should flagged attempts auto-trigger a notification or status change?
