import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleAuthService } from '../services/googleAuthService';
import { IJwtSigner } from '../domain/jwtSigner';
import { FirebaseServiceAccount } from '../domain/types';

describe('GoogleAuthService Caching & Token Generation Unit Tests', () => {
  const serviceAccount: FirebaseServiceAccount = {
    project_id: 'test-project',
    client_email: 'test@example.com',
    private_key: 'test-key',
  };

  const mockJwtSigner = (): IJwtSigner => ({
    signJwt: vi.fn().mockResolvedValue('mock_jwt_signature'),
  });

  const mockKVNamespace = (): KVNamespace => ({
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as any);

  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.spyOn(global, 'fetch');
    // Absolute test isolation: Reset the global module-level in-memory cache before every test run
    GoogleAuthService.resetCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate a fresh access token on cache miss and write to KV', async () => {
    const signer = mockJwtSigner();
    const kv = mockKVNamespace();

    vi.spyOn(kv, 'get').mockResolvedValue(null); // KV miss

    const mockResponse = {
      ok: true,
      json: async () => ({
        access_token: 'generated_token_xyz',
        expires_in: 3600,
      }),
    };
    fetchMock.mockResolvedValue(mockResponse);

    const authService = new GoogleAuthService(serviceAccount, signer, kv);
    const token = await authService.getAccessToken();

    expect(token).toBe('generated_token_xyz');
    expect(kv.get).toHaveBeenCalledWith('google_oauth_access_token', 'json');
    expect(kv.put).toHaveBeenCalledWith(
      'google_oauth_access_token',
      expect.stringContaining('generated_token_xyz'),
      expect.any(Object)
    );
  });

  it('should retrieve cached token from Cloudflare KV if local memory is empty', async () => {
    const signer = mockJwtSigner();
    const kv = mockKVNamespace();

    const cachedTokenData = {
      token: 'kv_cached_token_abc',
      expiry: Date.now() + 1800 * 1000, // Expires in 30 minutes
    };
    vi.spyOn(kv, 'get').mockResolvedValue(cachedTokenData as any);

    const authService = new GoogleAuthService(serviceAccount, signer, kv);
    const token = await authService.getAccessToken();

    expect(token).toBe('kv_cached_token_abc');
    expect(kv.get).toHaveBeenCalledWith('google_oauth_access_token', 'json');
    expect(fetchMock).not.toHaveBeenCalled(); // No Google API hit
  });
});
