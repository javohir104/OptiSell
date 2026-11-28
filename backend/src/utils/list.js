/** Helpers for searching, sorting and paging in-memory lists. */

/** Case-insensitive "contains" search over several fields. */
export function matches(term, ...fields) {
  if (!term) return true;
  const needle = term.toLowerCase();
  return fields.some((f) => f != null && String(f).toLowerCase().includes(needle));
}

export const sameText = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // nulls last
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Sort a copy of `rows` by `key(row)`, then by id. `order` is 'asc' or 'desc'.
 * Null values always go last.
 */
export function sortRows(rows, key, order = 'asc') {
  const dir = order === 'desc' ? -1 : 1;
  return [...rows].sort((x, y) => {
    const a = key(x);
    const b = key(y);
    if (a == null || b == null) return compare(a, b);
    return dir * compare(a, b) || dir * compare(x.id, y.id);
  });
}

export function paginationMeta(page, limit, total) {
  return { page, limit, total, total_pages: Math.ceil(total / limit) };
}

/** One page of rows plus the meta object the frontend expects. */
export function paginate(rows, page, limit) {
  return {
    items: rows.slice((page - 1) * limit, page * limit),
    meta: paginationMeta(page, limit, rows.length),
  };
}

/** Group rows by key(row) -> Map(key -> rows[]). */
export function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = key(row);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}
