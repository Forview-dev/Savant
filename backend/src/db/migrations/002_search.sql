-- Clean up any prior attempt at function-based GIN index
DROP INDEX IF EXISTS sops_fts_gin;

-- 1) Add a generated tsvector storage column (kept up to date by a trigger)
ALTER TABLE sops
  ADD COLUMN IF NOT EXISTS search_tsv tsvector;

-- 2) Backfill existing rows
UPDATE sops
SET search_tsv = to_tsvector(
  'simple',
  coalesce(title,'') || ' ' ||
  coalesce(category,'') || ' ' ||
  coalesce(array_to_string(tags, ' '),'') || ' ' ||
  coalesce(plain_text,'')
);

-- 3) Create a GIN index on the tsvector column
CREATE INDEX IF NOT EXISTS sops_search_tsv_gin
  ON sops
  USING GIN (search_tsv);

-- 4) Create a trigger function to maintain search_tsv on INSERT/UPDATE
CREATE OR REPLACE FUNCTION sops_tsvector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_tsv := to_tsvector(
    'simple',
    coalesce(NEW.title,'') || ' ' ||
    coalesce(NEW.category,'') || ' ' ||
    coalesce(array_to_string(NEW.tags, ' '),'') || ' ' ||
    coalesce(NEW.plain_text,'')
  );
  RETURN NEW;
END;
$$;

-- 5) Attach the trigger to the sops table
DROP TRIGGER IF EXISTS sops_tsvector_update_trigger ON sops;

CREATE TRIGGER sops_tsvector_update_trigger
BEFORE INSERT OR UPDATE OF title, category, tags, plain_text
ON sops
FOR EACH ROW
EXECUTE FUNCTION sops_tsvector_update();
