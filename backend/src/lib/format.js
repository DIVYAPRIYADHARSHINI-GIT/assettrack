// Serialization helpers: Prisma Decimal -> number, @db.Date -> 'YYYY-MM-DD'

export const STATUS_LABELS = {
  IN_STOCK: 'In Stock',
  ASSIGNED: 'Assigned',
  UNDER_REPAIR: 'Under Repair',
  RETIRED: 'Retired',
};

export const STATUS_FROM_LABEL = Object.fromEntries(
  Object.entries(STATUS_LABELS).flatMap(([k, v]) => [
    [v.toLowerCase(), k],
    [k.toLowerCase(), k],
    [v.toLowerCase().replace(/\s+/g, '_'), k],
  ]),
);

export const toDateString = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
export const toNumber = (d) => (d == null ? 0 : Number(d));

export function serializeAsset(a) {
  if (!a) return a;
  const out = {
    ...a,
    purchasePrice: toNumber(a.purchasePrice),
    purchaseDate: toDateString(a.purchaseDate),
    warrantyEnd: toDateString(a.warrantyEnd),
  };
  if (a.category) out.category = { id: a.category.id, name: a.category.name };
  if (a.assignments) out.assignments = a.assignments.map(serializeAssignment);
  if (a.repairs) out.repairs = a.repairs.map(serializeRepair);
  if (a.createdBy) out.createdBy = publicUser(a.createdBy);
  return out;
}

export function serializeAssignment(x) {
  if (!x) return x;
  const out = { ...x, assignedAt: toDateString(x.assignedAt), returnedAt: toDateString(x.returnedAt) };
  if (x.asset) out.asset = serializeAsset(x.asset);
  if (x.assignedBy) out.assignedBy = publicUser(x.assignedBy);
  if (x.returnedBy) out.returnedBy = publicUser(x.returnedBy);
  return out;
}

export function serializeRepair(r) {
  if (!r) return r;
  const out = {
    ...r,
    cost: toNumber(r.cost),
    startDate: toDateString(r.startDate),
    endDate: toDateString(r.endDate),
  };
  if (r.asset) out.asset = serializeAsset(r.asset);
  if (r.createdBy) out.createdBy = publicUser(r.createdBy);
  return out;
}

export function publicUser(u) {
  if (!u) return u;
  const { passwordHash, tokenVersion, ...rest } = u;
  return rest;
}

/** Today's calendar date as a Date at UTC midnight (server-local date). */
export function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
