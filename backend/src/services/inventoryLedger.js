/**
 * Shared inventory-ledger writes. Must be called with a client inside a transaction.
 */

export async function recordMovement(
  client,
  { userId, productId, type, change, after, saleId = null, note = null },
) {
  await client.query(
    `INSERT INTO inventory_movements
       (user_id, product_id, movement_type, quantity_change, quantity_after, sale_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, productId, type, change, after, saleId, note],
  );
}

/**
 * Lock one active product's inventory row (SELECT ... FOR UPDATE) and return it, or null.
 */
export async function lockInventory(client, userId, productId) {
  const { rows } = await client.query(
    `SELECT i.product_id, i.quantity, i.low_stock_threshold
       FROM inventory i
       JOIN products p ON p.id = i.product_id
      WHERE i.product_id = $1 AND i.user_id = $2 AND p.is_active
      FOR UPDATE OF i`,
    [productId, userId],
  );
  return rows[0] ?? null;
}
