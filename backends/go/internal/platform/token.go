package platform

import (
	"context"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/ticketing-labs/backend-go/internal/domain"
	"github.com/ticketing-labs/backend-go/internal/usecase"
)

// RefreshStore persists refresh tokens so they can be revoked on use. Consume must be
// atomic: it returns the owner and removes the token in one step, so a token can be
// spent exactly once. Redis GETDEL provides this; the memory version uses a mutex.
type RefreshStore interface {
	Save(ctx context.Context, jti, userID string, ttl time.Duration) error
	Consume(ctx context.Context, jti string) (userID string, ok bool, err error)
}

// TokenService issues short-lived access JWTs and opaque, rotating refresh tokens.
// Access tokens are stateless HS256 JWTs. Refresh tokens are opaque handles stored
// server-side; rotating one revokes it, so a stolen-and-replayed refresh token fails.
type TokenService struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
	store      RefreshStore
	ids        usecase.IDGenerator
	clock      usecase.Clock
}

func NewTokenService(secret string, accessTTL, refreshTTL time.Duration, store RefreshStore, ids usecase.IDGenerator, clock usecase.Clock) *TokenService {
	return &TokenService{
		secret: []byte(secret), accessTTL: accessTTL, refreshTTL: refreshTTL,
		store: store, ids: ids, clock: clock,
	}
}

func (s *TokenService) IssueAccess(userID string, role domain.Role) (string, int, error) {
	now := s.clock.Now()
	claims := jwt.MapClaims{
		"sub":  userID,
		"role": string(role),
		"iat":  now.Unix(),
		"exp":  now.Add(s.accessTTL).Unix(),
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
	if err != nil {
		return "", 0, err
	}
	return tok, int(s.accessTTL.Seconds()), nil
}

func (s *TokenService) IssueRefresh(userID string) (string, error) {
	jti := s.ids.NewID()
	if err := s.store.Save(context.Background(), jti, userID, s.refreshTTL); err != nil {
		return "", err
	}
	return jti, nil
}

func (s *TokenService) Rotate(ctx context.Context, refreshToken string) (string, error) {
	userID, ok, err := s.store.Consume(ctx, refreshToken)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", domain.ErrInvalidToken // unknown, expired, or already spent
	}
	return userID, nil
}

func (s *TokenService) ParseAccess(token string) (string, domain.Role, error) {
	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, domain.ErrInvalidToken
		}
		return s.secret, nil
	})
	if err != nil || !parsed.Valid {
		return "", "", domain.ErrInvalidToken
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return "", "", domain.ErrInvalidToken
	}
	sub, _ := claims["sub"].(string)
	role, _ := claims["role"].(string)
	if sub == "" {
		return "", "", domain.ErrInvalidToken
	}
	return sub, domain.Role(role), nil
}

var _ usecase.TokenService = (*TokenService)(nil)
