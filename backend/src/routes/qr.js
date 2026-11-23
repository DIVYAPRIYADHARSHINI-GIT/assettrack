import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { notFound, badRequest } from '../lib/errors.js';
import { STATUS_LABELS, toDateString } from '../lib/format.js';
import { ah } from '../middleware/async.js';

// Public (no auth) endpoint used by QR labels. Returns only non-sensitive details:
// no price, serial number, vendor, notes or employee email.
const router = Router();

router.get(
  '/:tag',
  ah(async (req, res) => {
    const tag = String(req.params.tag || '').trim().toUpperCase();
    if (!/^AT-\d{4,}$/.test(tag)) throw badRequest('Invalid asset tag format (expected AT-0001)');
    const a = await prisma.asset.findUnique({
      where: { assetTag: tag },
      include: {
        category: { select: { name: true } },
        assignments: { where: { returnedAt: null }, take: 1, select: { employeeName: true, department: true } },
      },
    });
    if (!a) throw notFound(`No asset with tag ${tag}`);
    const holder = a.assignments[0];
    res.json({
      data: {
        id: a.id,
        assetTag: a.assetTag,
        name: a.name,
        category: a.category.name,
        brand: a.brand,
        model: a.model,
        location: a.location,
        status: a.status,
        statusLabel: STATUS_LABELS[a.status],
        warrantyEnd: toDateString(a.warrantyEnd),
        assignedTo: holder ? `${holder.employeeName} (${holder.department})` : null,
      },
    });
  }),
);

export default router;
