import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { STATUS_LABELS, serializeAssignment, serializeRepair, toNumber, todayUtc, addDays, toDateString } from '../lib/format.js';
import { ah } from '../middleware/async.js';

const router = Router();

// One call that returns everything the printable report needs.
router.get(
  '/summary',
  ah(async (req, res) => {
    const days = [30, 60, 90].includes(Number(req.query.warrantyDays)) ? Number(req.query.warrantyDays) : 90;
    const today = todayUtc();

    const [categories, assets, assignments, repairs] = await Promise.all([
      prisma.category.findMany({ orderBy: { name: 'asc' } }),
      prisma.asset.findMany({ select: { id: true, categoryId: true, status: true, purchasePrice: true } }),
      prisma.assignment.findMany({
        where: { returnedAt: null },
        orderBy: [{ department: 'asc' }, { employeeName: 'asc' }],
        include: { asset: { include: { category: true } } },
      }),
      prisma.repair.findMany({
        orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
        include: { asset: { include: { category: true } } },
      }),
    ]);

    const byCategory = categories.map((c) => {
      const list = assets.filter((a) => a.categoryId === c.id);
      const counts = Object.fromEntries(Object.keys(STATUS_LABELS).map((s) => [s, list.filter((a) => a.status === s).length]));
      return { category: c.name, total: list.length, ...counts, value: list.reduce((s, a) => s + toNumber(a.purchasePrice), 0) };
    });

    const warranty = await prisma.asset.findMany({
      where: { warrantyEnd: { gte: today, lte: addDays(today, days) }, status: { not: 'RETIRED' } },
      orderBy: [{ warrantyEnd: 'asc' }, { id: 'asc' }],
      include: { category: true },
    });

    const repairByCategory = {};
    for (const r of repairs) {
      const key = r.asset.category.name;
      repairByCategory[key] ??= { category: key, count: 0, cost: 0, open: 0 };
      repairByCategory[key].count += 1;
      repairByCategory[key].cost += toNumber(r.cost);
      if (r.status !== 'COMPLETED') repairByCategory[key].open += 1;
    }

    res.json({
      data: {
        generatedAt: new Date().toISOString(),
        totals: {
          assets: assets.length,
          value: assets.reduce((s, a) => s + toNumber(a.purchasePrice), 0),
          assigned: assignments.length,
          repairCost: repairs.reduce((s, r) => s + toNumber(r.cost), 0),
          repairs: repairs.length,
        },
        byCategory,
        assigned: assignments.map((a) => {
          const s = serializeAssignment(a);
          return {
            assetTag: a.asset.assetTag,
            assetName: a.asset.name,
            category: a.asset.category.name,
            employeeName: s.employeeName,
            employeeEmail: s.employeeEmail,
            department: s.department,
            assignedAt: s.assignedAt,
          };
        }),
        warrantyDays: days,
        warranty: warranty.map((a) => ({
          assetTag: a.assetTag,
          name: a.name,
          category: a.category.name,
          location: a.location,
          status: STATUS_LABELS[a.status],
          warrantyEnd: toDateString(a.warrantyEnd),
          daysLeft: Math.round((new Date(a.warrantyEnd) - today) / 86_400_000),
        })),
        repairs: repairs.map((r) => {
          const s = serializeRepair(r);
          return {
            assetTag: r.asset.assetTag,
            assetName: r.asset.name,
            issue: s.issue,
            vendor: s.vendor,
            status: s.status,
            cost: s.cost,
            startDate: s.startDate,
            endDate: s.endDate,
          };
        }),
        repairByCategory: Object.values(repairByCategory).sort((a, b) => b.cost - a.cost),
      },
    });
  }),
);

export default router;
