package redisadp

import (
	"crypto/rand"
	"encoding/hex"
)

// randToken returns a 128-bit random hex string used to prove lock ownership.
func randToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
