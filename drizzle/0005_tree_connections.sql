-- Migration: tree_connections + cross_tree_person_links
-- Adds cross-family tree connection infrastructure (the "in-law" model).

DO $$ BEGIN
  CREATE TYPE "public"."tree_connection_status" AS ENUM('pending', 'active', 'ended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "tree_connections" (
  "id"                   uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "tree_a_id"            uuid NOT NULL REFERENCES "trees"("id") ON DELETE cascade,
  "tree_b_id"            uuid NOT NULL REFERENCES "trees"("id") ON DELETE cascade,
  "status"               "tree_connection_status" DEFAULT 'pending' NOT NULL,
  "initiated_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "initiated_by_tree_id" uuid NOT NULL REFERENCES "trees"("id") ON DELETE cascade,
  "accepted_at"          timestamp with time zone,
  "ended_at"             timestamp with time zone,
  "created_at"           timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"           timestamp with time zone DEFAULT now() NOT NULL,
  -- Normalise pair order so (A,B) and (B,A) cannot both exist
  CONSTRAINT "tree_connections_order_chk" CHECK ("tree_a_id" < "tree_b_id"),
  -- initiating tree must be one of the two parties
  CONSTRAINT "tree_connections_initiator_chk"
    CHECK ("initiated_by_tree_id" = "tree_a_id" OR "initiated_by_tree_id" = "tree_b_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tree_connections_pair_unique_idx"
  ON "tree_connections" USING btree ("tree_a_id", "tree_b_id");
CREATE INDEX IF NOT EXISTS "tree_connections_tree_a_idx"
  ON "tree_connections" USING btree ("tree_a_id");
CREATE INDEX IF NOT EXISTS "tree_connections_tree_b_idx"
  ON "tree_connections" USING btree ("tree_b_id");
CREATE INDEX IF NOT EXISTS "tree_connections_status_idx"
  ON "tree_connections" USING btree ("status");
CREATE INDEX IF NOT EXISTS "tree_connections_initiated_by_user_idx"
  ON "tree_connections" USING btree ("initiated_by_user_id");

CREATE TABLE IF NOT EXISTS "cross_tree_person_links" (
  "id"               uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "connection_id"    uuid NOT NULL REFERENCES "tree_connections"("id") ON DELETE cascade,
  "person_a_id"      uuid NOT NULL REFERENCES "people"("id") ON DELETE cascade,
  "person_b_id"      uuid NOT NULL REFERENCES "people"("id") ON DELETE cascade,
  "linked_by_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  -- person A can only be linked once per connection
  CONSTRAINT "cross_tree_person_links_no_self_chk" CHECK ("person_a_id" <> "person_b_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cross_tree_person_links_person_a_conn_unique_idx"
  ON "cross_tree_person_links" USING btree ("connection_id", "person_a_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cross_tree_person_links_person_b_conn_unique_idx"
  ON "cross_tree_person_links" USING btree ("connection_id", "person_b_id");
CREATE INDEX IF NOT EXISTS "cross_tree_person_links_connection_idx"
  ON "cross_tree_person_links" USING btree ("connection_id");
CREATE INDEX IF NOT EXISTS "cross_tree_person_links_person_a_idx"
  ON "cross_tree_person_links" USING btree ("person_a_id");
CREATE INDEX IF NOT EXISTS "cross_tree_person_links_person_b_idx"
  ON "cross_tree_person_links" USING btree ("person_b_id");
