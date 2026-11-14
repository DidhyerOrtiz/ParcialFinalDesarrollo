import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_DURATION_MS = 60 * 60 * 1000;

function equal(left, right) {
  const digest = value => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(left), digest(right));
}

export function adminAuth({ email, password }) {
  const sign = payload => createHmac('sha256', password)
    .update('portal-municipal:admin-session:' + email + ':' + payload)
    .digest('base64url');

  return {
    login(credentials) {
      const validEmail = equal(credentials.correo.trim().toLowerCase(), email);
      const validPassword = equal(credentials.contrasena, password);
      if (!validEmail || !validPassword) return null;

      const payload = (Date.now() + SESSION_DURATION_MS) + '.' + randomBytes(24).toString('base64url');
      return payload + '.' + sign(payload);
    },

    verify(token) {
      const match = /^(\d{13}\.[\w-]{32})\.([\w-]{43})$/.exec(token);
      return Boolean(match && equal(match[2], sign(match[1])) &&
        Number(match[1].split('.')[0]) > Date.now());
    }
  };
}
