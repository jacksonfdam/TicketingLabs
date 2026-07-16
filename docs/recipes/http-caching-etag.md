# Recipe: HTTP caching with ETag and Cache-Control

## 1. Problem

When a sale opens, thousands of clients poll the event list and event detail. Most of the
time nothing has changed, but every poll still costs a full response — bandwidth on the
wire and work in the backend. You want unchanged data to be cheap to re-fetch.

## 2. Concept

Two complementary HTTP mechanisms:

- **`Cache-Control`** tells clients and CDNs how long a response may be reused without
  asking again (`max-age`). Freshness for free, within the window.
- **`ETag`** is a fingerprint of the response. The client sends it back as
  `If-None-Match`; if the resource is unchanged, the server answers `304 Not Modified`
  with no body. The client still makes the request, but the response is tiny.

Use `Cache-Control` for "don't even ask for N seconds" and `ETag` for "ask, but only pay
for the body if it actually changed."

## 3. Implementation

`backends/go/internal/transport/http/handlers.go`. The event list is cacheable for 30s;
event detail carries a weak ETag over the volatile fields (status + availability):

```go
// GET /events
w.Header().Set("Cache-Control", "public, max-age=30")

// GET /events/{id}
etag := weakETag(detail) // hash of event status + each sector's available_inventory
if r.Header.Get("If-None-Match") == etag {
    w.WriteHeader(http.StatusNotModified) // 304, no body
    return
}
w.Header().Set("ETag", etag)
w.Header().Set("Cache-Control", "public, max-age=5")
```

The ETag hashes exactly the fields that matter for a buyer (is it still on sale, how many
seats are left), so it changes the instant inventory moves and stays stable otherwise. The
frontend's TanStack Query `staleTime` is aligned to these `max-age` values, so the client
cache and the HTTP cache agree.

## 4. How to see it working

```bash
# first request returns an ETag; sending it back yields 304
ETAG=$(curl -sk -D- -o /dev/null https://localhost/api/events/$EVENT | grep -i etag | tr -d '\r' | cut -d' ' -f2)
curl -sk -o /dev/null -w "%{http_code}\n" -H "If-None-Match: $ETAG" https://localhost/api/events/$EVENT   # 304

# after a reservation changes availability, the ETag changes and you get a 200 body again
```

The contract documents `304` on `GET /events/{id}`; the conformance suite exercises it.

## 5. Trade-offs

- **Caching stale availability is dangerous here.** A 30s cache on the *list* is fine
  (names, venues rarely change), but the detail's `max-age` is deliberately short (5s)
  and gated by the ETag, because showing "10 seats left" when there are zero sends users
  into a reservation that will 409. Freshness matters more than cache hit rate on the hot
  path.
- **Weak ETags mean "semantically equivalent", not "byte-identical."** Fine here, since
  we hash the meaningful fields, not the whole serialisation.
- **Polling still costs a round-trip even on a 304.** For truly high-fanout reads a
  push channel (SSE/WebSocket) or a CDN would beat polling; ETag/Cache-Control is the
  simple, universal first step.
