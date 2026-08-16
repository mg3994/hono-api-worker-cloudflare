import { describe, it, expect } from 'vitest';
import app from '../index';
import { mockEnv } from './testUtils';

describe('Hono Routes Integration Tests', () => {
  it('should successfully return standard guest response on GET /api/payments without any credentials', async () => {
    // Invoke payments endpoint as a guest (no Authorization header), passing mockEnv as the 3rd argument
    const response = await app.request('/api/payments', undefined, mockEnv);
    expect(response.status).toBe(200);

    const body = await response.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.isGuest).toBe(true);
    expect(body.data.paymentTier).toBe('Guest / Standard Tier');
  });

  it('should block GET /api/me with 401 Unauthorized if Authorization header is missing', async () => {
    // GET /api/me requires mandatory authentication
    const response = await app.request('/api/me', undefined, mockEnv);
    expect(response.status).toBe(401);

    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toContain('Authentication required');
  });

  it('should block compulsory GET /api/me with 401 Unauthorized if Bearer token format is malformed', async () => {
    // Non-Bearer token or bad Authorization header format
    const response = await app.request('/api/me', {
      headers: {
        'Authorization': 'Basic dGVzdDp0ZXN0',
      },
    }, mockEnv);
    expect(response.status).toBe(401);

    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toContain('Missing or invalid Authorization header');
  });

  it('should successfully sync a guest device session via POST /api/devices/sync', async () => {
    const payload = {
      action: 'SYNC_DEVICE',
      clientId: 'browser_test_id',
      idToken: 'guest_session',
      deviceToken: 'fcm_mock_device_token_999',
      clientName: 'Safari (Desktop)',
    };

    const response = await app.request('/api/devices/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);

    expect(response.status).toBe(200);

    const body = await response.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('Device session synced successfully');
    expect(body.data.session.uid).toBe('guest');
    expect(body.data.session.browserClientId).toBe('browser_test_id');
  });

  it('should successfully log out a device session via POST /api/devices/sync', async () => {
    const payload = {
      action: 'LOGOUT_DEVICE',
      clientId: 'browser_test_id',
    };

    const response = await app.request('/api/devices/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);

    expect(response.status).toBe(200);

    const body = await response.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('Successfully logged out browser device session');
  });

  it('should block GET /api/business/:id/users with 401 Unauthorized if unauthenticated', async () => {
    const response = await app.request('/api/business/biz_123/users', undefined, mockEnv);
    expect(response.status).toBe(401);

    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should block POST /api/notifications/send with 401 Unauthorized if unauthenticated', async () => {
    const payload = {
      targetUid: 'user_123',
      title: 'Alert',
      body: 'Message details',
    };

    const response = await app.request('/api/notifications/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);

    expect(response.status).toBe(401);

    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should block POST /api/claims/revoke with 401 Unauthorized if unauthenticated', async () => {
    const payload = {
      targetEmail: 'test@example.com',
      businessId: 'biz_123',
    };

    const response = await app.request('/api/claims/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);

    expect(response.status).toBe(401);

    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should block POST /api/claims/revoke with 400 Validation Error if targetEmail is invalid or missing', async () => {
    const payload = {
      targetEmail: 'invalid-email-format',
      businessId: 'biz_123',
    };

    const response = await app.request('/api/claims/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, mockEnv);

    expect(response.status).toBe(400);

    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('should block GET /api/users/phone with 401 Unauthorized if request is unauthenticated', async () => {
    const response = await app.request('/api/users/phone?phoneNumber=%2B919876543210', undefined, mockEnv);
    expect(response.status).toBe(401);

    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should block POST /api/users/create with 401 Unauthorized if request is unauthenticated', async () => {
    const response = await app.request('/api/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'newuser@example.com' }),
    }, mockEnv);
    expect(response.status).toBe(401);

    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should block POST /api/users/link-phone with 401 Unauthorized if request is unauthenticated', async () => {
    const response = await app.request('/api/users/link-phone', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid: 'user_123', phoneNumber: '+1234567890' }),
    }, mockEnv);
    expect(response.status).toBe(401);

    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
