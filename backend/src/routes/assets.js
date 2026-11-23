import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { parse, parseId, z, zDate, zEmail, zMoney, zOptionalText, zRequiredText } from '../lib/validate.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import {
  STATUS_LABELS,
  serializeAsset,
  serializeAssignment,
  serializeRepair,
  toDateString,
  todayUtc,
  addDays,
} from '../lib/format.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';
import { logActivity, diffFields } from '../lib/activity.js';
import { nextAssetTag } from '../lib/assetTag.js';
import { createAssetSchema, updateAssetSchema, ASSET_FIELDS, datesInOrder, dateOrderIssue } from '../lib/assetSchema.js';
import { buildAssetOrder, buildAssetWhere, currentAssignmentInclude, parsePaging } from '../lib/assetQuery.js';
import { findAssetBySerialCI } from '../lib/ci.js';

const router = Router();

const listInclude = {
  category: true,
  assignments: currentAssignmentInclude,
};

function withHolder(asset) {
  const s = serializeAsset(asset);
  const current = s.assignments?.[0] || null;
  delete s.assignments;
  return { ...s, currentAssignment: current };
}

async function loadAsset(id) {
  const asset = await prisma.asset.findUnique({ where: { id }, include: listInclude });
  if (!asset) throw notFound('Asset not found');
  return asset;
}

async function ensureCategory(categoryId) {
  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat) throw badRequest('Category does not exist', { fields: { categoryId: 'Category does not exist' } });
  return cat;
}

async function ensureSerialFree(serialNumber, exceptId) {
  const dupe = await findAssetBySerialCI(serialNumber, exceptId);
  if (dupe) {
    throw conflict(`Serial number "${serialNumber}" is already used by ${dupe.assetTag}`, {
      fields: { serialNumber: `Already used by ${dupe.assetTag}` },
    });
  }
}

// ---------- list / lookup ----------

router.get(
  '/',
  ah(async (req, res) => {
    const where = buildAssetWhere(req.query);
    const orderBy = buildAssetOrder(req.query);
    const { page, pageSize, skip, take } = parsePaging(req.query);
    const [total, rows, value] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.findMany({ where, orderBy, skip, take, include: listInclude }),
      prisma.asset.aggregate({ where, _sum: { purchasePrice: true } }),
    ]);
    res.json({
      data: rows.map(withHolder),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        totalValue: Number(value._sum.purchasePrice || 0),
      },
    });
  }),
);

router.get(
  '/locations',
  ah(async (_req, res) => {
    const rows = await prisma.asset.findMany({
      where: { location: { not: null } },
      distinct: ['location'],
      select: { location: true },
      orderBy: { location: 'asc' },
    });
    res.json({ data: rows.map((r) => r.location) });
  }),
);

router.get(
  '/by-tag/:tag',
  ah(async (req, res) => {
    const tag = String(req.params.tag || '').trim().toUpperCase();
    const asset = await prisma.asset.findUnique({ where: { assetTag: tag }, include: listInclude });
    if (!asset) throw notFound(`No asset with tag ${tag}`);
    res.json({ data: withHolder(asset) });
  }),
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        category: true,
        createdBy: { select: { id: true, name: true, email: true } },
        assignments: {
          orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
          include: {
            assignedBy: { select: { id: true, name: true } },
            returnedBy: { select: { id: true, name: true } },
          },
        },
        repairs: {
          orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!asset) throw notFound('Asset not found');
    const s = serializeAsset(asset);
    s.currentAssignment = s.assignments.find((a) => !a.returnedAt) || null;
    s.openRepair = s.repairs.find((r) => r.status !== 'COMPLETED') || null;
    s.repairCostTotal = s.repairs.reduce((sum, r) => sum + r.cost, 0);
    res.json({ data: s });
  }),
);

router.get(
  '/:id/assignments',
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    await loadAsset(id);
    const rows = await prisma.assignment.findMany({
      where: { assetId: id },
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
      include: { assignedBy: { select: { id: true, name: true } }, returnedBy: { select: { id: true, name: true } } },
    });
    res.json({ data: rows.map(serializeAssignment) });
  }),
);

router.get(
  '/:id/repairs',
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    await loadAsset(id);
    const rows = await prisma.repair.findMany({ where: { assetId: id }, orderBy: [{ startDate: 'desc' }, { id: 'desc' }] });
    res.json({ data: rows.map(serializeRepair) });
  }),
);

