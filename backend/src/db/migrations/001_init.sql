-- Users
CREATE TABLE IF NOT EXISTS users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Magic tokens (store raw for dev simplicity; swap to hash later)
CREATE TABLE IF NOT EXISTS magic_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SOPs (head)
CREATE TABLE IF NOT EXISTS sops (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  author_email TEXT,
  current_delta JSONB,
  current_html TEXT,
  plain_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- SOP versions (immutable history)
CREATE TABLE IF NOT EXISTS sop_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sop_id BIGINT NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
  version_no INT NOT NULL,
  delta JSONB,
  html TEXT,
  author_email TEXT,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sop_id, version_no)
);

-- Indexes
CREATE INDEX IF NOT EXISTS sops_updated_idx ON sops(updated_at DESC);
CREATE INDEX IF NOT EXISTS sops_deleted_idx ON sops(deleted_at);
