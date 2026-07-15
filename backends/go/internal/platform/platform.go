// Package platform holds small, concrete implementations of the low-level ports:
// the clock, id generation, and password hashing. They are boring on purpose.
package platform

import (
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now().UTC() }

type UUIDGenerator struct{}

func (UUIDGenerator) NewID() string { return uuid.NewString() }

// BcryptHasher verifies passwords against bcrypt hashes. bcrypt is used rather than
// argon2 because the hash format is identical across every language in this lab, so
// one seeded hash authenticates against all seven backends. See the seed file.
type BcryptHasher struct{}

func (BcryptHasher) Verify(hash, plaintext string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext)) == nil
}

// Hash is a helper used by tooling to generate seed hashes; not on the hot path.
func (BcryptHasher) Hash(plaintext string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	return string(b), err
}
