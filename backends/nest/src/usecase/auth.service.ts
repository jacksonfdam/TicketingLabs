import { Errors } from '../domain/errors';
import { Role } from '../domain/models';
import { PasswordHasher, TokenService, UserRepository } from './ports';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.users.findByEmail(email);
    // Same error whether the email is unknown or the password is wrong. Telling an
    // attacker which emails exist is a free gift we decline to give.
    if (!user || !this.hasher.verify(user.passwordHash, password)) {
      throw Errors.InvalidCredentials;
    }
    return this.issue(user.id, user.role);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const userId = await this.tokens.rotate(refreshToken); // throws on reuse/expiry
    const user = await this.users.findById(userId);
    if (!user) throw Errors.InvalidToken;
    return this.issue(user.id, user.role);
  }

  private async issue(userId: string, role: Role): Promise<TokenPair> {
    const { token, expiresIn } = this.tokens.issueAccess(userId, role);
    const refreshToken = await this.tokens.issueRefresh(userId);
    return { accessToken: token, refreshToken, expiresIn };
  }
}
