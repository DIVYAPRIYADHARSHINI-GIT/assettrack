import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { parse, z, zEmail, zPassword } from '../lib/validate.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { publicUser } from '../lib/format.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
import { config } from '../config.js';

const router = Router();

// Rate limit login attempts per IP (failed + successful) to slow brute force.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { message: 'Too many login attempts. Please try again in 15 minutes.' } },
});

const loginSchema = z.object({
  email: zEmail,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(128),
});

// A constant hash so unknown emails take the same time as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

router.post(
  '/login',
  loginLimiter,
  ah(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !ok) throw unauthorized('Invalid email or password');
    if (!user.isActive) throw unauthorized('This account has been deactivated. Contact an administrator.');

    const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const { token, expiresAt } = signToken(updated);
    res.json({ token, expiresAt, user: publicUser(updated) });
  }),
);

router.post(
  '/logout',
  requireAuth,
  ah(async (req, res) => {
    // Revoke this token's id until it would have expired anyway; prune old rows.
    await prisma.$transaction([
      prisma.revokedToken.upsert({
        where: { jti: req.token.jti },
        create: { jti: req.token.jti, expiresAt: new Date(req.token.exp * 1000) },
        update: {},
      }),
      prisma.revokedToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);
    res.json({ message: 'Signed out' });
  }),
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

const changePasswordSchema = z.object({
  currentPassword: z.string({ error: 'Current password is required' }).min(1, 'Current password is required'),
  newPassword: zPassword,
});

router.post(
  '/change-password',
  requireAuth,
  ah(async (req, res) => {
    const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
    const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
    if (!ok) throw badRequest('Current password is incorrect', { fields: { currentPassword: 'Incorrect password' } });
    if (currentPassword === newPassword) {
      throw badRequest('New password must be different from the current password', {
        fields: { newPassword: 'Must be different from the current password' },
      });
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    // Bump tokenVersion so other sessions are signed out; issue a fresh token for this one.
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    const { token, expiresAt } = signToken(updated);
    res.json({ message: 'Password updated', token, expiresAt, user: publicUser(updated) });
  }),
);

export default router;
