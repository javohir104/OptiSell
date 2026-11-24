-- OptiSell initial schema
-- Conventions:
--   * Every business table carries user_id; all queries filter on it (tenant isolation).
--   * Composite foreign keys (x_id, user_id) make cross-tenant references impossible at the DB level.
--   * Money: NUMERIC(14,2). Quantities: INTEGER. Timestamps: TIMESTAMPTZ.

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
CREATE TYPE movement_type AS ENUM ('initial', 'restock', 'adjustment', 'sale', 'return', 'import');
CREATE TYPE sale_status AS ENUM ('completed', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'transfer', 'other');

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(254) NOT NULL,
  password_hash  TEXT NOT NULL,
  full_name      VARCHAR(100) NOT NULL,
  business_name  VARCHAR(150),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase_chk CHECK (email = lower(email)),
  CONSTRAINT users_email_uq UNIQUE (email)
);

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
CREATE TABLE products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sku            VARCHAR(64) NOT NULL,
  name           VARCHAR(200) NOT NULL,
  category       VARCHAR(100),
  unit           VARCHAR(20) NOT NULL DEFAULT 'pcs',
  description    VARCHAR(2000),
  cost_price     NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price  NUMERIC(14, 2) NOT NULL CHECK (selling_price >= 0),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT products_id_user_uq UNIQUE (id, user_id)
);

-- SKU is unique per user among active products (an archived product frees its SKU).
CREATE UNIQUE INDEX products_user_sku_active_uq ON products (user_id, lower(sku)) WHERE is_active;
CREATE INDEX products_user_category_idx ON products (user_id, category) WHERE is_active;
CREATE INDEX products_user_created_idx ON products (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- inventory (1:1 with products, current stock)
-- ---------------------------------------------------------------------------
CREATE TABLE inventory (
  product_id           UUID PRIMARY KEY,
  user_id              UUID NOT NULL,
  quantity             INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold  INTEGER NOT NULL DEFAULT 5,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_quantity_non_negative_chk CHECK (quantity >= 0),
  CONSTRAINT inventory_threshold_non_negative_chk CHECK (low_stock_threshold >= 0),
  CONSTRAINT inventory_product_fk FOREIGN KEY (product_id, user_id)
    REFERENCES products (id, user_id) ON DELETE CASCADE
);

CREATE INDEX inventory_user_idx ON inventory (user_id);

-- ---------------------------------------------------------------------------
-- sales
-- ---------------------------------------------------------------------------
CREATE TABLE sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status           sale_status NOT NULL DEFAULT 'completed',
  payment_method   payment_method NOT NULL DEFAULT 'cash',
  customer_name    VARCHAR(150),
  note             VARCHAR(500),
  total_amount     NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  total_cost       NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  items_count      INTEGER NOT NULL DEFAULT 0 CHECK (items_count >= 0),
  idempotency_key  VARCHAR(100),
  sold_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_id_user_uq UNIQUE (id, user_id),
  CONSTRAINT sales_idempotency_uq UNIQUE (user_id, idempotency_key)
);

CREATE INDEX sales_user_sold_at_idx ON sales (user_id, sold_at DESC);

-- ---------------------------------------------------------------------------
-- sale_items (unit_price / unit_cost are snapshots at time of sale)
-- ---------------------------------------------------------------------------
CREATE TABLE sale_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     UUID NOT NULL,
  user_id     UUID NOT NULL,
  product_id  UUID NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  unit_cost   NUMERIC(14, 2) NOT NULL CHECK (unit_cost >= 0),
  line_total  NUMERIC(16, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  line_cost   NUMERIC(16, 2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  CONSTRAINT sale_items_sale_product_uq UNIQUE (sale_id, product_id),
  CONSTRAINT sale_items_sale_fk FOREIGN KEY (sale_id, user_id)
    REFERENCES sales (id, user_id) ON DELETE CASCADE,
  -- NO ACTION (not RESTRICT) so deleting a whole user can still cascade.
  CONSTRAINT sale_items_product_fk FOREIGN KEY (product_id, user_id)
    REFERENCES products (id, user_id)
);

CREATE INDEX sale_items_product_idx ON sale_items (product_id);
CREATE INDEX sale_items_user_product_idx ON sale_items (user_id, product_id);

-- ---------------------------------------------------------------------------
-- inventory_movements (append-only stock ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL,
  product_id       UUID NOT NULL,
  movement_type    movement_type NOT NULL,
  quantity_change  INTEGER NOT NULL CHECK (quantity_change <> 0),
  quantity_after   INTEGER NOT NULL CHECK (quantity_after >= 0),
  sale_id          UUID,
  note             VARCHAR(500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT movements_product_fk FOREIGN KEY (product_id, user_id)
    REFERENCES products (id, user_id) ON DELETE CASCADE,
  CONSTRAINT movements_sale_fk FOREIGN KEY (sale_id, user_id)
    REFERENCES sales (id, user_id) ON DELETE CASCADE
);

CREATE INDEX movements_user_created_idx ON inventory_movements (user_id, created_at DESC);
CREATE INDEX movements_product_created_idx ON inventory_movements (product_id, created_at DESC);
CREATE INDEX movements_sale_idx ON inventory_movements (sale_id) WHERE sale_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category        VARCHAR(100) NOT NULL,
  amount          NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  description     VARCHAR(500),
  expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  payment_method NOT NULL DEFAULT 'cash',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX expenses_user_date_idx ON expenses (user_id, expense_date DESC);
CREATE INDEX expenses_user_category_idx ON expenses (user_id, category);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER inventory_updated_at BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sales_updated_at BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
