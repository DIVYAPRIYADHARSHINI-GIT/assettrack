import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export function signToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: String(user.id), role: user.role, tv: user.tokenVersion }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    jwtid: jti,
    issuer: 'assettrack',
  });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Require a valid, unrevoked JWT belonging to an active user. Sets req.user and req.token. */
export async function requireAuth(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized('Authentication required');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { issuer: 'assettrack' });
    } catch (e) {
      throw unauthorized(e.name === 'TokenExpiredError' ? 'Session expired, please sign in again' : 'Invalid token');
    }

    const [user, revoked] = await Promise.all([
      prisma.user.findUnique({ where: { id: Number(payload.sub) } }),
      prisma.revokedToken.findUnique({ where: { jti: payload.jti } }),
    ]);
    if (revoked) throw unauthorized('Session has been signed out');
    if (!user || !user.isActive) throw unauthorized('Account is inactive');
    if (user.tokenVersion !== payload.tv) throw unauthorized('Session expired, please sign in again');

    req.user = user;
    req.token = { jti: payload.jti, exp: payload.exp };
    next();
  } catch (err) {
    next(err);
  }
}

/** Role gate. Use after requireAuth. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('Admin access required'));
    next();
  };

export const requireAdmin = requireRole('ADMIN');
