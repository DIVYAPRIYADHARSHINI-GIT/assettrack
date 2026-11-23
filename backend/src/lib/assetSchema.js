import { z, zMoney, zOptionalDate, zOptionalText, zRequiredText } from './validate.js';

// Statuses an asset may be created/imported with. ASSIGNED and UNDER_REPAIR are only
// reachable through the assignment and repair flows so history always stays consistent.
export const CREATABLE_STATUSES = ['IN_STOCK', 'RETIRED'];

const baseFields = {
  name: zRequiredText('Name', 120),
  categoryId: z.coerce.number({ error: 'Category is required' }).int('Category is required').positive('Category is required'),
  brand: zOptionalText(80),
  model: zOptionalText(80),
  serialNumber: zRequiredText('Serial number', 80).regex(/^[A-Za-z0-9._\-/ ]+$/, 'Serial number may only contain letters, numbers, spaces and . _ - /'),
  purchaseDate: zOptionalDate,
  purchasePrice: zMoney.default(0),
  vendor: zOptionalText(120),
  warrantyEnd: zOptionalDate,
  location: zOptionalText(120),
  notes: zOptionalText(2000),
};

function datesInOrder(v) {
  return !(v.purchaseDate && v.warrantyEnd && v.warrantyEnd < v.purchaseDate);
}
const dateOrderIssue = { message: 'Warranty end date cannot be before the purchase date', path: ['warrantyEnd'] };

function notInFuture(v) {
  if (!v.purchaseDate) return true;
  const limit = new Date();
  limit.setUTCDate(limit.getUTCDate() + 1);
  return v.purchaseDate <= limit;
}
const futureIssue = { message: 'Purchase date cannot be in the future', path: ['purchaseDate'] };

export const createAssetSchema = z
  .object({
    ...baseFields,
    status: z.enum(CREATABLE_STATUSES, { error: 'New assets must be In Stock or Retired' }).default('IN_STOCK'),
  })
  .refine(datesInOrder, dateOrderIssue)
  .refine(notInFuture, futureIssue);

// Status is intentionally not editable here: use assign/return/repair/retire actions.
export const updateAssetSchema = z
  .object(Object.fromEntries(Object.entries(baseFields).map(([k, v]) => [k, v.optional()])))
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const ASSET_FIELDS = [
  'name',
  'categoryId',
  'brand',
  'model',
  'serialNumber',
  'purchaseDate',
  'purchasePrice',
  'vendor',
  'warrantyEnd',
  'location',
  'notes',
];

export { datesInOrder, dateOrderIssue };