router.get(
  '/:id/activity',
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    await loadAsset(id);
    const rows = await prisma.activityLog.findMany({
      where: { assetId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json({ data: rows });
  }),
);

// ---------- create / update / delete ----------

router.post(
  '/',
  requireAdmin,
  ah(async (req, res) => {
    const data = parse(createAssetSchema, req.body);
    const cat = await ensureCategory(data.categoryId);
    await ensureSerialFree(data.serialNumber);

    const asset = await prisma.$transaction(async (tx) => {
      const assetTag = await nextAssetTag(tx);
      const created = await tx.asset.create({
        data: { ...data, assetTag, createdById: req.user.id },
        include: listInclude,
      });
      await logActivity(
        {
          action: 'CREATE',
          entityType: 'Asset',
          entityId: created.id,
          assetId: created.id,
          userId: req.user.id,
          message: `Created ${assetTag} ${created.name} (${cat.name})`,
        },
        tx,
      );
      if (data.status === 'RETIRED') {
        await logActivity(
          {
            action: 'RETIRE',
            entityType: 'Asset',
            entityId: created.id,
            assetId: created.id,
            userId: req.user.id,
            message: `Registered ${assetTag} as Retired`,
          },
          tx,
        );
      }
      return created;
    });
    res.status(201).json({ data: withHolder(asset) });
  }),
);

router.patch(
  '/:id',
  requireAdmin,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    if (req.body && 'status' in req.body) {
      throw badRequest('Status cannot be edited directly. Use the Assign, Return, Repair or Retire actions.', {
        fields: { status: 'Use the asset actions to change status' },
      });
    }
    const data = parse(updateAssetSchema, req.body);
    const existing = await loadAsset(id);
    if (data.categoryId) await ensureCategory(data.categoryId);
    if (data.serialNumber) await ensureSerialFree(data.serialNumber, id);
    const merged = { purchaseDate: existing.purchaseDate, warrantyEnd: existing.warrantyEnd, ...data };
    if (!datesInOrder(merged)) {
      throw badRequest(dateOrderIssue.message, { fields: { warrantyEnd: dateOrderIssue.message } });
    }

    const changes = diffFields(existing, { ...existing, ...data }, ASSET_FIELDS);
    const asset = await prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({ where: { id }, data, include: listInclude });
      if (Object.keys(changes).length) {
        await logActivity(
          {
            action: 'UPDATE',
            entityType: 'Asset',
            entityId: id,
            assetId: id,
            userId: req.user.id,
            message: `Updated ${updated.assetTag}: ${Object.keys(changes).join(', ')}`,
            details: { changes },
          },
          tx,
        );
      }
      return updated;
    });
    res.json({ data: withHolder(asset) });
  }),
);

router.delete(
  '/:id',
  requireAdmin,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const asset = await loadAsset(id);
    if (asset.status === 'ASSIGNED' || asset.status === 'UNDER_REPAIR') {
      throw conflict(`Cannot delete ${asset.assetTag} while it is ${STATUS_LABELS[asset.status]}. Return it or close the repair first.`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.asset.delete({ where: { id } });
      await logActivity(
        {
          action: 'DELETE',
          entityType: 'Asset',
          entityId: id,
          userId: req.user.id,
          message: `Deleted ${asset.assetTag} ${asset.name}`,
          details: { assetTag: asset.assetTag, serialNumber: asset.serialNumber },
        },
        tx,
      );
    });
    res.status(204).end();
  }),
);

// ---------- lifecycle actions ----------

const retireSchema = z.object({ reason: zOptionalText(500) });

router.post(
  '/:id/retire',
  requireAdmin,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const { reason } = parse(retireSchema, req.body);
    const asset = await loadAsset(id);
    if (asset.status === 'RETIRED') throw conflict(`${asset.assetTag} is already retired`);
    if (asset.status !== 'IN_STOCK') {
      throw conflict(
        `Only In Stock assets can be retired. ${asset.assetTag} is ${STATUS_LABELS[asset.status]}; ${
          asset.status === 'ASSIGNED' ? 'return it first' : 'close the repair first'
        }.`,
      );
    }
    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.asset.updateMany({ where: { id, status: 'IN_STOCK' }, data: { status: 'RETIRED' } });
      if (r.count === 0) throw conflict('Asset status changed, please refresh');
      await logActivity(
        {
          action: 'RETIRE',
          entityType: 'Asset',
          entityId: id,
          assetId: id,
          userId: req.user.id,
          message: `Retired ${asset.assetTag}${reason ? `: ${reason}` : ''}`,
          details: reason ? { reason } : undefined,
        },
        tx,
      );
      return tx.asset.findUnique({ where: { id }, include: listInclude });
    });
    res.json({ data: withHolder(updated) });
  }),
);

