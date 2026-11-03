ALTER TABLE store_users
  ADD COLUMN disabled_at timestamptz;

CREATE INDEX store_users_active_members_idx
  ON store_users (store_id, role)
  WHERE disabled_at IS NULL;
