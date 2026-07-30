import { FirebaseServiceAccount, signJwt } from './firebaseUtils';

export interface IGoogleAuthService {
  getAccessToken(): Promise<string>;
}

// Module-level cache to persist the Google OAuth2 access token across multiple incoming requests
// on the same Cloudflare Worker instance (minimizing CPU overhead and API roundtrips).
let cachedAccessToken: { token: string; expiry: number } | null = null;

export class GoogleAuthService implements IGoogleAuthService {
  private serviceAccount: FirebaseServiceAccount;

  constructor(serviceAccount: FirebaseServiceAccount) {
    this.serviceAccount = serviceAccount;
  }

  /**
   * Decoupled Google OAuth2 access token generation for Google API scopes.
   * Caches the access token globally to avoid redundant JWT generation and roundtrips.
   */
  public async getAccessToken(): Promise<string> {
    // Return cached token if it has not expired yet (expires in 1 hour; we buffer by 5 minutes)
    if (cachedAccessToken && cachedAccessToken.expiry > Date.now() + 300 * 1000) {
      return cachedAccessToken.token;
    }

    const iat = Math.floor(Date.now() / 1000);
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

    cachedAccessToken = {
      token: data.access_token,
      expiry: Date.now() + 3600 * 1000,
    };

    return cachedAccessToken.token;
  }
}
