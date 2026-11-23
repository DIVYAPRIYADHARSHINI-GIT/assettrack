import { Router } from 'express';
import multer from 'multer';
import { parse as parseCsv } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { prisma } from '../lib/prisma.js';
import { badRequest } from '../lib/errors.js';
import { formatZodError } from '../lib/validate.js';
import { STATUS_FROM_LABEL, STATUS_LABELS, toDateString, toNumber } from '../lib/format.js';
import { createAssetSchema } from '../lib/assetSchema.js';
import { buildAssetOrder, buildAssetWhere, currentAssignmentInclude } from '../lib/assetQuery.js';
import { nextAssetTag } from '../lib/assetTag.js';
import { logActivity } from '../lib/activity.js';
import { requireAdmin } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

const router = Router();
const MAX_ROWS = 1000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.csv$/i.test(file.originalname) || /csv|text\/plain|excel/.test(file.mimetype);
    cb(ok ? null : badRequest('Only .csv files are accepted'), ok);
  },
});

// Column order for the template and the export.
export const IMPORT_COLUMNS = [
  'name',
  'category',
  'brand',
  'model',
  'serialNumber',
  'purchaseDate',
  'purchasePrice',
  'vendor',
  'warrantyEnd',
  'location',
  'status',
  'notes',
];

// Accept friendly header variants ("Serial Number", "serial_number", "Warranty End Date" ...).
const HEADER_ALIASES = {
  name: 'name',
  assetname: 'name',
  category: 'category',
  brand: 'brand',
  model: 'model',
  serialnumber: 'serialNumber',
  serial: 'serialNumber',
  serialno: 'serialNumber',
  purchasedate: 'purchaseDate',
  purchaseprice: 'purchasePrice',
  price: 'purchasePrice',
  cost: 'purchasePrice',
  vendor: 'vendor',
  supplier: 'vendor',
  warrantyend: 'warrantyEnd',
  warrantyenddate: 'warrantyEnd',
  warranty: 'warrantyEnd',
  location: 'location',
  status: 'status',
  notes: 'notes',
  assettag: 'assetTag',
};

const normHeader = (h) => String(h || '').replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z]/g, '');

