import { z } from 'zod';
import { text } from './common.js';

export const MAX_IMPORT_ROWS = 10_000;

// A CSV cell. The frontend parses the file and sends rows as objects keyed by column name.
const cell = z.union([z.string().max(2000), z.number(), z.null()]).optional();

// z.object (not strict): extra CSV columns are dropped, never copied anywhere.
const ROW_SCHEMAS = {
  products: z.object({
    name: cell,
    category: cell,
    price: cell,
    cost: cell,
    stock: cell,
    sku: cell,
    minStock: cell,
    maxStock: cell,
    unit: cell,
    description: cell,
  }),
  sales: z.object({
    sku: cell,
    quantity: cell,
    unitPrice: cell,
    date: cell,
    customer: cell,
    paymentMethod: cell,
  }),
};

export const REQUIRED_COLUMNS = {
  products: ['name', 'category', 'price', 'cost', 'stock'],
  sales: ['sku', 'quantity'],
};

export const importTypeParams = z.strictObject({ type: z.enum(['products', 'sales']) });

export const importBodyFor = (type) =>
  z.strictObject({
    file_name: text(255),
    columns: z.array(z.string().trim().max(100)).max(200),
    rows: z.array(ROW_SCHEMAS[type]).max(MAX_IMPORT_ROWS, `At most ${MAX_IMPORT_ROWS} rows per file`),
  });

export const importHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
