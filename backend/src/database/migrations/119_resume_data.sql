-- Add resume_data column to store parsed resume information
ALTER TABLE org.students
ADD COLUMN resume_data JSONB;

COMMENT ON COLUMN org.students.resume_data IS 'Parsed resume data from AI service: {text, hyperlinks, metadata}';