/** Accepts YYYY-MM-DD, DD/MM/YYYY and DD-MM-YYYY; returns YYYY-MM-DD or the raw value for the validator to reject. */
function normalizeDate(v) {
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

function readCsv(buffer) {
  const text = buffer.toString('utf8');
  if (!text.trim()) throw badRequest('The CSV file is empty');
  let records;
  try {
    records = parseCsv(text, {
      bom: true,
      columns: (headers) => headers.map((h) => HEADER_ALIASES[normHeader(h)] || `__unknown:${String(h).trim()}`),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (e) {
    throw badRequest(`Could not read CSV: ${e.message}`);
  }
  if (!records.length) throw badRequest('The CSV has a header row but no data rows');
  if (records.length > MAX_ROWS) throw badRequest(`Too many rows (${records.length}). The limit is ${MAX_ROWS} per file.`);
  const headers = Object.keys(records[0]);
  const missing = ['name', 'category', 'serialNumber'].filter((h) => !headers.includes(h));
  if (missing.length) {
    throw badRequest(`Missing required column(s): ${missing.join(', ')}. Download the template for the expected headers.`);
  }
  return records;
}

/** Validate every row; returns [{ row, data?, errors, values }]. Row numbers match the spreadsheet (header = 1). */
async function validateRows(records) {
  const categories = await prisma.category.findMany();
  const catByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  const serials = records.map((r) => String(r.serialNumber || '').trim()).filter(Boolean);
  const existing = await prisma.asset.findMany({
    where: { serialNumber: { in: serials, mode: 'insensitive' } },
    select: { serialNumber: true, assetTag: true },
  });
  const existingBySerial = new Map(existing.map((e) => [e.serialNumber.toLowerCase(), e.assetTag]));
  const seenInFile = new Map();

  return records.map((rec, i) => {
    const row = i + 2;
    const errors = [];
    const values = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, rec[c] ?? '']));

    const catName = String(rec.category || '').trim();
    const cat = catByName.get(catName.toLowerCase());
    if (!catName) errors.push({ field: 'category', message: 'Category is required' });
    else if (!cat) {
      errors.push({
        field: 'category',
        message: `Unknown category "${catName}". Use one of: ${categories.map((c) => c.name).join(', ')}`,
      });
    }

    let status = 'IN_STOCK';
    const rawStatus = String(rec.status || '').trim();
    if (rawStatus) {
      status = STATUS_FROM_LABEL[rawStatus.toLowerCase()];
      if (!status) errors.push({ field: 'status', message: `Unknown status "${rawStatus}"` });
      else if (!['IN_STOCK', 'RETIRED'].includes(status)) {
        errors.push({
          field: 'status',
          message: `Status "${STATUS_LABELS[status]}" cannot be imported; import as In Stock, then use Assign/Repair`,
        });
      }
    }

    const candidate = {
      name: rec.name,
      categoryId: cat?.id ?? 0,
      brand: rec.brand,
      model: rec.model,
      serialNumber: rec.serialNumber ?? '',
      purchaseDate: normalizeDate(rec.purchaseDate),
      purchasePrice: rec.purchasePrice ?? '',
      vendor: rec.vendor,
      warrantyEnd: normalizeDate(rec.warrantyEnd),
      location: rec.location,
      notes: rec.notes,
      status: status && ['IN_STOCK', 'RETIRED'].includes(status) ? status : 'IN_STOCK',
    };
    const result = createAssetSchema.safeParse(candidate);
    if (!result.success) {
      for (const [field, message] of Object.entries(formatZodError(result.error))) {
        if (field === 'categoryId') continue; // already reported with a better message
        errors.push({ field, message });
      }
    }

    const serial = String(rec.serialNumber || '').trim();
    if (serial) {
      const key = serial.toLowerCase();
      if (existingBySerial.has(key)) {
        errors.push({ field: 'serialNumber', message: `Serial number already exists (${existingBySerial.get(key)})` });
      } else if (seenInFile.has(key)) {
        errors.push({ field: 'serialNumber', message: `Duplicate serial number in this file (also on row ${seenInFile.get(key)})` });
      } else {
        seenInFile.set(key, row);
      }
    }

    return { row, values, errors, data: errors.length ? null : result.data };
  });
}

router.get('/template', (_req, res) => {
  const csv = stringify(
    [
      IMPORT_COLUMNS,
      ['Dell Latitude 5440', 'Laptop', 'Dell', 'Latitude 5440', 'DL5440-EXAMPLE1', '2025-04-15', '78500', 'Dell India', '2028-04-14', 'Bengaluru HQ - Floor 2', 'In Stock', 'Example row - replace me'],
      ['LG 27UL500 Monitor', 'Monitor', 'LG', '27UL500', 'LG27-EXAMPLE2', '15/06/2025', '18990', 'Croma Business', '15/06/2028', 'Chennai Office', '', ''],
    ],
    { bom: true },
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="assettrack-import-template.csv"');
  res.send(csv);
});

// POST /api/csv/import?dryRun=true -> preview only. Without dryRun, valid rows are inserted and invalid rows reported.
router.post(
  '/import',
  requireAdmin,
  upload.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('Attach a CSV file in the "file" field');
    const dryRun = ['1', 'true', 'yes'].includes(String(req.query.dryRun || '').toLowerCase());
    const records = readCsv(req.file.buffer);
    const rows = await validateRows(records);
    const valid = rows.filter((r) => r.data);
    const invalid = rows.filter((r) => !r.data);

    let created = [];
    if (!dryRun && valid.length) {
      created = await prisma.$transaction(
        async (tx) => {
          const out = [];
          for (const r of valid) {
            const assetTag = await nextAssetTag(tx);
            const asset = await tx.asset.create({ data: { ...r.data, assetTag, createdById: req.user.id } });
            await logActivity(
              {
                action: 'CREATE',
                entityType: 'Asset',
                entityId: asset.id,
                assetId: asset.id,
                userId: req.user.id,
                message: `Created ${assetTag} ${asset.name} via CSV import (row ${r.row})`,
              },
              tx,
            );
            out.push({ row: r.row, id: asset.id, assetTag, name: asset.name });
          }
          await logActivity(
            {
              action: 'IMPORT',
              entityType: 'Import',
              userId: req.user.id,
              message: `CSV import "${req.file.originalname}": ${out.length} imported, ${invalid.length} rejected`,
              details: { file: req.file.originalname, imported: out.length, rejected: invalid.length },
            },
            tx,
          );
          return out;
        },
        { timeout: 60_000 },
      );
    }

    res.status(dryRun ? 200 : created.length ? 201 : 200).json({
      data: {
        dryRun,
        fileName: req.file.originalname,
        totalRows: rows.length,
        validCount: valid.length,
        errorCount: invalid.length,
        importedCount: created.length,
        imported: created,
        rows: rows.map(({ row, values, errors }) => ({ row, values, errors, valid: errors.length === 0 })),
      },
    });
  }),
);

// GET /api/csv/export accepts the same filters as GET /api/assets (and ids=1,2,3 for a selection).
router.get(
  '/export',
  ah(async (req, res) => {
    const where = buildAssetWhere(req.query);
    const orderBy = buildAssetOrder(req.query);
    const assets = await prisma.asset.findMany({
      where,
      orderBy,
      include: { category: true, assignments: currentAssignmentInclude },
      take: 10_000,
    });
    const header = ['assetTag', ...IMPORT_COLUMNS, 'assignedTo', 'assignedEmail', 'department', 'assignedAt'];
    const rows = assets.map((a) => {
      const h = a.assignments[0];
      return [
        a.assetTag,
        a.name,
        a.category.name,
        a.brand || '',
        a.model || '',
        a.serialNumber,
        toDateString(a.purchaseDate) || '',
        toNumber(a.purchasePrice).toFixed(2),
        a.vendor || '',
        toDateString(a.warrantyEnd) || '',
        a.location || '',
        STATUS_LABELS[a.status],
        a.notes || '',
        h?.employeeName || '',
        h?.employeeEmail || '',
        h?.department || '',
        toDateString(h?.assignedAt) || '',
      ];
    });
    // Prefix cells that would be interpreted as formulas by spreadsheet apps (CSV injection).
    const safe = rows.map((r) => r.map((c) => (/^[=+\-@\t\r]/.test(String(c)) && !/^-?\d/.test(String(c)) ? `'${c}` : c)));
    const csv = stringify([header, ...safe], { bom: true });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="assettrack-assets-${stamp}.csv"`);
    res.setHeader('X-Total-Count', String(assets.length));
    res.send(csv);
  }),
);

export default router;
