import { query, withTransaction } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { SqlParams, offset, paginationMeta } from '../utils/sql.js';
import { likePattern } from '../validators/common.js';
import { lockInventory, recordMovement } from './inventoryLedger.js';

const PRODUCT_SELECT = `
  SELECT p.id, p.sku, p.name, p.category, p.unit, p.description,
         p.cost_price, p.selling_price, p.is_active,
         i.quantity, i.low_stock_threshold,
         (i.quantity = 0) AS out_of_stock,
         (i.quantity <= i.low_stock_threshold) AS low_stock,
         p.created_at, p.updated_at
    FROM products p
    JOIN inventory i ON i.product_id = p.id`;

// Whitelist: user input picks a key, never raw SQL.
const SORT_COLUMNS = {
  created_at: 'p.created_at',
  name: 'p.name',
  sku: 'p.sku',
  selling_price: 'p.selling_price',
  quantity: 'i.quantity',
};

const UPDATABLE_COLUMNS = ['sku', 'name', 'category', 'unit', 'description', 'cost_price', 'selling_price'];

async function fetchProduct(db, userId, productId) {
  const { rows } = await db.query(`${PRODUCT_SELECT} WHERE p.id = $1 AND p.user_id = $2`, [
    productId,
    userId,
  ]);
  return rows[0] ?? null;
}

export async function listProducts(userId, q) {
  const sql = new SqlParams();
  sql.where(`p.user_id = ${sql.add(userId)}`);

  if (q.status === 'active') sql.where('p.is_active');
  if (q.status === 'archived') sql.where('NOT p.is_active');

  if (q.search) {
    const pattern = sql.add(likePattern(q.search));
    sql.where(`(p.name ILIKE ${pattern} OR p.sku ILIKE ${pattern})`);
  }
  if (q.category) sql.where(`lower(p.category) = lower(${sql.add(q.category)})`);

  if (q.stock_status === 'out') sql.where('i.quantity = 0');
  if (q.stock_status === 'low') sql.where('i.quantity > 0 AND i.quantity <= i.low_stock_threshold');
  if (q.stock_status === 'in_stock') sql.where('i.quantity > i.low_stock_threshold');

  const where = sql.whereSql();
  const countResult = await query(
    `SELECT COUNT(*) AS total FROM products p JOIN inventory i ON i.product_id = p.id ${where}`,
    sql.values,
  );

  const order = `${SORT_COLUMNS[q.sort]} ${q.order === 'asc' ? 'ASC' : 'DESC'}, p.id`;
  const limit = sql.add(q.limit);
  const skip = sql.add(offset(q.page, q.limit));
  const { rows } = await query(
    `${PRODUCT_SELECT} ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${skip}`,
    sql.values,
  );

  return { items: rows, meta: paginationMeta(q.page, q.limit, countResult.rows[0].total) };
}

export async function getProduct(userId, productId) {
  const product = await fetchProduct({ query }, userId, productId);
  if (!product) throw AppError.notFound('Product not found');
  return product;
}

export async function listCategories(userId) {
  const { rows } = await query(
    `SELECT category, COUNT(*) AS product_count
       FROM products
      WHERE user_id = $1 AND is_active AND category IS NOT NULL
      GROUP BY category
      ORDER BY category`,
    [userId],
  );
  return rows;
}

async function insertProduct(client, userId, data, { quantity = 0, movementType = 'initial' } = {}) {
  const { rows } = await client.query(
    `INSERT INTO products (user_id, sku, name, category, unit, description, cost_price, selling_price)
     VALUES ($1, $2, $3, $4, COALESCE($5::text, 'pcs'), $6, COALESCE($7::numeric, 0), $8)
     RETURNING id`,
    [
      userId,
      data.sku,
      data.name,
      data.category ?? null,
      data.unit ?? null,
      data.description ?? null,
      data.cost_price ?? null,
      data.selling_price,
    ],
  );
  const productId = rows[0].id;

  await client.query(
    `INSERT INTO inventory (product_id, user_id, quantity, low_stock_threshold)
     VALUES ($1, $2, $3, COALESCE($4::int, 5))`,
    [productId, userId, quantity, data.low_stock_threshold ?? null],
  );

  if (quantity > 0) {
    await recordMovement(client, {
      userId,
      productId,
      type: movementType,
      change: quantity,
      after: quantity,
      note: movementType === 'initial' ? 'Initial stock' : 'Bulk import',
    });
  }
  return productId;
}

