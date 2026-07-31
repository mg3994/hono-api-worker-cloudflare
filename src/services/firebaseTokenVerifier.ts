import { base64urlDecode } from './firebaseUtils';
import { ILogger } from '../domain/logger';

export interface DecodedTokenPayload {
  uid: string;
  email: string;
  email_verified?: boolean;
  o?: string[];
  m?: string[];
  s?: string[];
  [key: string]: any;
}

export interface IFirebaseTokenVerifier {
  verifyToken(token: string, projectId: string): Promise<DecodedTokenPayload>;
}

// Module-level in-memory cache to persist imported CryptoKeys locally on the edge instance
const publicKeyCryptoKeyCache = new Map<string, CryptoKey>();

export class FirebaseTokenVerifier implements IFirebaseTokenVerifier {
  private firebasePublicKeyKv?: KVNamespace;
  private logger?: ILogger;

  constructor(firebasePublicKeyKv?: KVNamespace, logger?: ILogger) {
    this.firebasePublicKeyKv = firebasePublicKeyKv;
    this.logger = logger;
  }

  /**
   * Saves fresh JWKs from Google in Cloudflare KV.
   * Cleans up local memory key cache for expired/rotated kids.
   */
  private async fetchAndCacheGoogleJwks(): Promise<any[]> {
    this.logger?.info('Fetching fresh JWK set from Google securetoken robot API...');

    const response = await fetch(
      'https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com'
    );
    if (!response.ok) {
      throw new Error('Failed to fetch Firebase JWKs');
    }

    const cacheControl = response.headers.get('cache-control');
    let maxAge = 3600;
    if (cacheControl) {
      const match = cacheControl.match(/max-age=(\d+)/);
      if (match) {
        maxAge = parseInt(match[1], 10);
      }
    }

    const data = (await response.json()) as { keys: any[] };

    // Prune the in-memory publicKeyCryptoKeyCache for rotated keys
    this.logger?.info('Pruning outdated verified public keys from in-memory cache on JWK rotation...');
    const validKids = new Set(data.keys.map((k) => k.kid));
    for (const kid of publicKeyCryptoKeyCache.keys()) {
      if (!validKids.has(kid)) {
        publicKeyCryptoKeyCache.delete(kid);
      }
    }

    // Cache each newly fetched JWK in globally distributed Cloudflare KV with Google's exact Cache-Control TTL
    if (this.firebasePublicKeyKv) {
      for (const key of data.keys) {
        try {
          await this.firebasePublicKeyKv.put(
            `jwk_kid_${key.kid}`,
            JSON.stringify(key),
            { expirationTtl: Math.max(60, maxAge) } // Minimum TTL of 60s as per Cloudflare constraints
          );
        } catch (err) {
          console.warn(`FirebaseTokenVerifier: Failed to write JWK for kid "${key.kid}" to KV:`, err);
        }
      }
    }

    return data.keys;
  }

  private b64ToUint8Array(str: string): Uint8Array {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Decodes and locally verifies the RS256 signature of a Firebase ID JWT token using Web Crypto.
   */
  public async verifyToken(token: string, projectId: string): Promise<DecodedTokenPayload> {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(base64urlDecode(headerB64)) as { kid?: string; alg?: string };
    const payload = JSON.parse(base64urlDecode(payloadB64)) as {
      iss?: string;
      aud?: string;
      exp?: number;
      sub?: string;
      email?: string;
      [key: string]: any;
    };

    if (!header.kid) {
      throw new Error('JWT header missing kid');
    }
    if (header.alg !== 'RS256') {
      throw new Error('JWT alg is not RS256');
    }

    // Validate standard Firebase claims
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      throw new Error('Token has expired');
    }
    if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
      throw new Error(`Invalid issuer: ${payload.iss}`);
    }
    if (payload.aud !== projectId) {
      throw new Error(`Invalid audience: ${payload.aud}`);
    }
    if (!payload.sub) {
      throw new Error('Subject (uid) missing in token');
    }

    // Retrieve or import the matching public key
    let publicKey = publicKeyCryptoKeyCache.get(header.kid);
    if (!publicKey) {
      let matchingJwk: any = null;

      // Try retrieving the JWK from Cloudflare KV cache first
      if (this.firebasePublicKeyKv) {
        try {
          const cachedJwkStr = await this.firebasePublicKeyKv.get(`jwk_kid_${header.kid}`);
          if (cachedJwkStr) {
            matchingJwk = JSON.parse(cachedJwkStr);
          }
        } catch (err) {
          console.warn(`FirebaseTokenVerifier: Failed to read JWK for kid "${header.kid}" from KV:`, err);
        }
      }

      // If missing in KV, fetch fresh keys from Google (which populates the KV cache)
      if (!matchingJwk) {
        const jwks = await this.fetchAndCacheGoogleJwks();
        matchingJwk = jwks.find((key) => key.kid === header.kid);
      }

      if (!matchingJwk) {
        throw new Error('No matching public key found for kid');
      }

      publicKey = await crypto.subtle.importKey(
        'jwk',
        matchingJwk,
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256',
        },
        false,
        ['verify']
      );
      publicKeyCryptoKeyCache.set(header.kid, publicKey);
    }

    // Convert header + payload to Uint8Array for verification
    const encoder = new TextEncoder();
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = this.b64ToUint8Array(signatureB64);

    const isValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signature,
      data
    );

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    return {
      uid: payload.sub,
      email: payload.email || '',
      ...payload,
    };
  }
}
