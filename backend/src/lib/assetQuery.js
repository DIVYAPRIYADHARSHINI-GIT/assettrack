import { badRequest } from './errors.js';
import { addDays, todayUtc } from './format.js';

const STATUSES = ['IN_STOCK', 'ASSIGNED', 'UNDER_REPAIR', 'RETIRED'];
const WARRANTY_WINDOWS = ['expired', '30', '60', '90', 'active', 'none'];

const SORTS = {
  assetTag: (o) => ({ assetTag: o }),
  name: (o) => ({ name: o }),
  category: (o) => ({ category: { name: o } }),
  status: (o) => ({ status: o }),
  location: (o) => ({ location: { sort: o, nulls: 'last' } }),
  purchaseDate: (o) => ({ purchaseDate: { sort: o, nulls: 'last' } }),
  purchasePrice: (o) => ({ purchasePrice: o }),
  warrantyEnd: (o) => ({ warrantyEnd: { sort: o, nulls: 'last' } }),
  createdAt: (o) => ({ createdAt: o }),
  updatedAt: (o) => ({ updatedAt: o }),
};

function list(v) {
  if (v == null || v === '') return [];
  return []
    .concat(v)
    .flatMap((x) => String(x).split(','))
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Build a Prisma `where` for the asset list from query-string filters. Shared by list and export. */
export function buildAssetWhere(query) {
  const and = [];

  const search = String(query.search || '').trim().slice(0, 100);
  if (search) {
    const c = { contains: search, mode: 'insensitive' };
    and.push({
      OR: [
        { assetTag: c },
        { name: c },
        { serialNumber: c },
        { brand: c },
        { model: c },
        { vendor: c },
        { location: c },
        { notes: c },
        { assignments: { some: { returnedAt: null, OR: [{ employeeName: c }, { employeeEmail: c }] } } },
      ],
    });
  }

  const categoryIds = list(query.categoryId).map(Number);
  if (categoryIds.some((n) => !Number.isInteger(n) || n <= 0)) throw badRequest('Invalid categoryId filter');
  if (categoryIds.length) and.push({ categoryId: { in: categoryIds } });

  const statuses = list(query.status).map((s) => s.toUpperCase());
  const badStatus = statuses.find((s) => !STATUSES.includes(s));
  if (badStatus) throw badRequest(`Invalid status filter "${badStatus}". Use one of ${STATUSES.join(', ')}`);
  if (statuses.length) and.push({ status: { in: statuses } });

  const locations = list(query.location);
  if (locations.length) and.push({ location: { in: locations } });

  const warranty = String(query.warranty || '').trim();
  if (warranty) {
    if (!WARRANTY_WINDOWS.includes(warranty)) {
      throw badRequest(`Invalid warranty filter. Use one of ${WARRANTY_WINDOWS.join(', ')}`);
    }
    const today = todayUtc();
    if (warranty === 'expired') and.push({ warrantyEnd: { lt: today } });
    else if (warranty === 'none') and.push({ warrantyEnd: null });
    else if (warranty === 'active') and.push({ warrantyEnd: { gte: today } });
    else and.push({ warrantyEnd: { gte: today, lte: addDays(today, Number(warranty)) } });
  }

  const ids = list(query.ids).map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw badRequest('Invalid ids');
  if (ids.length) and.push({ id: { in: ids } });

  return and.length ? { AND: and } : {};
}

export function buildAssetOrder(query) {
  const sortBy = String(query.sortBy || 'assetTag');
  const order = String(query.order || 'asc').toLowerCase();
  if (!SORTS[sortBy]) throw badRequest(`Invalid sortBy. Use one of ${Object.keys(SORTS).join(', ')}`);
  if (!['asc', 'desc'].includes(order)) throw badRequest('order must be asc or desc');
  // Tie-break on id so pagination is stable.
  return [SORTS[sortBy](order), { id: 'asc' }];
}

export function parsePaging(query, maxSize = 100) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(query.pageSize, 10) || 10));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Include the current (open) assignment so the list can show the holder. */
export const currentAssignmentInclude = {
  where: { returnedAt: null },
  orderBy: { assignedAt: 'desc' },
  take: 1,
};
