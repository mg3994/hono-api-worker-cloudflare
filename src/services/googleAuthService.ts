import { IJwtSigner } from '../domain/jwtSigner';
import { FirebaseServiceAccount } from '../domain/types';

export interface IGoogleAuthService {
  getAccessToken(): Promise<string>;
}

// Module-level in-memory cache for ultra-fast, local request caching
let cachedAccessToken: { token: string; expiry: number } | null = null;
let inFlightTokenPromise: Promise<string> | null = null; // Prevents thundering herd lock

export class GoogleAuthService implements IGoogleAuthService {
  private serviceAccount: FirebaseServiceAccount;
  private jwtSigner: IJwtSigner;
  private googleOauthTokenKv?: KVNamespace;

  constructor(serviceAccount: FirebaseServiceAccount, jwtSigner: IJwtSigner, googleOauthTokenKv?: KVNamespace) {
    this.serviceAccount = serviceAccount;
    this.jwtSigner = jwtSigner;
    this.googleOauthTokenKv = googleOauthTokenKv;
  }

  /**
   * Resets the in-memory Google OAuth token cache (primarily useful during unit test teardowns).
   */
  public static resetCache(): void {
    cachedAccessToken = null;
    inFlightTokenPromise = null;
  }

  /**
   * Decoupled Google OAuth2 access token generation for Google API scopes.
   * Utilizes a highly efficient, multi-level caching strategy and prevents thundering herd.
   */
  public async getAccessToken(): Promise<string> {
    const nowMs = Date.now();

    // 1. Check local in-memory cache first (with 5 minutes buffer)
    if (cachedAccessToken && cachedAccessToken.expiry > nowMs + 300 * 1000) {
      return cachedAccessToken.token;
    }

    // 2. Prevent concurrent duplicate fetches (Thundering Herd lock)
    if (inFlightTokenPromise) {
      return inFlightTokenPromise;
    }

    inFlightTokenPromise = this.fetchAndCacheToken(nowMs).finally(() => {
      inFlightTokenPromise = null;
    });

    return inFlightTokenPromise;
  }

  private async fetchAndCacheToken(nowMs: number): Promise<string> {
    const kvKey = 'google_oauth_access_token';

    // Check Cloudflare KV cache if available
    if (this.googleOauthTokenKv) {
      try {
        const cachedFromKv = await this.googleOauthTokenKv.get<{ token: string; expiry: number }>(kvKey, 'json');
        if (cachedFromKv && cachedFromKv.expiry > nowMs + 300 * 1000) {
          cachedAccessToken = cachedFromKv;
          return cachedFromKv.token;
        }
      } catch (err) {
        console.warn('GoogleAuthService: Failed to retrieve token from KV cache:', err);
      }
    }

    // Cache Miss: Generate a fresh OAuth2 access token from Google
    const iat = Math.floor(nowMs / 1000);
    const exp = iat + 3600;

    const payload = {
      iss: this.serviceAccount.client_email,
      // Identity toolkit scope + general Cloud Platform scope for maximum API coverage
      scope: 'https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      exp,
      iat,
    };

    // Clean Architecture & SOLID: Delegate signing completely to injected IJwtSigner interface!
    const jwt = await this.jwtSigner.signJwt(payload);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
      signal: AbortSignal.timeout(10000), // 10s timeout safeguard
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to obtain Google access token: ${errText}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in?: number };

    // Dynamically retrieve expires_in (seconds) from the Google API response
    const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : 3600;

    // Compute the exact expiration timestamp
    const expiryTime = nowMs + expiresInSeconds * 1000;
    cachedAccessToken = {
      token: data.access_token,
      expiry: expiryTime,
    };

    // Store in globally distributed Cloudflare KV Namespace with dynamic expires_in TTL (adjusted with buffer)
    if (this.googleOauthTokenKv) {
      try {
        const bufferTtl = Math.max(60, expiresInSeconds - 300);
        await this.googleOauthTokenKv.put(
          kvKey,
          JSON.stringify(cachedAccessToken),
          { expirationTtl: bufferTtl }
        );
      } catch (err) {
        console.warn('GoogleAuthService: Failed to write token to KV cache:', err);
      }
    }

    return cachedAccessToken.token;
  }
}
