ALTER TABLE product_variants
  ADD COLUMN low_stock_threshold integer
  CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0);
