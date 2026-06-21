/**
 * Edge-compatible session token cryptographic utility.
 * Uses Web Crypto API which is globally available in both Next.js Edge Middleware
 * and the standard Node.js API route runtime.
 */

export interface SessionPayload {
  user: string;
  exp: number;
  createdAt: number;
}

// Convert ArrayBuffer or Uint8Array to Base64URL string
function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Convert Base64URL string back to ArrayBuffer
function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  let base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// UTF-8 string encoding helper
const encodeText = (text: string) => new TextEncoder().encode(text);

/**
 * Sign a payload string with a secret key using HMAC-SHA256.
 * Returns a Base64URL-encoded signature.
 */
export async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encodeText(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encodeText(payload));
  return bufferToBase64Url(signature);
}

/**
 * Verify a payload and signature against a secret key using HMAC-SHA256.
 */
export async function hmacVerify(payload: string, signatureB64Url: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encodeText(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const signatureData = base64UrlToBuffer(signatureB64Url);
    return await crypto.subtle.verify('HMAC', key, signatureData, encodeText(payload));
  } catch (e) {
    return false;
  }
}

/**
 * Create a signed session token.
 * Output format: <payloadB64Url>.<signatureB64Url>
 */
export async function createSessionToken(user: string, secret: string, maxAgeMs: number): Promise<string> {
  const now = Date.now();
  const payloadObj: SessionPayload = {
    user,
    createdAt: now,
    exp: now + maxAgeMs,
  };
  
  const payloadB64Url = bufferToBase64Url(encodeText(JSON.stringify(payloadObj)));
  const signature = await hmacSign(payloadB64Url, secret);
  return `${payloadB64Url}.${signature}`;
}

/**
 * Verify and decode a session token.
 * Returns the decoded payload if valid and unexpired, otherwise null.
 */
export async function verifyAndDecodeSession(token: string, secret: string): Promise<SessionPayload | null> {
  if (!token || !token.includes('.')) {
    return null;
  }
  
  const [payloadB64Url, signature] = token.split('.');
  if (!payloadB64Url || !signature) {
    return null;
  }
  
  const isValid = await hmacVerify(payloadB64Url, signature, secret);
  if (!isValid) {
    return null;
  }
  
  try {
    // Decode payload
    const decodedBuffer = base64UrlToBuffer(payloadB64Url);
    const decodedText = new TextDecoder().decode(decodedBuffer);
    const payload: SessionPayload = JSON.parse(decodedText);
    
    // Check expiration
    if (payload.exp < Date.now()) {
      return null;
    }
    
    return payload;
  } catch (e) {
    return null;
  }
}
