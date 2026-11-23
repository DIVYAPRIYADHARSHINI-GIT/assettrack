import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { badRequest } from '../lib/errors.js';
import { parsePaging } from '../lib/assetQuery.js';
import { ah } from '../middleware/async.js';

const router = Router();

const ACTIONS = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'ASSIGN',
  'RETURN',
  'REPAIR_START',
  'REPAIR_UPDATE',
  'REPAIR_CLOSE',
  'RETIRE',
  'IMPORT',
];

router.get(
  '/',
  ah(async (req, res) => {
    const where = {};
    const action = String(req.query.action || '').toUpperCase();
    if (action) {
      const list = action.split(',').filter(Boolean);
      const bad = list.find((a) => !ACTIONS.includes(a));
      if (bad) throw badRequest(`Invalid action filter "${bad}"`);
      where.action = { in: list };
    }
    if (req.query.assetId) where.assetId = Number(req.query.assetId) || -1;
    if (req.query.userId) where.userId = Number(req.query.userId) || -1;
    const search = String(req.query.search || '').trim();
    if (search) where.message = { contains: search, mode: 'insensitive' };

    const { page, pageSize, skip, take } = parsePaging(req.query, 100);
    const [total, rows] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: {
          user: { select: { id: true, name: true, email: true } },
          asset: { select: { id: true, assetTag: true, name: true } },
        },
      }),
    ]);
    res.json({ data: rows, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
  }),
);

export default router;
