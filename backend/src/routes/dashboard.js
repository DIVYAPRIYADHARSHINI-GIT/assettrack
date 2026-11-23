import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { STATUS_LABELS, serializeAsset, todayUtc, addDays } from '../lib/format.js';
import { ah } from '../middleware/async.js';

const router = Router();

router.get(
  '/',
  ah(async (_req, res) => {
    const today = todayUtc();
    const in90 = addDays(today, 90);

    const [byStatusRaw, byCategoryRaw, categories, valueAgg, expiring, recent, repairAgg] = await Promise.all([
      prisma.asset.groupBy({ by: ['status'], _count: { _all: true }, _sum: { purchasePrice: true } }),
      prisma.asset.groupBy({ by: ['categoryId'], _count: { _all: true }, _sum: { purchasePrice: true } }),
      prisma.category.findMany({ orderBy: { name: 'asc' } }),
      prisma.asset.aggregate({ _sum: { purchasePrice: true }, _count: { _all: true } }),
      prisma.asset.findMany({
        where: { warrantyEnd: { gte: today, lte: in90 }, status: { not: 'RETIRED' } },
        orderBy: [{ warrantyEnd: 'asc' }, { id: 'asc' }],
        include: { category: true },
      }),
      prisma.activityLog.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 12,
        include: {
          user: { select: { id: true, name: true } },
          asset: { select: { id: true, assetTag: true, name: true } },
        },
      }),
      prisma.repair.aggregate({ _sum: { cost: true } }),
    ]);

    const byStatus = Object.keys(STATUS_LABELS).map((status) => {
      const row = byStatusRaw.find((r) => r.status === status);
      return {
        status,
        label: STATUS_LABELS[status],
        count: row?._count._all || 0,
        value: Number(row?._sum.purchasePrice || 0),
      };
    });
    const count = (s) => byStatus.find((b) => b.status === s).count;

    const byCategory = categories
      .map((c) => {
        const row = byCategoryRaw.find((r) => r.categoryId === c.id);
        return { categoryId: c.id, name: c.name, count: row?._count._all || 0, value: Number(row?._sum.purchasePrice || 0) };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    // Days until expiry, bucketed cumulatively: the 60-day list includes the 30-day one.
    const withDays = expiring.map((a) => ({
      ...serializeAsset(a),
      daysLeft: Math.round((new Date(a.warrantyEnd) - today) / 86_400_000),
    }));
    const warranty = {
      30: withDays.filter((a) => a.daysLeft <= 30),
      60: withDays.filter((a) => a.daysLeft <= 60),
      90: withDays,
    };

    const total = valueAgg._count._all;
    const assigned = count('ASSIGNED');
    const inStock = count('IN_STOCK');

    res.json({
      data: {
        totals: {
          totalAssets: total,
          assigned,
          inStock,
          underRepair: count('UNDER_REPAIR'),
          retired: count('RETIRED'),
          // "Free" = available to hand out; retired and in-repair are neither.
          free: inStock,
          totalValue: Number(valueAgg._sum.purchasePrice || 0),
          activeValue: byStatus.filter((b) => b.status !== 'RETIRED').reduce((s, b) => s + b.value, 0),
          repairCost: Number(repairAgg._sum.cost || 0),
        },
        assignedVsFree: { assigned, free: inStock },
        byStatus,
        byCategory,
        warranty: {
          counts: { 30: warranty[30].length, 60: warranty[60].length, 90: warranty[90].length },
          30: warranty[30],
          60: warranty[60],
          90: warranty[90],
        },
        recentActivity: recent,
        generatedAt: new Date().toISOString(),
      },
    });
  }),
);

export default router;
