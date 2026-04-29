-- Enable extensions for full-text search and trigram matching.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Generated tsvector columns for full-text search.
-- These stay in sync automatically via the GENERATED ALWAYS AS clause.
ALTER TABLE memories ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(transcript_text, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(date_of_event_text, '')), 'D')
  ) STORED;

ALTER TABLE people ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(display_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(first_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(last_name, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(essence_line, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(also_known_as, ' '), '')), 'C') ||
    setweight(to_tsvector('english', coalesce(maiden_name, '')), 'B')
  ) STORED;

ALTER TABLE places ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(label, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(locality, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(admin_region, '')), 'C')
  ) STORED;

-- GIN indexes for tsvector search (fast full-text queries).
CREATE INDEX memories_search_gin_idx ON memories USING GIN (search_vector);
CREATE INDEX people_search_gin_idx ON people USING GIN (search_vector);
CREATE INDEX places_search_gin_idx ON places USING GIN (search_vector);

-- GIN indexes for trigram similarity (fuzzy/prefix matching on key text fields).
CREATE INDEX memories_title_trgm_idx ON memories USING GIN (title gin_trgm_ops);
CREATE INDEX people_display_name_trgm_idx ON people USING GIN (display_name gin_trgm_ops);
CREATE INDEX places_label_trgm_idx ON places USING GIN (label gin_trgm_ops);