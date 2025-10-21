-- 003_demo_seed.sql
-- Insert 8 demo SOPs for testing search, filtering, and versions

INSERT INTO sops (title, category, tags, author_email, current_delta, current_html, plain_text)
VALUES
('Equipment Startup Procedure', 'Operations', ARRAY['startup','equipment'], 'demo@company.com',
  '{}'::jsonb,
  '<p>Step-by-step process for starting up industrial equipment safely.</p>',
  'Step-by-step process for starting up industrial equipment safely.'
),
('Safety Inspection Checklist', 'Safety', ARRAY['inspection','checklist'], 'demo@company.com',
  '{}'::jsonb,
  '<p>Checklist for weekly safety inspections covering fire hazards, PPE, and signage.</p>',
  'Checklist for weekly safety inspections covering fire hazards, PPE, and signage.'
),
('Emergency Shutdown Procedure', 'Safety', ARRAY['emergency','shutdown'], 'demo@company.com',
  '{}'::jsonb,
  '<p>Procedure for safely shutting down systems in emergency situations to prevent damage.</p>',
  'Procedure for safely shutting down systems in emergency situations to prevent damage.'
),
('Maintenance Scheduling Process', 'Maintenance', ARRAY['planning','maintenance'], 'demo@company.com',
  '{}'::jsonb,
  '<p>Defines how maintenance tasks are scheduled, tracked, and prioritized.</p>',
  'Defines how maintenance tasks are scheduled, tracked, and prioritized.'
),
('Quality Control Sampling', 'Quality', ARRAY['sampling','control','qc'], 'demo@company.com',
  '{}'::jsonb,
  '<p>Instructions for collecting product samples for quality control tests.</p>',
  'Instructions for collecting product samples for quality control tests.'
),
('Material Handling Guidelines', 'Logistics', ARRAY['handling','logistics','safety'], 'demo@company.com',
  '{}'::jsonb,
  '<p>Procedures for safe handling and transportation of materials within the plant.</p>',
  'Procedures for safe handling and transportation of materials within the plant.'
),
('Incident Reporting Process', 'Safety', ARRAY['incident','report','investigation'], 'demo@company.com',
  '{}'::jsonb,
  '<p>Steps for employees to report and document workplace incidents.</p>',
  'Steps for employees to report and document workplace incidents.'
),
('Calibration of Measuring Instruments', 'Quality', ARRAY['calibration','measurement'], 'demo@company.com',
  '{}'::jsonb,
  '<p>Detailed method for calibrating instruments to ensure measurement accuracy.</p>',
  'Detailed method for calibrating instruments to ensure measurement accuracy.'
);

-- Backfill search_tsv for the new rows
UPDATE sops
SET search_tsv = to_tsvector(
  'simple',
  coalesce(title,'') || ' ' ||
  coalesce(category,'') || ' ' ||
  array_to_string(coalesce(tags, '{}'), ' ') || ' ' ||
  coalesce(plain_text,'')
);
