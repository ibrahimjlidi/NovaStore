DROP INDEX IF EXISTS invitations_one_pending_email;

UPDATE invitations
SET status = 'revoked'
WHERE status = 'pending';

ALTER TABLE store_users
  DROP COLUMN clerk_user_id,
  ADD COLUMN password_hash text,
  ADD COLUMN auth_version integer NOT NULL DEFAULT 0 CHECK (auth_version >= 0);

CREATE UNIQUE INDEX store_users_email_unique ON store_users (lower(email));

ALTER TABLE invitations
  DROP COLUMN clerk_invitation_id,
  ADD COLUMN token_hash text UNIQUE,
  ADD COLUMN expires_at timestamptz;

CREATE UNIQUE INDEX invitations_one_pending_email
  ON invitations (store_id, lower(email))
  WHERE status = 'pending';

CREATE TABLE password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, store_id) REFERENCES store_users(id, store_id) ON DELETE CASCADE
);

CREATE INDEX password_resets_user_idx ON password_resets (user_id, created_at DESC);
