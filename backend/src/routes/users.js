import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { parse, parseId, z, zEmail, zPassword, zRequiredText } from '../lib/validate.js';
import { badRequest, notFound } from '../lib/errors.js';
import { publicUser } from '../lib/format.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

const router = Router();
router.use(requireAdmin);

const zRole = z.enum(['ADMIN', 'VIEWER'], { error: 'Role must be ADMIN or VIEWER' });

const createSchema = z.object({
  name: zRequiredText('Name', 100),
  email: zEmail,
  password: zPassword,
  role: zRole.default('VIEWER'),
});

const updateSchema = z
  .object({
    name: zRequiredText('Name', 100).optional(),
    email: zEmail.optional(),
    role: zRole.optional(),
    isActive: z.boolean({ error: 'isActive must be true or false' }).optional(),
    password: zPassword.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

router.get(
  '/',
  ah(async (req, res) => {
    const q = String(req.query.search || '').trim();
    const users = await prisma.user.findMany({
      where: q
        ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
        : undefined,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    res.json({ data: users.map(publicUser) });
  }),
);

router.post(
  '/',
  ah(async (req, res) => {
    const data = parse(createSchema, req.body);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, role: data.role, passwordHash },
    });
    res.status(201).json({ data: publicUser(user) });
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: parseId(req.params.id) } });
    if (!user) throw notFound('User not found');
    res.json({ data: publicUser(user) });
  }),
);

router.patch(
  '/:id',
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parse(updateSchema, req.body);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound('User not found');

    // Guard rails so the system can never be left without an active admin.
    if (id === req.user.id && (data.isActive === false || data.role === 'VIEWER')) {
      throw badRequest('You cannot deactivate yourself or remove your own admin role');
    }
    const losingAdmin = existing.role === 'ADMIN' && existing.isActive && (data.role === 'VIEWER' || data.isActive === false);
    if (losingAdmin) {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (admins <= 1) throw badRequest('At least one active admin is required');
    }

    const update = { ...data };
    delete update.password;
    if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);
    // Invalidate existing sessions when the password, role or active flag changes.
    if (data.password || data.isActive === false || (data.role && data.role !== existing.role)) {
      update.tokenVersion = { increment: 1 };
    }

    const user = await prisma.user.update({ where: { id }, data: update });
    res.json({ data: publicUser(user) });
  }),
);

// "Delete" is a soft deactivation; history keeps the user reference.
router.delete(
  '/:id',
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === req.user.id) throw badRequest('You cannot deactivate yourself');
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw notFound('User not found');
    if (existing.role === 'ADMIN' && existing.isActive) {
      const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (admins <= 1) throw badRequest('At least one active admin is required');
    }
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false, tokenVersion: { increment: 1 } },
    });
    res.json({ data: publicUser(user) });
  }),
);

export default router;
