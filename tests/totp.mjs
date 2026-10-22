// Testhjälp: räknar ut TOTP-kod (RFC 6238) från en base32-nyckel – samma sak som en autentiseringsapp gör.
import { createHmac } from 'node:crypto';
export function totp(secretB32, t = Date.now()) {
  const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, val = 0; const out = [];
  for (const ch of secretB32.replace(/\s|=/g, '').toUpperCase()) { val = (val << 5) | B.indexOf(ch); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  const step = Math.floor(t / 1000 / 30); const msg = Buffer.alloc(8); msg.writeUInt32BE(Math.floor(step / 2 ** 32), 0); msg.writeUInt32BE(step >>> 0, 4);
  const h = createHmac('sha1', Buffer.from(out)).update(msg).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
if (process.argv[2]) console.log(totp(process.argv[2]));
