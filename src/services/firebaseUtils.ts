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
