import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaimsService } from '../services/claimsService';
import { AssignClaimsUseCase } from '../usecases/assignClaimsUseCase';
import { IFirebaseRepository, FirebaseUserRecord } from '../repositories/firebaseRepository';
import { UserContext, CustomClaims } from '../domain/types';
import { PermissionDeniedError, LimitExceededError, AuthenticationError } from '../domain/errors';
import { TokenService } from '../services/tokenService';
import * as firebaseUtils from '../services/firebaseUtils';

describe('ClaimsService Unit Tests', () => {
  const claimsService = new ClaimsService();

  it('should successfully add a role for a business ID if no previous roles exist', () => {
    const currentClaims: CustomClaims = { o: [], m: [], s: [] };
    const updated = claimsService.updateBusinessRole(currentClaims, 'biz_1', 'o');
    expect(updated.o).toContain('biz_1');
    expect(updated.m).toEqual([]);
    expect(updated.s).toEqual([]);
  });

  it('should remove business ID from other roles when promoting/demoting (partitioning)', () => {
    // Start as staff
    const currentClaims: CustomClaims = { o: [], m: [], s: ['biz_1', 'biz_2'] };

    // Promote to owner
    const updated = claimsService.updateBusinessRole(currentClaims, 'biz_1', 'o');
    expect(updated.o).toContain('biz_1');
    expect(updated.s).not.toContain('biz_1');
    expect(updated.s).toContain('biz_2'); // Other business remains
  });

  it('should not allow duplicate entries for the same role', () => {
    const currentClaims: CustomClaims = { o: ['biz_1'], m: [], s: [] };
    const updated = claimsService.updateBusinessRole(currentClaims, 'biz_1', 'o');
    expect(updated.o).toEqual(['biz_1']);
  });

  it('should throw a LimitExceededError if the user exceeds the dynamic maxLimit', () => {
    const o = Array.from({ length: 3 }, (_, i) => `biz_o_${i}`);
    const currentClaims: CustomClaims = { o, m: [], s: [] }; // Total of 3

    // Try adding a 4th with a maxLimit of 3
    expect(() => {
      claimsService.updateBusinessRole(currentClaims, 'new_biz', 's', 3);
    }).toThrow(LimitExceededError);
  });
});

