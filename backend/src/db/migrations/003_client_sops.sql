-- Add client-specific columns
ALTER TABLE sops
  ADD COLUMN IF NOT EXISTS is_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_name text;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS sops_is_client_idx ON sops (is_client);
CREATE INDEX IF NOT EXISTS sops_client_name_idx ON sops (client_name);