/** Update provided fields of an active product. Throws 404 if not found/archived. */
async function updateProductFields(client, userId, productId, data) {
  const params = [productId, userId];
  const sets = [];
  for (const column of UPDATABLE_COLUMNS) {
    if (data[column] !== undefined) {
      params.push(data[column]);
      sets.push(`${column} = $${params.length}`);
    }
  }

  if (sets.length) {
    const { rowCount } = await client.query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND is_active`,
      params,
    );
    if (!rowCount) throw AppError.notFound('Product not found');
  }

  const inventory = await lockInventory(client, userId, productId);
  if (!inventory) throw AppError.notFound('Product not found');

  if (data.low_stock_threshold !== undefined) {
    await client.query(
      'UPDATE inventory SET low_stock_threshold = $3 WHERE product_id = $1 AND user_id = $2',
      [productId, userId, data.low_stock_threshold],
    );
  }
  return inventory;
}

export async function createProduct(userId, data) {
  return withTransaction(async (client) => {
    const productId = await insertProduct(client, userId, data, {
      quantity: data.initial_quantity ?? 0,
    });
    return fetchProduct(client, userId, productId);
  });
}

export async function updateProduct(userId, productId, data) {
  return withTransaction(async (client) => {
    await updateProductFields(client, userId, productId, data);
    return fetchProduct(client, userId, productId);
  });
}

/** Soft delete: sales history keeps referencing the product; its SKU becomes reusable. */
export async function archiveProduct(userId, productId) {
  const { rows } = await query(
    `UPDATE products SET is_active = FALSE
      WHERE id = $1 AND user_id = $2 AND is_active
      RETURNING id, is_active`,
    [productId, userId],
  );
  if (!rows.length) throw AppError.notFound('Product not found');
  return rows[0];
}

/**
 * Bulk upsert by SKU (for CSV/Excel import). All-or-nothing: any error rolls back every row.
 * Existing active product with same SKU (case-insensitive) -> updated; otherwise created.
 * `quantity`, when given, sets the absolute stock level and is recorded as an 'import' movement.
 */
export async function bulkUpsertProducts(userId, items) {
  return withTransaction(async (client) => {
    const results = [];

    for (const [index, item] of items.entries()) {
      const { rows } = await client.query(
        'SELECT id FROM products WHERE user_id = $1 AND lower(sku) = lower($2) AND is_active',
        [userId, item.sku],
      );

      if (!rows.length) {
        const id = await insertProduct(client, userId, item, {
          quantity: item.quantity ?? 0,
          movementType: 'import',
        });
        results.push({ row: index, sku: item.sku, id, action: 'created' });
        continue;
      }

      const productId = rows[0].id;
      const { quantity: _q, sku: _s, ...fields } = item;
      const inventory = await updateProductFields(client, userId, productId, fields);

      if (item.quantity !== undefined && item.quantity !== inventory.quantity) {
        await client.query(
          'UPDATE inventory SET quantity = $3 WHERE product_id = $1 AND user_id = $2',
          [productId, userId, item.quantity],
        );
        await recordMovement(client, {
          userId,
          productId,
          type: 'import',
          change: item.quantity - inventory.quantity,
          after: item.quantity,
          note: 'Bulk import',
        });
      }
      results.push({ row: index, sku: item.sku, id: productId, action: 'updated' });
    }

    return {
      created: results.filter((r) => r.action === 'created').length,
      updated: results.filter((r) => r.action === 'updated').length,
      results,
    };
  });
}
