/**
 * 加密与编码工具
 * 关键：md5 / authcode / password 必须与原 PHP 系统精确兼容，
 * 这样历史备份数据（用户密码哈希、登录 cookie）迁移后可直接使用。
 */

/** UTF-8 字符串 -> 字节数组 */
function utf8Bytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** 字节数组 -> 十六进制 */
function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/** 字节数组 -> base64 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** base64 -> 字节数组 */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/* ----------------------------- MD5 实现 ----------------------------- */
// Workers 的 WebCrypto 不支持 MD5，而原系统 authcode 依赖 md5，故内置纯 JS 实现。

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const K = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]);

function md5Cycle(x: Uint32Array, k: number[]): void {
  let [a, b, c, d] = x;
  for (let j = 0; j < 64; j++) {
    let f: number, g: number;
    if (j < 16) { f = (b & c) | (~b & d); g = j; }
    else if (j < 32) { f = (d & b) | (~d & c); g = (5 * j + 1) % 16; }
    else if (j < 48) { f = b ^ c ^ d; g = (3 * j + 5) % 16; }
    else { f = c ^ (b | ~d); g = (7 * j) % 16; }
    const tmp = d;
    d = c;
    c = b;
    const toRotate = (a + f + K[j] + k[g]) >>> 0;
    b = (b + ((toRotate << S[j]) | (toRotate >>> (32 - S[j])))) >>> 0;
    a = tmp;
  }
  x[0] = (x[0] + a) >>> 0;
  x[1] = (x[1] + b) >>> 0;
  x[2] = (x[2] + c) >>> 0;
  x[3] = (x[3] + d) >>> 0;
}

/** 计算 UTF-8 字符串的 MD5 十六进制值（与 PHP md5($str) 一致） */
export function md5(str: string): string {
  const bytes = utf8Bytes(str);
  const len = bytes.length;
  const bitLen = len * 8;
  // 填充到 56 mod 64
  const withOne = len + 1;
  const paddedLen = Math.ceil(withOne / 64) * 64;
  const msg = new Uint8Array(paddedLen);
  msg.set(bytes);
  msg[len] = 0x80;
  // 64 位长度（小端），JS 位运算为 32 位，这里只用低 32 位足够
  const dv = new DataView(msg.buffer);
  dv.setUint32(paddedLen - 8, bitLen >>> 0, true);
  dv.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  let x = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
  const k: number[] = [];
  for (let i = 0; i < paddedLen; i += 64) {
    for (let j = 0; j < 16; j++) k[j] = dv.getUint32(i + j * 4, true);
    md5Cycle(x, k);
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 4; i++) odv.setUint32(i * 4, x[i], true);
  return bytesToHex(out);
}

/* --------------------------- authcode 兼容 --------------------------- */
// 精确复现 app/common.php:87-127 的 authcode，保证历史 cookie 可用。

export function authcode(string: string, operation: 'ENCODE' | 'DECODE' = 'DECODE', key = '', expiry = 0): string {
  const ckeyLength = 4;
  const k = md5(key);
  const keya = md5(k.substring(0, 16));
  const keyb = md5(k.substring(16, 16 + 16));
  const keyc = ckeyLength
    ? operation === 'DECODE'
      ? string.substring(0, ckeyLength)
      : md5(String(Date.now() / 1000)).slice(-ckeyLength)
    : '';
  const cryptkey = keya + md5(keya + keyc);
  const keyLength = cryptkey.length;

  let data: Uint8Array;
  if (operation === 'DECODE') {
    const raw = string.substring(ckeyLength);
    data = base64ToBytes(raw);
  } else {
    const now = Math.floor(Date.now() / 1000);
    const expiryStr = String(expiry ? expiry + now : 0).padStart(10, '0');
    const check = md5(string + keyb).substring(0, 16);
    data = utf8Bytes(expiryStr + check + string);
  }

  const box = Array.from({ length: 256 }, (_, i) => i);
  const rndkey = new Uint8Array(256);
  for (let i = 0; i <= 255; i++) {
    rndkey[i] = cryptkey.charCodeAt(i % keyLength) & 0xff;
  }
  for (let j = 0, i = 0; i < 256; i++) {
    j = (j + box[i] + rndkey[i]) % 256;
    const tmp = box[i];
    box[i] = box[j];
    box[j] = tmp;
  }
  const result = new Uint8Array(data.length);
  for (let a = 0, j = 0, i = 0; i < data.length; i++) {
    a = (a + 1) % 256;
    j = (j + box[a]) % 256;
    const tmp = box[a];
    box[a] = box[j];
    box[j] = tmp;
    result[i] = data[i] ^ (box[(box[a] + box[j]) % 256]);
  }

  if (operation === 'DECODE') {
    const resultStr = new TextDecoder().decode(result);
    const ts = parseInt(resultStr.substring(0, 10), 10);
    const check = resultStr.substring(10, 26);
    const body = resultStr.substring(26);
    if ((ts === 0 || ts > Math.floor(Date.now() / 1000)) && check === md5(body + keyb).substring(0, 16)) {
      return body;
    }
    return '';
  }
  return keyc + bytesToBase64(result);
}

/* ---------------------------- 随机数 ---------------------------- */

const RANDOM_SEED = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function random(length: number, numeric = false): string {
  const seed = numeric ? RANDOM_SEED.substring(0, 10) : RANDOM_SEED;
  let out = '';
  for (let i = 0; i < length; i++) out += seed[Math.floor(Math.random() * seed.length)];
  return out;
}

export function getSid(): string {
  return md5(String(Math.random()) + String(Date.now()));
}

/* ---------------------------- 密码哈希 ---------------------------- */
// 使用 bcryptjs 兼容 PHP password_hash()/password_verify() 的 $2y$/$2b$ 哈希。

import bcrypt from 'bcryptjs';

export async function passwordHash(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function passwordVerify(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  // PHP 使用 $2y$，bcryptjs 兼容 $2a$/$2b$/$2y$
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/* ---------------------------- 其他 ---------------------------- */

export function getDnsType(value: string): 'A' | 'AAAA' | 'CNAME' {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return 'A';
  if (value.includes(':')) return 'AAAA';
  return 'CNAME';
}

export function isNullOrEmpty(v: any): boolean {
  return v === null || v === undefined || v === '';
}

/** 当前时间 Y-m-d H:i:s（可由 Daily 层覆盖以适配时区） */
export function now(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** Unix 时间戳（秒） */
export function timestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/** 用 SHA-256 生成十六进制（替代 md5 用于非兼容场景） */
export async function sha256Hex(str: string): Promise<string> {
  const bytes = utf8Bytes(str);
  const digest = await crypto.subtle.digest('SHA-256', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

export { bytesToHex, utf8Bytes };
