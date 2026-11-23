import { prisma } from './prisma.js';

/**
 * Record an activity log entry. Pass `tx` to write inside an existing transaction.
 * @param {object} p { action, entityType, entityId, assetId, userId, message, details }
 */
export function logActivity(p, tx = prisma) {
  return tx.activityLog.create({
    data: {
      action: p.action,
      entityType: p.entityType,
      entityId: p.entityId ?? null,
      assetId: p.assetId ?? null,
      userId: p.userId ?? null,
      message: p.message,
      details: p.details ?? undefined,
    },
  });
}

/** Return the list of changed fields between two plain objects (shallow). */
export function diffFields(before, after, keys) {
  const changes = {};
  for (const k of keys) {
    const a = norm(before[k]);
    const b = norm(after[k]);
    if (a !== b) changes[k] = { from: a, to: b };
  }
  return changes;
}

function norm(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
  return v;
}
