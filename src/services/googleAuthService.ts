import { FirebaseServiceAccount, signJwt } from './firebaseUtils';

export interface IGoogleAuthService {
  getAccessToken(): Promise<string>;
}

// Module-level in-memory cache for ultra-fast, local request caching
let cachedAccessToken: { token: string; expiry: number } | null = null;

export class GoogleAuthService implements IGoogleAuthService {
  private serviceAccount: FirebaseServiceAccount;
  private kvNamespace?: KVNamespace;

  constructor(serviceAccount: FirebaseServiceAccount, kvNamespace?: KVNamespace) {
    this.serviceAccount = serviceAccount;
    this.kvNamespace = kvNamespace;
  }

  /**
   * Decoupled Google OAuth2 access token generation for Google API scopes.
   * Utilizes a highly efficient, multi-level caching strategy:
   * 1. Check in-memory module-level cache (sub-millisecond latency local to instance).
   * 2. Check Cloudflare KV namespace (globally distributed edge key-value storage).
   * 3. Fallback to fresh JWT assertion generation & API call, then populate KV and memory.
   */
  public async getAccessToken(): Promise<string> {
    const nowMs = Date.now();

    // 1. Check local in-memory cache first (with 5 minutes buffer)
    if (cachedAccessToken && cachedAccessToken.expiry > nowMs + 300 * 1000) {
      return cachedAccessToken.token;
    }

    // 2. Fall back to Cloudflare KV cache if available
    const kvKey = 'google_oauth_access_token';
    if (this.kvNamespace) {
      try {
        const cachedFromKv = await this.kvNamespace.get<{ token: string; expiry: number }>(kvKey, 'json');
        if (cachedFromKv && cachedFromKv.expiry > nowMs + 300 * 1000) {
          // Populate the in-memory cache for subsequent fast retrievals on this instance
          cachedAccessToken = cachedFromKv;
          return cachedFromKv.token;
        }
      } catch (err) {
        // Log or silently fallback to generating a new token if KV fails
        console.warn('GoogleAuthService: Failed to retrieve token from KV cache:', err);
      }
    }

    // 3. Cache Miss: Generate a fresh OAuth2 access token from Google
    const iat = Math.floor(nowMs / 1000);
    const exp = iat + 3600;

    const payload = {
      iss: this.serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/identitytoolkit',
      aud: 'https://oauth2.googleapis.com/token',
      exp,
      iat,
    };

    const jwt = await signJwt(payload, this.serviceAccount);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to obtain Google access token: ${errText}`);
    }

    const data = (await response.json()) as { access_token: string };

    // Store in-memory
    const expiryTime = nowMs + 3600 * 1000;
    cachedAccessToken = {
      token: data.access_token,
      expiry: expiryTime,
    };

    // Store in globally distributed Cloudflare KV Namespace with 55 minutes TTL (3300 seconds)
    if (this.kvNamespace) {
      try {
        await this.kvNamespace.put(
          kvKey,
          JSON.stringify(cachedAccessToken),
          { expirationTtl: 3300 }
        );
      } catch (err) {
        console.warn('GoogleAuthService: Failed to write token to KV cache:', err);
      }
    }

    return cachedAccessToken.token;
  }
}
