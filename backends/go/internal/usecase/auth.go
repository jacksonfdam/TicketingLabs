package usecase

import (
	"context"

	"github.com/ticketing-labs/backend-go/internal/domain"
)

type TokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int
}

type AuthService struct {
	users  UserRepository
	hasher PasswordHasher
	tokens TokenService
}

func NewAuthService(u UserRepository, h PasswordHasher, t TokenService) *AuthService {
	return &AuthService{users: u, hasher: h, tokens: t}
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*TokenPair, error) {
	user, err := s.users.FindByEmail(ctx, email)
	if err != nil {
		// Same error whether the email is unknown or the password is wrong. Telling
		// an attacker which emails exist is a free gift we decline to give.
		return nil, domain.ErrInvalidCredentials
	}
	if !s.hasher.Verify(user.PasswordHash, password) {
		return nil, domain.ErrInvalidCredentials
	}
	return s.issue(user.ID, user.Role)
}

func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*TokenPair, error) {
	userID, err := s.tokens.Rotate(ctx, refreshToken)
	if err != nil {
		return nil, domain.ErrInvalidToken
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return nil, domain.ErrInvalidToken
	}
	return s.issue(user.ID, user.Role)
}

func (s *AuthService) issue(userID string, role domain.Role) (*TokenPair, error) {
	access, expiresIn, err := s.tokens.IssueAccess(userID, role)
	if err != nil {
		return nil, domain.ErrInternal
	}
	refresh, err := s.tokens.IssueRefresh(userID)
	if err != nil {
		return nil, domain.ErrInternal
	}
	return &TokenPair{AccessToken: access, RefreshToken: refresh, ExpiresIn: expiresIn}, nil
}
