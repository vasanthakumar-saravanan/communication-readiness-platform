-- M4: checklist_items seed placeholder
-- Real checklist items are programme-specific and are imported by the Placement Coordinator
-- at runtime via POST /api/checklist/import-csv.
-- This migration is reserved per M4 checklist numbering (106); no items to seed at DB-init time.

DO $$ BEGIN
  RAISE NOTICE 'Migration 106: checklist_items are loaded at runtime via admin CSV import.';
END $$;
