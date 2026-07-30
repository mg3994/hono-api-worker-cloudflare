export interface FirebaseServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

// Helper to convert string/buffer to base64url
export function base64urlEncode(strOrBuffer: Uint8Array | string): string {
  let base64 = '';
  if (typeof strOrBuffer === 'string') {
    base64 = btoa(unescape(encodeURIComponent(strOrBuffer)));
  } else {
    base64 = btoa(String.fromCharCode(...strOrBuffer));
  }
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Helper to decode base64url to string
export function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return decodeURIComponent(escape(atob(base64)));
}

// Decode base64 to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Private key CryptoKey caching map
const privateKeyCache = new Map<string, CryptoKey>();

// Parse PEM private key to CryptoKey
export async function importPrivateKey(pem: string): Promise<CryptoKey> {
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

// Sign a JWT using Google RS256 Service Account Key
export async function signJwt(
  payload: Record<string, any>,
  serviceAccount: FirebaseServiceAccount
): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const privateKey = await importPrivateKey(serviceAccount.private_key);
  const encoder = new TextEncoder();
  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    encoder.encode(dataToSign)
  );

  const encodedSignature = base64urlEncode(new Uint8Array(signatureBuffer));
  return `${dataToSign}.${encodedSignature}`;
}
