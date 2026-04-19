-- Migration: family map places
-- Adds reusable, tree-scoped places plus links from people and memories.

CREATE TABLE IF NOT EXISTS "places" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "tree_id" uuid NOT NULL REFERENCES "trees"("id") ON DELETE cascade,
  "label" varchar(200) NOT NULL,
  "normalized_label" varchar(200) NOT NULL,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "country_code" varchar(2),
  "admin_region" varchar(120),
  "locality" varchar(120),
  "geocode_provider" varchar(40) DEFAULT 'manual' NOT NULL,
  "geocode_confidence" integer,
  "created_by_user_id" text REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "places_tree_normalized_label_unique_idx"
  ON "places" USING btree ("tree_id", "normalized_label");
CREATE INDEX IF NOT EXISTS "places_tree_idx"
  ON "places" USING btree ("tree_id");
CREATE INDEX IF NOT EXISTS "places_created_by_idx"
  ON "places" USING btree ("created_by_user_id");

ALTER TABLE "people"
  ADD COLUMN IF NOT EXISTS "birth_place_id" uuid REFERENCES "places"("id") ON DELETE set null;
ALTER TABLE "people"
  ADD COLUMN IF NOT EXISTS "death_place_id" uuid REFERENCES "places"("id") ON DELETE set null;
CREATE INDEX IF NOT EXISTS "people_birth_place_idx"
  ON "people" USING btree ("birth_place_id");
CREATE INDEX IF NOT EXISTS "people_death_place_idx"
  ON "people" USING btree ("death_place_id");

ALTER TABLE "memories"
  ADD COLUMN IF NOT EXISTS "place_id" uuid REFERENCES "places"("id") ON DELETE set null;
ALTER TABLE "memories"
  ADD COLUMN IF NOT EXISTS "place_label_override" varchar(200);
CREATE INDEX IF NOT EXISTS "memories_place_idx"
  ON "memories" USING btree ("place_id");
