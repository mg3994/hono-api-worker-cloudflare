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

// Generate Google Access Token
export async function getGoogleAccessToken(
  serviceAccount: FirebaseServiceAccount
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/identitytoolkit',
    aud: 'https://oauth2.googleapis.com/token',
    exp,
    iat,
  };

  const jwt = await signJwt(payload, serviceAccount);

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
  return data.access_token;
}

// Retrieve JWK set for Firebase Auth Token Verification
let cachedJwks: { keys: any[]; expiry: number } | null = null;

async function getFirebaseJwks(): Promise<any[]> {
  if (cachedJwks && cachedJwks.expiry > Date.now()) {
    return cachedJwks.keys;
  }

  const response = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/jwk/securetoken@system.gserviceaccount.com'
  );
  if (!response.ok) {
    throw new Error('Failed to fetch Firebase JWKs');
  }

  // Set cache for 1 hour or based on Cache-Control if available
  const cacheControl = response.headers.get('cache-control');
  let maxAge = 3600;
  if (cacheControl) {
    const match = cacheControl.match(/max-age=(\d+)/);
    if (match) {
      maxAge = parseInt(match[1], 10);
    }
  }

  const data = (await response.json()) as { keys: any[] };
  cachedJwks = {
    keys: data.keys,
    expiry: Date.now() + maxAge * 1000,
  };
  return data.keys;
}

// Parse JWK big-integer representation (Base64url Uint8Array)
function b64ToUint8Array(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Verify Firebase ID Token
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string
): Promise<{
  uid: string;
  email: string;
  email_verified?: boolean;
  [key: string]: any;
}> {
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

  const jwks = await getFirebaseJwks();
  const matchingJwk = jwks.find((key) => key.kid === header.kid);
  if (!matchingJwk) {
    throw new Error('No matching public key found for kid');
  }

  // Import JWK to CryptoKey for verification
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    matchingJwk,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify']
  );

  // Convert header + payload to Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const signature = b64ToUint8Array(signatureB64);

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
