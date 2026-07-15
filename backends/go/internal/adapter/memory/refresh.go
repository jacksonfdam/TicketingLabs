package memory

import (
	"context"
	"sync"
	"time"
)

// RefreshStore is an in-process refresh-token store. Consume is atomic under the
// mutex, so a token is spendable exactly once even under concurrent rotation.
type RefreshStore struct {
	mu   sync.Mutex
	data map[string]entry
}

type entry struct {
	userID    string
	expiresAt time.Time
}

func NewRefreshStore() *RefreshStore { return &RefreshStore{data: map[string]entry{}} }

func (s *RefreshStore) Save(_ context.Context, jti, userID string, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[jti] = entry{userID: userID, expiresAt: time.Now().Add(ttl)}
	return nil
}

func (s *RefreshStore) Consume(_ context.Context, jti string) (string, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.data[jti]
	if !ok {
		return "", false, nil
	}
	delete(s.data, jti)
	if time.Now().After(e.expiresAt) {
		return "", false, nil
	}
	return e.userID, true, nil
}