router.post(
  '/:id/reactivate',
  requireAdmin,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const asset = await loadAsset(id);
    if (asset.status !== 'RETIRED') throw conflict(`${asset.assetTag} is not retired`);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.asset.update({ where: { id }, data: { status: 'IN_STOCK' } });
      await logActivity(
        {
          action: 'UPDATE',
          entityType: 'Asset',
          entityId: id,
          assetId: id,
          userId: req.user.id,
          message: `Reactivated ${asset.assetTag} (Retired → In Stock)`,
          details: { changes: { status: { from: 'RETIRED', to: 'IN_STOCK' } } },
        },
        tx,
      );
      return tx.asset.findUnique({ where: { id }, include: listInclude });
    });
    res.json({ data: withHolder(updated) });
  }),
);

function notFutureDate(d) {
  return d <= addDays(todayUtc(), 1);
}

const assignSchema = z.object({
  employeeName: zRequiredText('Employee name', 100),
  employeeEmail: zEmail,
  department: zRequiredText('Department', 80),
  assignedAt: zDate.refine(notFutureDate, 'Assignment date cannot be in the future'),
  conditionNotes: zOptionalText(1000),
});

router.post(
  '/:id/assign',
  requireAdmin,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parse(assignSchema, req.body);
    const asset = await loadAsset(id);
    if (asset.status !== 'IN_STOCK') {
      const holder = asset.assignments?.[0];
      throw conflict(
        `${asset.assetTag} cannot be assigned because it is ${STATUS_LABELS[asset.status]}${
          holder ? ` (held by ${holder.employeeName})` : ''
        }. Only In Stock assets can be assigned.`,
      );
    }
    if (asset.purchaseDate && data.assignedAt < asset.purchaseDate) {
      throw badRequest('Assignment date cannot be before the purchase date', {
        fields: { assignedAt: 'Cannot be before the purchase date' },
      });
    }

    const assignment = await prisma.$transaction(async (tx) => {
      // Conditional update guards against two admins assigning the same asset at once.
      const r = await tx.asset.updateMany({ where: { id, status: 'IN_STOCK' }, data: { status: 'ASSIGNED' } });
      if (r.count === 0) throw conflict('Asset is no longer In Stock, please refresh');
      const created = await tx.assignment.create({ data: { ...data, assetId: id, assignedById: req.user.id } });
      await logActivity(
        {
          action: 'ASSIGN',
          entityType: 'Assignment',
          entityId: created.id,
          assetId: id,
          userId: req.user.id,
          message: `Assigned ${asset.assetTag} to ${data.employeeName} (${data.department})`,
          details: { employeeEmail: data.employeeEmail, assignedAt: toDateString(data.assignedAt) },
        },
        tx,
      );
      return created;
    });
    res.status(201).json({ data: serializeAssignment(assignment) });
  }),
);

const returnSchema = z.object({
  returnedAt: zDate.refine(notFutureDate, 'Return date cannot be in the future'),
  returnCondition: zRequiredText('Condition on return', 60),
  returnNotes: zOptionalText(1000),
});

router.post(
  '/:id/return',
  requireAdmin,
  ah(async (req, res) => {
    const id = parseId(req.params.id);
    const data = parse(returnSchema, req.body);
    const asset = await loadAsset(id);
    const open = asset.assignments?.[0];
    if (asset.status !== 'ASSIGNED' || !open) throw conflict(`${asset.assetTag} is not currently assigned`);
    if (data.returnedAt < open.assignedAt) {
      throw badRequest(`Return date cannot be before the assignment date (${toDateString(open.assignedAt)})`, {
        fields: { returnedAt: 'Cannot be before the assignment date' },
      });
    }

    const assignment = await prisma.$transaction(async (tx) => {
      const r = await tx.asset.updateMany({ where: { id, status: 'ASSIGNED' }, data: { status: 'IN_STOCK' } });
      if (r.count === 0) throw conflict('Asset is no longer assigned, please refresh');
      const updated = await tx.assignment.update({
        where: { id: open.id },
        data: { ...data, returnedById: req.user.id },
      });
      await logActivity(
        {
          action: 'RETURN',
          entityType: 'Assignment',
          entityId: open.id,
          assetId: id,
          userId: req.user.id,
          message: `${open.employeeName} returned ${asset.assetTag} (condition: ${data.returnCondition})`,
          details: { returnedAt: toDateString(data.returnedAt), returnCondition: data.returnCondition },
        },
        tx,
      );
      return updated;
    });
    res.json({ data: serializeAssignment(assignment) });
  }),
);

export default router;
