import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { parse, parseId, z, zOptionalText, zRequiredText } from '../lib/validate.js';
import { conflict, notFound } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
import { logActivity } from '../lib/activity.js';

const router = Router();

const schema = z.object({
  name: zRequiredText('Name', 60),
  description: zOptionalText(255),
});

router.get(
  '/',
  ah(async (_req, res) => {
    const cats = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { assets: true } } },
    });
    res.json({ data: cats.map(({ _count, ...c }) => ({ ...c, assetCount: _count.assets })) });
  }),
);

router.post(
  '/',
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(schema, req.body);
    const dupe = await prisma.category.findFirst({ where: { name: { equals: data.name, mode: 'insensitive' } } });
    if (dupe) throw conflict(`Category "${data.name}" already exists`, { fields: { name: 'Already exists' } });
    const cat = await prisma.category.create({ data });
    await logActivity({
      action: 'CREATE',
      entityType: 'Category',
      entityId: cat.id,
      userId: req.user.id,
      message: `Created category ${cat.name}`,
    });
    res.status(201).json({ data: { ...cat, assetCount: 0 } });
  }),
);

router.patch(
  '/:id',
  requireAdmin,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parse(schema.partial(), req.body);
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw notFound('Category not found');
    if (data.name) {
      const dupe = await prisma.category.findFirst({
        where: { name: { equals: data.name, mode: 'insensitive' }, NOT: { id } },
      });
      if (dupe) throw conflict(`Category "${data.name}" already exists`, { fields: { name: 'Already exists' } });
    }
    const cat = await prisma.category.update({ where: { id }, data });
    await logActivity({
      action: 'UPDATE',
      entityType: 'Category',
      entityId: id,
      userId: req.user.id,
      message: `Updated category ${cat.name}`,
    });
    res.json({ data: cat });
  }),
);

router.delete(
  '/:id',
  requireAdmin,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const cat = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { assets: true } } } });
    if (!cat) throw notFound('Category not found');
    if (cat._count.assets > 0) {
      throw conflict(`Cannot delete "${cat.name}": ${cat._count.assets} asset(s) still use it. Move them first.`);
    }
    await prisma.category.delete({ where: { id } });
    await logActivity({
      action: 'DELETE',
      entityType: 'Category',
      entityId: id,
      userId: req.user.id,
      message: `Deleted category ${cat.name}`,
    });
    res.status(204).end();
  }),
);

export default router;
