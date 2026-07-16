// Package redisadp implements the Redis-backed ports: the distributed lock, the rate
// limiter, and the refresh-token store. This is where "distributed" stops being an
// adjective and starts being a network round-trip.
package redisadp

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
	"go.opentelemetry.io/otel"
)

type Client struct {
	rdb      *redis.Client
	lockTTL  time.Duration
	pollWait time.Duration
}

func New(rdb *redis.Client) *Client {
	return &Client{rdb: rdb, lockTTL: 15 * time.Second, pollWait: 20 * time.Millisecond}
}

// releaseScript deletes the lock only if we still own it (value matches). Without the
// check, a lock that expired and was re-acquired by someone else could be deleted by
// our late release, which is how you get two "exclusive" holders.
var releaseScript = redis.NewScript(`
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end`)

// Acquire implements a Redlock-style single-node lock: SET key token NX PX. It retries
// until `wait` elapses. The lock auto-expires after lockTTL so a crashed holder cannot
// wedge a sector forever.
func (c *Client) Acquire(ctx context.Context, key string, wait time.Duration) (func(), bool, error) {
	ctx, span := otel.Tracer("redis").Start(ctx, "redis.lock.acquire")
	defer span.End()
	token := randToken()
	deadline := time.Now().Add(wait)
	fullKey := "lock:" + key
	for {
		ok, err := c.rdb.SetNX(ctx, fullKey, token, c.lockTTL).Result()
		if err != nil {
			return nil, false, err
		}
		if ok {
			release := func() {
				_ = releaseScript.Run(context.Background(), c.rdb, []string{fullKey}, token).Err()
			}
			return release, true, nil
		}
		if time.Now().After(deadline) {
			return nil, false, nil
		}
		select {
		case <-ctx.Done():
			return nil, false, ctx.Err()
		case <-time.After(c.pollWait):
		}
	}
}

// Allow implements a fixed-window rate limiter: INCR then set the window TTL on first
// hit. Simple, cheap, and good enough for edge protection; a token bucket would be
// smoother but this is the honest, teachable version.
func (c *Client) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	fullKey := "ratelimit:" + key
	count, err := c.rdb.Incr(ctx, fullKey).Result()
	if err != nil {
		return true, err // fail open on limiter errors; do not lock users out on a Redis blip
	}
	if count == 1 {
		_ = c.rdb.Expire(ctx, fullKey, window).Err()
	}
	return count <= int64(limit), nil
}

// --- RefreshStore ---

func (c *Client) Save(ctx context.Context, jti, userID string, ttl time.Duration) error {
	return c.rdb.Set(ctx, "refresh:"+jti, userID, ttl).Err()
}

func (c *Client) Consume(ctx context.Context, jti string) (string, bool, error) {
	userID, err := c.rdb.GetDel(ctx, "refresh:"+jti).Result()
	if errors.Is(err, redis.Nil) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return userID, true, nil
}
