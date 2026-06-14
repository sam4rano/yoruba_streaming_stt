-- Create the transcripts table for PostgreSQL
CREATE TABLE IF NOT EXISTS transcripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    text TEXT NOT NULL,
    duration REAL NOT NULL, -- Duration of the session in seconds
    title TEXT -- Optional session title / label
);
