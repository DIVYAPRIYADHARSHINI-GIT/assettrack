import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { parse, parseId, z, zDate, zMoney, zOptionalDate, zOptionalText, zRequiredText } from '../lib/validate.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { STATUS_LABELS, serializeRepair, toDateString, todayUtc, addDays } from '../lib/format.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
import { logActivity } from '../lib/activity.js';
import { parsePaging } from '../lib/assetQuery.js';

const router = Router();

const notFuture = (d) => d <= addDays(todayUtc(), 1);
const REPAIR_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED'];
const REPAIR_LABELS = { OPEN: 'Open', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed' };

const createSchema = z.object({
  assetId: z.coerce.number({ error: 'Asset is required' }).int().positive('Asset is required'),
  issue: zRequiredText('Issue', 500),
  vendor: zOptionalText(120),
  cost: zMoney.default(0),
  startDate: zDate.refine(notFuture, 'Start date cannot be in the future'),
  status: z.enum(['OPEN', 'IN_PROGRESS'], { error: 'Status must be OPEN or IN_PROGRESS' }).default('OPEN'),
  notes: zOptionalText(1000),
});

const updateSchema = z
  .object({
    issue: zRequiredText('Issue', 500).optional(),
    vendor: zOptionalText(120).optional(),
    cost: zMoney.optional(),
    startDate: zDate.refine(notFuture, 'Start date cannot be in the future').optional(),
    status: z.enum(['OPEN', 'IN_PROGRESS'], { error: 'Use the close action to complete a repair' }).optional(),
    notes: zOptionalText(1000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const closeSchema = z.object({
  endDate: zDate.refine(notFuture, 'End date cannot be in the future'),
  cost: zMoney.optional(),
  notes: zOptionalText(1000),
});

const include = {
  asset: { select: { id: true, assetTag: true, name: true, status: true, location: true, category: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
};

router.get(
  '/',
  ah(async (req, res) => {
    const where = {};
    const status = String(req.query.status || '').toUpperCase();
    if (status) {
      const list = status.split(',').filter(Boolean);
      const bad = list.find((s) => !REPAIR_STATUSES.includes(s) && s !== 'ACTIVE');
      if (bad) throw badRequest(`Invalid status filter "${bad}"`);
      where.status = list.includes('ACTIVE') ? { in: ['OPEN', 'IN_PROGRESS'] } : { in: list };
    }
    if (req.query.assetId) where.assetId = parseId(req.query.assetId, 'assetId');
    const search = String(req.query.search || '').trim();
    if (search) {
      const c = { contains: search, mode: 'insensitive' };
      where.OR = [{ issue: c }, { vendor: c }, { asset: { assetTag: c } }, { asset: { name: c } }];
    }
    const { page, pageSize, skip, take } = parsePaging(req.query, 200);

    const [total, rows, sums, openCount] = await Promise.all([
      prisma.repair.count({ where }),
      prisma.repair.findMany({ where, include, orderBy: [{ startDate: 'desc' }, { id: 'desc' }], skip, take }),
      prisma.repair.groupBy({ by: ['status'], _sum: { cost: true }, _count: { _all: true } }),
      prisma.repair.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);

    const totals = { totalCost: 0, completedCost: 0, activeCost: 0, count: 0, activeCount: openCount };
    for (const s of sums) {
      const c = Number(s._sum.cost || 0);
      totals.totalCost += c;
      totals.count += s._count._all;
      if (s.status === 'COMPLETED') totals.completedCost += c;
      else totals.activeCost += c;
    }
    res.json({
      data: rows.map(serializeRepair),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), totals },
    });
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const repair = await prisma.repair.findUnique({ where: { id: parseId(req.params.id) }, include });
    if (!repair) throw notFound('Repair not found');
    res.json({ data: serializeRepair(repair) });
  }),
);

router.post(
  '/',
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(createSchema, req.body);
    const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
    if (!asset) throw badRequest('Asset does not exist', { fields: { assetId: 'Asset does not exist' } });
    if (asset.status !== 'IN_STOCK') {
      throw conflict(
        `${asset.assetTag} cannot be sent to repair because it is ${STATUS_LABELS[asset.status]}. ${
          asset.status === 'ASSIGNED' ? 'Return it from the employee first.' : 'Only In Stock assets can be sent to repair.'
        }`,
      );
    }

    const repair = await prisma.$transaction(async (tx) => {
      const r = await tx.asset.updateMany({ where: { id: asset.id, status: 'IN_STOCK' }, data: { status: 'UNDER_REPAIR' } });
      if (r.count === 0) throw conflict('Asset is no longer In Stock, please refresh');
      const created = await tx.repair.create({ data: { ...data, createdById: req.user.id }, include });
      await logActivity(
        {
          action: 'REPAIR_START',
          entityType: 'Repair',
          entityId: created.id,
          assetId: asset.id,
          userId: req.user.id,
          message: `Sent ${asset.assetTag} to repair: ${data.issue}${data.vendor ? ` (vendor: ${data.vendor})` : ''}`,
          details: { cost: data.cost, startDate: toDateString(data.startDate) },
        },
        tx,
      );
      return created;
    });
    res.status(201).json({ data: serializeRepair(repair) });
  }),
);

router.patch(
  '/:id',
  requireAdmin,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parse(updateSchema, req.body);
    const existing = await prisma.repair.findUnique({ where: { id }, include });
    if (!existing) throw notFound('Repair not found');
    if (existing.status === 'COMPLETED' && (data.status || data.startDate)) {
      throw conflict('This repair is already closed; only issue, vendor, cost and notes can be corrected');
    }
    if (data.startDate && existing.endDate && data.startDate > existing.endDate) {
      throw badRequest('Start date cannot be after the end date', { fields: { startDate: 'Cannot be after the end date' } });
    }
    const repair = await prisma.$transaction(async (tx) => {
      const updated = await tx.repair.update({ where: { id }, data, include });
      await logActivity(
        {
          action: 'REPAIR_UPDATE',
          entityType: 'Repair',
          entityId: id,
          assetId: existing.assetId,
          userId: req.user.id,
          message: `Updated repair for ${existing.asset.assetTag}${data.status ? ` (status: ${REPAIR_LABELS[data.status]})` : ''}`,
          details: { fields: Object.keys(data) },
        },
        tx,
      );
      return updated;
    });
    res.json({ data: serializeRepair(repair) });
  }),
);

router.post(
  '/:id/close',
  requireAdmin,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parse(closeSchema, req.body);
    const existing = await prisma.repair.findUnique({ where: { id }, include });
    if (!existing) throw notFound('Repair not found');
    if (existing.status === 'COMPLETED') throw conflict('This repair is already closed');
    if (data.endDate < existing.startDate) {
      throw badRequest(`End date cannot be before the start date (${toDateString(existing.startDate)})`, {
        fields: { endDate: 'Cannot be before the start date' },
      });
    }

    const repair = await prisma.$transaction(async (tx) => {
      const closed = await tx.repair.updateMany({
        where: { id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        data: {
          status: 'COMPLETED',
          endDate: data.endDate,
          ...(data.cost !== undefined ? { cost: data.cost } : {}),
          ...(data.notes ? { notes: data.notes } : {}),
        },
      });
      if (closed.count === 0) throw conflict('Repair was already closed, please refresh');
      // Return the asset to stock only if no other repair is still open for it.
      const stillOpen = await tx.repair.count({
        where: { assetId: existing.assetId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      });
      if (stillOpen === 0) {
        await tx.asset.updateMany({ where: { id: existing.assetId, status: 'UNDER_REPAIR' }, data: { status: 'IN_STOCK' } });
      }
      const finalCost = data.cost !== undefined ? data.cost : Number(existing.cost);
      await logActivity(
        {
          action: 'REPAIR_CLOSE',
          entityType: 'Repair',
          entityId: id,
          assetId: existing.assetId,
          userId: req.user.id,
          message: `Closed repair for ${existing.asset.assetTag} (cost ${finalCost.toFixed(2)}); asset back In Stock`,
          details: { endDate: toDateString(data.endDate), cost: finalCost },
        },
        tx,
      );
      return tx.repair.findUnique({ where: { id }, include });
    });
    res.json({ data: serializeRepair(repair) });
  }),
);

export default router;
