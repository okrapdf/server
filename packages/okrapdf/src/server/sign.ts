const DEFAULT_TTL_SECONDS = 60 * 60;
const CLOCK_SKEW_SECONDS = 60;

export interface DocumentAgentTokenParams {
  docId: string;
  ttlSeconds?: number;
  nowSeconds?: number;
}

export interface DocumentAgentTokenVerification {
  valid: boolean;
  docId?: string;
  exp?: number;
  error?: string;
}

function assertDocumentId(docId: string): string {
  const normalized = docId.trim();
  if (!normalized) {
    throw new Error('docId is required');
  }
  if (normalized.includes('.')) {
    throw new Error('docId must not contain "."');
  }
  return normalized;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

async function hmacSha256Base64Url(signingKey: string, payload: string): Promise<string> {
  if (!signingKey) {
    throw new Error('signingKey is required');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(sig));
}

export async function signDocumentAgentToken(
  signingKey: string,
  params: DocumentAgentTokenParams,
): Promise<string> {
  const docId = assertDocumentId(params.docId);
  const ttlSeconds = params.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('ttlSeconds must be a positive number');
  }

  const exp = (params.nowSeconds ?? nowSeconds()) + Math.floor(ttlSeconds);
  const payload = `${docId}.${exp}`;
  const sig = await hmacSha256Base64Url(signingKey, payload);
  return `${payload}.${sig}`;
}

export async function verifyDocumentAgentToken(
  signingKeys: string | Array<string | undefined | null>,
  token: string | null | undefined,
  expectedDocId: string,
  opts: { nowSeconds?: number } = {},
): Promise<DocumentAgentTokenVerification> {
  if (!token) return { valid: false, error: 'Missing token' };

  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, error: 'Malformed token' };

  const [docId, expRaw, sig] = parts;
  if (!docId || !expRaw || !sig) return { valid: false, error: 'Missing token fields' };
  if (docId !== expectedDocId) return { valid: false, error: 'Token document mismatch' };

  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp)) return { valid: false, error: 'Invalid expiry' };
  if ((opts.nowSeconds ?? nowSeconds()) > exp + CLOCK_SKEW_SECONDS) {
    return { valid: false, error: 'Token expired' };
  }

  const keys = Array.isArray(signingKeys) ? signingKeys : [signingKeys];
  const payload = `${docId}.${exp}`;
  for (const key of keys) {
    if (!key) continue;
    const expectedSig = await hmacSha256Base64Url(key, payload);
    if (timingSafeEqual(sig, expectedSig)) {
      return { valid: true, docId, exp };
    }
  }

  return { valid: false, error: 'Invalid signature' };
}
