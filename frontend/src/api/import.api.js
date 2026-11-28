import api, { unwrap } from './axios';
import { toImport } from './backend';
import { parseSpreadsheet } from '../utils/xlsx';

/**
 * CSV / Excel import (Javohir's analytics module, exposed through the backend).
 * ImportResult = { id, type, fileName, status: completed|partial|failed, totalRows, imported, failed,
 *                  errors: [{ row, field, message }], createdAt }
 */
export const IMPORT_TYPES = {
  products: {
    label: 'imp.type.products', // i18n key
    required: ['name', 'category', 'price', 'cost', 'stock'],
    optional: ['sku', 'minStock', 'maxStock', 'unit', 'description'],
    sample: { name: 'Green Tea 100 bags', category: 'Beverages', price: '88500', cost: '43500', stock: '120', sku: 'BEV-2001', minStock: '30', maxStock: '200', unit: 'pcs', description: '' },
    help: 'imp.help.products', // i18n key
  },
  sales: {
    label: 'imp.type.sales', // i18n key
    required: ['sku', 'quantity'],
    optional: ['unitPrice', 'date', 'customer', 'paymentMethod'],
    sample: { sku: 'BEV-2001', quantity: '2', unitPrice: '88500', date: '2026-11-01', customer: 'Walk-in', paymentMethod: 'cash' },
    help: 'imp.help.sales', // i18n key
  },
};

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_EXT = ['.csv', '.xlsx', '.xls'];

const real = {
  /** The file is parsed here; the backend validates and saves each row and keeps the report. */
  upload: async (type, file, onProgress) => {
    const { headers, rows } = await parseSpreadsheet(file);
    const res = await api.post(`/import/${type}`, { file_name: file.name.slice(0, 255), columns: headers, rows }, {
      timeout: 300000,
      onUploadProgress: (e) => onProgress?.(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
    });
    return toImport(unwrap(res));
  },
  history: (params) => api.get('/import/history', { params }).then(unwrap).then((list) => list.map(toImport)),
};

export const importApi = real;
