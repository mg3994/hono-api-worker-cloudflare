import { describe, it, expect, vi } from 'vitest';
import { ClaimsService } from '../services/claimsService';
import { AssignClaimsUseCase } from '../usecases/assignClaimsUseCase';
import { IFirebaseRepository, FirebaseUserRecord } from '../repositories/firebaseRepository';
import { UserContext, CustomClaims } from '../domain/types';

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

  it('should throw an error if the user exceeds 20 total business ID assignments', () => {
    const o = Array.from({ length: 10 }, (_, i) => `biz_o_${i}`);
    const m = Array.from({ length: 10 }, (_, i) => `biz_m_${i}`);
    const currentClaims: CustomClaims = { o, m, s: [] }; // Total of 20

    // Try adding one more (21st)
    expect(() => {
      claimsService.updateBusinessRole(currentClaims, 'new_biz', 's');
    }).toThrow(/limit exceeded/i);
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

  it('should deny non-owner and non-super-admin from assigning claims', async () => {
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
    ).rejects.toThrow(/permission denied/i);
  });

  it('should prevent Owner from assigning themselves to a lower/different role of their own business', async () => {
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
    ).rejects.toThrow(/an owner cannot assign themselves as a moderator or staff/i);
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
});
