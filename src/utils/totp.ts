/** TOTP (RFC 6238) 校验，兼容原 app/lib/TOTP.php */

function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of input.toUpperCase().replace(/=+$/, '')) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.substr(i, 8), 2));
  return new Uint8Array(bytes);
}

async function hmacSha1(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const keyBuf = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer;
  const dataBuf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, dataBuf);
  return new Uint8Array(sig);
}

function generateCode(secret: Uint8Array, counter: number, digits = 6): string {
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setUint32(0, Math.floor(counter / 0x100000000), false);
  dv.setUint32(4, counter >>> 0, false);
  // HMAC 是异步的，这里返回 Promise
  return null as any;
}

/** 异步生成指定时间窗的 TOTP 码 */
async function totpAt(secret: Uint8Array, counter: number, digits = 6): Promise<string> {
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setUint32(0, Math.floor(counter / 0x100000000), false);
  dv.setUint32(4, counter >>> 0, false);
  const hmac = await hmacSha1(secret, new Uint8Array(buf));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) >>> 0;
  return String(code % Math.pow(10, digits)).padStart(digits, '0');
}

/** 校验 TOTP（允许前后 1 个时间窗误差） */
export async function verifyTOTP(secretBase32: string, code: string, window = 1): Promise<boolean> {
  if (!secretBase32 || !code) return false;
  const secret = base32Decode(secretBase32);
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let i = -window; i <= window; i++) {
    const expected = await totpAt(secret, step + i);
    if (expected === code) return true;
  }
  return false;
}
