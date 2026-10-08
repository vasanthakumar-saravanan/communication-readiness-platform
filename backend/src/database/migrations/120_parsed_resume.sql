-- Add parsed_resume JSONB column to org.students.
-- This is the canonical source of truth for structured resume data
-- produced by the AI resume parser (PyMuPDF + LLM extraction).
--
-- Structure stored:
-- {
--   "fileName": "resume.pdf",
--   "parsedAt": "2024-01-01",
--   "name": null | "Candidate Name",
--   "email": null | "email@example.com",
--   "summary": null | "...",
--   "education": [],
--   "skills": { "languages": [], "frameworks": [], "databases": [], "tools": [] },
--   "projects": [ { "title": "...", "description": "...", "techStack": [] } ],
--   "experience": [],
--   "certifications": [],
--   "achievements": [],
--   "text": "raw extracted PDF text (used for interview question context)"
-- }

ALTER TABLE org.students
  ADD COLUMN IF NOT EXISTS parsed_resume JSONB;

COMMENT ON COLUMN org.students.parsed_resume
  IS 'Structured resume data produced by AI parser: skills, projects, experience, etc.';

-- Migrate any existing resume_data rows into parsed_resume (non-destructive).
-- resume_data was added in 119_resume_data.sql with an incorrect flat structure;
-- parsed_resume uses the correct structured format going forward.
UPDATE org.students
SET parsed_resume = resume_data
WHERE resume_data IS NOT NULL
  AND parsed_resume IS NULL;
