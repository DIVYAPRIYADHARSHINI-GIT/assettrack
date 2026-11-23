// Case-insensitive lookups. SQLite has no Prisma `mode: 'insensitive'`, so these use lower().
// (Prisma `contains` already maps to LIKE, which SQLite matches case-insensitively for ASCII.)
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/** Asset (assetTag) using this serial number, ignoring case; optionally excluding one asset id. */
export async function findAssetBySerialCI(serial, exceptId) {
  const rows = await prisma.$queryRaw`
    SELECT "assetTag" FROM "Asset"
    WHERE lower("serialNumber") = lower(${serial}) ${exceptId ? Prisma.sql`AND "id" <> ${exceptId}` : Prisma.empty}
    LIMIT 1`;
  return rows[0] || null;
}

/** Map of lower-cased serial -> assetTag for every existing asset matching one of `serials`. */
export async function assetTagsBySerialsCI(serials) {
  const lowered = [...new Set(serials.map((s) => String(s).toLowerCase()).filter(Boolean))];
  if (!lowered.length) return new Map();
  const rows = await prisma.$queryRaw`
    SELECT "serialNumber", "assetTag" FROM "Asset" WHERE lower("serialNumber") IN (${Prisma.join(lowered)})`;
  return new Map(rows.map((r) => [r.serialNumber.toLowerCase(), r.assetTag]));
}

/** Category with this name ignoring case, optionally excluding one id. */
export async function findCategoryByNameCI(name, exceptId) {
  const rows = await prisma.$queryRaw`
    SELECT "id", "name" FROM "Category"
    WHERE lower("name") = lower(${name}) ${exceptId ? Prisma.sql`AND "id" <> ${exceptId}` : Prisma.empty}
    LIMIT 1`;
  return rows[0] || null;
}
