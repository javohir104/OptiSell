/**
 * Tiny helper for building parameterized WHERE clauses.
 * Values are ALWAYS passed as $n parameters, never concatenated into SQL.
 *
 *   const q = new SqlParams();
 *   q.where(`p.user_id = ${q.add(userId)}`);
 *   pool.query(`SELECT ... ${q.whereSql()}`, q.values);
 */
export class SqlParams {
  constructor() {
    this.values = [];
    this.clauses = [];
  }

  /** Register a value and return its placeholder ($1, $2, ...). */
  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  where(clause) {
    this.clauses.push(clause);
    return this;
  }

  whereSql() {
    return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}

export function paginationMeta(page, limit, total) {
  return { page, limit, total, total_pages: Math.ceil(total / limit) };
}

export function offset(page, limit) {
  return (page - 1) * limit;
}
