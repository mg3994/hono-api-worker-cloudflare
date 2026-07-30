import { describe, it, expect } from 'vitest';
import app from '../index';

const mockEnv = {
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    project_id: 'mock-test-project',
    client_email: 'mock-client@example.com',
    private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSlAgEAAoIBAQC3\n-----END PRIVATE KEY-----',
  }),
  SUPER_ADMINS: 'admin@test.com',
};

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
});
