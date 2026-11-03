CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  city text NOT NULL DEFAULT 'Tunis',
  currency char(3) NOT NULL DEFAULT 'TND' CHECK (currency = 'TND'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE store_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  clerk_user_id text NOT NULL UNIQUE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'storekeeper', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, store_id)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('storekeeper', 'viewer')),
  clerk_invitation_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  FOREIGN KEY (invited_by, store_id) REFERENCES store_users(id, store_id)
);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  phone text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  email text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, store_id)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sku text NOT NULL CHECK (length(trim(sku)) BETWEEN 1 AND 64),
  name_ar text NOT NULL CHECK (length(trim(name_ar)) BETWEEN 1 AND 180),
  name_fr text NOT NULL CHECK (length(trim(name_fr)) BETWEEN 1 AND 180),
  category text NOT NULL CHECK (category IN ('tshirt', 'jeans', 'dress', 'jacket', 'shoes', 'accessories')),
  price_tnd numeric(12,3) NOT NULL CHECK (price_tnd > 0),
  low_stock_threshold integer NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, sku),
  UNIQUE (id, store_id)
);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  size text NOT NULL CHECK (size IN ('S', 'M', 'L', 'XL', 'ONE_SIZE')),
  color_key text NOT NULL CHECK (length(trim(color_key)) BETWEEN 1 AND 40),
  color_ar text NOT NULL CHECK (length(trim(color_ar)) BETWEEN 1 AND 80),
  color_fr text NOT NULL CHECK (length(trim(color_fr)) BETWEEN 1 AND 80),
  color_hex char(7) NOT NULL CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (product_id, store_id) REFERENCES products(id, store_id),
  UNIQUE (product_id, size, color_key),
  UNIQUE (id, store_id)
);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_number bigint GENERATED ALWAYS AS IDENTITY,
  supplier_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'received')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  received_at timestamptz,
  FOREIGN KEY (supplier_id, store_id) REFERENCES suppliers(id, store_id),
  FOREIGN KEY (created_by, store_id) REFERENCES store_users(id, store_id),
  UNIQUE (id, store_id),
  UNIQUE (store_id, order_number)
);

CREATE TABLE purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost_tnd numeric(12,3) NOT NULL CHECK (unit_cost_tnd > 0),
  FOREIGN KEY (order_id, store_id) REFERENCES purchase_orders(id, store_id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id, store_id) REFERENCES product_variants(id, store_id),
  UNIQUE (id, store_id)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUSTMENT')),
  quantity integer NOT NULL CHECK (quantity > 0),
  adjustment_sign smallint,
  note text NOT NULL DEFAULT '',
  purchase_order_line_id uuid UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (type = 'ADJUSTMENT' AND adjustment_sign IS NOT NULL AND adjustment_sign IN (-1, 1))
    OR (type IN ('IN', 'OUT') AND adjustment_sign IS NULL)
  ),
  FOREIGN KEY (variant_id, store_id) REFERENCES product_variants(id, store_id),
  FOREIGN KEY (purchase_order_line_id, store_id) REFERENCES purchase_order_lines(id, store_id),
  FOREIGN KEY (created_by, store_id) REFERENCES store_users(id, store_id)
);

CREATE INDEX product_variants_product_idx ON product_variants (store_id, product_id);
CREATE INDEX movements_variant_date_idx ON inventory_movements (store_id, variant_id, created_at DESC);
CREATE INDEX movements_created_at_idx ON inventory_movements (store_id, created_at DESC);
CREATE INDEX purchase_orders_date_idx ON purchase_orders (store_id, created_at DESC);
CREATE INDEX suppliers_name_idx ON suppliers (store_id, name);
CREATE UNIQUE INDEX invitations_one_pending_email ON invitations (store_id, lower(email)) WHERE status = 'pending';
