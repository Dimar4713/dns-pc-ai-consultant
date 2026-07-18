'use strict';

const crypto = require('crypto');

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join('; '));
  next();
}

function parseCookies(header) {
  return String(header || '').split(';').reduce((cookies, item) => {
    const separator = item.indexOf('=');
    if (separator < 0) return cookies;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createSecurity(config) {
  const loginAttempts = new Map();

  function hashIdentifier(value) {
    return crypto.createHmac('sha256', config.sessionSecret || 'development-only')
      .update(String(value || 'unknown')).digest('hex').slice(0, 24);
  }

  function sign(value) {
    return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
  }

  function createAdminToken(email) {
    const payload = Buffer.from(JSON.stringify({
      sub: email,
      role: 'admin',
      exp: Date.now() + config.adminSessionTtlMs
    })).toString('base64url');
    return `${payload}.${sign(payload)}`;
  }

  function verifyAdminToken(token) {
    if (!config.sessionSecret || !token || !token.includes('.')) return null;
    const [payload, signature] = token.split('.');
    if (!safeEqual(signature, sign(payload))) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (parsed.role !== 'admin' || parsed.sub !== config.adminEmail || Number(parsed.exp) <= Date.now()) return null;
      return parsed;
    } catch { return null; }
  }

  function verifyPassword(password) {
    if (config.adminPasswordHash) {
      const [scheme, saltHex, expectedHex] = config.adminPasswordHash.split('$');
      if (scheme !== 'scrypt' || !saltHex || !expectedHex) return false;
      try {
        const actual = crypto.scryptSync(String(password || ''), Buffer.from(saltHex, 'hex'), 64);
        return safeEqual(actual.toString('hex'), expectedHex);
      } catch { return false; }
    }
    return Boolean(config.adminPassword) && safeEqual(String(password || ''), config.adminPassword);
  }

  function requireAdmin(req, res, next) {
    const session = verifyAdminToken(parseCookies(req.headers.cookie).admin_session);
    if (!session) return res.status(401).json({ error: 'Требуется вход администратора.' });
    req.admin = session;
    next();
  }

  function isSecure(req) {
    return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || process.env.NODE_ENV === 'production';
  }

  function setAdminCookie(req, res, token) {
    const parts = [
      `admin_session=${encodeURIComponent(token)}`,
      'Path=/', 'HttpOnly', 'SameSite=Strict',
      `Max-Age=${Math.floor(config.adminSessionTtlMs / 1000)}`
    ];
    if (isSecure(req)) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  function clearAdminCookie(req, res) {
    const parts = ['admin_session=', 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
    if (isSecure(req)) parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
  }

  function loginAllowed(ip) {
    const key = hashIdentifier(ip);
    const windowStart = Date.now() - 15 * 60_000;
    const attempts = (loginAttempts.get(key) || []).filter((time) => time > windowStart);
    loginAttempts.set(key, attempts);
    return attempts.length < 5;
  }

  function recordLoginFailure(ip) {
    const key = hashIdentifier(ip);
    const attempts = loginAttempts.get(key) || [];
    attempts.push(Date.now());
    loginAttempts.set(key, attempts);
  }

  function clearLoginFailures(ip) {
    loginAttempts.delete(hashIdentifier(ip));
  }

  return {
    safeEqual, hashIdentifier, getClientIp, createAdminToken, verifyPassword,
    requireAdmin, setAdminCookie, clearAdminCookie,
    loginAllowed, recordLoginFailure, clearLoginFailures
  };
}

module.exports = { securityHeaders, createSecurity };
