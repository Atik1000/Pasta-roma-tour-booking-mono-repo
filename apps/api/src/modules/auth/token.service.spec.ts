import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { parseDurationToSeconds } from './auth.constants';
import { TokenService } from './token.service';

const CONFIG = {
  accessSecret: 'a'.repeat(48),
  accessTtl: '15m',
  refreshSecret: 'b'.repeat(48),
  refreshTtl: '30d',
};

interface StoredToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

/** In-memory stand-in for the `refresh_tokens` table. */
function makePrismaStub() {
  const rows = new Map<string, StoredToken>();
  let sequence = 0;

  return {
    rows,
    refreshToken: {
      create: jest.fn(
        ({ data }: { data: Omit<StoredToken, 'id' | 'revokedAt' | 'replacedById'> }) => {
          sequence += 1;
          const row: StoredToken = {
            // UUID-shaped: `rotateRefreshToken` rejects non-UUID ids before they
            // can reach Postgres, so a malformed token is a 401 not a 500.
            id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
            userId: data.userId,
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt,
            revokedAt: null,
            replacedById: null,
          };
          rows.set(row.id, row);
          return Promise.resolve(row);
        },
      ),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.get(where.id) ?? null),
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Partial<StoredToken> }) => {
        const row = rows.get(where.id);
        if (row) Object.assign(row, data);
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: { userId?: string; id?: string };
          data: Partial<StoredToken>;
        }) => {
          let count = 0;
          for (const row of rows.values()) {
            const matches =
              (where.userId === undefined || row.userId === where.userId) &&
              (where.id === undefined || row.id === where.id) &&
              row.revokedAt === null;
            if (matches) {
              Object.assign(row, data);
              count += 1;
            }
          }
          return Promise.resolve({ count });
        },
      ),
      deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
  };
}

describe('parseDurationToSeconds', () => {
  it('parses the supported suffixes', () => {
    expect(parseDurationToSeconds('900')).toBe(900);
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('12h')).toBe(43_200);
    expect(parseDurationToSeconds('30d')).toBe(2_592_000);
  });

  it('rejects anything it does not understand, rather than defaulting', () => {
    expect(() => parseDurationToSeconds('15 minutes')).toThrow(/Invalid duration/);
    expect(() => parseDurationToSeconds('')).toThrow(/Invalid duration/);
  });
});

describe('TokenService', () => {
  let prisma: ReturnType<typeof makePrismaStub>;
  let service: TokenService;

  beforeEach(() => {
    prisma = makePrismaStub();
    service = new TokenService(
      CONFIG,
      new JwtService({}),
      prisma as unknown as ConstructorParameters<typeof TokenService>[2],
    );
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  const user = { id: 'user-1', email: 'admin@pastaromatour.com', role: 'ADMIN' };

  describe('access tokens', () => {
    it('round-trips its claims', () => {
      const payload = service.verifyAccessToken(service.signAccessToken(user));

      expect(payload).toMatchObject({
        sub: 'user-1',
        email: user.email,
        role: 'ADMIN',
        typ: 'access',
      });
    });

    it('rejects a token signed with a different secret', () => {
      const forged = new JwtService({}).sign(
        { sub: 'user-1', typ: 'access' },
        { secret: 'x'.repeat(48) },
      );

      expect(() => service.verifyAccessToken(forged)).toThrow(UnauthorizedException);
    });

    it('rejects a token whose type is not "access"', () => {
      const wrongType = new JwtService({}).sign(
        { sub: 'user-1', typ: 'refresh' },
        { secret: CONFIG.accessSecret },
      );

      expect(() => service.verifyAccessToken(wrongType)).toThrow(UnauthorizedException);
    });
  });

  describe('refresh tokens', () => {
    it('stores only a hash, never the token itself', async () => {
      const { token } = await service.issueRefreshToken('user-1');
      const [id, secret] = token.split('.');

      const stored = prisma.rows.get(id ?? '');
      expect(stored).toBeDefined();
      expect(stored?.tokenHash).not.toBe(secret);
      expect(stored?.tokenHash).toHaveLength(64);
    });

    it('rotates on use and revokes the presented token', async () => {
      const first = await service.issueRefreshToken('user-1');
      const { userId, refresh } = await service.rotateRefreshToken(first.token);

      expect(userId).toBe('user-1');
      expect(refresh.token).not.toBe(first.token);
      expect(prisma.rows.get(first.token.split('.')[0] ?? '')?.revokedAt).toBeInstanceOf(Date);
      expect(prisma.rows.get(first.token.split('.')[0] ?? '')?.replacedById).toBe(
        refresh.token.split('.')[0],
      );
    });

    it('treats re-use of a rotated token as theft and kills every session', async () => {
      const first = await service.issueRefreshToken('user-1');
      const second = await service.rotateRefreshToken(first.token);

      // The attacker replays the old token.
      await expect(service.rotateRefreshToken(first.token)).rejects.toThrow(UnauthorizedException);

      // The legitimate holder's newer token is dead too.
      await expect(service.rotateRefreshToken(second.refresh.token)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an expired token', async () => {
      const { token } = await service.issueRefreshToken('user-1');
      const row = prisma.rows.get(token.split('.')[0] ?? '');
      if (row) row.expiresAt = new Date(Date.now() - 1_000);

      await expect(service.rotateRefreshToken(token)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token whose secret does not match the stored hash', async () => {
      const { token } = await service.issueRefreshToken('user-1');
      const [id] = token.split('.');

      await expect(service.rotateRefreshToken(`${id}.not-the-real-secret`)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a malformed token without touching the database', async () => {
      await expect(service.rotateRefreshToken('garbage')).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });
  });
});
