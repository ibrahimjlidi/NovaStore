ALTER TABLE store_users DROP CONSTRAINT store_users_role_check;
ALTER TABLE store_users
  ADD CONSTRAINT store_users_role_check
  CHECK (role IN ('admin', 'storekeeper', 'cashier', 'viewer'));

ALTER TABLE invitations DROP CONSTRAINT invitations_role_check;
ALTER TABLE invitations
  ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('storekeeper', 'cashier', 'viewer'));

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  phone text NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
  email text NOT NULL DEFAULT '' CHECK (length(email) <= 254),
  address text NOT NULL DEFAULT '' CHECK (length(address) <= 500),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, store_id)
);

CREATE INDEX customers_name_idx ON customers (store_id, name);
CREATE INDEX customers_phone_idx ON customers (store_id, phone) WHERE phone <> '';

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  invoice_number bigint GENERATED ALWAYS AS IDENTITY,
  customer_id uuid,
  cashier_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  subtotal_tnd numeric(21,3) NOT NULL CHECK (subtotal_tnd > 0),
  discount_tnd numeric(21,3) NOT NULL DEFAULT 0 CHECK (discount_tnd >= 0),
  total_tnd numeric(21,3) NOT NULL CHECK (total_tnd > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  FOREIGN KEY (customer_id, store_id) REFERENCES customers(id, store_id),
  FOREIGN KEY (cashier_user_id, store_id) REFERENCES store_users(id, store_id),
  UNIQUE (id, store_id),
  UNIQUE (store_id, invoice_number)
);

CREATE INDEX sales_store_date_idx ON sales (store_id, created_at DESC);
CREATE INDEX sales_customer_date_idx ON sales (store_id, customer_id, created_at DESC);
CREATE INDEX sales_cashier_date_idx ON sales (store_id, cashier_user_id, created_at DESC);

CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_tnd numeric(12,3) NOT NULL CHECK (unit_price_tnd > 0),
  line_total_tnd numeric(21,3) NOT NULL CHECK (line_total_tnd > 0),
  FOREIGN KEY (sale_id, store_id) REFERENCES sales(id, store_id),
  FOREIGN KEY (variant_id, store_id) REFERENCES product_variants(id, store_id),
  UNIQUE (id, store_id),
  UNIQUE (sale_id, variant_id)
);

CREATE INDEX sale_items_variant_idx ON sale_items (store_id, variant_id);

CREATE TABLE sale_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('cash', 'card')),
  amount_tnd numeric(21,3) NOT NULL CHECK (amount_tnd > 0),
  received_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (sale_id, store_id) REFERENCES sales(id, store_id),
  FOREIGN KEY (received_by, store_id) REFERENCES store_users(id, store_id),
  UNIQUE (sale_id)
);

ALTER TABLE inventory_movements
  ADD COLUMN sale_item_id uuid,
  ADD CONSTRAINT inventory_movements_sale_item_fk
    FOREIGN KEY (sale_item_id, store_id) REFERENCES sale_items(id, store_id),
  ADD CONSTRAINT inventory_movements_sale_item_unique UNIQUE (sale_item_id);
