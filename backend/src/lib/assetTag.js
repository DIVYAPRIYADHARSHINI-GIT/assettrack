/**
 * Atomically reserve the next asset tag (AT-0001, AT-0002, ...).
 * Uses an UPSERT ... RETURNING on a counter row so concurrent creates never collide.
 * Must be called with a transaction client so a failed create rolls the counter back.
 */
export async function nextAssetTag(tx) {
  const rows = await tx.$queryRaw`
    INSERT INTO "Counter" ("name", "value") VALUES ('assetTag', 1)
    ON CONFLICT ("name") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return formatAssetTag(Number(rows[0].value));
}

export function formatAssetTag(n) {
  return `AT-${String(n).padStart(4, '0')}`;
}
