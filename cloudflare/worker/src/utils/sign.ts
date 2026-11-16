/** 云厂商 API 签名工具（全部基于 WebCrypto，Workers 原生支持） */

/** RFC3986 percentEncode（阿里云用） */
export function percentEncode(str: any): string {
  return encodeURIComponent(String(str))
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%7E/g, '~');
}

async function hmac(algorithm: string, key: string | ArrayBuffer, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? enc.encode(key) : key,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** 阿里云 HMAC-SHA1 签名（对应 client/Aliyun.php:79-98） */
export async function aliyunSignature(params: Record<string, any>, accessKeySecret: string, method = 'POST'): Promise<string> {
  const keys = Object.keys(params).filter((k) => params[k] !== null && params[k] !== undefined).sort();
  const canonical = keys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  const stringToSign = `${method}&%2F&${percentEncode(canonical)}`;
  return hmac('SHA-1', accessKeySecret + '&', stringToSign);
}

/** 腾讯云 TC3-HMAC-SHA256 签名 */
export async function tc3Signature(
  secretId: string, secretKey: string, service: string,
  host: string, payload: string, timestamp: number, action: string
): Promise<Record<string, string>> {
  const date = new Date(timestamp * 1000).toISOString().split('T')[0];
  const enc = new TextEncoder();

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const hashedPayload = await sha256Hex(payload);
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
  const hashedRequest = await sha256Hex(canonicalRequest);
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedRequest}`;

  const kDate = await hmacRaw(enc.encode('TC3' + secretKey), date);
  const kService = await hmacRaw(kDate, service);
  const kSigning = await hmacRaw(kService, 'tc3_request');
  const signature = await hmacRaw(kSigning, stringToSign);
  const hex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');

  return {
    Authorization: `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${hex}`,
    'Content-Type': 'application/json; charset=utf-8',
    Host: host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': '2018-05-10',
    'X-TC-Language': 'zh-CN',
  };
}

async function hmacRaw(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

export async function sha256Hex(str: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 通用 AWS Signature V4（供 AWS Route53 等使用，简化版） */
export function hmacSha256Base64(key: string, data: string): Promise<string> {
  return hmac('SHA-256', key, data);
}
