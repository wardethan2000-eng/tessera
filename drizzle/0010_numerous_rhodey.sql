-- Migration: shared-memory reach rules
-- Generated after snapshot repair, then normalized to remain safe on databases
-- that already ran 0008_retire_tree_connections.

DO $$ BEGIN
  CREATE TYPE "public"."memory_reach_kind" AS ENUM(
    'immediate_family',
    'ancestors',
    'descendants',
    'whole_tree'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "memory_reach_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"kind" "memory_reach_kind" NOT NULL,
	"seed_person_id" uuid,
	"scope_tree_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DROP TABLE IF EXISTS "cross_tree_person_links" CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS "tree_connections" CASCADE;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "memory_reach_rules"
    ADD CONSTRAINT "memory_reach_rules_memory_id_memories_id_fk"
    FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "memory_reach_rules"
    ADD CONSTRAINT "memory_reach_rules_seed_person_id_people_id_fk"
    FOREIGN KEY ("seed_person_id") REFERENCES "public"."people"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "memory_reach_rules"
    ADD CONSTRAINT "memory_reach_rules_scope_tree_id_trees_id_fk"
    FOREIGN KEY ("scope_tree_id") REFERENCES "public"."trees"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "memory_reach_rules"
    ADD CONSTRAINT "memory_reach_rules_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "memory_reach_rules_memory_idx"
  ON "memory_reach_rules" USING btree ("memory_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_reach_rules_seed_person_idx"
  ON "memory_reach_rules" USING btree ("seed_person_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_reach_rules_scope_tree_idx"
  ON "memory_reach_rules" USING btree ("scope_tree_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_reach_rules_created_by_idx"
  ON "memory_reach_rules" USING btree ("created_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memory_reach_rules_kind_idx"
  ON "memory_reach_rules" USING btree ("kind");
--> statement-breakpoint

DROP TYPE IF EXISTS "public"."tree_connection_status";