describe('AssignClaimsUseCase Auth & Validation Tests', () => {
  const mockFirebaseRepo = (): IFirebaseRepository => ({
    getUserByEmail: vi.fn(),
    setCustomClaims: vi.fn(),
  });

  const claimsService = new ClaimsService();

  it('should allow Super Admin to assign any role to any user', async () => {
    const repo = mockFirebaseRepo();
    const useCase = new AssignClaimsUseCase(repo, claimsService);

    const caller: UserContext = {
      uid: 'admin_1',
      email: 'superadmin@example.com',
      isSuperAdmin: true,
      claims: { o: [], m: [], s: [] },
    };

    const targetUser: FirebaseUserRecord = {
      localId: 'user_123',
      email: 'target@example.com',
      customAttributes: JSON.stringify({ o: [], m: [], s: [] }),
    };

    vi.spyOn(repo, 'getUserByEmail').mockResolvedValue(targetUser);
    vi.spyOn(repo, 'setCustomClaims').mockResolvedValue();

    const result = await useCase.execute(caller, {
      targetEmail: 'target@example.com',
      role: 'o',
      businessId: 'biz_100',
    });

    expect(result.o).toContain('biz_100');
    expect(repo.setCustomClaims).toHaveBeenCalledWith('user_123', expect.any(Object));
  });

  it('should allow Owner of a business to assign roles to others for that business', async () => {
    const repo = mockFirebaseRepo();
    const useCase = new AssignClaimsUseCase(repo, claimsService);

    const caller: UserContext = {
      uid: 'owner_1',
      email: 'owner@example.com',
      isSuperAdmin: false,
      claims: { o: ['biz_100'], m: [], s: [] }, // Caller owns biz_100
    };

    const targetUser: FirebaseUserRecord = {
      localId: 'user_123',
      email: 'target@example.com',
      customAttributes: JSON.stringify({ o: [], m: [], s: [] }),
    };

    vi.spyOn(repo, 'getUserByEmail').mockResolvedValue(targetUser);
    vi.spyOn(repo, 'setCustomClaims').mockResolvedValue();

    const result = await useCase.execute(caller, {
      targetEmail: 'target@example.com',
      role: 'm',
      businessId: 'biz_100',
    });

    expect(result.m).toContain('biz_100');
    expect(repo.setCustomClaims).toHaveBeenCalled();
  });

  it('should deny non-owner and non-super-admin from assigning claims with PermissionDeniedError', async () => {
    const repo = mockFirebaseRepo();
    const useCase = new AssignClaimsUseCase(repo, claimsService);

    const caller: UserContext = {
      uid: 'user_2',
      email: 'user2@example.com',
      isSuperAdmin: false,
      claims: { o: ['another_biz'], m: [], s: [] }, // Caller does NOT own biz_100
    };

    await expect(
      useCase.execute(caller, {
        targetEmail: 'target@example.com',
        role: 'm',
        businessId: 'biz_100',
      })
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('should prevent Owner from assigning themselves to a lower/different role of their own business with PermissionDeniedError', async () => {
    const repo = mockFirebaseRepo();
    const useCase = new AssignClaimsUseCase(repo, claimsService);

    const caller: UserContext = {
      uid: 'owner_1',
      email: 'owner@example.com',
      isSuperAdmin: false,
      claims: { o: ['biz_100'], m: [], s: [] },
    };

    await expect(
      useCase.execute(caller, {
        targetEmail: 'owner@example.com', // Caller email is same as target
        role: 'm', // Trying to make themselves moderator of their own business
        businessId: 'biz_100',
      })
    ).rejects.toThrow(/An Owner cannot downgrade themselves or assign themselves to other roles for their own business/);
  });

  it('should allow Owner to update themselves to Owner of their own business (noop or reinforce)', async () => {
    const repo = mockFirebaseRepo();
    const useCase = new AssignClaimsUseCase(repo, claimsService);

    const caller: UserContext = {
      uid: 'owner_1',
      email: 'owner@example.com',
      isSuperAdmin: false,
      claims: { o: ['biz_100'], m: [], s: [] },
    };

    const targetUser: FirebaseUserRecord = {
      localId: 'owner_1',
      email: 'owner@example.com',
      customAttributes: JSON.stringify({ o: ['biz_100'], m: [], s: [] }),
    };

    vi.spyOn(repo, 'getUserByEmail').mockResolvedValue(targetUser);
    vi.spyOn(repo, 'setCustomClaims').mockResolvedValue();

    const result = await useCase.execute(caller, {
      targetEmail: 'owner@example.com',
      role: 'o', // Reinforce ownership
      businessId: 'biz_100',
    });

    expect(result.o).toContain('biz_100');
  });

  it('should allow Super Admin to remove or demote an Owner role', async () => {
    const repo = mockFirebaseRepo();
    const useCase = new AssignClaimsUseCase(repo, claimsService);

    const caller: UserContext = {
      uid: 'admin_1',
      email: 'superadmin@example.com',
      isSuperAdmin: true,
      claims: { o: [], m: [], s: [] },
    };

    const targetUser: FirebaseUserRecord = {
      localId: 'user_123',
      email: 'target@example.com',
      customAttributes: JSON.stringify({ o: ['biz_100'], m: [], s: [] }), // Target is currently owner
    };

    vi.spyOn(repo, 'getUserByEmail').mockResolvedValue(targetUser);
    vi.spyOn(repo, 'setCustomClaims').mockResolvedValue();

    const result = await useCase.execute(caller, {
      targetEmail: 'target@example.com',
      role: 'm', // Demote to Moderator
      businessId: 'biz_100',
    });

    expect(result.o).not.toContain('biz_100');
    expect(result.m).toContain('biz_100');
  });

  it('should prevent standard Business Owner from removing/demoting Owner role of another user', async () => {
    const repo = mockFirebaseRepo();
    const useCase = new AssignClaimsUseCase(repo, claimsService);

    const caller: UserContext = {
      uid: 'owner_1',
      email: 'owner@example.com',
      isSuperAdmin: false,
      claims: { o: ['biz_100'], m: [], s: [] }, // Caller owns biz_100
    };

    const targetUser: FirebaseUserRecord = {
      localId: 'user_123',
      email: 'target@example.com',
      customAttributes: JSON.stringify({ o: ['biz_100'], m: [], s: [] }), // Target is currently owner
    };

    vi.spyOn(repo, 'getUserByEmail').mockResolvedValue(targetUser);

    await expect(
      useCase.execute(caller, {
        targetEmail: 'target@example.com',
        role: 'm', // Trying to demote target to moderator
        businessId: 'biz_100',
      })
    ).rejects.toThrow(/Only Super Admins are authorized to remove or demote an Owner role/);
  });
});

describe('TokenService Unit Tests', () => {
  const serviceAccount = {
    project_id: 'test-project',
    client_email: 'test@example.com',
    private_key: 'test-key',
  };

  const superAdminsStr = 'admin1@test.com,admin2@test.com';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should correctly parse token and match super admin list', async () => {
    const mockDecodedToken = {
      uid: 'admin_uid',
      email: 'admin1@test.com',
      o: ['biz_x'],
      m: [],
      s: [],
    };

    const verifySpy = vi.spyOn(firebaseUtils, 'verifyFirebaseIdToken').mockResolvedValue(mockDecodedToken);

    const tokenService = new TokenService(serviceAccount, superAdminsStr);
    const context = await tokenService.verifyToken('mock_jwt_token');

    expect(verifySpy).toHaveBeenCalledWith('mock_jwt_token', 'test-project');
    expect(context.uid).toBe('admin_uid');
    expect(context.email).toBe('admin1@test.com');
    expect(context.isSuperAdmin).toBe(true);
    expect(context.claims.o).toContain('biz_x');
  });

  it('should identify non-super admin users correctly', async () => {
    const mockDecodedToken = {
      uid: 'user_uid',
      email: 'regular@test.com',
    };

    vi.spyOn(firebaseUtils, 'verifyFirebaseIdToken').mockResolvedValue(mockDecodedToken);

    const tokenService = new TokenService(serviceAccount, superAdminsStr);
    const context = await tokenService.verifyToken('mock_jwt_token');

    expect(context.isSuperAdmin).toBe(false);
  });

  it('should throw AuthenticationError when token verification fails', async () => {
    vi.spyOn(firebaseUtils, 'verifyFirebaseIdToken').mockRejectedValue(new Error('Invalid signature'));

    const tokenService = new TokenService(serviceAccount, superAdminsStr);

    await expect(tokenService.verifyToken('bad_token')).rejects.toThrow(AuthenticationError);
  });
});
