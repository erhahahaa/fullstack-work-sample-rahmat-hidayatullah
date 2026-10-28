## API Surface

The HTTP contract for the storefront. It is REST over JSON, versioned in the path, with cursor pagination and an explicit idempotency header. This document is the summary I would hand to a frontend engineer on day one.

### Resources

```text
GET    /v1/catalog/products                 list, filter by category
GET    /v1/catalog/products/:slug           detail, includes stock summary
GET    /v1/catalog/products/:slug/stock     short-TTL stock badge
POST   /v1/auth/login                       email + password, returns token pair
POST   /v1/auth/refresh                     rotates the refresh token
POST   /v1/auth/logout                      denylists the access jti
POST   /v1/auth/logout-all                  bumps token version, revokes families
GET    /v1/orders                           list current user's orders, cursor
GET    /v1/orders/:id                       detail
GET    /v1/orders/:id/status                small payload for polling
POST   /v1/orders/:id/cancel                only from pending
POST   /v1/checkout                         reserve stock, create payment intent
POST   /v1/webhooks/payments                provider only, HMAC signed, no auth header
```

Nouns, plural, no verbs in paths except the two operations that are genuinely not CRUD (`checkout`, `cancel`). Order status is read from its own subresource because the frontend polls it and does not need the full order document on every tick.

### Versioning

The major version lives in the path (`/v1`). Additive changes ship inside a version: a new optional field, a new endpoint, a new enum value the client should already tolerate. Removing a field, changing a type, or changing the meaning of an existing field is a new major version.

Deprecation gets a `Deprecation` and a `Sunset` header plus a changelog entry, with at least 90 days of overlap. Header-based version negotiation looks tidier in a URL and is worse in practice: it is invisible in logs, easy to strip at a proxy, and awkward to test from a browser.

### Pagination

Cursor pagination on an indexed sort key, not `OFFSET`. Offset is O(n) in the database and it skips or repeats rows when new orders arrive between pages. Cursors are opaque, base64url encoded, and carry the sort key plus a direction. They are not security boundaries, so validate and sign them if they leak anything sensitive.

```json
{
  "data": [{ "id": "ord_01J...", "status": "paid" }],
  "page": { "next_cursor": "eyJjcmVhdGVkX2F0Ijoi...", "has_more": true }
}
```

`limit` defaults to 20 and is capped at 100. A client that asks for 10,000 gets 100 and a `has_more` flag, not a timeout and a 500.

### Idempotency

`Idempotency-Key` is required on `POST /v1/checkout` and any future endpoint that moves money or creates a durable record. The client generates a UUID v4 per user intent and reuses it on retry, including retries after a network error where the response was lost.

The server stores `(user_id, key, request_hash, response_status, response_body)` for 24 hours. Three cases:

- Same key, same body: return the stored response with `Idempotent-Replay: true`. No second order.
- Same key, different body: `422 idempotency_key_reuse`. This is a client bug, not a transient error.
- New key: process normally. The unique constraint on `(user_id, key)` is what makes concurrent retries safe, not an application-level check.

A missing header is a `400`. Making it optional turns every mobile retry into a possible duplicate order.

### Errors

One envelope for every non-2xx response, including 5xx:

```json
{
  "error": {
    "code": "insufficient_stock",
    "message": "This item sold out while you were checking out.",
    "details": [{ "sku": "drop-001", "requested": 1, "available": 0 }],
    "request_id": "req_01J8Z...",
    "doc_url": "https://example.com/docs/errors#insufficient_stock"
  }
}
```

`code` is stable, machine readable, and never localized. `message` is for humans and may change. `request_id` appears in logs and in the support reply, which is the only way to join a customer screenshot to a trace. Validation errors add a `details` array with field paths.

| Status | When                                                                             |
| ------ | -------------------------------------------------------------------------------- |
| 200    | Read succeeded, or an idempotent replay (204 when there is no body, e.g. logout) |
| 201    | Resource created, includes `Location`                                            |
| 400    | Malformed request, missing idempotency key on a required route                   |
| 401    | Missing, expired, or revoked token                                               |
| 403    | Authenticated but not allowed (admin route, another user's order)                |
| 404    | Unknown resource, or one the caller is not allowed to see                        |
| 409    | State conflict (sold out, order already paid)                                    |
| 422    | Semantically valid JSON that fails a business rule                               |
| 429    | Rate limited, includes `Retry-After`                                             |
| 500    | Unhandled bug, never leaks a stack trace                                         |
| 503    | Dependency unavailable, safe to retry with backoff                               |

`409` versus `422` is the line people argue about. My rule: 409 when the request conflicts with current server state (the item is gone, the order moved on), 422 when the request is wrong regardless of state (quantity above the per-user limit, unknown coupon).

### REST or gRPC

REST is the default for anything a browser, a mobile app, or a third party calls. It caches at the CDN, debugs with curl, needs no generated client, and every proxy on earth understands it. The cost is a looser schema, which is why request and response validation lives in shared Zod schemas rather than in prose.

gRPC is worth its tooling cost when at least two of these are true: high fan-out between internal services where per-call overhead matters, strict latency budgets with deadlines and cancellation, streaming (server push, bidirectional), or a polyglot estate that benefits from a compiled schema and generated stubs. It also gives you free tracing metadata and typed errors.

The cost is real: `buf` and codegen in CI, generated clients to keep in sync, an HTTP/2-aware load balancer, deadline propagation you have to implement on both sides, and no browser story without gRPC-Web or a proxy. In a two-service system that is overhead with no payoff.

My recommendation is REST for the public surface, and REST for internal calls until a service boundary has a measured latency problem. If inventory splits into its own service and its p99 starts to matter, gRPC between the API and inventory is a reasonable second step. The browser still talks REST at the edge.
