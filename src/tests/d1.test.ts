import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompanyRepository } from '../repositories/companyRepository';
import { SessionRepository } from '../repositories/sessionRepository';
import { CustomClaims } from '../domain/types';
import { DeviceSessionRecord } from '../domain/sessionRepository';
import { createMockD1 } from './testUtils';

describe('D1 CompanyRepository & SessionRepository Tests', () => {
  it('should compile SQL statements and synchronize custom claims to D1 in batch', async () => {
    const mockDb = createMockD1();
    const repo = new CompanyRepository(mockDb);

    const claims: CustomClaims = {
      o: ['biz_1'],
      m: ['biz_2'],
      s: [],
    };

    await repo.syncClaimsToD1('user_123', 'test@example.com', claims);

    // Should have 1 DELETE and 2 INSERTS compiled into the statements list
    expect(mockDb.statements.length).toBe(3);
    expect(mockDb.statements[0].sql).toContain('DELETE FROM user_business_roles WHERE uid = ?');
    expect(mockDb.statements[0].params).toEqual(['user_123']);

    expect(mockDb.statements[1].sql).toContain('INSERT INTO user_business_roles');
    expect(mockDb.statements[1].params).toEqual([
      'user_123_biz_1',
      'user_123',
      'test@example.com',
      'biz_1',
      'o',
      expect.any(Number),
    ]);
  });

  it('should retrieve business users and format custom columns correctly', async () => {
    const mockDb = createMockD1();
    const repo = new CompanyRepository(mockDb);

    const result = await repo.getBusinessUsers('biz_123');

    expect(result.length).toBe(1);
    expect(result[0].uid).toBe('uid_1');
    expect(result[0].email).toBe('test@example.com');
    expect(result[0].businessId).toBe('biz_123');
    expect(result[0].role).toBe('o');
  });

  it('should compile Upsert SQL on syncDeviceSession', async () => {
    const mockDb = createMockD1();
    const repo = new SessionRepository(mockDb);

    const session: DeviceSessionRecord = {
      browserClientId: 'browser_1',
      uid: 'user_123',
      deviceToken: 'fcm_token_123',
      clientName: 'Chrome (Mobile)',
      updatedAt: 1234567,
    };

    await repo.syncDeviceSession(session);

    expect(mockDb.statements.length).toBe(1);
    expect(mockDb.statements[0].sql).toContain('INSERT INTO user_device_sessions');
    expect(mockDb.statements[0].sql).toContain('ON CONFLICT(browser_client_id) DO UPDATE');
    expect(mockDb.statements[0].params).toEqual([
      'browser_1',
      'user_123',
      'fcm_token_123',
      'Chrome (Mobile)',
      1234567,
    ]);
  });

  it('should compile Delete SQL on logoutDevice', async () => {
    const mockDb = createMockD1();
    const repo = new SessionRepository(mockDb);

    await repo.logoutDevice('browser_1');

    expect(mockDb.statements.length).toBe(1);
    expect(mockDb.statements[0].sql).toContain('DELETE FROM user_device_sessions WHERE browser_client_id = ?');
    expect(mockDb.statements[0].params).toEqual(['browser_1']);
  });

  it('should fetch FCM device tokens associated with a given Firebase UID', async () => {
    const mockDb = createMockD1();
    const repo = new SessionRepository(mockDb);

    const result = await repo.getFCMTokensByUid('user_123');

    expect(result).toEqual(['fcm_token_999']);
    expect(mockDb.statements.length).toBe(1);
    expect(mockDb.statements[0].sql).toContain('SELECT device_token as deviceToken FROM user_device_sessions WHERE uid = ?');
    expect(mockDb.statements[0].params).toEqual(['user_123']);
  });
});
