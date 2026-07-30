import { IJwtSigner } from '../domain/jwtSigner';
import { FirebaseServiceAccount } from '../domain/types';
import { base64urlEncode, base64ToArrayBuffer } from './firebaseUtils';

// Cache to persist imported private CryptoKeys on the edge instance
const privateKeyCache = new Map<string, CryptoKey>();

export class JwtSigner implements IJwtSigner {
  private serviceAccount: FirebaseServiceAccount;

  constructor(serviceAccount: FirebaseServiceAccount) {
    this.serviceAccount = serviceAccount;
  }

  private async importPrivateKey(pem: string): Promise<CryptoKey> {
    const cached = privateKeyCache.get(pem);
    if (cached) {
      return cached;
    }

    const cleanPem = pem
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\s+/g, '');
    const arrayBuffer = base64ToArrayBuffer(cleanPem);
    const key = await crypto.subtle.importKey(
      'pkcs8',
      arrayBuffer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

    privateKeyCache.set(pem, key);
    return key;
  }

  /**
   * Encapsulated, edge-optimized RS256 JWT signature generator using Web Crypto.
   */
  public async signJwt(payload: Record<string, any>): Promise<string> {
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const encodedHeader = base64urlEncode(JSON.stringify(header));
    const encodedPayload = base64urlEncode(JSON.stringify(payload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const privateKey = await this.importPrivateKey(this.serviceAccount.private_key);
    const encoder = new TextEncoder();
    const signatureBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      encoder.encode(dataToSign)
    );

    const encodedSignature = base64urlEncode(new Uint8Array(signatureBuffer));
    return `${dataToSign}.${encodedSignature}`;
  }
}
